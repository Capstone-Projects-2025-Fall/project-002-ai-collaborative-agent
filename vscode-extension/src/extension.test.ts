import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as vscode from 'vscode';

// ============================================================================
// MOCKS SETUP
// ============================================================================

// Mock VS Code API
vi.mock('vscode', () => ({
  window: {
    createWebviewPanel: vi.fn(),
    showInformationMessage: vi.fn().mockResolvedValue(undefined),
    showErrorMessage: vi.fn().mockResolvedValue(undefined),
    showWarningMessage: vi.fn().mockResolvedValue(undefined),
    showInputBox: vi.fn(),
    showOpenDialog: vi.fn(),
    createTreeView: vi.fn(() => ({ badge: undefined })),
    createStatusBarItem: vi.fn(() => ({
      text: '',
      tooltip: '',
      command: '',
      show: vi.fn(),
    })),
    registerUriHandler: vi.fn(),
  },
  commands: {
    registerCommand: vi.fn((name, callback) => ({ dispose: vi.fn() })),
    executeCommand: vi.fn(),
  },
  workspace: {
    workspaceFolders: [],
  },
  extensions: {
    getExtension: vi.fn(() => undefined),
  },
  env: {
    openExternal: vi.fn().mockResolvedValue(true),
  },
  ViewColumn: {
    Active: 1,
    Beside: 2,
  },
  TreeItemCollapsibleState: {
    None: 0,
    Collapsed: 1,
    Expanded: 2,
  },
  TreeItem: class TreeItem {
    constructor(public label: string, public collapsibleState?: number) {}
  },
  Uri: {
    file: vi.fn((p: string) => ({ fsPath: p, scheme: 'file', path: p })),
    parse: vi.fn((str: string) => {
      const url = new URL(str.replace('vscode://', 'http://'));
      return {
        scheme: str.split(':')[0],
        authority: url.hostname,
        query: url.search.substring(1),
        toString: () => str,
      };
    }),
    joinPath: vi.fn(),
  },
  ThemeIcon: vi.fn(),
  ThemeColor: vi.fn(),
  EventEmitter: vi.fn(() => ({
    event: vi.fn(),
    fire: vi.fn(),
  })),
  StatusBarAlignment: {
    Left: 1,
    Right: 2,
  },
}));

// Mock vsls
vi.mock('vsls/vscode', () => ({
  getApi: vi.fn(() => Promise.resolve(null)),
}));

// Mock AI analyze
vi.mock('./ai_analyze', () => ({
  activateCodeReviewer: vi.fn(),
}));

// Mock AuthService
const mockAuthService = {
  initialize: vi.fn().mockResolvedValue(undefined),
  isAuthenticated: vi.fn().mockReturnValue(false),
  getCurrentUser: vi.fn().mockReturnValue(null),
  getCurrentSession: vi.fn().mockReturnValue(null),
  onAuthStateChange: vi.fn(),
  setSessionFromTokens: vi.fn().mockResolvedValue(undefined),
};

vi.mock('./authService', () => ({
  AuthService: vi.fn(() => mockAuthService),
}));

// Mock DatabaseService
vi.mock('./databaseService', () => ({
  DatabaseService: vi.fn(() => ({
    getProfile: vi.fn(),
    createProfile: vi.fn(),
    updateProfile: vi.fn(),
    getProjectsForUser: vi.fn().mockResolvedValue([]),
    getProjectMembers: vi.fn().mockResolvedValue([]),
    getAllProfilesForUserProjects: vi.fn().mockResolvedValue([]),
    getAIPromptsForProject: vi.fn().mockResolvedValue([]),
  })),
}));

// Mock PeerSuggestionService
vi.mock('./peerSuggestionService', () => ({
  PeerSuggestionService: vi.fn(() => ({
    dispose: vi.fn(),
  })),
}));

// Mock RAGService
vi.mock('./ragService', () => ({
  RAGService: vi.fn(() => ({
    dispose: vi.fn(),
    isEnabled: vi.fn().mockResolvedValue(false),
    setEnabled: vi.fn().mockResolvedValue(true),
    getStats: vi.fn().mockResolvedValue({
      enabled: false,
      totalFiles: 0,
      totalChunks: 0,
      lastIndexed: null
    }),
    searchContext: vi.fn().mockResolvedValue([]),
    indexWorkspace: vi.fn().mockResolvedValue(undefined),
  })),
}));

// Mock Supabase config
vi.mock('./supabaseConfig', () => ({
  getSupabaseClient: vi.fn(() => ({
    from: vi.fn(() => ({
      insert: vi.fn().mockResolvedValue({ data: null, error: null }),
    })),
  })),
  getSupabaseUrl: vi.fn(() => 'https://test.supabase.co'),
  getSupabaseAnonKey: vi.fn(() => 'test-anon-key'),
  getEdgeFunctionUrl: vi.fn(() => 'https://test.supabase.co/functions/v1/test'),
}));

