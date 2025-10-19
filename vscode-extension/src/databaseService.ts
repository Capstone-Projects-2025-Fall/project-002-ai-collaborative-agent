import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { AuthUser } from './authService';

// Database types
export interface Profile {
  id: string;
  user_id: string;
  name: string;
  skills: string[];
  languages: string[];
  preferences: string;
  created_at: string;
  updated_at: string;
}

export interface Project {
  id: string;
  name: string;
  description: string;
  owner_id: string;
  invite_code: string;
  created_at: string;
  updated_at: string;
}

export interface ProjectMember {
  id: string;
  project_id: string;
  user_id: string;
  role: 'owner' | 'member';
  joined_at: string;
}

export interface ProjectInvite {
  id: string;
  project_id: string;
  email: string;
  invited_by: string;
  status: 'pending' | 'accepted' | 'declined';
  created_at: string;
  expires_at: string;
}

export interface AIPrompt {
  id: string;
  project_id: string;
  content: string;
  generated_by: string;
  created_at: string;
}

export class DatabaseService {
  private supabase: SupabaseClient;

  constructor(supabaseUrl: string, supabaseAnonKey: string) {
    this.supabase = createClient(supabaseUrl, supabaseAnonKey);
  }

  // Profile Operations
  async getProfile(userId: string): Promise<Profile | null> {
    const { data, error } = await this.supabase
      .from('profiles')
      .select('*')
      .eq('user_id', userId)
      .single();

    if (error) {
      console.error('Error fetching profile:', error);
      return null;
    }
    return data;
  }

