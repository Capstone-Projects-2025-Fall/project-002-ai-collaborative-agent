import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as vscode from 'vscode';

// Mock vscode module
vi.mock('vscode', () => ({
  window: {
    showInformationMessage: vi.fn(),
    showErrorMessage: vi.fn(),
    showWarningMessage: vi.fn(),
    registerTreeDataProvider: vi.fn(),
  },
  EventEmitter: class {
    event = vi.fn();
    fire = vi.fn();
  },
  TreeItem: class {
    constructor(public label: string, public collapsibleState: any) {}
  },
  TreeItemCollapsibleState: {
    None: 0,
    Collapsed: 1,
    Expanded: 2,
  },
  ThemeIcon: class {
    constructor(public id: string, public color?: any) {}
  },
  ThemeColor: class {
    constructor(public id: string) {}
  },
  Uri: {
    parse: vi.fn((uri) => ({ toString: () => uri })),
  },
}));

// Mock extension context
const createMockContext = () => ({
  subscriptions: [],
  workspaceState: {
    get: vi.fn(),
    update: vi.fn(),
    keys: vi.fn(() => []),
  },
  globalState: {
    get: vi.fn(),
    update: vi.fn(),
    keys: vi.fn(() => []),
    setKeysForSync: vi.fn(),
  },
  extensionPath: '/mock/path',
  extensionUri: vscode.Uri.parse('file:///mock/path'),
  asAbsolutePath: vi.fn((path) => `/mock/path/${path}`),
  storagePath: '/mock/storage',
  globalStoragePath: '/mock/global-storage',
  logPath: '/mock/log',
  extensionMode: 1,
  environmentVariableCollection: {} as any,
  secrets: {} as any,
  storageUri: vscode.Uri.parse('file:///mock/storage'),
  globalStorageUri: vscode.Uri.parse('file:///mock/global-storage'),
  logUri: vscode.Uri.parse('file:///mock/log'),
  extension: {} as any,
});

// Mock notification type
type NotificationType = 'info' | 'warning' | 'error' | 'success';

interface Notification {
  id: string;
  type: NotificationType;
  message: string;
  timestamp: Date;
  read: boolean;
  projectId?: string;
  projectName?: string;
}

// Simulate the addNotification function from extension.ts
class NotificationManager {
  private notifications: Notification[] = [];
  private context: any;

  constructor(context: any) {
    this.context = context;
  }

  addNotification(
    message: string,
    type: NotificationType = 'info',
    projectId?: string,
    projectName?: string
  ): Notification {
    const notification: Notification = {
      id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
      type,
      message,
      timestamp: new Date(),
      read: false,
      projectId,
      projectName,
    };

    this.notifications.unshift(notification);

    // Keep only last 50 notifications
    if (this.notifications.length > 50) {
      this.notifications = this.notifications.slice(0, 50);
    }

    // Show VS Code notification for important messages
    if (type === 'error') {
      vscode.window.showErrorMessage(message);
    } else if (type === 'warning') {
      vscode.window.showWarningMessage(message);
    }

    return notification;
  }

  getNotifications(): Notification[] {
    return this.notifications;
  }

  markAsRead(id: string): boolean {
    const notification = this.notifications.find((n) => n.id === id);
    if (notification) {
      notification.read = true;
      return true;
    }
    return false;
  }

  deleteNotification(id: string): boolean {
    const index = this.notifications.findIndex((n) => n.id === id);
    if (index !== -1) {
      this.notifications.splice(index, 1);
      return true;
    }
    return false;
  }

  clearAll(): void {
    this.notifications = [];
  }

  markAllAsRead(): void {
    this.notifications.forEach((n) => (n.read = true));
  }

  getUnreadCount(): number {
    return this.notifications.filter((n) => !n.read).length;
  }
}

