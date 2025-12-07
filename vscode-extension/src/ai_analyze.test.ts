import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as vscode from 'vscode';
import { activateCodeReviewer, deactivate } from './ai_analyze';

// Mock vscode module
vi.mock('vscode', () => ({
  window: {
    createStatusBarItem: vi.fn(() => ({
      text: '',
      tooltip: '',
      command: '',
      backgroundColor: undefined,
      show: vi.fn(),
      dispose: vi.fn(),
    })),
    showInformationMessage: vi.fn(),
    showErrorMessage: vi.fn(),
    showWarningMessage: vi.fn(),
    createWebviewPanel: vi.fn(() => ({
      webview: {
        html: '',
        onDidReceiveMessage: vi.fn(),
      },
      onDidDispose: vi.fn(),
      dispose: vi.fn(),
      reveal: vi.fn(),
    })),
    activeTextEditor: undefined,
  },
  commands: {
    registerCommand: vi.fn((command, callback) => ({
      dispose: vi.fn(),
    })),
  },
  workspace: {
    onDidChangeTextDocument: vi.fn(() => ({ dispose: vi.fn() })),
    onDidSaveTextDocument: vi.fn(() => ({ dispose: vi.fn() })),
    getConfiguration: vi.fn(() => ({
      get: vi.fn(),
      update: vi.fn(),
    })),
    workspaceFolders: [],
  },
  StatusBarAlignment: {
    Left: 1,
    Right: 2,
  },
  ViewColumn: {
    One: 1,
    Two: 2,
  },
  TreeItemCollapsibleState: {
    None: 0,
    Collapsed: 1,
    Expanded: 2,
  },
  Uri: {
    parse: vi.fn((uri) => ({ toString: () => uri })),
    file: vi.fn((path) => ({ fsPath: path })),
  },
}));

// Mock fetch for API calls
global.fetch = vi.fn();

// Helper function to create mock ExtensionContext
function createMockContext(): vscode.ExtensionContext {
  const mockMemento = {
    get: vi.fn(),
    update: vi.fn(),
    keys: vi.fn(() => []),
  };

  const mockGlobalState = {
    get: vi.fn(),
    update: vi.fn(),
    keys: vi.fn(() => []),
    setKeysForSync: vi.fn(),
  };

  const mockSecrets = {
    get: vi.fn(),
    store: vi.fn(),
    delete: vi.fn(),
    onDidChange: vi.fn(),
  };

  const mockEnvCollection = {
    replace: vi.fn(),
    append: vi.fn(),
    prepend: vi.fn(),
    get: vi.fn(),
    forEach: vi.fn(),
    delete: vi.fn(),
    clear: vi.fn(),
    getScoped: vi.fn(),
    [Symbol.iterator]: vi.fn(),
  };

  const mockContext: Partial<vscode.ExtensionContext> = {
    subscriptions: [],
    workspaceState: mockMemento as any,
    globalState: mockGlobalState as any,
    secrets: mockSecrets as any,
    extensionUri: { 
      scheme: 'file',
      authority: '',
      path: '/mock/path',
      query: '',
      fragment: '',
      fsPath: '/mock/path',
      with: vi.fn(),
      toString: () => 'file:///mock/path',
      toJSON: () => ({ $mid: 1 }),
    } as any,
    extensionPath: '/mock/path',
    environmentVariableCollection: mockEnvCollection as any,
    asAbsolutePath: vi.fn((relativePath: string) => `/mock/path/${relativePath}`),
    storageUri: {
      scheme: 'file',
      path: '/mock/storage',
      fsPath: '/mock/storage',
      toString: () => 'file:///mock/storage',
    } as any,
    storagePath: '/mock/storage',
    globalStorageUri: {
      scheme: 'file',
      path: '/mock/global-storage',
      fsPath: '/mock/global-storage',
      toString: () => 'file:///mock/global-storage',
    } as any,
    globalStoragePath: '/mock/global-storage',
    logUri: {
      scheme: 'file',
      path: '/mock/log',
      fsPath: '/mock/log',
      toString: () => 'file:///mock/log',
    } as any,
    logPath: '/mock/log',
    extensionMode: 1,
    extension: {
      id: 'test.extension',
      extensionUri: { toString: () => 'file:///mock/path' } as any,
      extensionPath: '/mock/path',
      isActive: true,
      packageJSON: {},
      exports: undefined,
      activate: vi.fn(),
      extensionKind: 1,
    } as any,
  };

  return mockContext as vscode.ExtensionContext;
}

