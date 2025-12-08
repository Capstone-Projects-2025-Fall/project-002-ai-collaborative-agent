import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { analyzeProgressWithAgent } from './agenticAI';
import * as fs from 'fs/promises';

// Mock vscode
vi.mock('vscode', () => ({}));

// Mock fs/promises
vi.mock('fs/promises');

// Mock supabaseConfig
vi.mock('./supabaseConfig', () => ({
  getSupabaseClient: vi.fn(() => mockSupabase)
}));

let mockSupabase: any;

describe('AgenticAI', () => {
  beforeEach(() => {
    // Reset all mocks
    vi.clearAllMocks();
    
    // Setup mock supabase with chainable methods
    const createMockChain = () => {
      const chain = {
        select: vi.fn(),
        eq: vi.fn(),
        limit: vi.fn(),
        from: vi.fn()
      };
      
      // Make methods chainable
      chain.select.mockReturnValue(chain);
      chain.eq.mockReturnValue(chain);
      chain.limit.mockReturnValue(chain);
      chain.from.mockReturnValue(chain);
      
      return chain;
    };

    mockSupabase = {
      from: vi.fn(() => createMockChain()),
      functions: {
        invoke: vi.fn()
      }
    };
  });

  describe('analyzeProgressWithAgent', () => {
    it('should successfully analyze a project with workspace context', async () => {
      // Mock file system
      const mockFiles = [
        { name: 'index.ts', isDirectory: () => false },
        { name: 'App.tsx', isDirectory: () => false },
        { name: 'utils.js', isDirectory: () => false }
      ];
      
      vi.mocked(fs.readdir).mockResolvedValue(mockFiles as any);
      vi.mocked(fs.stat).mockResolvedValue({
        mtime: new Date('2024-01-01')
      } as any);

      // Mock RAG context
      const mockChain = mockSupabase.from();
      mockChain.limit.mockResolvedValue({
        data: [
          { file_path: 'src/index.ts', file_language: 'typescript', chunk_text: 'console.log("test")' }
        ],
        error: null
      });

      // Mock edge function response
      mockSupabase.functions.invoke.mockResolvedValue({
        data: {
          analysis: {
            completionStatus: {
              percentComplete: 65,
              completedAreas: ['Authentication', 'Database setup'],
              inProgress: ['UI Components'],
              notStarted: ['Testing']
            },
            codeQuality: {
              overallScore: 8,
              strengths: ['Clean code', 'Good structure'],
              concerns: ['Missing tests']
            },
            teamPerformance: [
              {
                memberName: 'Alice',
                contributions: 'Implemented auth system',
                suggestions: 'Add more documentation',
                supportNeeded: 'Help with testing'
              }
            ],
            blockers: [
              {
                issue: 'API rate limits',
                affectedMembers: ['Bob'],
                suggestedSolution: 'Implement caching'
              }
            ],
            nextPriorities: [
              {
                priority: 'Complete UI components',
                assignTo: 'Alice',
                reasoning: 'Has frontend expertise'
              }
            ],
            summary: 'Project is on track with 65% completion'
          }
        },
        error: null
      });

      // Call the function
      const context = {
        projectId: 'test-project-123',
        projectDetails: {
          name: 'Test Project',
          description: 'A test project',
          requirements: 'Build a web app'
        },
        teamMembers: [
          { name: 'Alice', email: 'alice@test.com', skills: 'React', programmingLanguages: 'JavaScript' }
        ],
        workspacePath: '/test/workspace',
        ragEnabled: true
      };

      const progressMessages: string[] = [];
      const result = await analyzeProgressWithAgent(context, (msg) => {
        progressMessages.push(msg);
      });

      // Assertions
      expect(result).toBeDefined();
      expect(result.completionStatus.percentComplete).toBe(65);
      expect(result.codeQuality.overallScore).toBe(8);
      expect(result.teamPerformance).toHaveLength(1);
      expect(result.blockers).toHaveLength(1);
      expect(result.nextPriorities).toHaveLength(1);
      expect(result.summary).toBe('Project is on track with 65% completion');

      // Verify progress callbacks were called
      expect(progressMessages.length).toBeGreaterThan(0);
      expect(progressMessages.some(msg => msg.includes('[INIT]'))).toBe(true);
      expect(progressMessages.some(msg => msg.includes('[SCAN]'))).toBe(true);
      expect(progressMessages.some(msg => msg.includes('[RAG]'))).toBe(true);
      expect(progressMessages.some(msg => msg.includes('[AI]'))).toBe(true);
      expect(progressMessages.some(msg => msg.includes('[DONE]'))).toBe(true);
    });

    it('should handle workspace scanning correctly', async () => {
      // Mock nested directory structure
      const mockRootFiles = [
        { name: 'src', isDirectory: () => true },
        { name: 'package.json', isDirectory: () => false }
      ];
      
      const mockSrcFiles = [
        { name: 'index.ts', isDirectory: () => false },
        { name: 'App.tsx', isDirectory: () => false }
      ];

      let readdirCallCount = 0;
      vi.mocked(fs.readdir).mockImplementation((path: any) => {
        readdirCallCount++;
        if (readdirCallCount === 1) {
          return Promise.resolve(mockRootFiles as any);
        } else {
          return Promise.resolve(mockSrcFiles as any);
        }
      });

      vi.mocked(fs.stat).mockResolvedValue({
        mtime: new Date('2024-01-01')
      } as any);

      // Mock RAG and edge function
      const mockChain = mockSupabase.from();
      mockChain.limit.mockResolvedValue({ data: [], error: null });

      mockSupabase.functions.invoke.mockResolvedValue({
        data: {
          analysis: {
            completionStatus: { percentComplete: 0, completedAreas: [], inProgress: [], notStarted: [] },
            codeQuality: { overallScore: 5, strengths: [], concerns: [] },
            teamPerformance: [],
            blockers: [],
            nextPriorities: [],
            summary: 'Test'
          }
        },
        error: null
      });

      const context = {
        projectId: 'test-project',
        projectDetails: { name: 'Test', description: 'Test', requirements: 'Test' },
        teamMembers: [],
        workspacePath: '/test',
        ragEnabled: false
      };

      const progressMessages: string[] = [];
      await analyzeProgressWithAgent(context, (msg) => progressMessages.push(msg));

      // Verify workspace scanning messages
      expect(progressMessages.some(msg => msg.includes('Starting workspace scan'))).toBe(true);
      expect(progressMessages.some(msg => msg.includes('Found') && msg.includes('files'))).toBe(true);
      expect(readdirCallCount).toBeGreaterThan(0);
    });

    it('should handle RAG context when enabled', async () => {
      // Mock file system
      vi.mocked(fs.readdir).mockResolvedValue([
        { name: 'test.ts', isDirectory: () => false }
      ] as any);
      vi.mocked(fs.stat).mockResolvedValue({ mtime: new Date() } as any);

      // Mock RAG with data - properly set up the chain
      const mockRagData = [
        { file_path: 'src/index.ts', file_language: 'typescript', chunk_text: 'const x = 1;' },
        { file_path: 'src/App.tsx', file_language: 'typescriptreact', chunk_text: 'export const App = () => {}' }
      ];
      
      const mockChain = {
        select: vi.fn(),
        eq: vi.fn(),
        limit: vi.fn()
      };
      
      mockChain.select.mockReturnValue(mockChain);
      mockChain.eq.mockReturnValue(mockChain);
      mockChain.limit.mockResolvedValue({
        data: mockRagData,
        error: null
      });
      
      mockSupabase.from = vi.fn(() => mockChain);

      mockSupabase.functions.invoke.mockResolvedValue({
        data: {
          analysis: {
            completionStatus: { percentComplete: 50, completedAreas: [], inProgress: [], notStarted: [] },
            codeQuality: { overallScore: 7, strengths: [], concerns: [] },
            teamPerformance: [],
            blockers: [],
            nextPriorities: [],
            summary: 'Test with RAG'
          }
        },
        error: null
      });

      const context = {
        projectId: 'test-project',
        projectDetails: { name: 'Test', description: 'Test', requirements: 'Test' },
        teamMembers: [],
        workspacePath: '/test',
        ragEnabled: true
      };

      const progressMessages: string[] = [];
      const result = await analyzeProgressWithAgent(context, (msg) => progressMessages.push(msg));

      // Verify RAG was used
      expect(progressMessages.some(msg => msg.includes('[RAG]'))).toBe(true);
      expect(progressMessages.some(msg => msg.includes('Fetching indexed code context'))).toBe(true);
      expect(progressMessages.some(msg => msg.includes('Loaded 2 code chunks'))).toBe(true);
      expect(result).toBeDefined();
    });

    it('should handle RAG context when disabled', async () => {
      // Mock file system
      vi.mocked(fs.readdir).mockResolvedValue([
        { name: 'test.ts', isDirectory: () => false }
      ] as any);
      vi.mocked(fs.stat).mockResolvedValue({ mtime: new Date() } as any);

      mockSupabase.functions.invoke.mockResolvedValue({
        data: {
          analysis: {
            completionStatus: { percentComplete: 30, completedAreas: [], inProgress: [], notStarted: [] },
            codeQuality: { overallScore: 6, strengths: [], concerns: [] },
            teamPerformance: [],
            blockers: [],
            nextPriorities: [],
            summary: 'Test without RAG'
          }
        },
        error: null
      });

      const context = {
        projectId: 'test-project',
        projectDetails: { name: 'Test', description: 'Test', requirements: 'Test' },
        teamMembers: [],
        workspacePath: '/test',
        ragEnabled: false
      };

      const progressMessages: string[] = [];
      await analyzeProgressWithAgent(context, (msg) => progressMessages.push(msg));

      // Verify RAG was not used
      expect(progressMessages.some(msg => msg.includes('[RAG]'))).toBe(false);
      expect(progressMessages.some(msg => msg.includes('Fetching indexed code context'))).toBe(false);
    });

    it('should skip node_modules and hidden directories', async () => {
      // Mock directory structure with node_modules
      const mockFiles = [
        { name: 'node_modules', isDirectory: () => true },
        { name: '.git', isDirectory: () => true },
        { name: 'src', isDirectory: () => true },
        { name: 'dist', isDirectory: () => true },
        { name: 'package.json', isDirectory: () => false }
      ];

      const mockSrcFiles = [
        { name: 'index.ts', isDirectory: () => false }
      ];

      let readdirCallCount = 0;
      vi.mocked(fs.readdir).mockImplementation((path: any) => {
        readdirCallCount++;
        if (readdirCallCount === 1) {
          return Promise.resolve(mockFiles as any);
        } else {
          return Promise.resolve(mockSrcFiles as any);
        }
      });

      vi.mocked(fs.stat).mockResolvedValue({ mtime: new Date() } as any);

      const mockChain = mockSupabase.from();
      mockChain.limit.mockResolvedValue({ data: [], error: null });

      mockSupabase.functions.invoke.mockResolvedValue({
        data: {
          analysis: {
            completionStatus: { percentComplete: 0, completedAreas: [], inProgress: [], notStarted: [] },
            codeQuality: { overallScore: 5, strengths: [], concerns: [] },
            teamPerformance: [],
            blockers: [],
            nextPriorities: [],
            summary: 'Test'
          }
        },
        error: null
      });

      const context = {
        projectId: 'test-project',
        projectDetails: { name: 'Test', description: 'Test', requirements: 'Test' },
        teamMembers: [],
        workspacePath: '/test',
        ragEnabled: false
      };

      await analyzeProgressWithAgent(context);

      // Should only scan src directory, not node_modules, .git, or dist
      expect(readdirCallCount).toBe(2); // Root + src only
    });

    it('should handle edge function errors gracefully', async () => {
      // Mock file system
      vi.mocked(fs.readdir).mockResolvedValue([
        { name: 'test.ts', isDirectory: () => false }
      ] as any);
      vi.mocked(fs.stat).mockResolvedValue({ mtime: new Date() } as any);

      const mockChain = mockSupabase.from();
      mockChain.limit.mockResolvedValue({ data: [], error: null });

      // Mock edge function error
      mockSupabase.functions.invoke.mockResolvedValue({
        data: null,
        error: { message: 'Edge function timeout' }
      });

      const context = {
        projectId: 'test-project',
        projectDetails: { name: 'Test', description: 'Test', requirements: 'Test' },
        teamMembers: [],
        workspacePath: '/test',
        ragEnabled: false
      };

      const progressMessages: string[] = [];
      const result = await analyzeProgressWithAgent(context, (msg) => progressMessages.push(msg));

      // Should return fallback structure
      expect(result).toBeDefined();
      expect(result.completionStatus.percentComplete).toBe(0);
      expect(result.blockers[0].issue).toBe('Analysis service unavailable');
      expect(result.summary).toContain('Unable to complete agentic analysis');
      
      // Should have error message in progress
      expect(progressMessages.some(msg => msg.includes('[AI] Fatal error'))).toBe(true);
    });

    it('should send detailed progress updates', async () => {
      // Mock file system with multiple file types
      vi.mocked(fs.readdir).mockResolvedValue([
        { name: 'index.ts', isDirectory: () => false },
        { name: 'App.tsx', isDirectory: () => false },
        { name: 'style.css', isDirectory: () => false }
      ] as any);
      vi.mocked(fs.stat).mockResolvedValue({ mtime: new Date() } as any);

      const mockChain = mockSupabase.from();
      mockChain.limit.mockResolvedValue({
        data: [
          { file_path: 'src/index.ts', file_language: 'typescript', chunk_text: 'test' }
        ],
        error: null
      });

      mockSupabase.functions.invoke.mockResolvedValue({
        data: {
          analysis: {
            completionStatus: { percentComplete: 75, completedAreas: [], inProgress: [], notStarted: [] },
            codeQuality: { overallScore: 9, strengths: [], concerns: [] },
            teamPerformance: [],
            blockers: [],
            nextPriorities: [],
            summary: 'Great progress'
          }
        },
        error: null
      });

      const context = {
        projectId: 'test-project',
        projectDetails: { name: 'My Project', description: 'Test', requirements: 'Test' },
        teamMembers: [
          { name: 'Alice', email: 'alice@test.com' },
          { name: 'Bob', email: 'bob@test.com' }
        ],
        workspacePath: '/test',
        ragEnabled: true
      };

      const progressMessages: string[] = [];
      await analyzeProgressWithAgent(context, (msg) => progressMessages.push(msg));

      // Verify comprehensive status updates
      expect(progressMessages).toContain('[INIT] Initializing agentic AI analyzer');
      expect(progressMessages).toContain('[INIT] Project: My Project');
      expect(progressMessages.some(msg => msg.includes('[SCAN] Starting workspace scan'))).toBe(true);
      expect(progressMessages.some(msg => msg.includes('[SCAN] Found'))).toBe(true);
      expect(progressMessages.some(msg => msg.includes('.ts:'))).toBe(true); // File type stats
      expect(progressMessages.some(msg => msg.includes('[RAG] Fetching indexed code context'))).toBe(true);
      expect(progressMessages.some(msg => msg.includes('[PREP] Team size: 2 members'))).toBe(true);
      expect(progressMessages.some(msg => msg.includes('[AI] Connecting to analysis service'))).toBe(true);
      expect(progressMessages.some(msg => msg.includes('[DONE] Completion: 75%'))).toBe(true);
    });

    it('should handle database errors when fetching RAG context', async () => {
      // Mock file system
      vi.mocked(fs.readdir).mockResolvedValue([
        { name: 'test.ts', isDirectory: () => false }
      ] as any);
      vi.mocked(fs.stat).mockResolvedValue({ mtime: new Date() } as any);

      // Mock RAG error - properly set up the chain to throw
      const mockChain = {
        select: vi.fn(),
        eq: vi.fn(),
        limit: vi.fn()
      };
      
      mockChain.select.mockReturnValue(mockChain);
      mockChain.eq.mockReturnValue(mockChain);
      mockChain.limit.mockResolvedValue({
        data: null,
        error: { message: 'Database connection failed' }
      });
      
      mockSupabase.from = vi.fn(() => mockChain);

      mockSupabase.functions.invoke.mockResolvedValue({
        data: {
          analysis: {
            completionStatus: { percentComplete: 40, completedAreas: [], inProgress: [], notStarted: [] },
            codeQuality: { overallScore: 6, strengths: [], concerns: [] },
            teamPerformance: [],
            blockers: [],
            nextPriorities: [],
            summary: 'Analysis without RAG'
          }
        },
        error: null
      });

      const context = {
        projectId: 'test-project',
        projectDetails: { name: 'Test', description: 'Test', requirements: 'Test' },
        teamMembers: [],
        workspacePath: '/test',
        ragEnabled: true
      };

      const progressMessages: string[] = [];
      const result = await analyzeProgressWithAgent(context, (msg) => progressMessages.push(msg));

      // Should still complete successfully
      expect(result).toBeDefined();
      expect(result.completionStatus.percentComplete).toBe(40);
      
      // Should log the error (will be in catch block) - the error message gets wrapped
      expect(progressMessages.some(msg => msg.includes('[RAG] Error:'))).toBe(true);
    });

    it('should limit directory scan depth to 5 levels', async () => {
      // Create deeply nested structure
      let depth = 0;
      vi.mocked(fs.readdir).mockImplementation((path: any) => {
        depth++;
        if (depth <= 6) {
          return Promise.resolve([
            { name: `level${depth}`, isDirectory: () => true },
            { name: 'file.ts', isDirectory: () => false }
          ] as any);
        }
        return Promise.resolve([] as any);
      });

      vi.mocked(fs.stat).mockResolvedValue({ mtime: new Date() } as any);

      const mockChain = mockSupabase.from();
      mockChain.limit.mockResolvedValue({ data: [], error: null });

      mockSupabase.functions.invoke.mockResolvedValue({
        data: {
          analysis: {
            completionStatus: { percentComplete: 0, completedAreas: [], inProgress: [], notStarted: [] },
            codeQuality: { overallScore: 5, strengths: [], concerns: [] },
            teamPerformance: [],
            blockers: [],
            nextPriorities: [],
            summary: 'Test'
          }
        },
        error: null
      });

      const context = {
        projectId: 'test-project',
        projectDetails: { name: 'Test', description: 'Test', requirements: 'Test' },
        teamMembers: [],
        workspacePath: '/test',
        ragEnabled: false
      };

      await analyzeProgressWithAgent(context);

      // Should stop at depth 5 (6 readdir calls: root + 5 levels)
      expect(depth).toBeLessThanOrEqual(6);
    });

    it('should track file types correctly', async () => {
      // Mock various file types
      vi.mocked(fs.readdir).mockResolvedValue([
        { name: 'index.ts', isDirectory: () => false },
        { name: 'App.tsx', isDirectory: () => false },
        { name: 'styles.css', isDirectory: () => false },
        { name: 'utils.js', isDirectory: () => false },
        { name: 'config.json', isDirectory: () => false }
      ] as any);
      vi.mocked(fs.stat).mockResolvedValue({ mtime: new Date() } as any);

      const mockChain = mockSupabase.from();
      mockChain.limit.mockResolvedValue({ data: [], error: null });

      mockSupabase.functions.invoke.mockResolvedValue({
        data: {
          analysis: {
            completionStatus: { percentComplete: 0, completedAreas: [], inProgress: [], notStarted: [] },
            codeQuality: { overallScore: 5, strengths: [], concerns: [] },
            teamPerformance: [],
            blockers: [],
            nextPriorities: [],
            summary: 'Test'
          }
        },
        error: null
      });

      const context = {
        projectId: 'test-project',
        projectDetails: { name: 'Test', description: 'Test', requirements: 'Test' },
        teamMembers: [],
        workspacePath: '/test',
        ragEnabled: false
      };

      const progressMessages: string[] = [];
      await analyzeProgressWithAgent(context, (msg) => progressMessages.push(msg));

      // Should report different file types
      expect(progressMessages.some(msg => msg.includes('.ts:'))).toBe(true);
      expect(progressMessages.some(msg => msg.includes('.tsx:') || msg.includes('.css:') || msg.includes('.js:'))).toBe(true);
    });

    it('should handle empty workspace', async () => {
      // Mock empty workspace
      vi.mocked(fs.readdir).mockResolvedValue([] as any);

      const mockChain = mockSupabase.from();
      mockChain.limit.mockResolvedValue({ data: [], error: null });

      mockSupabase.functions.invoke.mockResolvedValue({
        data: {
          analysis: {
            completionStatus: { percentComplete: 0, completedAreas: [], inProgress: ['Not started'], notStarted: [] },
            codeQuality: { overallScore: 5, strengths: [], concerns: [] },
            teamPerformance: [],
            blockers: [],
            nextPriorities: [],
            summary: 'Empty workspace'
          }
        },
        error: null
      });

      const context = {
        projectId: 'test-project',
        projectDetails: { name: 'Test', description: 'Test', requirements: 'Test' },
        teamMembers: [],
        workspacePath: '/test',
        ragEnabled: false
      };

      const progressMessages: string[] = [];
      const result = await analyzeProgressWithAgent(context, (msg) => progressMessages.push(msg));

      // Should complete without errors
      expect(result).toBeDefined();
      expect(progressMessages.some(msg => msg.includes('[SCAN] Found 0 files'))).toBe(true);
    });

    it('should include team member information in progress updates', async () => {
      // Mock file system
      vi.mocked(fs.readdir).mockResolvedValue([
        { name: 'test.ts', isDirectory: () => false }
      ] as any);
      vi.mocked(fs.stat).mockResolvedValue({ mtime: new Date() } as any);

      const mockChain = mockSupabase.from();
      mockChain.limit.mockResolvedValue({ data: [], error: null });

      mockSupabase.functions.invoke.mockResolvedValue({
        data: {
          analysis: {
            completionStatus: { percentComplete: 0, completedAreas: [], inProgress: [], notStarted: [] },
            codeQuality: { overallScore: 5, strengths: [], concerns: [] },
            teamPerformance: [
              {
                memberName: 'Alice',
                contributions: 'Backend work',
                suggestions: 'Good job',
                supportNeeded: 'None'
              },
              {
                memberName: 'Bob',
                contributions: 'Frontend work',
                suggestions: 'Keep going',
                supportNeeded: 'Design help'
              }
            ],
            blockers: [],
            nextPriorities: [],
            summary: 'Test'
          }
        },
        error: null
      });

      const context = {
        projectId: 'test-project',
        projectDetails: { name: 'Test', description: 'Test', requirements: 'Test' },
        teamMembers: [
          { name: 'Alice', email: 'alice@test.com', skills: 'Backend', programmingLanguages: 'Python' },
          { name: 'Bob', email: 'bob@test.com', skills: 'Frontend', programmingLanguages: 'JavaScript' }
        ],
        workspacePath: '/test',
        ragEnabled: false
      };

      const progressMessages: string[] = [];
      const result = await analyzeProgressWithAgent(context, (msg) => progressMessages.push(msg));

      // Verify team size is logged
      expect(progressMessages.some(msg => msg.includes('[PREP] Team size: 2 members'))).toBe(true);
      
      // Verify team performance data
      expect(result.teamPerformance).toHaveLength(2);
      expect(result.teamPerformance[0].memberName).toBe('Alice');
      expect(result.teamPerformance[1].memberName).toBe('Bob');
    });

    it('should report prompt size', async () => {
      // Mock file system
      vi.mocked(fs.readdir).mockResolvedValue([
        { name: 'test.ts', isDirectory: () => false }
      ] as any);
      vi.mocked(fs.stat).mockResolvedValue({ mtime: new Date() } as any);

      const mockChain = mockSupabase.from();
      mockChain.limit.mockResolvedValue({ data: [], error: null });

      mockSupabase.functions.invoke.mockResolvedValue({
        data: {
          analysis: {
            completionStatus: { percentComplete: 0, completedAreas: [], inProgress: [], notStarted: [] },
            codeQuality: { overallScore: 5, strengths: [], concerns: [] },
            teamPerformance: [],
            blockers: [],
            nextPriorities: [],
            summary: 'Test'
          }
        },
        error: null
      });

      const context = {
        projectId: 'test-project',
        projectDetails: { name: 'Test', description: 'Test', requirements: 'Test' },
        teamMembers: [],
        workspacePath: '/test',
        ragEnabled: false
      };

      const progressMessages: string[] = [];
      await analyzeProgressWithAgent(context, (msg) => progressMessages.push(msg));

      // Should report prompt size
      expect(progressMessages.some(msg => msg.includes('[PREP] Context prepared') && msg.includes('chars'))).toBe(true);
      expect(progressMessages.some(msg => msg.includes('[AI] Prompt size:') && msg.includes('characters'))).toBe(true);
    });

    it('should handle recently modified files', async () => {
      // Mock files with different modification times
      vi.mocked(fs.readdir).mockResolvedValue([
        { name: 'old.ts', isDirectory: () => false },
        { name: 'new.ts', isDirectory: () => false }
      ] as any);

      let statCallCount = 0;
      vi.mocked(fs.stat).mockImplementation((path: any) => {
        statCallCount++;
        return Promise.resolve({
          mtime: new Date(Date.now() - statCallCount * 1000000) // Different times
        } as any);
      });

      const mockChain = mockSupabase.from();
      mockChain.limit.mockResolvedValue({ data: [], error: null });

      mockSupabase.functions.invoke.mockResolvedValue({
        data: {
          analysis: {
            completionStatus: { percentComplete: 0, completedAreas: [], inProgress: [], notStarted: [] },
            codeQuality: { overallScore: 5, strengths: [], concerns: [] },
            teamPerformance: [],
            blockers: [],
            nextPriorities: [],
            summary: 'Test'
          }
        },
        error: null
      });

      const context = {
        projectId: 'test-project',
        projectDetails: { name: 'Test', description: 'Test', requirements: 'Test' },
        teamMembers: [],
        workspacePath: '/test',
        ragEnabled: false
      };

      const progressMessages: string[] = [];
      await analyzeProgressWithAgent(context, (msg) => progressMessages.push(msg));

      // Should log checking modification times
      expect(progressMessages.some(msg => msg.includes('[SCAN] Checking file modification times'))).toBe(true);
      expect(progressMessages.some(msg => msg.includes('[SCAN] Found') && msg.includes('recently modified files'))).toBe(true);
    });

    it('should log RAG files being analyzed', async () => {
      // Mock file system
      vi.mocked(fs.readdir).mockResolvedValue([
        { name: 'test.ts', isDirectory: () => false }
      ] as any);
      vi.mocked(fs.stat).mockResolvedValue({ mtime: new Date() } as any);

      // Mock RAG with multiple files - make sure to properly mock the chain
      const mockRagData = [
        { file_path: 'src/auth.ts', file_language: 'typescript', chunk_text: 'auth code' },
        { file_path: 'src/api.ts', file_language: 'typescript', chunk_text: 'api code' },
        { file_path: 'src/utils.ts', file_language: 'typescript', chunk_text: 'utils code' }
      ];
      
      const mockChain = {
        select: vi.fn(),
        eq: vi.fn(),
        limit: vi.fn()
      };
      
      mockChain.select.mockReturnValue(mockChain);
      mockChain.eq.mockReturnValue(mockChain);
      mockChain.limit.mockResolvedValue({
        data: mockRagData,
        error: null
      });
      
      mockSupabase.from = vi.fn(() => mockChain);

      mockSupabase.functions.invoke.mockResolvedValue({
        data: {
          analysis: {
            completionStatus: { percentComplete: 0, completedAreas: [], inProgress: [], notStarted: [] },
            codeQuality: { overallScore: 5, strengths: [], concerns: [] },
            teamPerformance: [],
            blockers: [],
            nextPriorities: [],
            summary: 'Test'
          }
        },
        error: null
      });

      const context = {
        projectId: 'test-project',
        projectDetails: { name: 'Test', description: 'Test', requirements: 'Test' },
        teamMembers: [],
        workspacePath: '/test',
        ragEnabled: true
      };

      const progressMessages: string[] = [];
      await analyzeProgressWithAgent(context, (msg) => progressMessages.push(msg));

      // Should log that RAG loaded files and then analyze them
      expect(progressMessages.some(msg => msg.includes('[RAG] Loaded 3 code chunks'))).toBe(true);
      expect(progressMessages.some(msg => msg.includes('[RAG] Analyzing: src/auth.ts'))).toBe(true);
      expect(progressMessages.some(msg => msg.includes('[RAG] Analyzing: src/api.ts'))).toBe(true);
      expect(progressMessages.some(msg => msg.includes('[RAG] Analyzing: src/utils.ts'))).toBe(true);
    });
  });
});