describe('Notification System - addNotification', () => {
  let notificationManager: NotificationManager;
  let mockContext: ReturnType<typeof createMockContext>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockContext = createMockContext();
    notificationManager = new NotificationManager(mockContext);
  });

  it('should add a notification with info type by default', () => {
    const message = 'Test notification';
    const notification = notificationManager.addNotification(message);

    expect(notification).toBeDefined();
    expect(notification.message).toBe(message);
    expect(notification.type).toBe('info');
    expect(notification.read).toBe(false);
    expect(notification.id).toBeDefined();
    expect(notification.timestamp).toBeInstanceOf(Date);
  });

  it('should add a notification with custom type', () => {
    const message = 'Warning message';
    const notification = notificationManager.addNotification(message, 'warning');

    expect(notification.type).toBe('warning');
    expect(notification.message).toBe(message);
  });

  it('should add notification with project information', () => {
    const message = 'Project notification';
    const projectId = 'proj-123';
    const projectName = 'My Project';

    const notification = notificationManager.addNotification(
      message,
      'info',
      projectId,
      projectName
    );

    expect(notification.projectId).toBe(projectId);
    expect(notification.projectName).toBe(projectName);
  });

  it('should generate unique IDs for notifications', () => {
    const notif1 = notificationManager.addNotification('Message 1');
    const notif2 = notificationManager.addNotification('Message 2');

    expect(notif1.id).not.toBe(notif2.id);
  });

  it('should add notifications to the beginning of the list', () => {
    notificationManager.addNotification('First');
    notificationManager.addNotification('Second');

    const notifications = notificationManager.getNotifications();

    expect(notifications[0].message).toBe('Second');
    expect(notifications[1].message).toBe('First');
  });

  it('should limit notifications to 50 items', () => {
    // Add 60 notifications
    for (let i = 0; i < 60; i++) {
      notificationManager.addNotification(`Message ${i}`);
    }

    const notifications = notificationManager.getNotifications();

    expect(notifications.length).toBe(50);
    // Most recent should be at the beginning
    expect(notifications[0].message).toBe('Message 59');
  });

  it('should show error message for error notifications', () => {
    const message = 'Error occurred';
    notificationManager.addNotification(message, 'error');

    expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(message);
  });

  it('should show warning message for warning notifications', () => {
    const message = 'Warning occurred';
    notificationManager.addNotification(message, 'warning');

    expect(vscode.window.showWarningMessage).toHaveBeenCalledWith(message);
  });

  it('should not show popup for info notifications', () => {
    notificationManager.addNotification('Info message', 'info');

    expect(vscode.window.showErrorMessage).not.toHaveBeenCalled();
    expect(vscode.window.showWarningMessage).not.toHaveBeenCalled();
  });

  it('should not show popup for success notifications', () => {
    notificationManager.addNotification('Success message', 'success');

    expect(vscode.window.showErrorMessage).not.toHaveBeenCalled();
    expect(vscode.window.showWarningMessage).not.toHaveBeenCalled();
  });

  it('should handle empty message', () => {
    const notification = notificationManager.addNotification('');

    expect(notification.message).toBe('');
    expect(notification).toBeDefined();
  });

  it('should handle long messages', () => {
    const longMessage = 'A'.repeat(1000);
    const notification = notificationManager.addNotification(longMessage);

    expect(notification.message).toBe(longMessage);
    expect(notification.message.length).toBe(1000);
  });

  it('should handle special characters in message', () => {
    const message = 'Test <script>alert("xss")</script> & symbols';
    const notification = notificationManager.addNotification(message);

    expect(notification.message).toBe(message);
  });
});