describe('AI Code Analyzer - activateCodeReviewer', () => {
  let mockContext: vscode.ExtensionContext;
  let mockAddNotification: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    // Reset all mocks
    vi.clearAllMocks();

    // Create mock extension context
    mockContext = createMockContext();

    mockAddNotification = vi.fn();
  });

  afterEach(() => {
    // Clean up
    deactivate();
  });

  it('should activate extension successfully', () => {
    expect(() => {
      activateCodeReviewer(mockContext, mockAddNotification);
    }).not.toThrow();
  });

  it('should create status bar item', () => {
    activateCodeReviewer(mockContext, mockAddNotification);

    expect(vscode.window.createStatusBarItem).toHaveBeenCalledWith(
      vscode.StatusBarAlignment.Right,
      100
    );
  });

  it('should register all required commands', () => {
    activateCodeReviewer(mockContext, mockAddNotification);

    expect(vscode.commands.registerCommand).toHaveBeenCalledWith(
      'ai-code-reviewer.analyzeCode',
      expect.any(Function)
    );
    expect(vscode.commands.registerCommand).toHaveBeenCalledWith(
      'ai-code-reviewer.showResults',
      expect.any(Function)
    );
    expect(vscode.commands.registerCommand).toHaveBeenCalledWith(
      'ai-code-reviewer.showChangeLog',
      expect.any(Function)
    );
    expect(vscode.commands.registerCommand).toHaveBeenCalledWith(
      'ai-code-reviewer.configure',
      expect.any(Function)
    );
    expect(vscode.commands.registerCommand).toHaveBeenCalledWith(
      'ai-code-reviewer.toggleAutoAnalyze',
      expect.any(Function)
    );
  });

  it('should register document change listener', () => {
    activateCodeReviewer(mockContext, mockAddNotification);

    expect(vscode.workspace.onDidChangeTextDocument).toHaveBeenCalled();
  });

  it('should register file save listener', () => {
    activateCodeReviewer(mockContext, mockAddNotification);

    expect(vscode.workspace.onDidSaveTextDocument).toHaveBeenCalled();
  });

  it('should add all disposables to context subscriptions', () => {
    activateCodeReviewer(mockContext, mockAddNotification);

    // Should have registered multiple subscriptions
    expect(mockContext.subscriptions.length).toBeGreaterThan(0);
  });

  it('should handle activation error gracefully', () => {
    const errorMock = vi.spyOn(console, 'error').mockImplementation(() => {});
    const showErrorMock = vi.mocked(vscode.window.showErrorMessage);
    
    // Force an error by passing invalid context
    const invalidContext = null as any;
    
    // The function catches errors internally, so it won't throw
    activateCodeReviewer(invalidContext, mockAddNotification);

    // Should log error and show error message
    expect(errorMock).toHaveBeenCalled();
    expect(showErrorMock).toHaveBeenCalled();

    errorMock.mockRestore();
  });

  it('should accept optional notification callback', () => {
    // Should work without notification callback
    expect(() => {
      activateCodeReviewer(mockContext);
    }).not.toThrow();

    // Should work with notification callback
    expect(() => {
      activateCodeReviewer(mockContext, mockAddNotification);
    }).not.toThrow();
  });

  it('should start auto analyze on activation', () => {
    const setIntervalSpy = vi.spyOn(global, 'setInterval');
    
    activateCodeReviewer(mockContext, mockAddNotification);

    // Auto analyze timer should be started
    expect(setIntervalSpy).toHaveBeenCalled();

    setIntervalSpy.mockRestore();
  });
});

describe('AI Code Analyzer - Document Change Handling', () => {
  let mockContext: vscode.ExtensionContext;
  let mockAddNotification: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockContext = createMockContext();
    mockAddNotification = vi.fn();
  });

  it('should track document changes when auto analyze is enabled', () => {
    let changeListener: any;
    vi.mocked(vscode.workspace.onDidChangeTextDocument).mockImplementation((callback) => {
      changeListener = callback;
      return { dispose: vi.fn() };
    });

    activateCodeReviewer(mockContext, mockAddNotification);

    const mockDocument = {
      uri: { fsPath: '/test/file.ts' },
      getText: vi.fn(() => 'test content'),
      lineCount: 10,
    };

    const mockEvent = {
      document: mockDocument,
      contentChanges: [
        {
          text: 'function test() {}',
          range: {
            start: { line: 0, character: 0 },
            end: { line: 0, character: 0 },
          },
          rangeLength: 0,
        },
      ],
    };

    // Mock active editor
    (vscode.window as any).activeTextEditor = {
      document: mockDocument,
    };

    // Should not throw when processing change
    expect(() => {
      changeListener(mockEvent);
    }).not.toThrow();
  });
});

