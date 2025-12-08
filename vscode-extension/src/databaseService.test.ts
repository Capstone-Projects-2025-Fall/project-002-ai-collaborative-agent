import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { DatabaseService, Profile, Project } from './databaseService';
import { createClient } from '@supabase/supabase-js';

// Mock the Supabase client
vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn()
}));

describe('DatabaseService', () => {
  let databaseService: DatabaseService;
  let mockSupabase: any;
  
  const testUserId = 'user-123';
  const testProjectId = 'project-456';
  
  const testProfile: Profile = {
    id: testUserId,
    name: 'Test User',
    skills: 'TypeScript, React',
    programming_languages: 'JavaScript, Python',
    willing_to_work_on: 'Web development',
    jira_base_url: null,
    jira_project_key: null,
    jira_email: null,
    jira_api_token: null,
    jira_project_prompt: null,
    created_at: '2024-01-01T00:00:00Z'
  };
  
  const testProject: Project = {
    id: testProjectId,
    name: 'Test Project',
    description: 'A test project',
    goals: 'Build something great',
    requirements: 'TypeScript knowledge',
    invite_code: 'ABC123',
    owner_id: testUserId,
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z'
  };

  beforeEach(() => {
    // Create a simple chainable mock
    const createChainableMock = () => ({
      from: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      delete: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: null }),
      order: vi.fn().mockReturnThis(),
    });

    mockSupabase = {
      ...createChainableMock(),
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: null, error: null })
      }
    };
    
    (createClient as any).mockReturnValue(mockSupabase);
    databaseService = new DatabaseService('https://test.supabase.co', 'test-key');
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Constructor', () => {
    it('should create a Supabase client with provided credentials', () => {
      expect(createClient).toHaveBeenCalledWith('https://test.supabase.co', 'test-key');
    });

    it('should expose the Supabase client', () => {
      const client = databaseService.getSupabaseClient();
      expect(client).toBe(mockSupabase);
    });
  });

  describe('Profile Operations', () => {
    it('should fetch profile successfully', async () => {
      mockSupabase.single.mockResolvedValueOnce({ data: testProfile, error: null });
      
      const result = await databaseService.getProfile(testUserId);
      
      expect(mockSupabase.from).toHaveBeenCalledWith('profiles');
      expect(result).toEqual(testProfile);
    });

    it('should return null if profile not found', async () => {
      mockSupabase.single.mockResolvedValueOnce({ 
        data: null, 
        error: { code: 'PGRST116' } 
      });
      mockSupabase.single.mockResolvedValueOnce({ 
        data: null, 
        error: { code: 'PGRST116' } 
      });
      
      const result = await databaseService.getProfile(testUserId);
      expect(result).toBeNull();
    });

    it('should create a new profile', async () => {
      mockSupabase.single.mockResolvedValueOnce({ data: testProfile, error: null });
      
      const result = await databaseService.createProfile(
        testUserId,
        'Test User',
        'TypeScript',
        'JavaScript',
        'Web dev'
      );
      
      expect(mockSupabase.insert).toHaveBeenCalled();
      expect(result).toEqual(testProfile);
    });

    it('should update existing profile', async () => {
      mockSupabase.single
        .mockResolvedValueOnce({ data: testProfile, error: null })
        .mockResolvedValueOnce({ data: { ...testProfile, name: 'Updated' }, error: null });
      
      const result = await databaseService.updateProfile(testUserId, { name: 'Updated' });
      
      expect(mockSupabase.update).toHaveBeenCalled();
      expect(result?.name).toBe('Updated');
    });
  });

  describe('Project Operations', () => {
    it('should create a new project', async () => {
      mockSupabase.single.mockResolvedValueOnce({ data: testProject, error: null });
      
      const result = await databaseService.createProject(
        'Test Project',
        'Description',
        'Goals',
        'Requirements',
        testUserId
      );
      
      expect(mockSupabase.insert).toHaveBeenCalled();
      expect(result).toEqual(testProject);
    });

    it('should generate a 6-character invite code', async () => {
      mockSupabase.single.mockResolvedValueOnce({ data: testProject, error: null });
      
      await databaseService.createProject('Test', 'Desc', '', '', testUserId);
      
      const insertCall = mockSupabase.insert.mock.calls[0][0];
      expect(insertCall.invite_code).toMatch(/^[A-Z0-9]{6}$/);
    });

    it('should fetch projects for user', async () => {
      mockSupabase.eq
        .mockResolvedValueOnce({ data: [{ projects: testProject }], error: null })
        .mockResolvedValueOnce({ data: [testProject], error: null });
      
      const result = await databaseService.getProjectsForUser(testUserId);
      
      expect(Array.isArray(result)).toBe(true);
    });

    it('should delete project if user is owner', async () => {
      // Mock the owner check query chain
      const ownerCheckChain = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ 
          data: { owner_id: testUserId }, 
          error: null 
        })
      };
      
      // Mock the delete query chain
      const deleteChain = {
        delete: vi.fn().mockReturnThis(),
        eq: vi.fn().mockResolvedValue({ data: null, error: null })
      };
      
      mockSupabase.from
        .mockReturnValueOnce(ownerCheckChain)
        .mockReturnValueOnce(deleteChain);
      
      const result = await databaseService.deleteProject(testProjectId, testUserId);
      
      expect(result).toBe(true);
    });

    it('should prevent non-owner from deleting project', async () => {
      mockSupabase.single.mockResolvedValueOnce({ 
        data: { owner_id: 'other-user' }, 
        error: null 
      });
      
      const result = await databaseService.deleteProject(testProjectId, testUserId);
      
      expect(result).toBe(false);
    });

    it('should prevent owner from leaving project', async () => {
      mockSupabase.single.mockResolvedValueOnce({ 
        data: { owner_id: testUserId }, 
        error: null 
      });
      
      const result = await databaseService.leaveProject(testProjectId, testUserId);
      
      expect(result).toBe(false);
    });
  });

  describe('Project Member Operations', () => {
    it('should add member to project', async () => {
      mockSupabase.single.mockResolvedValueOnce({ data: { id: testUserId }, error: null });
      mockSupabase.insert.mockResolvedValueOnce({ data: null, error: null });
      
      const result = await databaseService.addProjectMember(testProjectId, testUserId);
      
      expect(result).toBe(true);
    });

    it('should fetch project members', async () => {
      const members = [
        { id: 'member-1', project_id: testProjectId, user_id: testUserId, created_at: '2024-01-01' }
      ];
      mockSupabase.eq.mockResolvedValueOnce({ data: members, error: null });
      
      const result = await databaseService.getProjectMembers(testProjectId);
      
      expect(result).toEqual(members);
    });

    it('should prevent removing the owner', async () => {
      mockSupabase.single.mockResolvedValueOnce({ 
        data: { owner_id: testUserId }, 
        error: null 
      });
      
      const result = await databaseService.removeProjectMember(
        testProjectId, 
        testUserId, 
        testUserId
      );
      
      expect(result).toBe(false);
    });
  });

  describe('Invite Code Operations', () => {
    it('should join project with valid invite code', async () => {
      mockSupabase.single
        .mockResolvedValueOnce({ data: testProject, error: null })
        .mockResolvedValueOnce({ data: null, error: null })
        .mockResolvedValueOnce({ data: { id: testUserId }, error: null });
      mockSupabase.insert.mockResolvedValueOnce({ data: null, error: null });
      
      const result = await databaseService.joinProjectByCode('ABC123', testUserId);
      
      expect(result).toEqual(testProject);
    });

    it('should return null for invalid invite code', async () => {
      mockSupabase.single.mockResolvedValueOnce({ 
        data: null, 
        error: { message: 'Not found' } 
      });
      
      const result = await databaseService.joinProjectByCode('INVALID', testUserId);
      
      expect(result).toBeNull();
    });

    it('should return project if already a member', async () => {
      const existingMember = { id: 'member-1', project_id: testProjectId, user_id: testUserId };
      mockSupabase.single
        .mockResolvedValueOnce({ data: testProject, error: null })
        .mockResolvedValueOnce({ data: existingMember, error: null });
      
      const result = await databaseService.joinProjectByCode('ABC123', testUserId);
      
      expect(result).toEqual(testProject);
    });
  });

  describe('AI Prompt Operations', () => {
    it('should create a new AI prompt', async () => {
      const aiPrompt = {
        id: 'prompt-123',
        project_id: testProjectId,
        prompt_content: 'Generate a function',
        ai_response: 'function test() { return true; }',
        created_at: '2024-01-01T00:00:00Z'
      };
      mockSupabase.single.mockResolvedValueOnce({ data: aiPrompt, error: null });
      
      const result = await databaseService.createAIPrompt(
        testProjectId,
        'Generate a function',
        'function test() { return true; }'
      );
      
      expect(result).toEqual(aiPrompt);
    });

    it('should fetch AI prompts for project', async () => {
      const prompts = [{
        id: 'prompt-123',
        project_id: testProjectId,
        prompt_content: 'Test',
        ai_response: 'Response',
        created_at: '2024-01-01'
      }];
      mockSupabase.order.mockResolvedValueOnce({ data: prompts, error: null });
      
      const result = await databaseService.getAIPromptsForProject(testProjectId);
      
      expect(result).toEqual(prompts);
    });
  });

  describe('Utility Methods', () => {
    it('should generate unique invite codes', async () => {
      const codes = new Set<string>();
      
      for (let i = 0; i < 5; i++) {
        mockSupabase.single.mockResolvedValueOnce({ data: testProject, error: null });
        await databaseService.createProject('Test', 'Desc', '', '', testUserId);
        
        const insertCall = mockSupabase.insert.mock.calls[i][0];
        codes.add(insertCall.invite_code);
      }
      
      // Most codes should be unique
      expect(codes.size).toBeGreaterThan(1);
    });
  });

  describe('Error Handling', () => {
    it('should handle database errors gracefully', async () => {
      mockSupabase.single.mockResolvedValueOnce({ 
        data: null, 
        error: { message: 'Database error' } 
      });
      
      const result = await databaseService.getProfile(testUserId);
      
      expect(result).toBeNull();
    });

    it('should handle null data', async () => {
      mockSupabase.single.mockResolvedValueOnce({ data: null, error: null });
      
      const result = await databaseService.getProfile(testUserId);
      
      expect(result).toBeNull();
    });
  });
});