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
        const { data, error } = await this.supabase
            .from('profiles')
            .select('*')
            .eq('id', userId)
            .single();
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
    async createProfile(userId, name, skills = '', programming_languages = '', willing_to_work_on = '') {
        console.log('Creating profile for user ID:', userId);
        const { data, error } = await this.supabase
            .from('profiles')
            .insert({
            id: userId,
            name,
            skills,
            programming_languages,
            willing_to_work_on
        })
            .select()
            .single();
        if (error) {
            console.error('Error creating profile:', error);
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
        const { data, error } = await this.supabase
            .from('profiles')
            .update(updates)
            .eq('id', userId)
            .select()
            .single();
        if (error) {
            console.error('Error updating profile:', error);
            return null;
        }
        return data;
    }
    // Project Operations
    async getProjectsForUser(userId) {
        const { data, error } = await this.supabase
            .from('project_members')
            .select(`
        projects(*)
      `)
            .eq('user_id', userId);
        if (error) {
            console.error('Error fetching projects for user:', error);
            return [];
        }
        return data?.map((item) => item.projects) || [];
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
    async createProject(name, description, goals = '', requirements = '') {
        console.log('DatabaseService: Creating project:', { name, description, goals, requirements });
        const inviteCode = this.generateInviteCode();
        const insertData = {
            name,
            description,
            goals,
            requirements,
            invite_code: inviteCode
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
                    // Create project
                    const project = await this.createProject(projectData.name || 'Migrated Project', projectData.description || '', projectData.goals || '', projectData.requirements || '');
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
}
exports.DatabaseService = DatabaseService;
//# sourceMappingURL=databaseService.js.map