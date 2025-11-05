-- Fix Row Level Security policies for the AI Collab Agent extension

-- First, let's check what policies currently exist and drop them if needed
DROP POLICY IF EXISTS "Allow public read access" ON public.profiles;
DROP POLICY IF EXISTS "Allow individual users to create profiles." ON public.profiles;
DROP POLICY IF EXISTS "Allow individual users to update their own profile." ON public.profiles;

-- Create proper RLS policies for profiles table
-- Users can view all profiles (for team collaboration)
CREATE POLICY "Allow public read access" ON public.profiles 
  FOR SELECT 
  USING (true);

-- Users can insert their own profile (id must match auth.uid())
CREATE POLICY "Allow users to create their own profile" ON public.profiles 
  FOR INSERT 
  WITH CHECK (auth.uid() = id);

-- Users can update their own profile
CREATE POLICY "Allow users to update their own profile" ON public.profiles 
  FOR UPDATE 
  USING (auth.uid() = id) 
  WITH CHECK (auth.uid() = id);

-- Users can delete their own profile
CREATE POLICY "Allow users to delete their own profile" ON public.profiles 
  FOR DELETE 
  USING (auth.uid() = id);

-- Create RLS policies for projects table
-- Anyone can view projects (for collaboration)
CREATE POLICY "Allow public read access" ON public.projects 
  FOR SELECT 
  USING (true);

-- Users can create projects
CREATE POLICY "Allow users to create projects" ON public.projects 
  FOR INSERT 
  WITH CHECK (true);

-- Users can update projects (for now, allow all - we'll restrict later)
CREATE POLICY "Allow users to update projects" ON public.projects 
  FOR UPDATE 
  USING (true) 
  WITH CHECK (true);

-- Users can delete projects (for now, allow all - we'll restrict later)
CREATE POLICY "Allow users to delete projects" ON public.projects 
  FOR DELETE 
  USING (true);

-- Create RLS policies for project_members table
-- Users can view project members for projects they're part of
CREATE POLICY "Allow members to view project members" ON public.project_members 
  FOR SELECT 
  USING (
    EXISTS (
      SELECT 1 FROM public.project_members pm 
      WHERE pm.project_id = project_members.project_id 
      AND pm.user_id = auth.uid()
    )
  );

-- Users can add themselves to projects
CREATE POLICY "Allow users to join projects" ON public.project_members 
  FOR INSERT 
  WITH CHECK (auth.uid() = user_id);

-- Users can remove themselves from projects
CREATE POLICY "Allow users to leave projects" ON public.project_members 
  FOR DELETE 
  USING (auth.uid() = user_id);

-- Create RLS policies for ai_prompts table
-- Users can view AI prompts for projects they're members of
CREATE POLICY "Allow members to view AI prompts" ON public.ai_prompts 
  FOR SELECT 
  USING (
    EXISTS (
      SELECT 1 FROM public.project_members pm 
      WHERE pm.project_id = ai_prompts.project_id 
      AND pm.user_id = auth.uid()
    )
  );

-- Users can create AI prompts for projects they're members of
CREATE POLICY "Allow members to create AI prompts" ON public.ai_prompts 
  FOR INSERT 
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.project_members pm 
      WHERE pm.project_id = ai_prompts.project_id 
      AND pm.user_id = auth.uid()
    )
  );

-- Users can update AI prompts they created
CREATE POLICY "Allow users to update their AI prompts" ON public.ai_prompts 
  FOR UPDATE 
  USING (
    generated_by IN (
      SELECT id FROM public.profiles WHERE user_id = auth.uid()
    )
  ) 
  WITH CHECK (
    generated_by IN (
      SELECT id FROM public.profiles WHERE user_id = auth.uid()
    )
  );

-- Users can delete their own AI prompts
CREATE POLICY "Allow users to delete their AI prompts" ON public.ai_prompts 
  FOR DELETE 
  USING (
    generated_by IN (
      SELECT id FROM public.profiles WHERE user_id = auth.uid()
    )
  );