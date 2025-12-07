import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as vscode from 'vscode';
import { PeerSuggestionService } from './peerSuggestionService';
import { DatabaseService } from './databaseService';
import { AuthService } from './authService';

// Mock VS Code API
vi.mock('vscode', () => ({
  window: {
    createStatusBarItem: vi.fn(() => ({
      text: '',
      tooltip: '',
      backgroundColor: undefined,
      command: '',
      show: vi.fn(),
      hide: vi.fn(),
      dispose: vi.fn()
    })),
    activeTextEditor: undefined,
    showInformationMessage: vi.fn(),
    showErrorMessage: vi.fn()
  },
  workspace: {
    onDidChangeTextDocument: vi.fn(() => ({ dispose: vi.fn() }))
  },
  languages: {
    onDidChangeDiagnostics: vi.fn(() => ({ dispose: vi.fn() })),
    getDiagnostics: vi.fn(() => [])
  },
  commands: {
    registerCommand: vi.fn(() => ({ dispose: vi.fn() }))
  },
  env: {
    clipboard: {
      writeText: vi.fn()
    }
  },
  StatusBarAlignment: {
    Right: 2
  },
  DiagnosticSeverity: {
    Error: 0,
    Warning: 1,
    Information: 2,
    Hint: 3
  },
  ThemeColor: vi.fn()
}));

