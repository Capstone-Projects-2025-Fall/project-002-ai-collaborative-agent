# Testing Guide - Database Integration

## 🚀 **Critical: Apply RLS Migration First**

**BEFORE testing, you MUST run the RLS migration:**

1. Go to your **Supabase Dashboard**
2. Navigate to **SQL Editor**
3. Copy the contents of `supabase/migrations/20241220000010_add_rls_policies.sql`
4. Paste and run the SQL script
5. Verify no errors occur

## 🧪 **Testing Checklist**

### **Test 1: Basic Extension Functionality**

**Setup:**
1. Press `F5` to launch extension in development mode
2. Open the AI Collab Agent panel

**Test Steps:**
- [ ] Extension loads without errors
- [ ] Login button is visible
- [ ] All tabs (Team Members, Projects, Join Project, AI Prompts) are accessible

### **Test 2: Authentication Flow**

**Test with Google OAuth:**
1. Click "Login with Google"
2. Complete OAuth flow
3. Verify you're logged in
4. Check console logs for profile creation

**Test with GitHub OAuth:**
1. Logout and click "Login with GitHub"
2. Complete OAuth flow
3. Verify you're logged in
4. Check console logs for profile creation

**Expected Results:**
- [ ] Profile is automatically created on first login
- [ ] User name is pulled from OAuth metadata
- [ ] No foreign key constraint errors
- [ ] User appears in Team Members tab

### **Test 3: Project Creation**

**Test Steps:**
1. Go to "Projects" tab
2. Fill in all fields:
   - Project Name: "Test Project"
   - Description: "A test project for database integration"
   - Goals: "Test the database integration"
   - Requirements: "Must work with Supabase"
3. Click "Create Project"

**Expected Results:**
- [ ] Project is created successfully
- [ ] Invite code is generated (6 characters)
- [ ] Project appears in project list
- [ ] Goals and requirements are stored
- [ ] Creator is automatically added as project member
- [ ] No database errors in console

### **Test 4: Data Isolation (RLS)**

**Setup:**
- You'll need two different accounts (Google + GitHub, or two different Google accounts)

**Test Steps:**
1. **User A**: Login and create a project
2. **User B**: Login with different account
3. **User B**: Check if you can see User A's project (should NOT see it)
4. **User A**: Share invite code with User B
5. **User B**: Use invite code to join project
6. **User B**: Check if you can now see the project

**Expected Results:**
- [ ] User B cannot see User A's project initially
- [ ] User B can see User A's project after joining
- [ ] Both users can see each other's profiles
- [ ] Each user can only edit their own profile

### **Test 5: Invite System**

**Test Steps:**
1. **User A**: Create a project, copy the invite code
2. **User B**: Go to "Join Project" tab
3. **User B**: Enter the invite code and click "Join Project"
4. **User B**: Check that the project now appears in your project list

**Expected Results:**
- [ ] Invite code works correctly
- [ ] User B is added as project member
- [ ] Project appears in User B's project list
- [ ] Both users can see the project

### **Test 6: Profile Management**

**Test Steps:**
1. Go to "Team Members" tab
2. Update your profile:
   - Skills: "JavaScript, Python, React"
   - Programming Languages: "JavaScript, Python, TypeScript"
   - Willing to Work On: "Frontend development, API design"
3. Click "Add User" to save

**Expected Results:**
- [ ] Profile updates are saved
- [ ] Changes are reflected in the database
- [ ] Other team members can see your updated profile
- [ ] You can only edit your own profile

### **Test 7: Multi-User Collaboration**

**Test Steps:**
1. **User A**: Create a project with goals and requirements
2. **User B**: Join the project using invite code
3. **Both Users**: Check that you can see each other in team members
4. **Both Users**: Verify you can see the project details

**Expected Results:**
- [ ] Both users see the same project
- [ ] Both users see each other in team members
- [ ] Project goals and requirements are visible to both
- [ ] Invite code is visible to both users

## 🔍 **Debugging Tips**

### **Check Console Logs**
- Open VS Code Developer Tools (Help → Toggle Developer Tools)
- Look for any error messages
- Check for successful database operations

### **Verify Database State**
1. Go to Supabase Dashboard → Table Editor
2. Check `profiles` table - should have your user profile
3. Check `projects` table - should have your projects
4. Check `project_members` table - should have your memberships

### **Common Issues**

**Issue**: "new row violates row-level security policy"
- **Cause**: RLS policies not applied correctly
- **Solution**: Re-run the RLS migration SQL

**Issue**: "Key is not present in table 'profiles'"
- **Cause**: User profile doesn't exist
- **Solution**: The extension should auto-create profiles, check console logs

**Issue**: Projects not showing up
- **Cause**: RLS policies working correctly, user not a member
- **Solution**: This is expected behavior - users only see their own projects

**Issue**: Invite codes not working
- **Cause**: Foreign key constraints or profile issues
- **Solution**: Check that both users have profiles in the database

## 📊 **Success Criteria**

- [ ] No foreign key constraint errors
- [ ] RLS policies are in place and working
- [ ] Users can only see their own projects
- [ ] Invite system allows secure project joining
- [ ] Profile creation works automatically
- [ ] Data isolation is maintained
- [ ] All database operations work correctly

## 🚨 **If Tests Fail**

1. **Check RLS Migration**: Ensure the SQL migration was applied successfully
2. **Check Environment Variables**: Verify `.env` file has correct Supabase credentials
3. **Check Console Logs**: Look for specific error messages
4. **Check Database State**: Verify tables exist and have correct structure
5. **Recompile Extension**: Run `npm run compile` in the vscode-extension directory

## 📞 **Getting Help**

If you encounter issues:
1. Check the console logs for specific error messages
2. Verify the database state in Supabase Dashboard
3. Ensure all migrations have been applied
4. Contact the development team with specific error details

---

**Last Updated**: 2024-12-20  
**Status**: Ready for Testing
