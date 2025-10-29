-- Complete fix for foreign key constraints and missing columns

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

-- 5. Ensure the user profile exists for the current user
-- This will create a profile if it doesn't exist
INSERT INTO public.profiles (id, name, skills, programming_languages, willing_to_work_on)
SELECT 
    'f575b6cb-f437-48b7-a1fd-5f2186c6547c' as id,
    'Thomas Ishida' as name,
    '' as skills,
    '' as programming_languages,
    '' as willing_to_work_on
WHERE NOT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = 'f575b6cb-f437-48b7-a1fd-5f2186c6547c'
);