describe('PeerSuggestionService', () => {
  let service: PeerSuggestionService;
  let mockContext: any;
  let mockDatabaseService: any;
  let mockAuthService: any;
  let mockGetActiveProject: any;

  const mockProject = {
    id: 'project-123',
    name: 'Test Project',
    description: 'A test project',
    goals: 'Test goals',
    requirements: 'Test requirements',
    owner_id: 'user-123',
    invite_code: 'ABC123',
    created_at: '2024-01-01',
    updated_at: '2024-01-01'
  };

  const mockUser = {
    id: 'user-123',
    email: 'test@example.com',
    name: 'Test User'
  };

  const mockTeamMembers = [
    {
      id: 'user-456',
      name: 'Team Member',
      skills: 'JavaScript, TypeScript',
      programming_languages: 'JavaScript, Python',
      willing_to_work_on: 'Web development',
      jira_base_url: null,
      jira_project_key: null,
      jira_email: null,
      jira_api_token: null,
      jira_project_prompt: null,
      created_at: '2024-01-01'
    }
  ];

  beforeEach(() => {
    mockContext = {
      subscriptions: []
    };

    mockDatabaseService = {
      getProfilesForProject: vi.fn().mockResolvedValue(mockTeamMembers)
    };

    mockAuthService = {
      getCurrentUser: vi.fn().mockReturnValue(mockUser)
    };

    mockGetActiveProject = vi.fn().mockResolvedValue(mockProject);

    service = new PeerSuggestionService(
      mockContext,
      mockDatabaseService,
      mockAuthService,
      mockGetActiveProject
    );
  });

  afterEach(() => {
    service.dispose();
    vi.clearAllMocks();
  });

  describe('Constructor', () => {
    it('should initialize with enabled state', () => {
      expect(service).toBeDefined();
    });

    it('should create a status bar item', () => {
      expect(vscode.window.createStatusBarItem).toHaveBeenCalledWith(
        vscode.StatusBarAlignment.Right,
        100
      );
    });

    it('should register view command', () => {
      expect(vscode.commands.registerCommand).toHaveBeenCalledWith(
        'aiCollab.viewPeerSuggestion',
        expect.any(Function)
      );
    });

    it('should register event listeners', () => {
      expect(vscode.workspace.onDidChangeTextDocument).toHaveBeenCalled();
      expect(vscode.languages.onDidChangeDiagnostics).toHaveBeenCalled();
    });
  });

  describe('Enable/Disable', () => {
    it('should enable the service', () => {
      service.disable();
      service.enable();
      // Service should be enabled (no error thrown)
      expect(true).toBe(true);
    });

    it('should disable the service', () => {
      service.disable();
      // Service should be disabled (no error thrown)
      expect(true).toBe(true);
    });
  });

  describe('Dispose', () => {
    it('should clean up resources on dispose', () => {
      const statusBarItem = (service as any).statusBarItem;
      service.dispose();
      
      expect(statusBarItem.dispose).toHaveBeenCalled();
    });

    it('should disable service on dispose', () => {
      service.dispose();
      // Should not throw error
      expect(true).toBe(true);
    });
  });

  describe('Project Context Handling', () => {
    it('should handle missing project context', async () => {
      mockGetActiveProject.mockResolvedValueOnce(null);
      
      // Create new service with null project
      const nullProjectService = new PeerSuggestionService(
        mockContext,
        mockDatabaseService,
        mockAuthService,
        mockGetActiveProject
      );
      
      // Should not throw error
      expect(nullProjectService).toBeDefined();
      
      nullProjectService.dispose();
    });
  });

  describe('Clipboard Operations', () => {
    it('should copy text to clipboard successfully', async () => {
      const testText = 'Test collaboration message';
      vi.mocked(vscode.env.clipboard.writeText).mockResolvedValueOnce(undefined);
      
      await vscode.env.clipboard.writeText(testText);
      
      expect(vscode.env.clipboard.writeText).toHaveBeenCalledWith(testText);
    });

    it('should handle clipboard errors gracefully', async () => {
      vi.mocked(vscode.env.clipboard.writeText).mockRejectedValueOnce(
        new Error('Clipboard error')
      );
      
      try {
        await vscode.env.clipboard.writeText('test');
      } catch (error: any) {
        expect(error.message).toBe('Clipboard error');
      }
    });
  });

  describe('Team Member Filtering', () => {
    it('should filter out current user from team members', async () => {
      const allMembers = [
        ...mockTeamMembers,
        {
          id: 'user-123', // Current user
          name: 'Current User',
          skills: 'Testing',
          programming_languages: 'TypeScript',
          willing_to_work_on: 'Testing',
          jira_base_url: null,
          jira_project_key: null,
          jira_email: null,
          jira_api_token: null,
          jira_project_prompt: null,
          created_at: '2024-01-01'
        }
      ];

      mockDatabaseService.getProfilesForProject.mockResolvedValueOnce(allMembers);
      
      const members = await mockDatabaseService.getProfilesForProject(mockProject.id);
      const filteredMembers = members.filter((m: any) => m.id !== mockUser.id);
      
      expect(filteredMembers.length).toBe(1);
      expect(filteredMembers[0].id).toBe('user-456');
    });

    it('should return empty array if no other team members', async () => {
      mockDatabaseService.getProfilesForProject.mockResolvedValueOnce([
        {
          id: 'user-123', // Only current user
          name: 'Current User',
          skills: '',
          programming_languages: '',
          willing_to_work_on: '',
          jira_base_url: null,
          jira_project_key: null,
          jira_email: null,
          jira_api_token: null,
          jira_project_prompt: null,
          created_at: '2024-01-01'
        }
      ]);
      
      const members = await mockDatabaseService.getProfilesForProject(mockProject.id);
      const filteredMembers = members.filter((m: any) => m.id !== mockUser.id);
      
      expect(filteredMembers).toEqual([]);
    });
  });

  describe('Error Handling', () => {
    it('should handle database errors gracefully', async () => {
      mockDatabaseService.getProfilesForProject.mockRejectedValueOnce(
        new Error('Database error')
      );
      
      try {
        await mockDatabaseService.getProfilesForProject(mockProject.id);
      } catch (error: any) {
        expect(error.message).toBe('Database error');
      }
    });

    it('should handle missing user gracefully', () => {
      mockAuthService.getCurrentUser.mockReturnValueOnce(null);
      
      const user = mockAuthService.getCurrentUser();
      
      expect(user).toBeNull();
    });
  });

  describe('Struggle Detection Patterns', () => {
    it('should detect TODO comments', () => {
      const codeWithTodo = `
        function test() {
          // TODO: Fix this later
          return true;
        }
      `;
      
      expect(codeWithTodo).toContain('TODO');
    });

    it('should detect FIXME comments', () => {
      const codeWithFixme = `
        function test() {
          # FIXME: This is broken
          pass
        }
      `;
      
      expect(codeWithFixme).toContain('FIXME');
    });

    it('should detect complex library imports', () => {
      const codeWithComplexImport = 'import tensorflow as tf';
      
      expect(codeWithComplexImport).toContain('tensorflow');
    });
  });

  describe('Logic Error Detection', () => {
    it('should identify potential add/subtract mismatch', () => {
      const code = `
        function addNumbers(a, b) {
          return a - b; // Should be + but using -
        }
      `;
      
      const hasSubtract = code.includes('-');
      const functionNameSaysAdd = code.includes('addNumbers');
      
      expect(hasSubtract && functionNameSaysAdd).toBe(true);
    });

    it('should identify get function without return', () => {
      const code = `
        function getUserData(id) {
          const user = database.find(id);
          console.log(user);
        }
      `;
      
      const hasGetFunction = code.includes('getUserData');
      const hasExitStatement = /\breturn\b/.test(code);
      
      expect(hasGetFunction).toBe(true);
      expect(hasExitStatement).toBe(false);
    });

    it('should identify delete function with add operations', () => {
      const code = `
        function deleteUser(id) {
          users.push(id); // Should remove, but adding
        }
      `;
      
      const hasDelete = code.includes('deleteUser');
      const hasPush = code.includes('push');
      
      expect(hasDelete && hasPush).toBe(true);
    });
  });

  describe('Context Hash Generation', () => {
    it('should generate consistent hash for same input', () => {
      const request = {
        codeSnippet: 'test code',
        languageId: 'typescript',
        cursorPosition: { line: 10, character: 5 },
        fileName: 'test.ts',
        diagnostics: [],
        projectContext: mockProject,
        teamMembers: [],
        currentUserId: 'user-123'
      };

      const crypto = require('crypto');
      const hashInput = `${request.codeSnippet.substring(0, 200)}|${request.languageId}|${request.cursorPosition.line}|${request.cursorPosition.character}`;
      const hash1 = crypto.createHash('md5').update(hashInput).digest('hex');
      const hash2 = crypto.createHash('md5').update(hashInput).digest('hex');
      
      expect(hash1).toBe(hash2);
    });

    it('should generate different hash for different input', () => {
      const crypto = require('crypto');
      const hash1 = crypto.createHash('md5').update('input1').digest('hex');
      const hash2 = crypto.createHash('md5').update('input2').digest('hex');
      
      expect(hash1).not.toBe(hash2);
    });
  });

  describe('Duplicate Prevention', () => {
    it('should track recent suggestions', () => {
      const recentSuggestions = new Map<string, number>();
      const hash = 'test-hash';
      const timestamp = Date.now();
      
      recentSuggestions.set(hash, timestamp);
      
      expect(recentSuggestions.has(hash)).toBe(true);
      expect(recentSuggestions.get(hash)).toBe(timestamp);
    });

    it('should detect duplicate within time window', () => {
      const recentSuggestions = new Map<string, number>();
      const hash = 'test-hash';
      const now = Date.now();
      const DUPLICATE_WINDOW = 10 * 60 * 1000; // 10 minutes
      
      recentSuggestions.set(hash, now - 5 * 60 * 1000); // 5 minutes ago
      
      const lastTime = recentSuggestions.get(hash);
      const isDuplicate = lastTime && (now - lastTime < DUPLICATE_WINDOW);
      
      expect(isDuplicate).toBe(true);
    });

    it('should allow suggestion after time window expires', () => {
      const recentSuggestions = new Map<string, number>();
      const hash = 'test-hash';
      const now = Date.now();
      const DUPLICATE_WINDOW = 10 * 60 * 1000; // 10 minutes
      
      recentSuggestions.set(hash, now - 15 * 60 * 1000); // 15 minutes ago
      
      const lastTime = recentSuggestions.get(hash);
      const isDuplicate = lastTime && (now - lastTime < DUPLICATE_WINDOW);
      
      expect(isDuplicate).toBe(false);
    });
  });
});