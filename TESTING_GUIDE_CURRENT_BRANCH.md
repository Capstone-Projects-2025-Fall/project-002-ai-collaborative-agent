# Testing Guide - edit-projects-CA2-56 Branch

## Current Branch Status

**Branch:** `edit-projects-CA2-56`

## ✅ Implemented Features

### 1. Project Deletion (Owner Only)
- ✅ `deleteProject()` method in `databaseService.ts`
- ✅ Message handler in `extension.ts`
- ✅ "Delete Project" button in UI (only for owners)

### 2. Leave Project (Non-Owners)
- ✅ `leaveProject()` method in `databaseService.ts`
- ✅ Message handler in `extension.ts`
- ✅ "Leave Project" button in UI (for non-owners)

### 3. Project Editing
- ✅ `updateProject()` method in `databaseService.ts`
- ✅ Message handler in `extension.ts`
- ✅ Edit button (✏️) in UI
- ✅ Edit modal with form
- ✅ Member management section (owner only)

### 4. Remove Project Members (Owner Only)
- ✅ `removeProjectMember()` method in `databaseService.ts`
- ✅ Message handler in `extension.ts`
- ✅ Remove buttons in edit modal

### 5. Owner Display
- ✅ Owner badge display
- ✅ Owner indicator in project cards

## ⚠️ Critical Issues to Fix Before Testing

### Issue 1: Missing `owner_id` in Project Creation (CRITICAL)

**Problem:** `createProject()` doesn't accept or set `owner_id`, but database requires it.

**Fix Needed:**
```typescript
// In databaseService.ts line 169
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

// In extension.ts line 795
const project = await databaseService.createProject(name, description, goals, requirements, user.id);  // ← ADD user.id
```

### Issue 2: Windows OAuth Not Fixed

**Status:** Still using `exec` instead of `vscode.env.openExternal()`

**Impact:** Will fail on Windows machines

---

## Pre-Testing Setup

### 1. Fix Critical Issues First

Before testing, you MUST fix the `owner_id` issue or project creation will fail.

### 2. Database Migration (If You Have Existing Projects)

If you have existing projects without `owner_id`, run this migration:

```sql
-- Create: supabase/migrations/20241220000012_fix_missing_owner_ids.sql
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

### 3. Build and Install Extension

```bash
cd vscode-extension
npm install
npm run compile
# Press F5 in VS Code to launch extension development host
```

---

## Testing Scenarios

### Test 1: Project Creation with Owner

**Steps:**
1. Open VS Code extension panel
2. Go to "Projects" tab
3. Fill in project form:
   - Name: "Test Project 1"
   - Description: "This is a test project"
   - Goals: "Learn testing"
   - Requirements: "Must have tests"
4. Select team members (optional)
5. Click "Create Project"

**Expected:**
- ✅ Success message: "Project 'Test Project 1' created successfully!"
- ✅ Project appears in project list
- ✅ Owner badge appears next to project name
- ✅ "Delete Project" button visible (not "Leave Project")

**Verification:**
```sql
SELECT id, name, owner_id FROM projects WHERE name = 'Test Project 1';
-- Should show owner_id is set (not NULL)
```

**If it fails:**
- Check VS Code Output panel for errors
- Verify `owner_id` is being set (fix the code above first)

---

### Test 2: Edit Project Details

**Prerequisites:** Have a project created (you as owner or member)

**Steps:**
1. Find your project in the project list
2. Verify "✏️ Edit" button appears next to project name
3. Click "✏️ Edit" button
4. Edit modal should open
5. Modify:
   - Description: "Updated description"
   - Goals: "Updated goals"
   - Requirements: "Updated requirements"
6. Click "Save Changes"

**Expected:**
- ✅ Modal opens with current project data
- ✅ Project name field is read-only (grayed out)
- ✅ Success message: "Project updated successfully!"
- ✅ Changes reflected in project list
- ✅ Database updated

**Verification:**
```sql
SELECT description, goals, requirements 
FROM projects 
WHERE name = 'Test Project 1';
-- Should show updated values
```

**Edge Cases to Test:**
- Non-member tries to edit → Should fail with permission error
- Edit without description → Should show validation error

---

### Test 3: Owner Delete Project

**Prerequisites:** Have a project where you are the owner

**Steps:**
1. Find your project in the list
2. Verify "Delete Project" button appears (red button)
3. Click "Delete Project"
4. Confirm deletion in dialog

**Expected:**
- ✅ Confirmation dialog appears
- ✅ Success message: "Project deleted successfully!"
- ✅ Project removed from project list
- ✅ Project removed from database
- ✅ All project_members cascade deleted

**Verification:**
```sql
SELECT * FROM projects WHERE name = 'Test Project 1';
-- Should return 0 rows

SELECT * FROM project_members WHERE project_id = '<deleted_project_id>';
-- Should return 0 rows
```

**Edge Cases to Test:**
- Non-owner tries to delete → Should show "Failed to delete project. You may not be the owner."

---

### Test 4: Non-Owner Leave Project

**Prerequisites:** 
- User A creates a project
- User B joins the project via invite code

**Steps (as User B):**
1. Find the project in your project list
2. Verify "Leave Project" button appears (not "Delete Project")
3. Click "Leave Project"
4. Confirm leaving in dialog

**Expected:**
- ✅ Confirmation dialog appears
- ✅ Success message: "Left project successfully!"
- ✅ Project removed from User B's project list
- ✅ User B removed from project_members table
- ✅ Project still exists (User A still sees it)

**Verification:**
```sql
-- As User B
SELECT * FROM project_members 
WHERE user_id = '<user_b_id>' AND project_id = '<project_id>';
-- Should return 0 rows