// Mock fs/promises
vi.mock('fs/promises', () => ({
  readFile: vi.fn(),
  writeFile: vi.fn(),
  rename: vi.fn(),
}));

// Mock createJiraTasks command
vi.mock('./commands/createJiraTasks', () => ({
  createJiraTasksCmd: vi.fn(),
}));

// ============================================================================
// TESTS - FOCUSED ON UNIQUE EXTENSION INTEGRATION
// ============================================================================

describe('Extension Integration', () => {
  let mockContext: any;
  let mockSecrets: Map<string, string>;
  let mockGlobalState: Map<string, any>;

  beforeEach(async () => {
    vi.clearAllMocks();
    
    mockSecrets = new Map();
    mockGlobalState = new Map();

    mockContext = {
      subscriptions: [],
      secrets: {
        get: vi.fn((key: string) => Promise.resolve(mockSecrets.get(key))),
        store: vi.fn((key: string, value: string) => {
          mockSecrets.set(key, value);
          return Promise.resolve();
        }),
        delete: vi.fn((key: string) => {
          mockSecrets.delete(key);
          return Promise.resolve();
        }),
      },
      globalState: {
        get: vi.fn((key: string) => mockGlobalState.get(key)),
        update: vi.fn((key: string, value: any) => {
          if (value === undefined) {
            mockGlobalState.delete(key);
          } else {
            mockGlobalState.set(key, value);
          }
          return Promise.resolve();
        }),
      },
      extensionPath: '/test/extension/path',
      extensionUri: { fsPath: '/test/extension/path' },
    };

    // Reset auth service mock
    mockAuthService.initialize.mockResolvedValue(undefined);
    mockAuthService.isAuthenticated.mockReturnValue(false);
    mockAuthService.getCurrentUser.mockReturnValue(null);
    mockAuthService.getCurrentSession.mockReturnValue(null);
    mockAuthService.onAuthStateChange.mockClear();
    mockAuthService.setSessionFromTokens.mockResolvedValue(undefined);
  });

  describe('Session Persistence', () => {
    it('should restore session from stored tokens on activation', async () => {
      mockSecrets.set('supabase_access_token', 'stored-access');
      mockSecrets.set('supabase_refresh_token', 'stored-refresh');

      const { activate } = await import('./extension');
      await activate(mockContext);

      expect(mockAuthService.setSessionFromTokens).toHaveBeenCalledWith(
        'stored-access',
        'stored-refresh'
      );
    });

    it('should save tokens on auth state change', async () => {
      let authStateCallback: Function | undefined;
      
      // Reset and set up the mock to capture the callback
      mockAuthService.onAuthStateChange.mockClear();
      mockAuthService.onAuthStateChange.mockImplementation((callback: Function) => {
        authStateCallback = callback;
        return { dispose: vi.fn() };
      });
      
      // Set up the session that will be returned when callback is triggered
      mockAuthService.getCurrentSession.mockReturnValue({
        access_token: 'new-access',
        refresh_token: 'new-refresh',
      });

      const { activate } = await import('./extension');
      await activate(mockContext);

      // Verify callback was registered
      expect(authStateCallback).toBeDefined();
      
      // Trigger the callback
      const mockUser = { id: 'user-123', email: 'test@example.com' };
      await authStateCallback!(mockUser);

      // Verify tokens were stored
      expect(mockContext.secrets.store).toHaveBeenCalledWith('supabase_access_token', 'new-access');
      expect(mockContext.secrets.store).toHaveBeenCalledWith('supabase_refresh_token', 'new-refresh');
    });

    it('should delete tokens on sign out', async () => {
      let authStateCallback: Function | undefined;
      
      // Reset and set up the mock to capture the callback
      mockAuthService.onAuthStateChange.mockClear();
      mockAuthService.onAuthStateChange.mockImplementation((callback: Function) => {
        authStateCallback = callback;
        return { dispose: vi.fn() };
      });

      const { activate } = await import('./extension');
      await activate(mockContext);

      // Verify callback was registered
      expect(authStateCallback).toBeDefined();
      
      // Trigger the callback with null user (sign out)
      await authStateCallback!(null);

      // Verify tokens were deleted
      expect(mockContext.secrets.delete).toHaveBeenCalledWith('supabase_access_token');
      expect(mockContext.secrets.delete).toHaveBeenCalledWith('supabase_refresh_token');
    });
  });

  describe('OAuth Callback Handling', () => {
    it('should handle OAuth callback with tokens', async () => {
      const { activate } = await import('./extension');
      await activate(mockContext);

      const uriHandlerCall = (vscode.window.registerUriHandler as any).mock.calls[0];
      expect(uriHandlerCall).toBeDefined();
      
      const uriHandler = uriHandlerCall[0];
      const mockUri = vscode.Uri.parse('vscode://ai-collab-agent.auth?access_token=test-token&refresh_token=test-refresh');

      await uriHandler.handleUri(mockUri);

      expect(mockAuthService.setSessionFromTokens).toHaveBeenCalledWith(
        'test-token',
        'test-refresh'
      );
    });

    it('should show error when no access token in callback', async () => {
      const { activate } = await import('./extension');
      await activate(mockContext);

      const uriHandler = (vscode.window.registerUriHandler as any).mock.calls[0][0];
      const mockUri = vscode.Uri.parse('vscode://ai-collab-agent.auth');

      await uriHandler.handleUri(mockUri);

      expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
        expect.stringContaining('No access token received')
      );
    });
  });

  describe('LLM API Key Management', () => {
    it('should store API key when provided', async () => {
      const { activate } = await import('./extension');
      await activate(mockContext);

      // Find the command handler
      const registerCalls = (vscode.commands.registerCommand as any).mock.calls;
      const setKeyCall = registerCalls.find((call: any) => call[0] === 'aiCollab.setLLMApiKey');
      expect(setKeyCall).toBeDefined();

      const commandHandler = setKeyCall[1];
      (vscode.window.showInputBox as any).mockResolvedValue('sk-test-key');

      await commandHandler();

      expect(mockContext.secrets.store).toHaveBeenCalledWith('llm_api_key', 'sk-test-key');
    });

    it('should clear API key when empty string provided', async () => {
      const { activate } = await import('./extension');
      await activate(mockContext);

      const registerCalls = (vscode.commands.registerCommand as any).mock.calls;
      const setKeyCall = registerCalls.find((call: any) => call[0] === 'aiCollab.setLLMApiKey');
      const commandHandler = setKeyCall[1];

      (vscode.window.showInputBox as any).mockResolvedValue('');

      await commandHandler();

      expect(mockContext.secrets.store).toHaveBeenCalledWith('llm_api_key', '');
    });

    it('should not store when user cancels', async () => {
      const { activate } = await import('./extension');
      await activate(mockContext);

      const registerCalls = (vscode.commands.registerCommand as any).mock.calls;
      const setKeyCall = registerCalls.find((call: any) => call[0] === 'aiCollab.setLLMApiKey');
      const commandHandler = setKeyCall[1];

      (vscode.window.showInputBox as any).mockResolvedValue(undefined);

      await commandHandler();

      expect(mockContext.secrets.store).not.toHaveBeenCalled();
    });
  });

  describe('Active Project Tracking', () => {
    it('should store and retrieve active project ID', async () => {
      const { activate } = await import('./extension');
      await activate(mockContext);

      await mockContext.globalState.update('activeProjectId', 'project-123');
      expect(mockGlobalState.get('activeProjectId')).toBe('project-123');
    });

    it('should clear active project when undefined', async () => {
      mockGlobalState.set('activeProjectId', 'existing');

      const { activate } = await import('./extension');
      await activate(mockContext);

      await mockContext.globalState.update('activeProjectId', undefined);
      expect(mockGlobalState.has('activeProjectId')).toBe(false);
    });
  });

  describe('Notification Persistence', () => {
    it('should load notifications from global state', async () => {
      const notifications = [
        { id: '1', type: 'info', message: 'Test', timestamp: new Date().toISOString(), read: false },
      ];
      mockGlobalState.set('aiCollab.notifications', notifications);

      const { activate } = await import('./extension');
      await activate(mockContext);

      expect(mockContext.globalState.get).toHaveBeenCalledWith('aiCollab.notifications');
    });
  });

  describe('Status Bar Integration', () => {
    it('should create and configure status bar item', async () => {
      const mockStatusBar = {
        text: '',
        tooltip: '',
        command: '',
        show: vi.fn(),
      };
      (vscode.window.createStatusBarItem as any).mockReturnValue(mockStatusBar);

      const { activate } = await import('./extension');
      await activate(mockContext);

      expect(mockStatusBar.text).toBe('$(squirrel) AI Collab Agent');
      expect(mockStatusBar.tooltip).toBe('Open AI Collab Panel');
      expect(mockStatusBar.command).toBe('aiCollab.openPanel');
      expect(mockStatusBar.show).toHaveBeenCalled();
    });
  });

  describe('Error Handling', () => {
    it('should handle auth initialization failure', async () => {
      mockAuthService.initialize.mockRejectedValueOnce(new Error('Auth failed'));

      const { activate } = await import('./extension');
      await activate(mockContext);

      expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
        expect.stringContaining('Authentication setup failed')
      );
    });

    it('should handle token restoration failure', async () => {
      mockSecrets.set('supabase_access_token', 'invalid-token');
      mockAuthService.setSessionFromTokens.mockRejectedValueOnce(new Error('Invalid token'));

      const { activate } = await import('./extension');
      await activate(mockContext);

      // Should clear invalid tokens
      expect(mockContext.secrets.delete).toHaveBeenCalledWith('supabase_access_token');
      expect(mockContext.secrets.delete).toHaveBeenCalledWith('supabase_refresh_token');
    });
  });
});