describe('AI Code Analyzer - Auto Analyze Toggle', () => {
  let mockContext: vscode.ExtensionContext;
  let toggleCommand: any;

  beforeEach(() => {
    vi.clearAllMocks();
    mockContext = createMockContext();

    vi.mocked(vscode.commands.registerCommand).mockImplementation((command, callback) => {
      if (command === 'ai-code-reviewer.toggleAutoAnalyze') {
        toggleCommand = callback;
      }
      return { dispose: vi.fn() };
    });
  });

  it('should toggle auto analyze on and off', async () => {
    activateCodeReviewer(mockContext);

    // Toggle off
    await toggleCommand();
    expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
      'Smart monitoring disabled'
    );

    // Toggle back on
    await toggleCommand();
    expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
      'Smart monitoring enabled'
    );
  });
});

describe('AI Code Analyzer - Status Bar', () => {
  let mockContext: vscode.ExtensionContext;
  let mockStatusBarItem: any;

  beforeEach(() => {
    vi.clearAllMocks();
    mockStatusBarItem = {
      text: '',
      tooltip: '',
      command: '',
      backgroundColor: undefined,
      show: vi.fn(),
      dispose: vi.fn(),
    };

    vi.mocked(vscode.window.createStatusBarItem).mockReturnValue(mockStatusBarItem);

    mockContext = createMockContext();
  });

  it('should show status bar item on activation', () => {
    activateCodeReviewer(mockContext);

    expect(mockStatusBarItem.show).toHaveBeenCalled();
  });

  it('should set command on status bar item', () => {
    activateCodeReviewer(mockContext);

    expect(mockStatusBarItem.command).toBe('ai-code-reviewer.analyzeCode');
  });

  it('should update status bar text', () => {
    activateCodeReviewer(mockContext);

    // Status bar should be updated with monitoring text
    expect(mockStatusBarItem.text).toContain('Pallas Watch');
  });
});

describe('AI Code Analyzer - Deactivation', () => {
  let mockContext: vscode.ExtensionContext;
  let mockStatusBarItem: any;

  beforeEach(() => {
    vi.clearAllMocks();
    mockStatusBarItem = {
      text: '',
      tooltip: '',
      command: '',
      backgroundColor: undefined,
      show: vi.fn(),
      dispose: vi.fn(),
    };

    vi.mocked(vscode.window.createStatusBarItem).mockReturnValue(mockStatusBarItem);

    mockContext = createMockContext();
  });

  it('should dispose status bar item on deactivation', () => {
    activateCodeReviewer(mockContext);
    deactivate();

    expect(mockStatusBarItem.dispose).toHaveBeenCalled();
  });

  it('should stop auto analyze timer on deactivation', () => {
    const clearIntervalSpy = vi.spyOn(global, 'clearInterval');
    
    activateCodeReviewer(mockContext);
    deactivate();

    expect(clearIntervalSpy).toHaveBeenCalled();
    
    clearIntervalSpy.mockRestore();
  });
});

describe('AI Code Analyzer - API Integration', () => {
  let mockContext: vscode.ExtensionContext;
  let analyzeCommand: any;

  beforeEach(() => {
    vi.clearAllMocks();
    mockContext = createMockContext();

    vi.mocked(vscode.commands.registerCommand).mockImplementation((command, callback) => {
      if (command === 'ai-code-reviewer.analyzeCode') {
        analyzeCommand = callback;
      }
      return { dispose: vi.fn() };
    });

    // Mock active editor with document
    (vscode.window as any).activeTextEditor = {
      document: {
        uri: { fsPath: '/test/file.ts' },
        getText: vi.fn(() => 'function test() { return true; }'),
        lineCount: 1,
        fileName: 'file.ts',
        languageId: 'typescript',
      },
    };
  });

  it('should register analyze command that can be called', async () => {
    activateCodeReviewer(mockContext);

    // The command should be registered and defined
    expect(analyzeCommand).toBeDefined();
    expect(typeof analyzeCommand).toBe('function');
  });
});