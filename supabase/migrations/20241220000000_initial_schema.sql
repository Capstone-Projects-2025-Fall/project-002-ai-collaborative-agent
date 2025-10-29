-- Initial schema for AI Collaborative Agent
-- This migration creates all necessary tables for user profiles, projects, and collaboration

-- Enable necessary extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create profiles table (linked to auth.users)
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
    name TEXT NOT NULL,
    skills TEXT[] DEFAULT '{}',
    languages TEXT[] DEFAULT '{}',
    preferences TEXT DEFAULT '',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create projects table
CREATE TABLE IF NOT EXISTS public.projects (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT DEFAULT '',
    owner_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
    invite_code TEXT UNIQUE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create project_members junction table
CREATE TABLE IF NOT EXISTS public.project_members (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE NOT NULL,
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
    role TEXT DEFAULT 'member' CHECK (role IN ('owner', 'member')),
    joined_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(project_id, user_id)
);

-- Create project_invites table for email invitations
CREATE TABLE IF NOT EXISTS public.project_invites (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE NOT NULL,
    email TEXT NOT NULL,
    invited_by UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    expires_at TIMESTAMP WITH TIME ZONE DEFAULT (NOW() + INTERVAL '7 days')
);

-- Create ai_prompts table for storing generated prompts
CREATE TABLE IF NOT EXISTS public.ai_prompts (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE NOT NULL,
    content TEXT NOT NULL,
    generated_by UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_profiles_user_id ON public.profiles(user_id);
CREATE INDEX IF NOT EXISTS idx_projects_owner_id ON public.projects(owner_id);
CREATE INDEX IF NOT EXISTS idx_projects_invite_code ON public.projects(invite_code);
CREATE INDEX IF NOT EXISTS idx_project_members_project_id ON public.project_members(project_id);
CREATE INDEX IF NOT EXISTS idx_project_members_user_id ON public.project_members(user_id);
CREATE INDEX IF NOT EXISTS idx_project_invites_project_id ON public.project_invites(project_id);
CREATE INDEX IF NOT EXISTS idx_project_invites_email ON public.project_invites(email);
CREATE INDEX IF NOT EXISTS idx_ai_prompts_project_id ON public.ai_prompts(project_id);

-- Create function to generate invite codes
CREATE OR REPLACE FUNCTION generate_invite_code()
RETURNS TEXT AS $$
DECLARE
    chars TEXT := 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    result TEXT := '';
    i INTEGER;
BEGIN
    FOR i IN 1..6 LOOP
        result := result || substr(chars, floor(random() * length(chars) + 1)::integer, 1);
    END LOOP;
    RETURN result;
END;
$$ LANGUAGE plpgsql;

-- Create function to automatically generate invite codes for new projects
CREATE OR REPLACE FUNCTION set_project_invite_code()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.invite_code IS NULL OR NEW.invite_code = '' THEN
        NEW.invite_code := generate_invite_code();
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to auto-generate invite codes
CREATE TRIGGER trigger_set_project_invite_code
    BEFORE INSERT ON public.projects
    FOR EACH ROW
    EXECUTE FUNCTION set_project_invite_code();

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create triggers for updated_at
CREATE TRIGGER trigger_profiles_updated_at
    BEFORE UPDATE ON public.profiles
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trigger_projects_updated_at
    BEFORE UPDATE ON public.projects
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Row Level Security (RLS) Policies

-- Enable RLS on all tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_invites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_prompts ENABLE ROW LEVEL SECURITY;

-- Profiles policies
CREATE POLICY "Users can view their own profile" ON public.profiles
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can update their own profile" ON public.profiles
    FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own profile" ON public.profiles
    FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Projects policies
CREATE POLICY "Users can view projects they own or are members of" ON public.projects
    FOR SELECT USING (
        owner_id IN (
            SELECT id FROM public.profiles WHERE user_id = auth.uid()
        ) OR
        id IN (
            SELECT project_id FROM public.project_members pm
            JOIN public.profiles p ON pm.user_id = p.id
            WHERE p.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can create projects" ON public.projects
    FOR INSERT WITH CHECK (
        owner_id IN (
            SELECT id FROM public.profiles WHERE user_id = auth.uid()
        )
    );

CREATE POLICY "Project owners can update their projects" ON public.projects
    FOR UPDATE USING (
        owner_id IN (
            SELECT id FROM public.profiles WHERE user_id = auth.uid()
        )
    );

CREATE POLICY "Project owners can delete their projects" ON public.projects
    FOR DELETE USING (
        owner_id IN (
            SELECT id FROM public.profiles WHERE user_id = auth.uid()
        )
    );

-- Project members policies
CREATE POLICY "Users can view project members of projects they belong to" ON public.project_members
    FOR SELECT USING (
        project_id IN (
            SELECT id FROM public.projects p
            WHERE p.owner_id IN (
                SELECT id FROM public.profiles WHERE user_id = auth.uid()
            ) OR p.id IN (
                SELECT project_id FROM public.project_members pm
                JOIN public.profiles p2 ON pm.user_id = p2.id
                WHERE p2.user_id = auth.uid()
            )
        )
    );

CREATE POLICY "Project owners can add members" ON public.project_members
    FOR INSERT WITH CHECK (
        project_id IN (
            SELECT id FROM public.projects
            WHERE owner_id IN (
                SELECT id FROM public.profiles WHERE user_id = auth.uid()
            )
        )
    );

CREATE POLICY "Project owners can remove members" ON public.project_members
    FOR DELETE USING (
        project_id IN (
            SELECT id FROM public.projects
            WHERE owner_id IN (
                SELECT id FROM public.profiles WHERE user_id = auth.uid()
            )
        )
    );

-- Allow users to join projects via invite code (public access for invite codes)
CREATE POLICY "Anyone can join project with valid invite code" ON public.project_members
    FOR INSERT WITH CHECK (
        project_id IN (
            SELECT id FROM public.projects
            WHERE invite_code IS NOT NULL
        )
    );

-- Project invites policies
CREATE POLICY "Users can view invites for their projects" ON public.project_invites
    FOR SELECT USING (
        project_id IN (
            SELECT id FROM public.projects
            WHERE owner_id IN (
                SELECT id FROM public.profiles WHERE user_id = auth.uid()
            )
        )
    );

CREATE POLICY "Project owners can create invites" ON public.project_invites
    FOR INSERT WITH CHECK (
        project_id IN (
            SELECT id FROM public.projects
            WHERE owner_id IN (
                SELECT id FROM public.profiles WHERE user_id = auth.uid()
            )
        )
    );

CREATE POLICY "Project owners can update invites" ON public.project_invites
    FOR UPDATE USING (
        project_id IN (
            SELECT id FROM public.projects
            WHERE owner_id IN (
                SELECT id FROM public.profiles WHERE user_id = auth.uid()
            )
        )
    );

-- AI prompts policies
CREATE POLICY "Users can view prompts for projects they belong to" ON public.ai_prompts
    FOR SELECT USING (
        project_id IN (
            SELECT id FROM public.projects p
            WHERE p.owner_id IN (
                SELECT id FROM public.profiles WHERE user_id = auth.uid()
            ) OR p.id IN (
                SELECT project_id FROM public.project_members pm
                JOIN public.profiles p2 ON pm.user_id = p2.id
                WHERE p2.user_id = auth.uid()
            )
        )
    );

CREATE POLICY "Users can create prompts for projects they belong to" ON public.ai_prompts
    FOR INSERT WITH CHECK (
        project_id IN (
            SELECT id FROM public.projects p
            WHERE p.owner_id IN (
                SELECT id FROM public.profiles WHERE user_id = auth.uid()
            ) OR p.id IN (
                SELECT project_id FROM public.project_members pm
                JOIN public.profiles p2 ON pm.user_id = p2.id
                WHERE p2.user_id = auth.uid()
            )
        ) AND
        generated_by IN (
            SELECT id FROM public.profiles WHERE user_id = auth.uid()
        )
    );

-- Create function to handle new user signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.profiles (user_id, name)
    VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'name', NEW.email));
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger to automatically create profile on user signup
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