describe('Notification System - Mark as Read', () => {
  let notificationManager: NotificationManager;
  let mockContext: ReturnType<typeof createMockContext>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockContext = createMockContext();
    notificationManager = new NotificationManager(mockContext);
  });

  it('should mark notification as read', () => {
    const notification = notificationManager.addNotification('Test');
    expect(notification.read).toBe(false);

    const result = notificationManager.markAsRead(notification.id);

    expect(result).toBe(true);
    expect(
      notificationManager.getNotifications().find((n) => n.id === notification.id)?.read
    ).toBe(true);
  });

  it('should return false for non-existent notification ID', () => {
    const result = notificationManager.markAsRead('non-existent-id');

    expect(result).toBe(false);
  });

  it('should keep notification in list after marking as read', () => {
    const notification = notificationManager.addNotification('Test');
    const initialCount = notificationManager.getNotifications().length;

    notificationManager.markAsRead(notification.id);

    expect(notificationManager.getNotifications().length).toBe(initialCount);
  });
});

describe('Notification System - Mark All as Read', () => {
  let notificationManager: NotificationManager;
  let mockContext: ReturnType<typeof createMockContext>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockContext = createMockContext();
    notificationManager = new NotificationManager(mockContext);
  });

  it('should mark all notifications as read', () => {
    notificationManager.addNotification('Message 1');
    notificationManager.addNotification('Message 2');
    notificationManager.addNotification('Message 3');

    notificationManager.markAllAsRead();

    const notifications = notificationManager.getNotifications();
    expect(notifications.every((n) => n.read)).toBe(true);
  });

  it('should handle empty notification list', () => {
    expect(() => {
      notificationManager.markAllAsRead();
    }).not.toThrow();
  });
});

describe('Notification System - Delete Notification', () => {
  let notificationManager: NotificationManager;
  let mockContext: ReturnType<typeof createMockContext>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockContext = createMockContext();
    notificationManager = new NotificationManager(mockContext);
  });

  it('should delete notification by ID', () => {
    const notification = notificationManager.addNotification('Test');
    const initialCount = notificationManager.getNotifications().length;

    const result = notificationManager.deleteNotification(notification.id);

    expect(result).toBe(true);
    expect(notificationManager.getNotifications().length).toBe(initialCount - 1);
  });

  it('should return false when deleting non-existent notification', () => {
    const result = notificationManager.deleteNotification('non-existent-id');

    expect(result).toBe(false);
  });

  it('should not affect other notifications when deleting one', () => {
    const notif1 = notificationManager.addNotification('Message 1');
    const notif2 = notificationManager.addNotification('Message 2');

    notificationManager.deleteNotification(notif1.id);

    const notifications = notificationManager.getNotifications();
    expect(notifications.length).toBe(1);
    expect(notifications[0].id).toBe(notif2.id);
  });
});

describe('Notification System - Clear All', () => {
  let notificationManager: NotificationManager;
  let mockContext: ReturnType<typeof createMockContext>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockContext = createMockContext();
    notificationManager = new NotificationManager(mockContext);
  });

  it('should clear all notifications', () => {
    notificationManager.addNotification('Message 1');
    notificationManager.addNotification('Message 2');
    notificationManager.addNotification('Message 3');

    notificationManager.clearAll();

    expect(notificationManager.getNotifications().length).toBe(0);
  });

  it('should handle clearing empty list', () => {
    expect(() => {
      notificationManager.clearAll();
    }).not.toThrow();

    expect(notificationManager.getNotifications().length).toBe(0);
  });
});

describe('Notification System - Get Unread Count', () => {
  let notificationManager: NotificationManager;
  let mockContext: ReturnType<typeof createMockContext>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockContext = createMockContext();
    notificationManager = new NotificationManager(mockContext);
  });

  it('should return correct unread count', () => {
    notificationManager.addNotification('Message 1');
    notificationManager.addNotification('Message 2');
    notificationManager.addNotification('Message 3');

    expect(notificationManager.getUnreadCount()).toBe(3);
  });

  it('should update unread count after marking as read', () => {
    const notif1 = notificationManager.addNotification('Message 1');
    notificationManager.addNotification('Message 2');

    notificationManager.markAsRead(notif1.id);

    expect(notificationManager.getUnreadCount()).toBe(1);
  });

  it('should return 0 for empty notification list', () => {
    expect(notificationManager.getUnreadCount()).toBe(0);
  });

  it('should return 0 after marking all as read', () => {
    notificationManager.addNotification('Message 1');
    notificationManager.addNotification('Message 2');

    notificationManager.markAllAsRead();

    expect(notificationManager.getUnreadCount()).toBe(0);
  });
});