  async createProfile(userId: string, name: string, skills: string[] = [], languages: string[] = [], preferences: string = ''): Promise<Profile | null> {
    const { data, error } = await this.supabase
      .from('profiles')
      .insert({
        user_id: userId,
        name,
        skills,
        languages,
        preferences
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating profile:', error);
      return null;
    }
    return data;
  }

  async updateProfile(userId: string, updates: Partial<Omit<Profile, 'id' | 'user_id' | 'created_at'>>): Promise<Profile | null> {
    const { data, error } = await this.supabase
      .from('profiles')
      .update({
        ...updates,
        updated_at: new Date().toISOString()
      })
      .eq('user_id', userId)
      .select()
      .single();

    if (error) {
      console.error('Error updating profile:', error);
      return null;
    }
    return data;
  }

  // Project Operations
  async getProjectsForUser(userId: string): Promise<Project[]> {
    const { data, error } = await this.supabase
      .from('projects')
      .select(`
        *,
        project_members!inner(user_id)
      `)
      .eq('project_members.user_id', userId);

    if (error) {
      console.error('Error fetching projects:', error);
      return [];
    }
    return data || [];
  }

  async getOwnedProjects(userId: string): Promise<Project[]> {
    const { data, error } = await this.supabase
      .from('projects')
      .select('*')
      .eq('owner_id', userId);

    if (error) {
      console.error('Error fetching owned projects:', error);
      return [];
    }
    return data || [];
  }

  async createProject(ownerId: string, name: string, description: string): Promise<Project | null> {
    const inviteCode = this.generateInviteCode();
    
    const { data, error } = await this.supabase
      .from('projects')
      .insert({
        name,
        description,
        owner_id: ownerId,
        invite_code: inviteCode
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating project:', error);
      return null;
    }

    // Add owner as project member
    await this.addProjectMember(data.id, ownerId, 'owner');
    
    return data;
  }

  async updateProject(projectId: string, ownerId: string, updates: Partial<Omit<Project, 'id' | 'owner_id' | 'created_at'>>): Promise<Project | null> {
    const { data, error } = await this.supabase
      .from('projects')
      .update({
        ...updates,
        updated_at: new Date().toISOString()
      })
      .eq('id', projectId)
      .eq('owner_id', ownerId)
      .select()
      .single();

    if (error) {
      console.error('Error updating project:', error);
      return null;
    }
    return data;
  }

  async deleteProject(projectId: string, ownerId: string): Promise<boolean> {
    const { error } = await this.supabase
      .from('projects')
      .delete()
      .eq('id', projectId)
      .eq('owner_id', ownerId);

    if (error) {
      console.error('Error deleting project:', error);
      return false;
    }
    return true;
  }

  // Project Member Operations
  async getProjectMembers(projectId: string): Promise<ProjectMember[]> {
    const { data, error } = await this.supabase
      .from('project_members')
      .select(`
        *,
        profiles!inner(name)
      `)
      .eq('project_id', projectId);

    if (error) {
      console.error('Error fetching project members:', error);
      return [];
    }
    return data || [];
  }

  async addProjectMember(projectId: string, userId: string, role: 'owner' | 'member' = 'member'): Promise<boolean> {
    const { error } = await this.supabase
      .from('project_members')
      .insert({
        project_id: projectId,
        user_id: userId,
        role
      });

    if (error) {
      console.error('Error adding project member:', error);
      return false;
    }
    return true;
  }

  async removeProjectMember(projectId: string, userId: string): Promise<boolean> {
    const { error } = await this.supabase
      .from('project_members')
      .delete()
      .eq('project_id', projectId)
      .eq('user_id', userId);

    if (error) {
      console.error('Error removing project member:', error);
      return false;
    }
    return true;
  }

  // Invite Code Operations
  async joinProjectByCode(inviteCode: string, userId: string): Promise<Project | null> {
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
    const success = await this.addProjectMember(project.id, userId, 'member');
    if (!success) {
      return null;
    }

    return project;
  }

  async generateNewInviteCode(projectId: string, ownerId: string): Promise<string | null> {
    const newCode = this.generateInviteCode();
    
    const { error } = await this.supabase
      .from('projects')
      .update({ invite_code: newCode })
      .eq('id', projectId)
      .eq('owner_id', ownerId);

    if (error) {
      console.error('Error generating new invite code:', error);
      return null;
    }

    return newCode;
  }

  // AI Prompt Operations
  async saveAIPrompt(projectId: string, content: string, generatedBy: string): Promise<AIPrompt | null> {
    const { data, error } = await this.supabase
      .from('ai_prompts')
      .insert({
        project_id: projectId,
        content,
        generated_by: generatedBy
      })
      .select()
      .single();

    if (error) {
      console.error('Error saving AI prompt:', error);
      return null;
    }
    return data;
  }

  async getAIPromptsForProject(projectId: string): Promise<AIPrompt[]> {
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
  async migrateFromJSON(jsonData: any, userId: string): Promise<boolean> {
    try {
      // Create or update user profile
      let profile = await this.getProfile(userId);
      if (!profile) {
        // Create profile from JSON data or defaults
        const userData = jsonData.users?.find((u: any) => u.id === userId) || {};
        profile = await this.createProfile(
          userId,
          userData.name || 'User',
          userData.skills || [],
          userData.languages || [],
          userData.preferences || ''
        );
      }

      if (!profile) {
        console.error('Failed to create profile during migration');
        return false;
      }

      // Migrate projects
      if (jsonData.projects && Array.isArray(jsonData.projects)) {
        for (const projectData of jsonData.projects) {
          // Create project
          const project = await this.createProject(
            userId,
            projectData.name || 'Migrated Project',
            projectData.description || ''
          );

          if (project && projectData.selectedMemberIds) {
            // Add members to project
            for (const memberId of projectData.selectedMemberIds) {
              if (memberId !== userId) {
                await this.addProjectMember(project.id, memberId, 'member');
              }
            }
          }
        }
      }

      return true;
    } catch (error) {
      console.error('Error during migration:', error);
      return false;
    }
  }

  // Utility Methods
  private generateInviteCode(): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = '';
    for (let i = 0; i < 6; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  }

  // Get Supabase client for direct queries if needed
  getSupabaseClient(): SupabaseClient {
    return this.supabase;
  }
}
