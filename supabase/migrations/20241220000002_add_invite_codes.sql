-- Add invite_code column to projects table
ALTER TABLE public.projects 
ADD COLUMN IF NOT EXISTS invite_code VARCHAR(6) UNIQUE;

-- Update existing projects with invite codes
UPDATE public.projects 
SET invite_code = UPPER(SUBSTRING(MD5(RANDOM()::TEXT), 1, 6))
WHERE invite_code IS NULL;

-- Create index for faster invite code lookups
CREATE INDEX IF NOT EXISTS idx_projects_invite_code ON public.projects(invite_code);
