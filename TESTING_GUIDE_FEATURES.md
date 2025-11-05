# Testing Guide for Bug Fixes and Features

## Current Status

### ✅ What's Working
1. **Basic project creation** - Projects can be created (but owner_id is missing, which will cause issues)
2. **Profile management** - Users can update their profiles
3. **Join project** - Users can join projects via invite code

### ❌ What's NOT Working (Code Reverted)

1. **Branch 1: Windows OAuth Fix** - Reverted to old `exec` method (will fail on Windows)
2. **Branch 2: Username Fix** - Migration file deleted
3. **Branch 3: Project Deletion** - All methods removed:
   - `deleteProject()` - REMOVED
   - `leaveProject()` - REMOVED
   - `getProjectOwner()` - REMOVED
   - Owner tracking in `createProject()` - REMOVED
4. **Branch 4: Project Editing** - All features removed:
   - `updateProject()` - REMOVED
   - `removeProjectMember()` - REMOVED
   - Edit modal UI - REMOVED
   - Edit button - REMOVED

### ⚠️ Critical Issue: Missing `owner_id`

The database schema **REQUIRES** `owner_id` (it's NOT NULL), but `createProject()` is not setting it. This will cause:
- Project creation to **FAIL** with database constraint violation
- RLS policies won't work correctly
- Project deletion/editing impossible

---

## Database Migrations Needed

### 1. Fix existing projects without owner_id (CRITICAL)

If you have existing projects in the database without `owner_id`, you need to fix them:

```sql
-- Create migration: 20241220000012_fix_missing_owner_ids.sql
-- This assigns the first project member as owner for projects without owner_id

UPDATE public.projects p
SET owner_id = (
    SELECT pm.user_id 
    FROM public.project_members pm 
    WHERE pm.project_id = p.id 
    ORDER BY pm.joined_at ASC 
    LIMIT 1
)
WHERE owner_id IS NULL OR owner_id NOT IN (SELECT id FROM public.profiles);
```

### 2. Fix "Thomas Ishida" default names (Optional)

```sql
-- Create migration: 20241220000011_fix_thomas_ishida_names.sql
UPDATE public.profiles p
SET name = COALESCE(
    (SELECT au.raw_user_meta_data->>'full_name' FROM auth.users au WHERE au.id = p.id),
    (SELECT au.raw_user_meta_data->>'name' FROM auth.users au WHERE au.id = p.id),
    (SELECT SPLIT_PART(au.email, '@', 1) FROM auth.users au WHERE au.id = p.id),
    'User'
)
WHERE p.name = 'Thomas Ishida' OR p.name IS NULL OR p.name = '';
```

---

## How to Test Each Feature

### Prerequisites

1. **Install VS Code Extension:**
   ```bash
   cd vscode-extension
   npm install
   npm run compile
   # Then install the .vsix file in VS Code
   ```

2. **Set up Supabase:**
   ```bash
   # Make sure you have Supabase CLI installed
   supabase start
   # Or connect to your remote Supabase instance
   ```

3. **Run Migrations:**
   ```bash
   supabase db reset  # This will run all migrations
   # OR
   supabase migration up  # Apply pending migrations
   ```

---

## Testing Branch 1: Windows OAuth Fix

### Current Status: ❌ NOT FIXED (Code reverted)

**What to test:**
1. Open VS Code extension
2. Click "Sign in with Google" or "Sign in with GitHub"
3. **Expected on Windows:** Browser should open automatically
4. **Current behavior:** Command line prompt appears instead

**To fix:** Re-implement the Windows OAuth fix using `vscode.env.openExternal()`

**Test Steps:**
1. On Windows machine, open VS Code
2. Open extension panel
3. Click OAuth login button
4. Verify browser opens (not command prompt)

---

## Testing Branch 2: Username Fix

### Current Status: ❌ Migration deleted

**What to test:**
1. Create a new user account (without providing a name)
2. Check if profile shows "Thomas Ishida" or proper default
3. **Expected:** Should show email prefix or "User"
4. **Current:** May show "Thomas Ishida" from old migrations

**Test Steps:**
1. Sign up with OAuth (Google/GitHub) without full name
2. Check profile display in extension
3. Verify name is not "Thomas Ishida"
4. Check database: `SELECT name FROM profiles WHERE name = 'Thomas Ishida';`

**To fix:** Re-create the migration file or run the SQL manually

---

## Testing Branch 3: Project Deletion & Ownership

### Current Status: ❌ NOT IMPLEMENTED (All code removed)

**What to test:**

#### 3.1 Project Creation with Owner
1. Create a new project
2. **Expected:** Project should have owner_id set
3. **Current:** Will FAIL because owner_id is required but not set

**Test Steps:**
1. Create a project
2. Check database: `SELECT id, name, owner_id FROM projects WHERE name = 'Test Project';`
3. Verify owner_id is set (currently will be NULL and fail)

#### 3.2 Project Deletion (Owner)
1. As project owner, try to delete project
2. **Expected:** Delete button should appear, deletion should work
3. **Current:** No delete functionality exists

**Test Steps:**
1. Create project as User A
2. Verify owner badge appears
3. Click "Delete Project" button
4. Verify project is removed from database

#### 3.3 Leave Project (Non-owner)
1. As project member (not owner), try to leave project
2. **Expected:** "Leave Project" button should appear
3. **Current:** No leave functionality exists

**Test Steps:**
1. User A creates project
2. User B joins project via invite code
3. User B should see "Leave Project" button
4. Click button, verify User B is removed from project_members

**To fix:** Re-implement all deletion/leave methods

---

## Testing Branch 4: Project Editing

### Current Status: ❌ NOT IMPLEMENTED (All code removed)

**What to test:**

#### 4.1 Edit Project Details
1. As project member or owner, edit project
2. **Expected:** Edit button (✏️) should appear, modal opens
3. **Current:** No edit functionality exists

**Test Steps:**
1. Create or join a project
2. Verify edit button appears next to project name
3. Click edit button
4. Modify description, goals, or requirements
5. Save changes
6. Verify changes persist in database

#### 4.2 Owner Remove Members
1. As project owner, remove a member
2. **Expected:** Remove button appears in edit modal
3. **Current:** No member removal functionality exists

**Test Steps:**
1. Owner creates project
2. Add member to project
3. Owner opens edit modal
4. Verify member list shows with remove buttons
5. Remove a member
6. Verify member is removed from project_members table

**To fix:** Re-implement all editing methods and UI

---

## Quick Fix Checklist

### Immediate Actions Required:

1. **Fix `createProject()` to include `owner_id`:**
   ```typescript
   // In databaseService.ts
   async createProject(name: string, description: string, goals: string = '', requirements: string = '', ownerId: string): Promise<Project | null> {
     const insertData = {
       name,
       description,
       goals,
       requirements,
       invite_code: inviteCode,
       owner_id: ownerId  // ← ADD THIS
     };
   }
   ```

2. **Update `extension.ts` to pass ownerId:**
   ```typescript
   const project = await databaseService.createProject(name, description, goals, requirements, user.id);
   ```

3. **Run migration to fix existing projects:**
   ```bash
   supabase migration new fix_missing_owner_ids
   # Then add the SQL from section above
   supabase db reset
   ```

4. **Re-implement Windows OAuth fix** (use `vscode.env.openExternal()`)

5. **Re-implement project deletion/leave methods**

6. **Re-implement project editing methods and UI**

---

## Database Queries for Verification

### Check projects without owners:
```sql
SELECT id, name, owner_id FROM projects WHERE owner_id IS NULL;
```

### Check "Thomas Ishida" profiles:
```sql
SELECT id, name, created_at FROM profiles WHERE name = 'Thomas Ishida';
```

### Check project members:
```sql
SELECT p.name as project_name, pr.name as member_name, pm.user_id
FROM project_members pm
JOIN projects p ON pm.project_id = p.id
JOIN profiles pr ON pm.user_id = pr.id;
```

### Check project ownership:
```sql
SELECT p.name, pr.name as owner_name, p.owner_id
FROM projects p
JOIN profiles pr ON p.owner_id = pr.id;
```

---

## Testing Environment Setup

1. **Local Supabase:**
   ```bash
   supabase start
   supabase db reset
   ```

2. **VS Code Extension:**
   ```bash
   cd vscode-extension
   npm install
   npm run compile
   # Press F5 in VS Code to launch extension development host
   ```

3. **Test Accounts:**
   - Create at least 2 test accounts (User A and User B)
   - User A will be project owner
   - User B will be project member

4. **Monitor Logs:**
   - VS Code Output panel → "Log (Extension Host)"
   - Browser console for webview errors
   - Supabase logs: `supabase logs`

---

## Expected vs Current Behavior Summary

| Feature | Expected | Current | Status |
|---------|----------|---------|--------|
| Windows OAuth | Browser opens | Command prompt | ❌ Broken |
| Username default | "User" or email | "Thomas Ishida" | ❌ Broken |
| Project creation | Sets owner_id | Missing owner_id | ❌ Broken |
| Project deletion | Owner can delete | No functionality | ❌ Missing |
| Leave project | Member can leave | No functionality | ❌ Missing |
| Edit project | Members can edit | No functionality | ❌ Missing |
| Remove members | Owner can remove | No functionality | ❌ Missing |

