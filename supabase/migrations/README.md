# Supabase Database Migrations

This directory contains all database migrations for the AI Collaborative Agent VS Code extension.

## Migration History

### 20241220000010_add_rls_policies.sql
**Purpose:** Implement Row Level Security (RLS) policies for data isolation and security

**Changes:**
- Enabled RLS on `profiles`, `projects`, `project_members`, and `ai_prompts` tables
- Added policies for profile management (users can view all profiles, but only modify their own)
- Added policies for project access (users can only see projects they're members of)
- Added policies for project member management (users can see members of their projects)
- Added policies for AI prompts (users can only access prompts for their projects)

**Impact:**
- Users can now only see and interact with data they have permission to access
- Profiles are visible to all authenticated users (for team collaboration)
- Projects and AI prompts are isolated to project members only

---

## Database Schema

### Tables Overview

1. **`profiles`** - User profile information
   - Links to `auth.users` via `id`
   - Stores user skills, programming languages, and preferences
   
2. **`projects`** - Project information
   - Contains project name, description, goals, requirements
   - Has unique `invite_code` for team collaboration
   - Optional `owner_id` to track project creator

3. **`project_members`** - Many-to-many relationship
   - Links users (`user_id`) to projects (`project_id`)
   - Enables team collaboration

4. **`ai_prompts`** - AI conversation history
   - Stores prompts and responses for each project
   - Links to projects via `project_id`

5. **`project_ai_history`** - Project-specific AI interaction history
   - Aggregates AI history per project

6. **`project_details`** - Additional project metadata
   - Denormalized data for performance

7. **`users`** - **DEPRECATED** (use `profiles` instead)
   - This table should not be used in new code

### Relationships

```
auth.users (Supabase Auth)
    ↓ (1:1)
profiles
    ↓ (1:many)
project_members
    ↓ (many:1)
projects
    ↓ (1:many)
ai_prompts
```

### Foreign Key Constraints

- `project_members.user_id` → `profiles.id` (ON DELETE CASCADE)
- `project_members.project_id` → `projects.id` (ON DELETE CASCADE)
- `ai_prompts.project_id` → `projects.id` (ON DELETE CASCADE)
- `projects.owner_id` → `profiles.id` (ON DELETE CASCADE)

---

## Applying Migrations

### Remote Database (Production)

1. Go to your Supabase Dashboard
2. Navigate to SQL Editor
3. Copy the migration SQL file contents
4. Run the SQL script
5. Verify the changes in the Table Editor

### Local Development (if using Supabase CLI)

```bash
# Start local Supabase
supabase start

# Apply migrations
supabase db push

# View migration status
supabase migration list
```

---

## Rollback Instructions

### To Disable RLS (if needed for debugging)

```sql
-- Disable RLS on all tables
ALTER TABLE public.profiles DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.projects DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_members DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_prompts DISABLE ROW LEVEL SECURITY;
```

### To Re-enable RLS

```sql
-- Re-enable RLS on all tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_prompts ENABLE ROW LEVEL SECURITY;
```

### To Drop All RLS Policies

```sql
-- Drop all policies on profiles
DROP POLICY IF EXISTS "Users can view all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Users can insert their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can delete their own profile" ON public.profiles;

-- Drop all policies on projects
DROP POLICY IF EXISTS "Users can view projects they are members of" ON public.projects;
DROP POLICY IF EXISTS "Users can create projects" ON public.projects;
DROP POLICY IF EXISTS "Users can update their own projects" ON public.projects;
DROP POLICY IF EXISTS "Users can delete their own projects" ON public.projects;

-- Drop all policies on project_members
DROP POLICY IF EXISTS "Users can view members of their projects" ON public.project_members;
DROP POLICY IF EXISTS "Users can add members to their projects" ON public.project_members;
DROP POLICY IF EXISTS "Users can remove themselves from projects" ON public.project_members;

-- Drop all policies on ai_prompts
DROP POLICY IF EXISTS "Users can view prompts for their projects" ON public.ai_prompts;
DROP POLICY IF EXISTS "Users can create prompts for their projects" ON public.ai_prompts;
DROP POLICY IF EXISTS "Users can update prompts for their projects" ON public.ai_prompts;
DROP POLICY IF EXISTS "Users can delete prompts for their projects" ON public.ai_prompts;
```

---

## Testing Migrations

### Verify RLS is Working

1. **Login as User A**
   - Create a project
   - Note the invite code

2. **Login as User B**
   - Verify you cannot see User A's project
   - Join User A's project using the invite code
   - Verify you can now see the project

3. **Test Profile Access**
   - Both users should be able to see each other's profiles
   - Each user should only be able to edit their own profile

### Common Issues

**Issue:** `new row violates row-level security policy`
- **Cause:** Trying to insert/update data that violates RLS policies
- **Solution:** Ensure the authenticated user has permission for the operation

**Issue:** `Key is not present in table "profiles"`
- **Cause:** User doesn't have a profile yet
- **Solution:** The extension automatically creates profiles on first login

**Issue:** Projects not showing up
- **Cause:** User is not a member of any projects
- **Solution:** Create a new project or join via invite code

---

## Environment Variables

Required environment variables (stored in `.env` file in project root):

```bash
SUPABASE_URL=your-project-url.supabase.co
SUPABASE_ANON_KEY=your-anon-key
```

---

## Support

For issues or questions about migrations, contact the development team or refer to the main project README.

