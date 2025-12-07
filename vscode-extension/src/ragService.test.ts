import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { RAGService, RAGStats, SearchResult } from './ragService';
import { SupabaseClient } from '@supabase/supabase-js';

// Mock fetch globally
global.fetch = vi.fn();

// Mock vscode workspace
vi.mock('vscode', () => ({
  workspace: {
    createFileSystemWatcher: vi.fn(() => ({
      onDidChange: vi.fn(() => ({ dispose: vi.fn() })),
      onDidCreate: vi.fn(() => ({ dispose: vi.fn() })),
      onDidDelete: vi.fn(() => ({ dispose: vi.fn() })),
      dispose: vi.fn()
    })),
    workspaceFolders: []
  },
  RelativePattern: vi.fn((base, pattern) => ({ base, pattern })),
  Uri: {
    file: vi.fn((path) => ({ fsPath: path }))
  }
}));

// Mock fs/promises
vi.mock('fs/promises', () => ({
  readdir: vi.fn(),
  readFile: vi.fn(),
  stat: vi.fn()
}));

describe('RAGService', () => {
  let ragService: RAGService;
  let mockSupabase: any;
  let mockGetUserId: any;

  beforeEach(() => {
    // Create a mock chain that works for all query patterns
    const createMockChain = () => {
      const chain = {
        select: vi.fn(),
        eq: vi.fn(),
        single: vi.fn(),
        order: vi.fn(),
        limit: vi.fn(),
        delete: vi.fn(),
        insert: vi.fn(),
        upsert: vi.fn()
      };
      
      // Make each method return the chain to allow chaining
      chain.select.mockReturnValue(chain);
      chain.eq.mockReturnValue(chain);
      chain.single.mockReturnValue(Promise.resolve({ data: null, error: null }));
      chain.order.mockReturnValue(chain);
      chain.limit.mockReturnValue(Promise.resolve({ data: [], error: null }));
      chain.delete.mockReturnValue(chain);
      
      return chain;
    };

    // Create mock Supabase client
    mockSupabase = {
      rpc: vi.fn(),
      from: vi.fn(() => createMockChain())
    };

    // Mock getUserId function
    mockGetUserId = vi.fn(() => 'user-123');

    // Reset fetch mock
    (global.fetch as any).mockReset();

    ragService = new RAGService(mockSupabase as any, mockGetUserId);
  });

  afterEach(() => {
    ragService.dispose();
    vi.clearAllMocks();
  });

  describe('isEnabled', () => {
    it('should return true when RAG is enabled for project', async () => {
      mockSupabase.rpc.mockResolvedValue({ data: true, error: null });

      const result = await ragService.isEnabled('project-123');

      expect(result).toBe(true);
      expect(mockSupabase.rpc).toHaveBeenCalledWith('is_rag_enabled', {
        p_project_id: 'project-123'
      });
    });

    it('should return false when RAG is disabled', async () => {
      mockSupabase.rpc.mockResolvedValue({ data: false, error: null });

      const result = await ragService.isEnabled('project-123');

      expect(result).toBe(false);
    });

    it('should return false on error', async () => {
      mockSupabase.rpc.mockResolvedValue({ 
        data: null, 
        error: { message: 'Database error' } 
      });

      const result = await ragService.isEnabled('project-123');

      expect(result).toBe(false);
    });
  });

  describe('setEnabled', () => {
    it('should enable RAG for a project', async () => {
      mockSupabase.rpc.mockResolvedValue({ data: true, error: null });

      const result = await ragService.setEnabled('project-123', true);

      expect(result).toBe(true);
      expect(mockSupabase.rpc).toHaveBeenCalledWith('set_rag_enabled', {
        p_project_id: 'project-123',
        p_enabled: true
      });
    });

    it('should disable RAG for a project', async () => {
      mockSupabase.rpc.mockResolvedValue({ data: true, error: null });

      const result = await ragService.setEnabled('project-123', false);

      expect(result).toBe(true);
      expect(mockSupabase.rpc).toHaveBeenCalledWith('set_rag_enabled', {
        p_project_id: 'project-123',
        p_enabled: false
      });
    });

    it('should return false on error', async () => {
      mockSupabase.rpc.mockResolvedValue({ 
        data: null, 
        error: { message: 'Permission denied' } 
      });

      const result = await ragService.setEnabled('project-123', true);

      expect(result).toBe(false);
    });
  });

  describe('getStats', () => {
    it('should return stats when indexing status exists', async () => {
      const mockStats = {
        project_id: 'project-123',
        rag_enabled: true,
        total_files: 50,
        total_chunks: 200,
        completed_at: '2024-12-07T12:00:00Z'
      };

      // Set up the mock chain properly
      const mockChain = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: mockStats, error: null })
      };
      
      mockSupabase.from.mockReturnValue(mockChain);

      const result = await ragService.getStats('project-123');

      expect(result).toEqual({
        enabled: true,
        totalFiles: 50,
        totalChunks: 200,
        lastIndexed: new Date('2024-12-07T12:00:00Z')
      });
    });

    it('should return default stats when no status exists', async () => {
      // Set up the mock chain for no data
      const mockChain = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: null, error: null })
      };
      
      mockSupabase.from.mockReturnValue(mockChain);

      const result = await ragService.getStats('project-123');

      expect(result).toEqual({
        enabled: false,
        totalFiles: 0,
        totalChunks: 0,
        lastIndexed: null
      });
    });

    it('should handle null values gracefully', async () => {
      const mockStats = {
        project_id: 'project-123',
        rag_enabled: null,
        total_files: null,
        total_chunks: null,
        completed_at: null
      };

      // Set up the mock chain with null values
      const mockChain = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: mockStats, error: null })
      };
      
      mockSupabase.from.mockReturnValue(mockChain);

      const result = await ragService.getStats('project-123');

      expect(result.enabled).toBe(false);
      expect(result.totalFiles).toBe(0);
      expect(result.totalChunks).toBe(0);
      expect(result.lastIndexed).toBe(null);
    });
  });

  describe('searchContext', () => {
    it('should return search results when RAG is enabled', async () => {
      const mockResults = [
        {
          file_path: 'src/utils.ts',
          chunk_text: 'function helper() { return true; }',
          file_language: 'ts',
          similarity: 0.85,
          indexed_by: 'user-123'
        }
      ];

      (global.fetch as any).mockResolvedValue({
        ok: true,
        json: async () => ({ embeddings: [[0.1, 0.2, 0.3]] })
      });

      mockSupabase.rpc.mockResolvedValue({ data: mockResults, error: null });

      const results = await ragService.searchContext('project-123', 'test query');

      expect(results).toHaveLength(1);
      expect(results[0].filePath).toBe('src/utils.ts');
      expect(results[0].chunkText).toBe('function helper() { return true; }');
      expect(results[0].language).toBe('ts');
      expect(results[0].similarity).toBe(0.85);
    });

    it('should return empty array when embedding generation fails', async () => {
      (global.fetch as any).mockResolvedValue({
        ok: false,
        json: async () => ({ error: 'API error' })
      });

      const results = await ragService.searchContext('project-123', 'test query');

      expect(results).toEqual([]);
    });

    it('should handle custom match options', async () => {
      (global.fetch as any).mockResolvedValue({
        ok: true,
        json: async () => ({ embeddings: [[0.1, 0.2, 0.3]] })
      });

      mockSupabase.rpc.mockResolvedValue({ data: [], error: null });

      await ragService.searchContext('project-123', 'test query', {
        matchThreshold: 0.8,
        matchCount: 5,
        forceSearch: true
      });

      expect(mockSupabase.rpc).toHaveBeenCalledWith('search_workspace_context', {
        p_project_id: 'project-123',
        p_query_embedding: [0.1, 0.2, 0.3],
        p_match_threshold: 0.8,
        p_match_count: 5,
        p_force_search: true
      });
    });

    it('should require user ID for embedding generation', async () => {
      mockGetUserId.mockReturnValue(null);

      const results = await ragService.searchContext('project-123', 'test query');

      expect(results).toEqual([]);
      expect(global.fetch).not.toHaveBeenCalled();
    });
  });

  describe('formatContextForPrompt', () => {
    it('should format search results for AI prompt', () => {
      const results: SearchResult[] = [
        {
          filePath: 'src/utils.ts',
          chunkText: 'function helper() { return true; }',
          language: 'ts',
          similarity: 0.85,
          indexedBy: 'user-123'
        },
        {
          filePath: 'src/main.ts',
          chunkText: 'console.log("Hello");',
          language: 'ts',
          similarity: 0.75,
          indexedBy: 'user-456'
        }
      ];

      const formatted = ragService.formatContextForPrompt(results);

      expect(formatted).toContain('RELEVANT CODE FROM WORKSPACE');
      expect(formatted).toContain('src/utils.ts');
      expect(formatted).toContain('85.0% match');
      expect(formatted).toContain('function helper()');
      expect(formatted).toContain('src/main.ts');
      expect(formatted).toContain('75.0% match');
      expect(formatted).toContain('END OF WORKSPACE CONTEXT');
    });

    it('should return empty string when no results', () => {
      const formatted = ragService.formatContextForPrompt([]);

      expect(formatted).toBe('');
    });

    it('should handle results without language', () => {
      const results: SearchResult[] = [
        {
          filePath: 'README.md',
          chunkText: '# Project',
          language: '',
          similarity: 0.6,
          indexedBy: 'user-123'
        }
      ];

      const formatted = ragService.formatContextForPrompt(results);

      expect(formatted).toContain('README.md');
      expect(formatted).toContain('# Project');
    });
  });

  describe('dispose', () => {
    it('should clean up watchers and timers', () => {
      // Create service with some state
      const service = new RAGService(mockSupabase as any, mockGetUserId);

      // Call dispose
      service.dispose();

      // Should not throw and should be safe to call multiple times
      expect(() => service.dispose()).not.toThrow();
    });
  });

  describe('Edge Function Integration', () => {
    it('should call embeddings edge function with correct payload', async () => {
      (global.fetch as any).mockResolvedValue({
        ok: true,
        json: async () => ({ embeddings: [[0.1, 0.2, 0.3]] })
      });

      mockSupabase.rpc.mockResolvedValue({ data: [], error: null });

      await ragService.searchContext('project-123', 'test query');

      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('generate-embeddings'),
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json'
          }),
          body: expect.stringContaining('test query')
        })
      );
    });

    it('should include userId and projectId in embedding request', async () => {
      (global.fetch as any).mockResolvedValue({
        ok: true,
        json: async () => ({ embeddings: [[0.1, 0.2, 0.3]] })
      });

      mockSupabase.rpc.mockResolvedValue({ data: [], error: null });

      await ragService.searchContext('project-123', 'test query');

      const fetchCall = (global.fetch as any).mock.calls[0];
      const body = JSON.parse(fetchCall[1].body);

      expect(body.userId).toBe('user-123');
      expect(body.projectId).toBe('project-123');
      expect(body.texts).toEqual(['test query']);
    });

    it('should handle edge function rate limiting', async () => {
      (global.fetch as any).mockResolvedValue({
        ok: false,
        status: 429,
        json: async () => ({ error: 'Rate limit exceeded' }),
        text: async () => 'Rate limit exceeded'
      });

      const results = await ragService.searchContext('project-123', 'test query');

      expect(results).toEqual([]);
    });

    it('should handle network errors gracefully', async () => {
      (global.fetch as any).mockRejectedValue(new Error('Network error'));

      const results = await ragService.searchContext('project-123', 'test query');

      expect(results).toEqual([]);
    });
  });

  describe('Database Integration', () => {
    it('should use correct RPC function for RAG enable check', async () => {
      mockSupabase.rpc.mockResolvedValue({ data: true, error: null });

      await ragService.isEnabled('project-123');

      expect(mockSupabase.rpc).toHaveBeenCalledWith('is_rag_enabled', {
        p_project_id: 'project-123'
      });
    });

    it('should use correct RPC function for RAG toggle', async () => {
      mockSupabase.rpc.mockResolvedValue({ data: true, error: null });

      await ragService.setEnabled('project-123', true);

      expect(mockSupabase.rpc).toHaveBeenCalledWith('set_rag_enabled', {
        p_project_id: 'project-123',
        p_enabled: true
      });
    });

    it('should query correct table for stats', async () => {
      // Set up the mock chain
      const mockChain = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: null, error: null })
      };
      
      mockSupabase.from.mockReturnValue(mockChain);

      await ragService.getStats('project-123');

      expect(mockSupabase.from).toHaveBeenCalledWith('project_indexing_status');
    });

    it('should use correct RPC for context search', async () => {
      const mockEmbedding = [0.1, 0.2, 0.3];
      (global.fetch as any).mockResolvedValue({
        ok: true,
        json: async () => ({ embeddings: [mockEmbedding] })
      });

      mockSupabase.rpc.mockResolvedValue({ data: [], error: null });

      await ragService.searchContext('project-123', 'test query', {
        matchThreshold: 0.75,
        matchCount: 15
      });

      expect(mockSupabase.rpc).toHaveBeenCalledWith('search_workspace_context', {
        p_project_id: 'project-123',
        p_query_embedding: mockEmbedding,
        p_match_threshold: 0.75,
        p_match_count: 15,
        p_force_search: false
      });
    });
  });

  describe('Cost Optimization', () => {
    it('should use default thresholds to limit API calls', async () => {
      (global.fetch as any).mockResolvedValue({
        ok: true,
        json: async () => ({ embeddings: [[0.1, 0.2, 0.3]] })
      });

      mockSupabase.rpc.mockResolvedValue({ data: [], error: null });

      await ragService.searchContext('project-123', 'test query');

      expect(mockSupabase.rpc).toHaveBeenCalledWith('search_workspace_context',
        expect.objectContaining({
          p_match_threshold: 0.7,
          p_match_count: 10
        })
      );
    });

    it('should batch embedding generation', async () => {
      // This would be tested in the private method tests
      // For now, verify single embedding works
      (global.fetch as any).mockResolvedValue({
        ok: true,
        json: async () => ({
          embeddings: [[0.1, 0.2, 0.3]],
          usage: { total_tokens: 8 }
        })
      });

      mockSupabase.rpc.mockResolvedValue({ data: [], error: null });

      await ragService.searchContext('project-123', 'short query');

      expect(global.fetch).toHaveBeenCalledTimes(1);
    });
  });

  describe('Error Handling', () => {
    it('should handle missing user ID gracefully', async () => {
      mockGetUserId.mockReturnValue(null);

      const results = await ragService.searchContext('project-123', 'test');

      expect(results).toEqual([]);
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('should handle database errors in getStats', async () => {
      // Set up the mock chain to throw an error
      const mockChain = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockRejectedValue(new Error('DB error'))
      };
      
      mockSupabase.from.mockReturnValue(mockChain);

      await expect(ragService.getStats('project-123')).rejects.toThrow();
    });

    it('should handle search errors gracefully', async () => {
      (global.fetch as any).mockResolvedValue({
        ok: true,
        json: async () => ({ embeddings: [[0.1, 0.2]] })
      });

      mockSupabase.rpc.mockResolvedValue({ 
        data: null, 
        error: { message: 'Search failed' } 
      });

      const results = await ragService.searchContext('project-123', 'test');

      expect(results).toEqual([]);
    });
  });

  describe('Data Mapping', () => {
    it('should correctly map database results to SearchResult format', async () => {
      const mockDbResults = [
        {
          file_path: 'test.ts',
          chunk_text: 'const x = 1;',
          file_language: 'typescript',
          similarity: 0.9,
          indexed_by: 'user-999'
        }
      ];

      (global.fetch as any).mockResolvedValue({
        ok: true,
        json: async () => ({ embeddings: [[0.1, 0.2]] })
      });

      mockSupabase.rpc.mockResolvedValue({ data: mockDbResults, error: null });

      const results = await ragService.searchContext('project-123', 'query');

      expect(results[0]).toEqual({
        filePath: 'test.ts',
        chunkText: 'const x = 1;',
        language: 'typescript',
        similarity: 0.9,
        indexedBy: 'user-999'
      });
    });

    it('should handle missing optional fields', async () => {
      const mockDbResults = [
        {
          file_path: 'test.ts',
          chunk_text: 'code',
          file_language: null,
          similarity: 0.8,
          indexed_by: null
        }
      ];

      (global.fetch as any).mockResolvedValue({
        ok: true,
        json: async () => ({ embeddings: [[0.1]] })
      });

      mockSupabase.rpc.mockResolvedValue({ data: mockDbResults, error: null });

      const results = await ragService.searchContext('project-123', 'query');

      expect(results[0].language).toBeNull();
      expect(results[0].indexedBy).toBeNull();
    });
  });

  describe('formatContextForPrompt with edge cases', () => {
    it('should handle very high similarity scores', () => {
      const results: SearchResult[] = [{
        filePath: 'exact-match.ts',
        chunkText: 'exact code',
        language: 'ts',
        similarity: 0.999,
        indexedBy: 'user-1'
      }];

      const formatted = ragService.formatContextForPrompt(results);

      expect(formatted).toContain('99.9% match');
    });

    it('should handle very low similarity scores', () => {
      const results: SearchResult[] = [{
        filePath: 'weak-match.ts',
        chunkText: 'some code',
        language: 'ts',
        similarity: 0.01,
        indexedBy: 'user-1'
      }];

      const formatted = ragService.formatContextForPrompt(results);

      expect(formatted).toContain('1.0% match');
    });

    it('should handle special characters in file paths', () => {
      const results: SearchResult[] = [{
        filePath: 'src/components/[id]/page.tsx',
        chunkText: 'component code',
        language: 'tsx',
        similarity: 0.8,
        indexedBy: 'user-1'
      }];

      const formatted = ragService.formatContextForPrompt(results);

      expect(formatted).toContain('src/components/[id]/page.tsx');
    });

    it('should handle code with backticks', () => {
      const results: SearchResult[] = [{
        filePath: 'test.ts',
        chunkText: 'const template = `Hello ${name}`;',
        language: 'ts',
        similarity: 0.8,
        indexedBy: 'user-1'
      }];

      const formatted = ragService.formatContextForPrompt(results);

      expect(formatted).toContain('const template = `Hello ${name}`;');
    });
  });
});

