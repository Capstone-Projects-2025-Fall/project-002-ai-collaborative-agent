/**
 * RAG Service - Optimized for Collaborative Workspaces
 * 
 * Design Principles:
 * - Opt-in: RAG only used when explicitly enabled
 * - Hybrid: Works with active project or standalone workspace
 * - Smart: Intelligent file filtering for Live Share environments
 * - Auto-update: Reindex files on save
 * - Subtle: Provide usage stats without overwhelming UI
 */

import { SupabaseClient } from '@supabase/supabase-js';
import * as vscode from 'vscode';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as crypto from 'crypto';
import { getEmbeddingsEdgeFunctionUrl, getSupabaseAnonKey } from './supabaseConfig';

// Configuration
const MAX_CHUNK_SIZE = 3000; // characters
const CHUNK_OVERLAP = 200; // characters
const BATCH_SIZE = 10; // Process embeddings in batches to avoid rate limits

// File filtering - optimized for cost
const CODE_EXTENSIONS = [
  '.ts', '.js', '.tsx', '.jsx', '.py', '.java', '.cpp', '.c', '.cs',
  '.go', '.rb', '.php', '.swift', '.kt', '.rs', '.html', '.css', '.scss'
];

const IGNORE_PATTERNS = [
  'node_modules', '.git', 'dist', 'build', 'out', '.vscode', 'coverage',
  '.next', '__pycache__', 'target', 'vendor', '.test.', '.spec.',
  'test/', 'tests/', '__tests__/', '.min.', 'bundle.'
];

export interface RAGStats {
  enabled: boolean;
  totalFiles: number;
  totalChunks: number;
  lastIndexed: Date | null;
  filesUsed?: number; // For query results
}

export interface SearchResult {
  filePath: string;
  chunkText: string;
  language: string;
  similarity: number;
  indexedBy: string;
}

export class RAGService {
  private fileWatchers: vscode.FileSystemWatcher[] = [];
  private pendingReindexes: Set<string> = new Set();
  private reindexTimer: NodeJS.Timeout | undefined;
  private currentUserId: string | null = null;

  constructor(
    private supabase: SupabaseClient,
    private getUserId: () => string | null
  ) {
    // Store user ID getter for later use
  }

  /**
   * Check if RAG is enabled for a project
   */
  async isEnabled(projectId: string): Promise<boolean> {
    const { data, error } = await this.supabase.rpc('is_rag_enabled', {
      p_project_id: projectId
    });

    if (error) {
      console.error('Error checking RAG status:', error);
      return false;
    }

    return data === true;
  }

  /**
   * Enable or disable RAG for a project (opt-in control)
   */
  async setEnabled(projectId: string, enabled: boolean): Promise<boolean> {
    const { data, error } = await this.supabase.rpc('set_rag_enabled', {
      p_project_id: projectId,
      p_enabled: enabled
    });

    if (error) {
      console.error('Error setting RAG status:', error);
      return false;
    }

    return true;
  }

  /**
   * Get RAG statistics for a project
   */
  async getStats(projectId: string): Promise<RAGStats> {
    const { data: statusData } = await this.supabase
      .from('project_indexing_status')
      .select('*')
      .eq('project_id', projectId)
      .single();

    if (!statusData) {
      return {
        enabled: false,
        totalFiles: 0,
        totalChunks: 0,
        lastIndexed: null
      };
    }

    return {
      enabled: statusData.rag_enabled || false,
      totalFiles: statusData.total_files || 0,
      totalChunks: statusData.total_chunks || 0,
      lastIndexed: statusData.completed_at ? new Date(statusData.completed_at) : null
    };
  }

