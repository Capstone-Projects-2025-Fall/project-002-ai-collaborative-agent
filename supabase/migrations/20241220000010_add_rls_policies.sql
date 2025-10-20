-- Row Level Security (RLS) Policies for AI Collaborative Agent
-- This migration adds security policies to ensure users can only access their own data

-- ============================================================================
-- PROFILES TABLE RLS
-- ============================================================================

-- Enable RLS on profiles table
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if any
DROP POLICY IF EXISTS "Users can view all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Users can insert their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can delete their own profile" ON public.profiles;

-- Allow all authenticated users to view profiles (needed for team collaboration)
CREATE POLICY "Users can view all profiles" 
ON public.profiles 
FOR SELECT 
TO authenticated
USING (true);

-- Users can only insert their own profile (id must match auth.uid())
CREATE POLICY "Users can insert their own profile" 
ON public.profiles 
FOR INSERT 
TO authenticated
WITH CHECK (auth.uid() = id);

-- Users can only update their own profile
CREATE POLICY "Users can update their own profile" 
ON public.profiles 
FOR UPDATE 
TO authenticated
USING (auth.uid() = id)
WITH CHECK (auth.uid() = id);

-- Users can only delete their own profile
CREATE POLICY "Users can delete their own profile" 
ON public.profiles 
FOR DELETE 
TO authenticated
USING (auth.uid() = id);

-- ============================================================================
-- PROJECTS TABLE RLS
-- ============================================================================

-- Enable RLS on projects table
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if any
DROP POLICY IF EXISTS "Users can view projects they are members of" ON public.projects;
DROP POLICY IF EXISTS "Users can create projects" ON public.projects;
DROP POLICY IF EXISTS "Users can update their own projects" ON public.projects;
DROP POLICY IF EXISTS "Users can delete their own projects" ON public.projects;

-- Users can only view projects they are members of
CREATE POLICY "Users can view projects they are members of" 
ON public.projects 
FOR SELECT 
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.project_members 
    WHERE project_members.project_id = projects.id 
    AND project_members.user_id = auth.uid()
  )
);

-- All authenticated users can create projects
CREATE POLICY "Users can create projects" 
ON public.projects 
FOR INSERT 
TO authenticated
WITH CHECK (true);

-- Users can update projects they own (if owner_id is set) or are members of
CREATE POLICY "Users can update their own projects" 
ON public.projects 
FOR UPDATE 
TO authenticated
USING (
  owner_id = auth.uid() OR
  EXISTS (
    SELECT 1 FROM public.project_members 
    WHERE project_members.project_id = projects.id 
    AND project_members.user_id = auth.uid()
  )
)
WITH CHECK (
  owner_id = auth.uid() OR
  EXISTS (
    SELECT 1 FROM public.project_members 
    WHERE project_members.project_id = projects.id 
    AND project_members.user_id = auth.uid()
  )
);

-- Users can delete projects they own
CREATE POLICY "Users can delete their own projects" 
ON public.projects 
FOR DELETE 
TO authenticated
USING (owner_id = auth.uid());

-- ============================================================================
-- PROJECT_MEMBERS TABLE RLS
-- ============================================================================

-- Enable RLS on project_members table
ALTER TABLE public.project_members ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if any
DROP POLICY IF EXISTS "Users can view members of their projects" ON public.project_members;
DROP POLICY IF EXISTS "Users can add members to their projects" ON public.project_members;
DROP POLICY IF EXISTS "Users can remove themselves from projects" ON public.project_members;

-- Users can view members of projects they belong to
CREATE POLICY "Users can view members of their projects" 
ON public.project_members 
FOR SELECT 
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.project_members pm 
    WHERE pm.project_id = project_members.project_id 
    AND pm.user_id = auth.uid()
  )
);

-- Users can add themselves to a project (for invite system)
-- Or project owners can add members
CREATE POLICY "Users can add members to their projects" 
ON public.project_members 
FOR INSERT 
TO authenticated
WITH CHECK (
  user_id = auth.uid() OR
  EXISTS (
    SELECT 1 FROM public.projects 
    WHERE projects.id = project_members.project_id 
    AND projects.owner_id = auth.uid()
  )
);

-- Users can remove themselves from projects
-- Or project owners can remove members
CREATE POLICY "Users can remove themselves from projects" 
ON public.project_members 
FOR DELETE 
TO authenticated
USING (
  user_id = auth.uid() OR
  EXISTS (
    SELECT 1 FROM public.projects 
    WHERE projects.id = project_members.project_id 
    AND projects.owner_id = auth.uid()
  )
);

-- ============================================================================
-- AI_PROMPTS TABLE RLS
-- ============================================================================

-- Enable RLS on ai_prompts table
ALTER TABLE public.ai_prompts ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if any
DROP POLICY IF EXISTS "Users can view prompts for their projects" ON public.ai_prompts;
DROP POLICY IF EXISTS "Users can create prompts for their projects" ON public.ai_prompts;
DROP POLICY IF EXISTS "Users can update prompts for their projects" ON public.ai_prompts;
DROP POLICY IF EXISTS "Users can delete prompts for their projects" ON public.ai_prompts;

-- Users can only view AI prompts for projects they are members of
CREATE POLICY "Users can view prompts for their projects" 
ON public.ai_prompts 
FOR SELECT 
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.project_members 
    WHERE project_members.project_id = ai_prompts.project_id 
    AND project_members.user_id = auth.uid()
  )
);

-- Users can create prompts for projects they are members of
CREATE POLICY "Users can create prompts for their projects" 
ON public.ai_prompts 
FOR INSERT 
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.project_members 
    WHERE project_members.project_id = ai_prompts.project_id 
    AND project_members.user_id = auth.uid()
  )
);

-- Users can update prompts for projects they are members of
CREATE POLICY "Users can update prompts for their projects" 
ON public.ai_prompts 
FOR UPDATE 
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.project_members 
    WHERE project_members.project_id = ai_prompts.project_id 
    AND project_members.user_id = auth.uid()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.project_members 
    WHERE project_members.project_id = ai_prompts.project_id 
    AND project_members.user_id = auth.uid()
  )
);

-- Users can delete prompts for projects they are members of
CREATE POLICY "Users can delete prompts for their projects" 
ON public.ai_prompts 
FOR DELETE 
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.project_members 
    WHERE project_members.project_id = ai_prompts.project_id 
    AND project_members.user_id = auth.uid()
  )
);

-- ============================================================================
-- SUMMARY
-- ============================================================================
-- This migration implements Row Level Security for:
-- 1. Profiles: Users can see all profiles but only modify their own
-- 2. Projects: Users can only see and interact with projects they're members of
-- 3. Project Members: Users can only see members of their projects
-- 4. AI Prompts: Users can only see/create/update/delete prompts for their projects
--
-- Note: This ensures data isolation while allowing team collaboration

