-- Flexible fix for foreign key constraints and missing columns
-- This handles any user, not just a specific one

-- 1. Add missing columns to projects table if they don't exist
ALTER TABLE public.projects 
ADD COLUMN IF NOT EXISTS goals TEXT;

ALTER TABLE public.projects 
ADD COLUMN IF NOT EXISTS requirements TEXT;

ALTER TABLE public.projects 
ADD COLUMN IF NOT EXISTS invite_code VARCHAR(6) UNIQUE;

-- 2. Update existing projects with invite codes if they don't have them
UPDATE public.projects 
SET invite_code = UPPER(SUBSTRING(MD5(RANDOM()::TEXT), 1, 6))
WHERE invite_code IS NULL;

-- 3. Create index for faster invite code lookups
CREATE INDEX IF NOT EXISTS idx_projects_invite_code ON public.projects(invite_code);

-- 4. Fix foreign key constraints
-- Drop existing constraints
ALTER TABLE public.project_members 
DROP CONSTRAINT IF EXISTS project_members_user_id_fkey;

ALTER TABLE public.project_members 
DROP CONSTRAINT IF EXISTS project_members_project_id_fkey;

-- Add correct foreign key constraints
ALTER TABLE public.project_members 
ADD CONSTRAINT project_members_user_id_fkey 
FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

ALTER TABLE public.project_members 
ADD CONSTRAINT project_members_project_id_fkey 
FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;

-- 5. Create profiles for all authenticated users who don't have profiles yet
-- This will create profiles for any user in auth.users who doesn't have a profile
INSERT INTO public.profiles (id, name, skills, programming_languages, willing_to_work_on)
SELECT 
    au.id,
    COALESCE(au.raw_user_meta_data->>'full_name', au.raw_user_meta_data->>'name', 'User') as name,
    '' as skills,
    '' as programming_languages,
    '' as willing_to_work_on
FROM auth.users au
LEFT JOIN public.profiles p ON au.id = p.id
WHERE p.id IS NULL;