  /**
   * Index workspace for a project (manual trigger)
   * This is the main entry point for users
   */
  async indexWorkspace(
    projectId: string,
    workspacePath: string,
    userId: string,
    progressCallback?: (percent: number, message: string) => void
  ): Promise<boolean> {
    try {
      // Update status to indexing
      await this.updateIndexingStatus(projectId, {
        status: 'indexing',
        workspace_path: workspacePath,
        started_at: new Date().toISOString()
      });

      progressCallback?.(0, 'Scanning workspace...');

      // Read and filter files
      const files = await this.readWorkspaceFiles(workspacePath);
      console.log(`Found ${files.length} files to index`);

      if (files.length === 0) {
        throw new Error('No code files found in workspace');
      }

      progressCallback?.(10, `Found ${files.length} files`);

      let indexedFiles = 0;
      let totalChunks = 0;

      // Index each file
      for (const file of files) {
        try {
          const chunks = await this.indexFile(
            projectId,
            file,
            userId
          );

          totalChunks += chunks;
          indexedFiles++;

          const progress = 10 + (indexedFiles / files.length) * 85;
          progressCallback?.(
            progress,
            `Indexed ${indexedFiles}/${files.length}: ${path.basename(file.path)}`
          );
        } catch (error) {
          console.error(`Error indexing ${file.path}:`, error);
          // Continue with other files
        }
      }

      // Mark as completed
      await this.updateIndexingStatus(projectId, {
        status: 'completed',
        total_files: files.length,
        indexed_files: indexedFiles,
        total_chunks: totalChunks,
        completed_at: new Date().toISOString()
      });

      progressCallback?.(100, `✓ Indexed ${indexedFiles} files with ${totalChunks} chunks`);

      // Start watching for changes
      this.startWatchingWorkspace(projectId, workspacePath);

      return true;
    } catch (error) {
      console.error('Error indexing workspace:', error);
      await this.updateIndexingStatus(projectId, {
        status: 'failed',
        error_message: error instanceof Error ? error.message : 'Unknown error'
      });
      return false;
    }
  }

  /**
   * Search for relevant code context (only if RAG enabled)
   */
  async searchContext(
    projectId: string,
    query: string,
    options: {
      matchThreshold?: number;
      matchCount?: number;
      forceSearch?: boolean; // For explicit user requests
    } = {}
  ): Promise<SearchResult[]> {
    const {
      matchThreshold = 0.7,
      matchCount = 10,
      forceSearch = false
    } = options;

    try {
      // Generate embedding for query
      const queryEmbedding = await this.generateEmbedding(query, projectId);

      if (!queryEmbedding) {
        console.warn('Could not generate query embedding');
        return [];
      }

      // Search using Supabase function (respects RAG enabled flag)
      const { data, error } = await this.supabase.rpc('search_workspace_context', {
        p_project_id: projectId,
        p_query_embedding: queryEmbedding,
        p_match_threshold: matchThreshold,
        p_match_count: matchCount,
        p_force_search: forceSearch
      });

      if (error) {
        console.error('Error searching context:', error);
        return [];
      }

      return (data || []).map((row: any) => ({
        filePath: row.file_path,
        chunkText: row.chunk_text,
        language: row.file_language,
        similarity: row.similarity,
        indexedBy: row.indexed_by
      }));
    } catch (error) {
      console.error('Error in searchContext:', error);
      return [];
    }
  }

  /**
   * Format search results as context for AI prompt
   */
  formatContextForPrompt(results: SearchResult[]): string {
    if (results.length === 0) {
      return '';
    }

    let context = '\n\n=== RELEVANT CODE FROM WORKSPACE ===\n\n';
    context += `Found ${results.length} relevant code snippets:\n\n`;

    results.forEach((result, idx) => {
      const similarity = (result.similarity * 100).toFixed(1);
      context += `[${idx + 1}] ${result.filePath} (${similarity}% match)\n`;
      context += `\`\`\`${result.language}\n${result.chunkText}\n\`\`\`\n\n`;
    });

    context += '=== END OF WORKSPACE CONTEXT ===\n\n';
    return context;
  }

  /**
   * Stop watching workspace and clean up
   */
  dispose(): void {
    this.fileWatchers.forEach(watcher => watcher.dispose());
    this.fileWatchers = [];

    if (this.reindexTimer) {
      clearTimeout(this.reindexTimer);
    }
  }