-- Project should still exist
SELECT * FROM projects WHERE id = '<project_id>';
-- Should return 1 row
```

**Edge Cases to Test:**
- Owner tries to leave → Should show "Failed to leave project. If you're the owner, you must delete the project instead."

---

### Test 5: Owner Remove Member from Project

**Prerequisites:**
- User A is owner of a project
- User B is a member of the project

**Steps (as User A - Owner):**
1. Open project in list
2. Click "✏️ Edit" button
3. Edit modal opens
4. Scroll to "Team Members" section
5. Verify User B appears in member list
6. Click "Remove" button next to User B
7. Confirm removal

**Expected:**
- ✅ Member list shows all project members
- ✅ Owner badge shows next to owner's name
- ✅ "Remove" button appears for non-owner members
- ✅ No "Remove" button for owner
- ✅ Success message: "Member removed from project successfully!"
- ✅ User B removed from project_members table
- ✅ Modal updates to show updated member list

**Verification:**
```sql
SELECT * FROM project_members 
WHERE project_id = '<project_id>' AND user_id = '<user_b_id>';
-- Should return 0 rows
```

**Edge Cases to Test:**
- Non-owner tries to remove member → Should fail
- Owner tries to remove themselves → Should be prevented (no button shown)

---

### Test 6: Owner Badge Display

**Steps:**
1. Create a project (you become owner)
2. Join someone else's project (you become member)

**Expected:**
- ✅ Your projects show green "Owner" badge
- ✅ Other projects don't show owner badge for you
- ✅ Edit button appears for all projects you're a member of
- ✅ Delete button only on your projects
- ✅ Leave button only on projects you're not owner of

---

### Test 7: Project Name Cannot Be Edited

**Steps:**
1. Open edit modal for a project
2. Try to edit the "Project Name" field

**Expected:**
- ✅ Project Name field is read-only (grayed out)
- ✅ Field shows current project name
- ✅ Cannot type in the field
- ✅ Placeholder text: "Project name cannot be changed"

---

## Database Verification Queries

### Check all projects and their owners:
```sql
SELECT 
    p.name as project_name,
    pr.name as owner_name,
    p.owner_id,
    COUNT(pm.user_id) as member_count
FROM projects p
LEFT JOIN profiles pr ON p.owner_id = pr.id
LEFT JOIN project_members pm ON p.id = pm.project_id
GROUP BY p.id, p.name, pr.name, p.owner_id
ORDER BY p.created_at DESC;
```

### Check project members:
```sql
SELECT 
    p.name as project_name,
    pr.name as member_name,
    CASE WHEN p.owner_id = pr.id THEN 'Owner' ELSE 'Member' END as role
FROM project_members pm
JOIN projects p ON pm.project_id = p.id
JOIN profiles pr ON pm.user_id = pr.id
ORDER BY p.name, role DESC;
```

### Check for projects without owners (should be 0):
```sql
SELECT id, name, owner_id 
FROM projects 
WHERE owner_id IS NULL;
```

### Check for "Thomas Ishida" profiles (if testing username fix):
```sql
SELECT id, name, created_at 
FROM profiles 
WHERE name = 'Thomas Ishida';
```

---

## Common Issues and Fixes

### Issue: "Project creation failed"
**Cause:** Missing `owner_id` in createProject()
**Fix:** Add `owner_id` parameter and pass `user.id` when calling

### Issue: "Failed to delete project. You may not be the owner."
**Cause:** `owner_id` not set correctly when project was created
**Fix:** Run migration to fix existing projects, then ensure new projects set owner_id

### Issue: Edit button doesn't appear
**Cause:** User not a member of the project
**Fix:** Join project via invite code first

### Issue: "Failed to update project. You may not have permission."
**Cause:** User is not owner or member
**Fix:** Verify user is in project_members table

### Issue: Modal doesn't open
**Cause:** JavaScript error in console
**Fix:** Check browser console (F12) in VS Code webview

---

## Testing Checklist

- [ ] Project creation sets owner_id correctly
- [ ] Owner badge appears on owned projects
- [ ] Edit button appears for project members
- [ ] Edit modal opens with correct data
- [ ] Project details can be updated (description, goals, requirements)
- [ ] Project name cannot be edited
- [ ] Owner can delete project
- [ ] Non-owner can leave project
- [ ] Owner cannot leave (must delete)
- [ ] Owner can remove members from project
- [ ] Non-owner cannot remove members
- [ ] Changes persist in database
- [ ] UI updates after operations
- [ ] Error messages show for invalid operations

---

## Next Steps After Testing

1. **Fix Windows OAuth** (Branch 1) - Still needs implementation
2. **Fix Username Default** (Branch 2) - Migration needed
3. **Verify all edge cases** work correctly
4. **Test on Windows** (if available) to verify OAuth fix

---

## Quick Test Commands

```bash
# Check current branch
git branch --show-current

# View recent commits
git log --oneline -5

# Check if owner_id is in createProject signature
grep -A 5 "async createProject" vscode-extension/src/databaseService.ts

# Check if extension.ts passes ownerId
grep -A 10 "createProject" vscode-extension/src/extension.ts | grep "user.id"
```