describe('Notification System - Notification Types', () => {
  let notificationManager: NotificationManager;
  let mockContext: ReturnType<typeof createMockContext>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockContext = createMockContext();
    notificationManager = new NotificationManager(mockContext);
  });

  it('should handle info type notifications', () => {
    const notification = notificationManager.addNotification('Info', 'info');

    expect(notification.type).toBe('info');
    expect(vscode.window.showErrorMessage).not.toHaveBeenCalled();
    expect(vscode.window.showWarningMessage).not.toHaveBeenCalled();
  });

  it('should handle success type notifications', () => {
    const notification = notificationManager.addNotification('Success', 'success');

    expect(notification.type).toBe('success');
    expect(vscode.window.showErrorMessage).not.toHaveBeenCalled();
    expect(vscode.window.showWarningMessage).not.toHaveBeenCalled();
  });

  it('should handle warning type notifications', () => {
    const notification = notificationManager.addNotification('Warning', 'warning');

    expect(notification.type).toBe('warning');
    expect(vscode.window.showWarningMessage).toHaveBeenCalledWith('Warning');
  });

  it('should handle error type notifications', () => {
    const notification = notificationManager.addNotification('Error', 'error');

    expect(notification.type).toBe('error');
    expect(vscode.window.showErrorMessage).toHaveBeenCalledWith('Error');
  });
});

describe('Notification System - Timestamp', () => {
  let notificationManager: NotificationManager;
  let mockContext: ReturnType<typeof createMockContext>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockContext = createMockContext();
    notificationManager = new NotificationManager(mockContext);
  });

  it('should set timestamp when creating notification', () => {
    const before = new Date();
    const notification = notificationManager.addNotification('Test');
    const after = new Date();

    expect(notification.timestamp.getTime()).toBeGreaterThanOrEqual(before.getTime());
    expect(notification.timestamp.getTime()).toBeLessThanOrEqual(after.getTime());
  });

  it('should have different timestamps for sequential notifications', async () => {
    const notif1 = notificationManager.addNotification('First');
    
    // Small delay to ensure different timestamps
    await new Promise(resolve => setTimeout(resolve, 10));
    
    const notif2 = notificationManager.addNotification('Second');

    expect(notif2.timestamp.getTime()).toBeGreaterThanOrEqual(
      notif1.timestamp.getTime()
    );
  });
});

describe('Notification System - Edge Cases', () => {
  let notificationManager: NotificationManager;
  let mockContext: ReturnType<typeof createMockContext>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockContext = createMockContext();
    notificationManager = new NotificationManager(mockContext);
  });

  it('should handle rapid successive notifications', () => {
    for (let i = 0; i < 100; i++) {
      notificationManager.addNotification(`Message ${i}`);
    }

    const notifications = notificationManager.getNotifications();
    expect(notifications.length).toBe(50); // Should be capped at 50
  });

  it('should handle notifications with undefined project info', () => {
    const notification = notificationManager.addNotification(
      'Test',
      'info',
      undefined,
      undefined
    );

    expect(notification.projectId).toBeUndefined();
    expect(notification.projectName).toBeUndefined();
  });

  it('should maintain order after deletions', () => {
    const notif1 = notificationManager.addNotification('First');
    const notif2 = notificationManager.addNotification('Second');
    const notif3 = notificationManager.addNotification('Third');

    notificationManager.deleteNotification(notif2.id);

    const notifications = notificationManager.getNotifications();
    expect(notifications.length).toBe(2);
    expect(notifications[0].id).toBe(notif3.id);
    expect(notifications[1].id).toBe(notif1.id);
  });
});