  // ==================== PRIVATE METHODS ====================

  /**
   * Read all code files from workspace with intelligent filtering
   */
  private async readWorkspaceFiles(workspacePath: string): Promise<Array<{
    path: string;
    content: string;
    language: string;
    size: number;
  }>> {
    const files: Array<any> = [];

    const readDir = async (dirPath: string) => {
      try {
        const entries = await fs.readdir(dirPath, { withFileTypes: true });

        for (const entry of entries) {
          // Skip ignored patterns
          if (IGNORE_PATTERNS.some(pattern => entry.name.includes(pattern))) {
            continue;
          }

          const fullPath = path.join(dirPath, entry.name);

          if (entry.isDirectory()) {
            await readDir(fullPath);
          } else if (entry.isFile()) {
            const ext = path.extname(entry.name).toLowerCase();

            if (CODE_EXTENSIONS.includes(ext)) {
              try {
                const content = await fs.readFile(fullPath, 'utf-8');
                const stats = await fs.stat(fullPath);

                // Skip very large files (>500KB)
                if (stats.size < 500000) {
                  files.push({
                    path: path.relative(workspacePath, fullPath),
                    content: content,
                    language: ext.substring(1),
                    size: stats.size
                  });
                }
              } catch (err) {
                console.log(`Could not read file: ${fullPath}`);
              }
            }
          }
        }
      } catch (err) {
        console.log(`Could not read directory: ${dirPath}`);
      }
    };

    await readDir(workspacePath);
    return files;
  }

  /**
   * Index a single file
   * Uses batch embedding generation for better performance
   */
  private async indexFile(
    projectId: string,
    file: { path: string; content: string; language: string; size: number },
    userId: string
  ): Promise<number> {
    // Delete existing chunks
    await this.supabase
      .from('project_workspace_files')
      .delete()
      .eq('project_id', projectId)
      .eq('file_path', file.path);

    // Split into chunks
    const chunks = this.chunkContent(file.content);
    
    // Generate embeddings in batch for better performance
    const embeddings = await this.generateEmbeddingsBatch(chunks, projectId);

    // Store chunks with embeddings
    for (let i = 0; i < chunks.length; i++) {
      if (embeddings[i]) {
        await this.supabase.from('project_workspace_files').insert({
          project_id: projectId,
          file_path: file.path,
          file_content: file.content,
          chunk_index: i,
          chunk_text: chunks[i],
          embedding: embeddings[i],
          file_language: file.language,
          file_size: file.size,
          is_auto_indexed: false,
          indexed_by_user_id: userId
        });
      }
    }

    return chunks.length;
  }

  /**
   * Split content into chunks with overlap
   */
  private chunkContent(content: string): string[] {
    if (content.length <= MAX_CHUNK_SIZE) {
      return [content];
    }

    const chunks: string[] = [];
    const lines = content.split('\n');
    let currentChunk = '';

    for (const line of lines) {
      if (currentChunk.length + line.length > MAX_CHUNK_SIZE) {
        if (currentChunk.trim()) {
          chunks.push(currentChunk.trim());
          
          // Start new chunk with overlap
          const overlapText = currentChunk.substring(
            Math.max(0, currentChunk.length - CHUNK_OVERLAP)
          );
          currentChunk = overlapText + line + '\n';
        } else {
          currentChunk = line + '\n';
        }
      } else {
        currentChunk += line + '\n';
      }
    }

    if (currentChunk.trim()) {
      chunks.push(currentChunk.trim());
    }

    return chunks;
  }

