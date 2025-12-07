import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AuthService } from './authService';
import * as supabaseConfig from './supabaseConfig';
import * as vscode from 'vscode';

// Mock VS Code
vi.mock('vscode', () => ({
  env: {
    openExternal: vi.fn()
  },
  Uri: {
    parse: vi.fn((url: string) => ({ toString: () => url }))
  }
}));

// Mock Supabase config
vi.mock('./supabaseConfig', () => ({
  getSupabaseClient: vi.fn()
}));

describe('AuthService', () => {
  let authService: AuthService;
  let mockSupabaseClient: any;

  beforeEach(() => {
    mockSupabaseClient = {
      auth: {
        getSession: vi.fn(),
        signUp: vi.fn(),
        signInWithPassword: vi.fn(),
        signInWithOAuth: vi.fn(),
        signOut: vi.fn(),
        setSession: vi.fn(),
        onAuthStateChange: vi.fn()
      }
    };

    vi.mocked(supabaseConfig.getSupabaseClient).mockReturnValue(mockSupabaseClient);
    authService = new AuthService();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('initialize', () => {
    it('should initialize with existing session', async () => {
      const mockSession = {
        user: {
          id: 'user-123',
          email: 'test@example.com',
          user_metadata: { name: 'Test User' }
        },
        access_token: 'access-token',
        refresh_token: 'refresh-token'
      };

      mockSupabaseClient.auth.getSession.mockResolvedValue({
        data: { session: mockSession },
        error: null
      });

      await authService.initialize();

      expect(mockSupabaseClient.auth.getSession).toHaveBeenCalled();
      expect(authService.isAuthenticated()).toBe(true);
      expect(authService.getCurrentUser()).toEqual({
        id: 'user-123',
        email: 'test@example.com',
        name: 'Test User',
        avatar_url: undefined
      });
    });

    it('should handle initialization without session', async () => {
      mockSupabaseClient.auth.getSession.mockResolvedValue({
        data: { session: null },
        error: null
      });

      await authService.initialize();

      expect(authService.isAuthenticated()).toBe(false);
      expect(authService.getCurrentUser()).toBeNull();
    });

    it('should handle initialization errors', async () => {
      mockSupabaseClient.auth.getSession.mockResolvedValue({
        data: { session: null },
        error: { message: 'Session error' }
      });

      await authService.initialize();

      expect(authService.isAuthenticated()).toBe(false);
    });
  });

  describe('signUp', () => {
    it('should sign up user successfully', async () => {
      const mockUser = {
        id: 'user-123',
        email: 'test@example.com',
        user_metadata: { name: 'Test User' }
      };

      mockSupabaseClient.auth.signUp.mockResolvedValue({
        data: {
          user: mockUser,
          session: { access_token: 'token', refresh_token: 'refresh' }
        },
        error: null
      });

      const result = await authService.signUp('test@example.com', 'password123', 'Test User');

      expect(result.error).toBeNull();
      expect(result.user).toEqual({
        id: 'user-123',
        email: 'test@example.com',
        name: 'Test User',
        avatar_url: undefined
      });
    });

    it('should use email prefix as name if name not provided', async () => {
      const mockUser = {
        id: 'user-123',
        email: 'test@example.com',
        user_metadata: {}
      };

      mockSupabaseClient.auth.signUp.mockResolvedValue({
        data: { user: mockUser, session: {} },
        error: null
      });

      await authService.signUp('test@example.com', 'password123');

      expect(mockSupabaseClient.auth.signUp).toHaveBeenCalledWith({
        email: 'test@example.com',
        password: 'password123',
        options: {
          data: {
            name: 'test'
          }
        }
      });
    });

    it('should handle sign up error', async () => {
      mockSupabaseClient.auth.signUp.mockResolvedValue({
        data: { user: null, session: null },
        error: { message: 'Email already exists' }
      });

      const result = await authService.signUp('test@example.com', 'password123');

      expect(result.error).toBe('Email already exists');
      expect(result.user).toBeNull();
    });

    it('should handle sign up exception', async () => {
      mockSupabaseClient.auth.signUp.mockRejectedValue(new Error('Network error'));

      const result = await authService.signUp('test@example.com', 'password123');

      expect(result.error).toBe('Network error');
      expect(result.user).toBeNull();
    });
  });

  describe('signIn', () => {
    it('should sign in user successfully', async () => {
      const mockUser = {
        id: 'user-123',
        email: 'test@example.com',
        user_metadata: { name: 'Test User' }
      };

      mockSupabaseClient.auth.signInWithPassword.mockResolvedValue({
        data: {
          user: mockUser,
          session: { access_token: 'token', refresh_token: 'refresh' }
        },
        error: null
      });

      const result = await authService.signIn('test@example.com', 'password123');

      expect(result.error).toBeNull();
      expect(result.user).toEqual({
        id: 'user-123',
        email: 'test@example.com',
        name: 'Test User',
        avatar_url: undefined
      });
      expect(authService.isAuthenticated()).toBe(true);
    });

    it('should handle invalid credentials', async () => {
      mockSupabaseClient.auth.signInWithPassword.mockResolvedValue({
        data: { user: null, session: null },
        error: { message: 'Invalid credentials' }
      });

      const result = await authService.signIn('test@example.com', 'wrongpassword');

      expect(result.error).toBe('Invalid credentials');
      expect(result.user).toBeNull();
    });
  });

  // Skip OAuth tests due to local server port conflicts in test environment
  describe.skip('OAuth flows (skipped - integration tests)', () => {
    it('should initiate Google OAuth flow', async () => {
      // Skipped: Tests local HTTP server which conflicts with other tests
    });

    it('should initiate GitHub OAuth flow', async () => {
      // Skipped: Tests local HTTP server which conflicts with other tests
    });
  });

  describe('signOut', () => {
    it('should sign out user successfully', async () => {
      const mockUser = {
        id: 'user-123',
        email: 'test@example.com',
        user_metadata: {}
      };

      mockSupabaseClient.auth.signInWithPassword.mockResolvedValue({
        data: { user: mockUser, session: {} },
        error: null
      });

      await authService.signIn('test@example.com', 'password123');
      expect(authService.isAuthenticated()).toBe(true);

      mockSupabaseClient.auth.signOut.mockResolvedValue({ error: null });

      const result = await authService.signOut();

      expect(result.error).toBeNull();
      expect(authService.isAuthenticated()).toBe(false);
      expect(authService.getCurrentUser()).toBeNull();
    });

    it('should handle sign out error', async () => {
      mockSupabaseClient.auth.signOut.mockResolvedValue({
        error: { message: 'Sign out failed' }
      });

      const result = await authService.signOut();

      expect(result.error).toBe('Sign out failed');
    });
  });

  describe('setSessionFromTokens', () => {
    it('should set session from access token', async () => {
      const mockSession = {
        user: {
          id: 'user-123',
          email: 'test@example.com',
          user_metadata: { name: 'Test User' }
        },
        access_token: 'access-token',
        refresh_token: 'refresh-token'
      };

      mockSupabaseClient.auth.setSession.mockResolvedValue({
        data: { session: mockSession },
        error: null
      });

      await authService.setSessionFromTokens('access-token', 'refresh-token');

      expect(mockSupabaseClient.auth.setSession).toHaveBeenCalledWith({
        access_token: 'access-token',
        refresh_token: 'refresh-token'
      });
      expect(authService.isAuthenticated()).toBe(true);
    });

    it('should handle missing refresh token', async () => {
      const mockSession = {
        user: { id: 'user-123', email: 'test@example.com', user_metadata: {} },
        access_token: 'access-token',
        refresh_token: ''
      };

      mockSupabaseClient.auth.setSession.mockResolvedValue({
        data: { session: mockSession },
        error: null
      });

      await authService.setSessionFromTokens('access-token');

      expect(mockSupabaseClient.auth.setSession).toHaveBeenCalledWith({
        access_token: 'access-token',
        refresh_token: ''
      });
    });

    it('should throw error on session failure', async () => {
      mockSupabaseClient.auth.setSession.mockResolvedValue({
        data: { session: null },
        error: { message: 'Invalid token' }
      });

      await expect(authService.setSessionFromTokens('invalid-token')).rejects.toThrow('Invalid token');
    });
  });

  describe('onAuthStateChange', () => {
    it('should call callback on sign in', () => {
      const callback = vi.fn();
      const mockUser = {
        id: 'user-123',
        email: 'test@example.com',
        user_metadata: { name: 'Test User' }
      };
      const mockSession = {
        user: mockUser,
        access_token: 'token',
        refresh_token: 'refresh'
      };

      let authCallback: any;
      mockSupabaseClient.auth.onAuthStateChange.mockImplementation((cb: any) => {
        authCallback = cb;
        return {
          data: {
            subscription: { unsubscribe: vi.fn() }
          }
        };
      });

      authService.onAuthStateChange(callback);
      authCallback('SIGNED_IN', mockSession);

      expect(callback).toHaveBeenCalledWith({
        id: 'user-123',
        email: 'test@example.com',
        name: 'Test User',
        avatar_url: undefined
      });
    });

    it('should call callback on sign out', () => {
      const callback = vi.fn();

      let authCallback: any;
      mockSupabaseClient.auth.onAuthStateChange.mockImplementation((cb: any) => {
        authCallback = cb;
        return {
          data: {
            subscription: { unsubscribe: vi.fn() }
          }
        };
      });

      authService.onAuthStateChange(callback);
      authCallback('SIGNED_OUT', null);

      expect(callback).toHaveBeenCalledWith(null);
    });

    it('should return unsubscribe function', () => {
      const mockUnsubscribe = vi.fn();
      mockSupabaseClient.auth.onAuthStateChange.mockReturnValue({
        data: {
          subscription: { unsubscribe: mockUnsubscribe }
        }
      });

      const unsubscribe = authService.onAuthStateChange(vi.fn());
      unsubscribe();

      expect(mockUnsubscribe).toHaveBeenCalled();
    });
  });

  describe('user mapping', () => {
    it('should map user with full metadata', async () => {
      const mockUser = {
        id: 'user-123',
        email: 'test@example.com',
        user_metadata: {
          name: 'Test User',
          avatar_url: 'https://example.com/avatar.jpg'
        }
      };

      mockSupabaseClient.auth.signInWithPassword.mockResolvedValue({
        data: { user: mockUser, session: {} },
        error: null
      });

      const result = await authService.signIn('test@example.com', 'password');

      expect(result.user).toEqual({
        id: 'user-123',
        email: 'test@example.com',
        name: 'Test User',
        avatar_url: 'https://example.com/avatar.jpg'
      });
    });

    it('should use full_name if name not available', async () => {
      const mockUser = {
        id: 'user-123',
        email: 'test@example.com',
        user_metadata: {
          full_name: 'Full Name User'
        }
      };

      mockSupabaseClient.auth.signInWithPassword.mockResolvedValue({
        data: { user: mockUser, session: {} },
        error: null
      });

      const result = await authService.signIn('test@example.com', 'password');

      expect(result.user?.name).toBe('Full Name User');
    });

    it('should use email prefix if no name metadata', async () => {
      const mockUser = {
        id: 'user-123',
        email: 'testuser@example.com',
        user_metadata: {}
      };

      mockSupabaseClient.auth.signInWithPassword.mockResolvedValue({
        data: { user: mockUser, session: {} },
        error: null
      });

      const result = await authService.signIn('testuser@example.com', 'password');

      expect(result.user?.name).toBe('testuser');
    });

    it('should use picture as avatar_url fallback', async () => {
      const mockUser = {
        id: 'user-123',
        email: 'test@example.com',
        user_metadata: {
          picture: 'https://example.com/picture.jpg'
        }
      };

      mockSupabaseClient.auth.signInWithPassword.mockResolvedValue({
        data: { user: mockUser, session: {} },
        error: null
      });

      const result = await authService.signIn('test@example.com', 'password');

      expect(result.user?.avatar_url).toBe('https://example.com/picture.jpg');
    });
  });

  describe('getCurrentUser and getCurrentSession', () => {
    it('should return null when not authenticated', () => {
      expect(authService.getCurrentUser()).toBeNull();
      expect(authService.getCurrentSession()).toBeNull();
    });

    it('should return user and session when authenticated', async () => {
      const mockUser = {
        id: 'user-123',
        email: 'test@example.com',
        user_metadata: {}
      };
      const mockSession = {
        user: mockUser,
        access_token: 'token',
        refresh_token: 'refresh'
      };

      mockSupabaseClient.auth.signInWithPassword.mockResolvedValue({
        data: { user: mockUser, session: mockSession },
        error: null
      });

      await authService.signIn('test@example.com', 'password');

      expect(authService.getCurrentUser()).toBeTruthy();
      expect(authService.getCurrentSession()).toEqual(mockSession);
    });
  });

  describe('isAuthenticated', () => {
    it('should return false when not authenticated', () => {
      expect(authService.isAuthenticated()).toBe(false);
    });

    it('should return true when authenticated', async () => {
      const mockUser = {
        id: 'user-123',
        email: 'test@example.com',
        user_metadata: {}
      };

      mockSupabaseClient.auth.signInWithPassword.mockResolvedValue({
        data: { user: mockUser, session: {} },
        error: null
      });

      await authService.signIn('test@example.com', 'password');

      expect(authService.isAuthenticated()).toBe(true);
    });
  });
});