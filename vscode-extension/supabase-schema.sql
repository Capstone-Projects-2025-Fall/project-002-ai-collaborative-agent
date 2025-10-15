-- AI Collab Agent - Supabase Database Schema

-- ============================================
-- DROP EXISTING TABLES
-- ============================================
DROP TABLE IF EXISTS ai_prompts CASCADE;
DROP TABLE IF EXISTS project_members CASCADE;
DROP TABLE IF EXISTS projects CASCADE;
DROP TABLE IF EXISTS users CASCADE;

-- ============================================
-- 1. USERS TABLE (Team Members)
-- ============================================
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    skills TEXT NOT NULL,
    programming_languages TEXT NOT NULL,
    willing_to_work_on TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- index for faster queries
CREATE INDEX IF NOT EXISTS idx_users_created_at ON users(created_at DESC);

-- ============================================
-- 2. PROJECTS TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS projects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    description TEXT NOT NULL,
    goals TEXT,
    requirements TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- index for faster queries
CREATE INDEX IF NOT EXISTS idx_projects_created_at ON projects(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_projects_name ON projects(name);

-- ============================================
-- 3. PROJECT_MEMBERS TABLE (Junction Table)
-- Many-to-many relationship between projects and users
-- ============================================
CREATE TABLE IF NOT EXISTS project_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(project_id, user_id)
);

-- indexes for faster joins
CREATE INDEX IF NOT EXISTS idx_project_members_project_id ON project_members(project_id);
CREATE INDEX IF NOT EXISTS idx_project_members_user_id ON project_members(user_id);

-- ============================================
-- 4. AI_PROMPTS TABLE
-- Store AI-generated analysis and task delegations
-- ============================================
CREATE TABLE IF NOT EXISTS ai_prompts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    prompt_content TEXT NOT NULL,
    ai_response TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- indexes
CREATE INDEX IF NOT EXISTS idx_ai_prompts_project_id ON ai_prompts(project_id);
CREATE INDEX IF NOT EXISTS idx_ai_prompts_created_at ON ai_prompts(created_at DESC);

-- ============================================
-- 6. FUNCTIONS & TRIGGERS
-- Auto-update updated_at timestamp
-- ============================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- trigger to users table
DROP TRIGGER IF EXISTS update_users_updated_at ON users;
CREATE TRIGGER update_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- trigger to projects table
DROP TRIGGER IF EXISTS update_projects_updated_at ON projects;
CREATE TRIGGER update_projects_updated_at
    BEFORE UPDATE ON projects
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- 7. ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================

-- Enable RLS on all tables
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_prompts ENABLE ROW LEVEL SECURITY;
ALTER TABLE statistics ENABLE ROW LEVEL SECURITY;

-- Policies for public access
-- For development, we'll allow all operations. In production, we'll restrict these. basesd on our security needs

-- Users table policies
CREATE POLICY "Allow all operations on users" ON users
    FOR ALL USING (true) WITH CHECK (true);

-- Projects table policies
CREATE POLICY "Allow all operations on projects" ON projects
    FOR ALL USING (true) WITH CHECK (true);

-- Project members table policies
CREATE POLICY "Allow all operations on project_members" ON project_members
    FOR ALL USING (true) WITH CHECK (true);

-- AI prompts table policies
CREATE POLICY "Allow all operations on ai_prompts" ON ai_prompts
    FOR ALL USING (true) WITH CHECK (true);

-- ============================================
-- 8. HELPFUL VIEWS
-- ============================================

-- View to get projects with their team members
CREATE OR REPLACE VIEW project_details AS
SELECT 
    p.id AS project_id,
    p.name AS project_name,
    p.description,
    p.goals,
    p.requirements,
    p.created_at AS project_created_at,
    json_agg(
        json_build_object(
            'user_id', u.id,
            'name', u.name,
            'skills', u.skills,
            'programming_languages', u.programming_languages,
            'willing_to_work_on', u.willing_to_work_on
        )
    ) AS team_members
FROM projects p
LEFT JOIN project_members pm ON p.id = pm.project_id
LEFT JOIN users u ON pm.user_id = u.id
GROUP BY p.id, p.name, p.description, p.goals, p.requirements, p.created_at;

-- View to get AI prompt history for projects
CREATE OR REPLACE VIEW project_ai_history AS
SELECT 
    p.id AS project_id,
    p.name AS project_name,
    ap.id AS prompt_id,
    ap.ai_response,
    ap.created_at AS prompt_created_at
FROM projects p
LEFT JOIN ai_prompts ap ON p.id = ap.project_id
ORDER BY ap.created_at DESC;