  /**
   * Generate embedding using Supabase Edge Function
   * This is more secure and cost-effective than calling OpenAI directly
   */
  private async generateEmbedding(text: string, projectId?: string): Promise<number[] | null> {
    try {
      const userId = this.getUserId();
      if (!userId) {
        console.warn('No user ID available for embedding generation');
        return null;
      }

      const edgeFunctionUrl = getEmbeddingsEdgeFunctionUrl();
      const anonKey = getSupabaseAnonKey();

      const response = await fetch(edgeFunctionUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${anonKey}`,
          'apikey': anonKey
        },
        body: JSON.stringify({
          texts: [text],
          projectId: projectId,
          userId: userId
        })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        console.error('Edge function error:', errorData);
        return null;
      }

      const data = await response.json();
      return data.embeddings[0];
    } catch (error) {
      console.error('Error generating embedding:', error);
      return null;
    }
  }

  /**
   * Generate multiple embeddings in batch
   * More efficient for bulk operations
   */
  private async generateEmbeddingsBatch(
    texts: string[], 
    projectId: string
  ): Promise<(number[] | null)[]> {
    try {
      const userId = this.getUserId();
      if (!userId) {
        console.warn('No user ID available for batch embedding generation');
        return texts.map(() => null);
      }

      const edgeFunctionUrl = getEmbeddingsEdgeFunctionUrl();
      const anonKey = getSupabaseAnonKey();

      // Process in batches to avoid rate limits
      const results: (number[] | null)[] = [];
      
      for (let i = 0; i < texts.length; i += BATCH_SIZE) {
        const batch = texts.slice(i, i + BATCH_SIZE);

        const response = await fetch(edgeFunctionUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${anonKey}`,
            'apikey': anonKey
          },
          body: JSON.stringify({
            texts: batch,
            projectId: projectId,
            userId: userId
          })
        });

        if (!response.ok) {
          console.error('Batch embedding error:', await response.text());
          // Add nulls for failed batch
          results.push(...batch.map(() => null));
          continue;
        }

        const data = await response.json();
        results.push(...data.embeddings);
      }

      return results;
    } catch (error) {
      console.error('Error generating batch embeddings:', error);
      return texts.map(() => null);
    }
  }

  /**
   * Start watching workspace for file changes (auto-reindex on save)
   */
  private startWatchingWorkspace(projectId: string, workspacePath: string): void {
    // Clear existing watchers
    this.fileWatchers.forEach(w => w.dispose());
    this.fileWatchers = [];

    // Watch for file changes
    const pattern = new vscode.RelativePattern(workspacePath, '**/*');
    const watcher = vscode.workspace.createFileSystemWatcher(pattern);

    // On file change, mark for reindex
    watcher.onDidChange(uri => {
      const ext = path.extname(uri.fsPath).toLowerCase();
      if (CODE_EXTENSIONS.includes(ext)) {
        this.scheduleReindex(projectId, workspacePath, uri.fsPath);
      }
    });

    this.fileWatchers.push(watcher);
  }

  /**
   * Schedule file reindex (debounced)
   */
  private scheduleReindex(projectId: string, workspacePath: string, filePath: string): void {
    const relativePath = path.relative(workspacePath, filePath);
    this.pendingReindexes.add(relativePath);

    if (this.reindexTimer) {
      clearTimeout(this.reindexTimer);
    }

    // Debounce: reindex after 2 seconds of inactivity
    this.reindexTimer = setTimeout(async () => {
      const filesToReindex = Array.from(this.pendingReindexes);
      this.pendingReindexes.clear();

      console.log(`Auto-reindexing ${filesToReindex.length} changed files`);

      for (const relPath of filesToReindex) {
        try {
          const fullPath = path.join(workspacePath, relPath);
          const content = await fs.readFile(fullPath, 'utf-8');
          const stats = await fs.stat(fullPath);
          const ext = path.extname(fullPath).toLowerCase();

          await this.indexFile(projectId, {
            path: relPath,
            content: content,
            language: ext.substring(1),
            size: stats.size
          }, 'auto'); // Mark as auto-indexed
        } catch (error) {
          console.error(`Error reindexing ${relPath}:`, error);
        }
      }
    }, 2000);
  }

  /**
   * Update indexing status in database
   */
  private async updateIndexingStatus(projectId: string, updates: any): Promise<void> {
    await this.supabase
      .from('project_indexing_status')
      .upsert({
        project_id: projectId,
        ...updates,
        last_updated_at: new Date().toISOString()
      });
  }
}
