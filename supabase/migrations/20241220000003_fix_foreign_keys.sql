-- Fix foreign key constraints to reference profiles instead of users

-- Drop the existing foreign key constraint
ALTER TABLE public.project_members 
DROP CONSTRAINT IF EXISTS project_members_user_id_fkey;

-- Add the correct foreign key constraint to reference profiles
ALTER TABLE public.project_members 
ADD CONSTRAINT project_members_user_id_fkey 
FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

-- Also fix the project_members_project_id_fkey if it exists
ALTER TABLE public.project_members 
DROP CONSTRAINT IF EXISTS project_members_project_id_fkey;

ALTER TABLE public.project_members 
ADD CONSTRAINT project_members_project_id_fkey 
FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;
