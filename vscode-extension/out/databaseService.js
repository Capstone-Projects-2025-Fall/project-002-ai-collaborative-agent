"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DatabaseService = void 0;
const supabase_js_1 = require("@supabase/supabase-js");
class DatabaseService {
    supabase;
    constructor(supabaseUrl, supabaseAnonKey) {
        this.supabase = (0, supabase_js_1.createClient)(supabaseUrl, supabaseAnonKey);
    }
    // Profile Operations
    async getProfile(userId) {
        // userId is auth.users.id, but profiles table has user_id as the foreign key
        // However, the code assumes profiles.id === auth.users.id
        // Try both approaches: first by id, then by user_id if needed
        let { data, error } = await this.supabase
            .from('profiles')
            .select('*')
            .eq('id', userId)
            .single();
        // If not found by id, try by user_id
        if (error && error.code === 'PGRST116') {
            const { data: dataByUserId, error: errorByUserId } = await this.supabase
                .from('profiles')
                .select('*')
                .eq('user_id', userId)
                .single();
            if (!errorByUserId && dataByUserId) {
                data = dataByUserId;
                error = null;
            }
        }
        if (error) {
            if (error.code === 'PGRST116') {
                // Profile doesn't exist yet, return null
                console.log('Profile not found for user:', userId);
                return null;
            }
            console.error('Error fetching profile:', error);
            return null;
        }
        return data;
    }
    isMissingColumnError(error) {
        if (!error) {
            return false;
        }
        const code = (error.code || "").toString();
        const message = (error.message || "").toString().toLowerCase();
        return code === "42703" || message.includes("column") || message.includes("does not exist");
    }
    async createProfile(userId, name, skills = "", programming_languages = "", willing_to_work_on = "") {
        console.log('Creating profile for user ID:', userId);
        const insertPayload = {
            id: userId,
            name,
            skills,
            programming_languages,
            willing_to_work_on,
            jira_base_url: null,
            jira_project_key: null,
            jira_email: null,
            jira_api_token: null,
            jira_project_prompt: null
        };
        const { data, error } = await this.supabase
            .from('profiles')
            .insert(insertPayload)
            .select()
            .single();
        if (error) {
            console.error('Error creating profile:', error);
            if (this.isMissingColumnError(error)) {
                console.warn('Profiles table missing Jira credential columns; inserting base profile fields only.');
                const fallbackPayload = {
                    id: userId,
                    name,
                    skills,
                    programming_languages,
                    willing_to_work_on
                };
                const { data: fallbackData, error: fallbackError } = await this.supabase
                    .from('profiles')
                    .insert(fallbackPayload)
                    .select()
                    .single();
                if (fallbackError) {
                    console.error('Fallback profile insert failed:', fallbackError);
                    return null;
                }
                return fallbackData;
            }
            console.error('User ID being used:', userId);
            return null;
        }
        return data;
    }
    async updateProfile(userId, updates) {
        // First check if profile exists
        const existingProfile = await this.getProfile(userId);
        if (!existingProfile) {
            // Profile doesn't exist, create it
            console.log('Profile not found, creating new profile for user:', userId);
            return await this.createProfile(userId, updates.name || 'User', updates.skills || '', updates.programming_languages || '', updates.willing_to_work_on || '');
        }
        // Profile exists, update it
        const updatePayload = { ...updates };
        const { data, error } = await this.supabase
            .from('profiles')
            .update(updatePayload)
            .eq('id', userId)
            .select()
            .single();
        if (error) {
            console.error('Error updating profile:', error);
            if (this.isMissingColumnError(error)) {
                console.warn('Profiles table missing Jira credential columns; applying legacy profile update.');
                const fallbackUpdates = {
                    name: updates.name,
                    skills: updates.skills,
                    programming_languages: updates.programming_languages,
                    willing_to_work_on: updates.willing_to_work_on
                };
                const { data: fallbackData, error: fallbackError } = await this.supabase
                    .from('profiles')
                    .update(fallbackUpdates)
                    .eq('id', userId)
                    .select()
                    .single();
                if (fallbackError) {
                    console.error('Fallback profile update failed:', fallbackError);
                    return null;
                }
                return fallbackData;
            }
            return null;
        }
        return data;
    }
    // Project Operations
    async getProjectsForUser(profileId) {
        // Get projects where user is a member
        const { data: memberProjects, error: memberError } = await this.supabase
            .from('project_members')
            .select(`
        projects(*)
      `)
            .eq('user_id', profileId);
        if (memberError) {
            console.error('Error fetching projects for user (member):', memberError);
        }
        // Get projects where user is the owner
        const { data: ownedProjects, error: ownerError } = await this.supabase
            .from('projects')
            .select('*')
            .eq('owner_id', profileId);
        if (ownerError) {
            console.error('Error fetching projects for user (owner):', ownerError);
        }
        // Combine and deduplicate projects
        const memberProjectsList = memberProjects?.map((item) => item.projects).filter(Boolean) || [];
        const ownedProjectsList = ownedProjects || [];
        // Create a map to deduplicate by project id
        const projectsMap = new Map();
        [...memberProjectsList, ...ownedProjectsList].forEach((project) => {
            if (project && project.id) {
                projectsMap.set(project.id, project);
            }
        });
        return Array.from(projectsMap.values());
    }
    async getProfilesForProject(projectId) {
        const { data, error } = await this.supabase
            .from('project_members')
            .select(`
        profiles(*)
      `)
            .eq('project_id', projectId);
        if (error) {
            console.error('Error fetching profiles for project:', error);
            return [];
        }
        return data?.map((item) => item.profiles).filter(Boolean) || [];
    }
    async getAllProfilesForUserProjects(userId) {
        // Get all unique profiles from all projects the user is a member of
        const projects = await this.getProjectsForUser(userId);
        const profilesPromises = projects.map(project => this.getProfilesForProject(project.id));
        const profilesArrays = await Promise.all(profilesPromises);
        // Flatten and deduplicate profiles
        const allProfiles = profilesArrays.flat();
        const uniqueProfiles = allProfiles.filter((profile, index, self) => index === self.findIndex(p => p.id === profile.id));
        return uniqueProfiles;
    }
    async createProject(name, description, goals = '', requirements = '', ownerId) {
        console.log('DatabaseService: Creating project:', { name, description, goals, requirements, ownerId });
        const inviteCode = this.generateInviteCode();
        const insertData = {
            name,
            description,
            goals,
            requirements,
            invite_code: inviteCode,
            owner_id: ownerId
        };
        console.log('DatabaseService: Inserting data:', insertData);
        const { data, error } = await this.supabase
            .from('projects')
            .insert(insertData)
            .select()
            .single();
        if (error) {
            console.error('Error creating project:', error);
            console.error('Error details:', error.message);
            return null;
        }
        console.log('DatabaseService: Project created successfully:', data);
        return data;
    }
    async getProjectMembers(projectId) {
        const { data, error } = await this.supabase
            .from('project_members')
            .select('*')
            .eq('project_id', projectId);
        if (error) {
            console.error('Error fetching project members:', error);
            return [];
        }
        return data || [];
    }
    async addProjectMember(projectId, userId) {
        console.log('DatabaseService: Adding project member:', { projectId, userId });
        // First, check if the user profile exists
        const { data: profile, error: profileError } = await this.supabase
            .from('profiles')
            .select('id')
            .eq('id', userId)
            .single();
        if (profileError || !profile) {
            console.log('User profile not found, checking if user exists in auth.users...');
            // Check if user exists in auth.users first
            const { data: authUser, error: authError } = await this.supabase.auth.getUser();
            if (authError || !authUser.user || authUser.user.id !== userId) {
                console.error('User not found in auth.users or ID mismatch:', {
                    requestedUserId: userId,
                    authUserId: authUser?.user?.id,
                    authError
                });
                return false;
            }
            console.log('User exists in auth.users, creating profile...');
            // Create a basic profile for the user using their auth data
            const { data: newProfile, error: createError } = await this.supabase
                .from('profiles')
                .insert({
                id: userId,
                name: authUser.user.user_metadata?.full_name || authUser.user.user_metadata?.name || 'User',
                skills: '',
                programming_languages: '',
                willing_to_work_on: ''
            })
                .select()
                .single();
            if (createError || !newProfile) {
                console.error('Error creating user profile:', createError);
                if (createError) {
                    console.error('Profile creation error details:', createError.message);
                    console.error('Profile creation error code:', createError.code);
                    console.error('Profile creation error hint:', createError.hint);
                }
                return false;
            }
            console.log('User profile created successfully');
        }
        else {
            console.log('User profile found:', profile);
        }
        const { error } = await this.supabase
            .from('project_members')
            .insert({
            project_id: projectId,
            user_id: userId
        });
        if (error) {
            console.error('Error adding project member:', error);
            return false;
        }
        console.log('DatabaseService: Project member added successfully');
        return true;
    }
    // AI Prompt Operations
    async createAIPrompt(projectId, promptContent, aiResponse) {
        const { data, error } = await this.supabase
            .from('ai_prompts')
            .insert({
            project_id: projectId,
            prompt_content: promptContent,
            ai_response: aiResponse
        })
            .select()
            .single();
        if (error) {
            console.error('Error creating AI prompt:', error);
            return null;
        }
        return data;
    }
    async getAIPromptsForProject(projectId) {
        const { data, error } = await this.supabase
            .from('ai_prompts')
            .select('*')
            .eq('project_id', projectId)
            .order('created_at', { ascending: false });
        if (error) {
            console.error('Error fetching AI prompts:', error);
            return [];
        }
        return data || [];
    }
    // Migration Operations
    async migrateFromJSON(jsonData, userId) {
        try {
            // Create or update user profile
            let profile = await this.getProfile(userId);
            if (!profile) {
                // Create profile from JSON data or defaults
                const userData = jsonData.users?.[0] || {};
                profile = await this.createProfile(userId, userData.name || 'User', userData.skills || '', userData.programming_languages || '', userData.willing_to_work_on || '');
            }
            if (!profile) {
                console.error('Failed to create profile during migration');
                return false;
            }
            // Migrate projects
            if (jsonData.projects && Array.isArray(jsonData.projects)) {
                for (const projectData of jsonData.projects) {
                    // Create project with current user as owner
                    const project = await this.createProject(projectData.name || 'Migrated Project', projectData.description || '', projectData.goals || '', projectData.requirements || '', userId);
                    if (project) {
                        // Add the current user as a member
                        await this.addProjectMember(project.id, userId);
                        // Add other members if they exist
                        if (projectData.selectedMemberIds && Array.isArray(projectData.selectedMemberIds)) {
                            for (const memberId of projectData.selectedMemberIds) {
                                if (memberId !== userId) {
                                    await this.addProjectMember(project.id, memberId);
                                }
                            }
                        }
                    }
                }
            }
            return true;
        }
        catch (error) {
            console.error('Error during migration:', error);
            return false;
        }
    }
    // Invite Code Operations
    async joinProjectByCode(inviteCode, userId) {
        console.log('DatabaseService: Joining project with code:', { inviteCode, userId });
        // First, find the project by invite code
        const { data: project, error: projectError } = await this.supabase
            .from('projects')
            .select('*')
            .eq('invite_code', inviteCode)
            .single();
        if (projectError || !project) {
            console.error('Invalid invite code:', projectError);
            return null;
        }
        // Check if user is already a member
        const { data: existingMember } = await this.supabase
            .from('project_members')
            .select('id')
            .eq('project_id', project.id)
            .eq('user_id', userId)
            .single();
        if (existingMember) {
            console.log('User is already a member of this project');
            return project;
        }
        // Add user as project member
        const success = await this.addProjectMember(project.id, userId);
        if (!success) {
            return null;
        }
        console.log('DatabaseService: Successfully joined project:', project.name);
        return project;
    }
    async deleteProject(projectId, userId) {
        console.log('DatabaseService: Deleting project:', { projectId, userId });
        // First verify the user is the owner
        const { data: project, error: fetchError } = await this.supabase
            .from('projects')
            .select('owner_id')
            .eq('id', projectId)
            .single();
        if (fetchError || !project) {
            console.error('Error fetching project:', fetchError);
            return false;
        }
        // Convert both to strings for comparison (handle UUID type mismatches)
        const ownerIdStr = String(project.owner_id);
        const userIdStr = String(userId);
        console.log('DatabaseService: Comparing owner IDs:', { ownerIdStr, userIdStr, match: ownerIdStr === userIdStr });
        if (ownerIdStr !== userIdStr) {
            console.error('User is not the owner of this project', {
                projectOwnerId: ownerIdStr,
                userId: userIdStr,
                types: { owner: typeof project.owner_id, user: typeof userId }
            });
            return false;
        }
        // Delete the project (cascade will handle project_members)
        const { error } = await this.supabase
            .from('projects')
            .delete()
            .eq('id', projectId);
        if (error) {
            console.error('Error deleting project:', error);
            return false;
        }
        console.log('DatabaseService: Project deleted successfully');
        return true;
    }
    async leaveProject(projectId, userId) {
        console.log('DatabaseService: Leaving project:', { projectId, userId });
        // Check if user is the owner
        const { data: project, error: fetchError } = await this.supabase
            .from('projects')
            .select('owner_id')
            .eq('id', projectId)
            .single();
        if (fetchError || !project) {
            console.error('Error fetching project:', fetchError);
            return false;
        }
        // Convert both to strings for comparison (handle UUID type mismatches)
        const ownerIdStr = String(project.owner_id);
        const userIdStr = String(userId);
        console.log('DatabaseService: Checking if user is owner (leaveProject):', { ownerIdStr, userIdStr, isOwner: ownerIdStr === userIdStr });
        if (ownerIdStr === userIdStr) {
            console.error('Owner cannot leave project - must delete it instead');
            return false;
        }
        // Remove user from project_members
        const { error } = await this.supabase
            .from('project_members')
            .delete()
            .eq('project_id', projectId)
            .eq('user_id', userId);
        if (error) {
            console.error('Error leaving project:', error);
            return false;
        }
        console.log('DatabaseService: User left project successfully');
        return true;
    }
    async getProjectOwner(projectId) {
        const { data, error } = await this.supabase
            .from('projects')
            .select('owner_id')
            .eq('id', projectId)
            .single();
        if (error || !data) {
            console.error('Error fetching project owner:', error);
            return null;
        }
        return data.owner_id;
    }
    async updateProject(projectId, updates, userId) {
        console.log('DatabaseService: Updating project:', { projectId, updates, userId });
        // Verify user has permission (owner or member)
        const { data: project, error: fetchError } = await this.supabase
            .from('projects')
            .select('owner_id')
            .eq('id', projectId)
            .single();
        if (fetchError || !project) {
            console.error('Error fetching project:', fetchError);
            return null;
        }
        // Check if user is owner or member (convert to strings for comparison)
        const ownerIdStr = String(project.owner_id);
        const userIdStr = String(userId);
        const isOwner = ownerIdStr === userIdStr;
        const { data: memberCheck } = await this.supabase
            .from('project_members')
            .select('id')
            .eq('project_id', projectId)
            .eq('user_id', userId)
            .single();
        if (!isOwner && !memberCheck) {
            console.error('User is not owner or member of this project');
            return null;
        }
        // Update the project - only owner can change name
        const updateData = {
            description: updates.description,
            goals: updates.goals,
            requirements: updates.requirements
        };
        // Only allow name change if user is the owner
        if (updates.name && isOwner) {
            updateData.name = updates.name;
        }
        else if (updates.name && !isOwner) {
            console.warn('Non-owner attempted to change project name, ignoring');
        }
        const { data, error } = await this.supabase
            .from('projects')
            .update(updateData)
            .eq('id', projectId)
            .select()
            .single();
        if (error) {
            console.error('Error updating project:', error);
            return null;
        }
        console.log('DatabaseService: Project updated successfully');
        return data;
    }
    async removeProjectMember(projectId, memberId, userId) {
        console.log('DatabaseService: Removing project member:', { projectId, memberId, userId });
        // Verify user is the owner
        const { data: project, error: fetchError } = await this.supabase
            .from('projects')
            .select('owner_id')
            .eq('id', projectId)
            .single();
        if (fetchError || !project) {
            console.error('Error fetching project:', fetchError);
            return false;
        }
        if (project.owner_id !== userId) {
            console.error('Only project owner can remove members');
            return false;
        }
        // Cannot remove the owner
        if (memberId === project.owner_id) {
            console.error('Cannot remove project owner');
            return false;
        }
        // Remove member from project_members
        const { error } = await this.supabase
            .from('project_members')
            .delete()
            .eq('project_id', projectId)
            .eq('user_id', memberId);
        if (error) {
            console.error('Error removing project member:', error);
            return false;
        }
        console.log('DatabaseService: Project member removed successfully');
        return true;
    }
    // Utility Methods
    generateInviteCode() {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
        let result = '';
        for (let i = 0; i < 6; i++) {
            result += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return result;
    }
    // Get Supabase client for direct queries if needed
    getSupabaseClient() {
        return this.supabase;
    }
    // ==================== TIMELINE OPERATIONS ====================
    /**
     * Save a timeline point to the database
     */
    async saveTimelinePoint(point) {
        try {
            console.log(`💾 Saving timeline point to database: ${point.id}`);
            const { data, error } = await this.supabase
                .from('timeline_points')
                .insert([
                {
                    point_id: point.id,
                    file_path: point.filePath,
                    timestamp: point.timestamp,
                    description: point.description,
                    details: point.details,
                    lines_added: point.linesAdded,
                    lines_removed: point.linesRemoved,
                    change_type: point.changeType,
                    trigger_type: point.trigger_type,
                    code_before: point.codeBefore,
                    code_after: point.codeAfter,
                    change_types: point.changeTypes,
                    category: point.category
                }
            ]);
            if (error) {
                console.error('❌ Database save error:', error);
                console.error('❌ Error code:', error.code);
                console.error('❌ Error message:', error.message);
                console.error('❌ Error details:', error.details);
                console.error('❌ Error hint:', error.hint);
                return false;
            }
            console.log('✅ Timeline point saved to database');
            return true;
        }
        catch (error) {
            console.error('❌ Database save exception:', error);
            return false;
        }
    }
    /**
     * Load all timeline points from the database
     */
    async loadAllTimelinePoints() {
        try {
            console.log('💾 Loading timeline points from database...');
            const { data, error } = await this.supabase
                .from('timeline_points')
                .select('*')
                .order('timestamp', { ascending: false });
            if (error) {
                console.error('❌ Database load error:', error);
                return new Map();
            }
            if (!data || data.length === 0) {
                console.log('📭 No timeline points found in database');
                return new Map();
            }
            // Group points by file path
            const timelineMap = new Map();
            for (const row of data) {
                const point = {
                    id: row.point_id,
                    filePath: row.file_path,
                    timestamp: row.timestamp,
                    description: row.description,
                    details: row.details,
                    linesAdded: row.lines_added,
                    linesRemoved: row.lines_removed,
                    changeType: row.change_type,
                    trigger_type: row.trigger_type,
                    codeBefore: row.code_before || '',
                    codeAfter: row.code_after,
                    changeTypes: row.change_types || [],
                    category: row.category
                };
                const filePath = point.filePath;
                if (!timelineMap.has(filePath)) {
                    timelineMap.set(filePath, []);
                }
                timelineMap.get(filePath).push(point);
            }
            console.log(`✅ Loaded ${data.length} timeline points from database`);
            return timelineMap;
        }
        catch (error) {
            console.error('❌ Database load exception:', error);
            return new Map();
        }
    }
    /**
     * Load timeline points for a specific file
     */
    async loadTimelineForFile(filePath) {
        try {
            const { data, error } = await this.supabase
                .from('timeline_points')
                .select('*')
                .eq('file_path', filePath)
                .order('timestamp', { ascending: false });
            if (error) {
                console.error('❌ Database load error:', error);
                return [];
            }
            if (!data) {
                return [];
            }
            return data.map(row => ({
                id: row.point_id,
                filePath: row.file_path,
                timestamp: row.timestamp,
                description: row.description,
                details: row.details,
                linesAdded: row.lines_added,
                linesRemoved: row.lines_removed,
                changeType: row.change_type,
                trigger_type: row.trigger_type,
                codeBefore: row.code_before || '',
                codeAfter: row.code_after,
                changeTypes: row.change_types || [],
                category: row.category
            }));
        }
        catch (error) {
            console.error('❌ Database load exception:', error);
            return [];
        }
    }
    /**
     * Delete all timeline points (for testing/cleanup)
     */
    async clearAllTimelinePoints() {
        try {
            const { error } = await this.supabase
                .from('timeline_points')
                .delete()
                .neq('id', 0); // Delete all rows
            if (error) {
                console.error('❌ Database clear error:', error);
                return false;
            }
            console.log('✅ All timeline points cleared from database');
            return true;
        }
        catch (error) {
            console.error('❌ Database clear exception:', error);
            return false;
        }
    }
}
exports.DatabaseService = DatabaseService;
//# sourceMappingURL=databaseService.js.map