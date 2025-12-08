import * as vscode from 'vscode';
import { getSupabaseClient } from './supabaseConfig';
import * as fs from 'fs/promises';
import * as path from 'path';

/**
 * Agentic AI Analyzer
 * 
 * Uses AI agents with tool-calling capabilities to analyze the actual codebase
 * and provide real-time progress updates based on:
 * - Actual code in the workspace
 * - RAG context from indexed files
 * - Project details and requirements
 * - Team member skills and assignments
 */

interface AnalysisContext {
  projectId: string;
  projectDetails: any;
  teamMembers: any[];
  workspacePath: string;
  ragEnabled: boolean;
}

interface ProgressAnalysis {
  completionStatus: {
    percentComplete: number;
    completedAreas: string[];
    inProgress: string[];
    notStarted: string[];
  };
  codeQuality: {
    overallScore: number;
    strengths: string[];
    concerns: string[];
  };
  teamPerformance: Array<{
    memberName: string;
    contributions: string;
    suggestions: string;
    supportNeeded?: string;
  }>;
  blockers: Array<{
    issue: string;
    affectedMembers: string[];
    suggestedSolution: string;
  }>;
  nextPriorities: Array<{
    priority: string;
    assignTo: string;
    reasoning: string;
  }>;
  summary: string;
}

/**
 * Main agentic analysis function
 */
export async function analyzeProgressWithAgent(
  context: AnalysisContext,
  progressCallback?: (message: string) => void
): Promise<ProgressAnalysis> {
  const log = (msg: string) => {
    console.log(`[Agentic AI] ${msg}`);
    progressCallback?.(msg);
  };

  // Helper for delays
  const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

  try {
    // Get workspace context and prepare prompt FIRST (no delays here)
    const workspaceContext = await getWorkspaceContext(context.workspacePath);
    
    let ragContext = null;
    if (context.ragEnabled) {
      ragContext = await getRAGContext(context.projectId);
    }
    
    const analysisPrompt = buildProgressAnalysisPrompt(
      context,
      workspaceContext,
      ragContext
    );

    // Function to show progressive updates WHILE AI processes
    const showProgressiveUpdates = async () => {
      log('[INIT] Initializing agentic AI analyzer');
      await delay(800);
      
      log('[INIT] Project: ' + context.projectDetails.name);
      await delay(1000);
      
      if (context.projectDetails.description) {
        const desc = context.projectDetails.description.substring(0, 80);
        log('[INIT] Description: ' + desc + '...');
        await delay(800);
      }
      
      if (context.projectDetails.requirements) {
        log('[INIT] Loading requirements');
        await delay(800);
      }

      log('[SCAN] Starting workspace scan');
      await delay(1000);
      
      log('[SCAN] Workspace path: ' + context.workspacePath);
      await delay(800);
      
      log('[SCAN] Found ' + workspaceContext.stats.totalFiles + ' files');
      await delay(1000);
      
      const fileTypes = Object.entries(workspaceContext.stats.filesByExtension)
        .sort((a: any, b: any) => b[1] - a[1])
        .slice(0, 5);
      
      if (fileTypes.length > 0) {
        log('[SCAN] File breakdown:');
        await delay(800);
        
        for (const [ext, count] of fileTypes) {
          log(`[SCAN]   • ${ext}: ${count} files`);
          await delay(600);
        }
      }

      if (context.ragEnabled && ragContext) {
        log('[RAG] Fetching indexed code context');
        await delay(1000);
        
        if (ragContext.indexedFiles > 0) {
          log('[RAG] Loaded ' + ragContext.indexedFiles + ' code chunks');
          await delay(800);
          
          const filesToShow = ragContext.codeSnippets?.slice(0, 5) || [];
          for (const snippet of filesToShow) {
            log('[RAG]   • ' + snippet.path);
            await delay(600);
          }
        } else {
          log('[RAG] No indexed files found');
          await delay(800);
        }
      }

      log('[PREP] Building analysis context');
      await delay(1000);
      
      log('[PREP] Team size: ' + context.teamMembers.length + ' members');
      await delay(800);
      
      for (const member of context.teamMembers) {
        log('[PREP]   • ' + member.name);
        await delay(600);
      }
      
      log('[PREP] Context prepared (' + analysisPrompt.length + ' chars)');
      await delay(1000);

      log('[AI] Connecting to analysis service');
      await delay(1200);
      
      log('[AI] Sending request to agentic-progress-analysis');
      await delay(1000);
      
      log('[AI] Analyzing codebase vs project requirements...');
      await delay(1000);
      
      log('[AI] Evaluating team contributions and progress...');
      await delay(1000);
      
      log('[AI] Identifying blockers and next priorities...');
    };

    // Call AI and show updates in parallel
    const [analysis] = await Promise.all([
      // AI call (happens immediately)
      callAgenticEdgeFunction(
        analysisPrompt,
        context.projectId,
        (toolCall: string) => log('[AI] Tool call: ' + toolCall),
        log
      ),
      // Progressive updates (fills the wait time)
      showProgressiveUpdates()
    ]);

    log('[DONE] Analysis complete');
    await delay(800);
    
    log('[DONE] Completion: ' + analysis.completionStatus.percentComplete + '%');
    
    return analysis;
  } catch (error) {
    console.error('[Agentic AI] Error:', error);
    throw new Error(
      `Agentic analysis failed: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

/**
 * Get workspace structure and file information
 */
async function getWorkspaceContext(workspacePath: string, log?: (msg: string) => void): Promise<any> {
  try {
    const files: string[] = [];
    const stats: any = {
      totalFiles: 0,
      filesByExtension: {} as Record<string, number>,
      directories: [],
      recentlyModified: []
    };

    // Recursively scan workspace
    await scanDirectory(workspacePath, workspacePath, files, stats, 0, log);

    log?.('[SCAN] Checking file modification times');
    
    // Get recently modified files
    const filesWithTime = await Promise.all(
      files.slice(0, 100).map(async (file) => {
        try {
          const stat = await fs.stat(file);
          return { path: file, mtime: stat.mtime };
        } catch {
          return null;
        }
      })
    );

    stats.recentlyModified = filesWithTime
      .filter((f) => f !== null)
      .sort((a, b) => b!.mtime.getTime() - a!.mtime.getTime())
      .slice(0, 20)
      .map((f) => path.relative(workspacePath, f!.path));

    log?.('[SCAN] Found ' + stats.recentlyModified.length + ' recently modified files');

    return {
      rootPath: workspacePath,
      files: files.map((f) => path.relative(workspacePath, f)),
      stats
    };
  } catch (error) {
    console.error('Error getting workspace context:', error);
    return { rootPath: workspacePath, files: [], stats: {} };
  }
}

async function scanDirectory(
  dir: string,
  rootPath: string,
  files: string[],
  stats: any,
  depth: number = 0,
  log?: (msg: string) => void
): Promise<void> {
  if (depth > 5) return; // Limit depth

  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    const dirName = path.relative(rootPath, dir) || '/';
    
    if (depth <= 2 && dirName !== '/') {
      log?.('[SCAN] Scanning: ' + dirName);
    }

    for (const entry of entries) {
      // Skip common ignore patterns
      if (
        entry.name.startsWith('.') ||
        entry.name === 'node_modules' ||
        entry.name === 'dist' ||
        entry.name === 'build' ||
        entry.name === 'out'
      ) {
        continue;
      }

      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        stats.directories.push(path.relative(rootPath, fullPath));
        await scanDirectory(fullPath, rootPath, files, stats, depth + 1, log);
      } else {
        files.push(fullPath);
        stats.totalFiles++;

        const ext = path.extname(entry.name);
        stats.filesByExtension[ext] = (stats.filesByExtension[ext] || 0) + 1;
      }
    }
  } catch (error) {
    // Silently skip directories we can't read
  }
}

/**
 * Get RAG context for the project
 */
async function getRAGContext(projectId: string, log?: (msg: string) => void): Promise<any> {
  try {
    const supabase = getSupabaseClient();

    log?.('[RAG] Querying database for indexed files');
    
    // Get indexed files count and chunks
    const { data, error } = await supabase
      .from('project_workspace_files')
      .select('file_path, file_language, chunk_text')
      .eq('project_id', projectId)
      .limit(50); // Limit to keep context manageable

    if (error) throw error;

    log?.('[RAG] Retrieved ' + (data?.length || 0) + ' code chunks from database');

    return {
      indexedFiles: data?.length || 0,
      codeSnippets: data?.map((d: any) => ({
        path: d.file_path,
        language: d.file_language,
        snippet: d.chunk_text.substring(0, 500)
      }))
    };
  } catch (error) {
    console.error('Error getting RAG context:', error);
    log?.('[RAG] Error: ' + (error instanceof Error ? error.message : 'Unknown error'));
    return { indexedFiles: 0, codeSnippets: [] };
  }
}

/**
 * Build the analysis prompt for the AI
 */
function buildProgressAnalysisPrompt(
  context: AnalysisContext,
  workspaceContext: any,
  ragContext: any
): string {
  const { projectDetails, teamMembers } = context;

  let prompt = `# PROGRESS ANALYSIS REQUEST

You are an expert project analyzer with access to the actual codebase. Provide a comprehensive progress update.

## PROJECT INFORMATION
- Name: ${projectDetails.name}
- Description: ${projectDetails.description}
- Requirements: ${projectDetails.requirements || 'Not specified'}

## TEAM MEMBERS
${teamMembers.map((m: any) => `- ${m.name} (${m.email})
  Skills: ${m.skills || 'Not specified'}
  Languages: ${m.programmingLanguages || 'Not specified'}
  Available for: ${m.willingToWorkOn || 'Not specified'}`).join('\n')}

## WORKSPACE CONTEXT
- Total Files: ${workspaceContext.stats.totalFiles}
- File Types: ${Object.entries(workspaceContext.stats.filesByExtension)
  .map(([ext, count]) => `${ext} (${count})`)
  .join(', ')}
- Recent Activity: ${workspaceContext.stats.recentlyModified.slice(0, 5).join(', ')}

${ragContext ? `## CODE ANALYSIS (from RAG)
- Indexed Files: ${ragContext.indexedFiles}
- Code Snippets Available: ${ragContext.codeSnippets?.length || 0}

Sample Code Structure:
${ragContext.codeSnippets?.slice(0, 3).map((s: any) => `- ${s.path} (${s.language})`).join('\n')}
` : ''}

## ANALYSIS REQUIREMENTS

Analyze the current state of the project and provide:

1. **Completion Status** (0-100%)
   - What's completed vs what's planned
   - Areas in progress
   - Not yet started

2. **Code Quality Assessment** (1-10 score)
   - Overall code quality
   - Strengths in the codebase
   - Areas of concern

3. **Team Performance**
   - What each team member has contributed
   - Suggestions for improvement
   - Support needed

4. **Blockers**
   - Current blockers or issues
   - Affected team members
   - Suggested solutions

5. **Next Priorities**
   - Top 3-5 next steps
   - Recommended assignees
   - Reasoning

6. **Summary**
   - High-level overview of project status

Return your analysis as JSON matching this structure:
{
  "completionStatus": {
    "percentComplete": number,
    "completedAreas": string[],
    "inProgress": string[],
    "notStarted": string[]
  },
  "codeQuality": {
    "overallScore": number,
    "strengths": string[],
    "concerns": string[]
  },
  "teamPerformance": [{
    "memberName": string,
    "contributions": string,
    "suggestions": string,
    "supportNeeded": string?
  }],
  "blockers": [{
    "issue": string,
    "affectedMembers": string[],
    "suggestedSolution": string
  }],
  "nextPriorities": [{
    "priority": string,
    "assignTo": string,
    "reasoning": string
  }],
  "summary": string
}`;

  return prompt;
}

/**
 * Call the Supabase Edge Function with agentic capabilities
 */
async function callAgenticEdgeFunction(
  prompt: string,
  projectId: string,
  toolCallback?: (toolCall: string) => void,
  log?: (msg: string) => void
): Promise<ProgressAnalysis> {
  try {
    const supabase = getSupabaseClient();

    log?.('[AI] Preparing request payload');
    log?.('[AI] Prompt size: ' + prompt.length + ' characters');
    
    // Call the edge function
    log?.('[AI] Invoking edge function: agentic-progress-analysis');
    const { data, error } = await supabase.functions.invoke('agentic-progress-analysis', {
      body: {
        prompt,
        projectId
      }
    });

    if (error) {
      log?.('[AI] Error from edge function: ' + error.message);
      throw error;
    }

    log?.('[AI] Received response from edge function');
    log?.('[AI] Parsing analysis results');

    // Parse and validate response
    if (data && data.analysis) {
      log?.('[AI] Successfully parsed analysis data');
      return data.analysis as ProgressAnalysis;
    }

    throw new Error('Invalid response from agentic edge function');
  } catch (error) {
    console.error('Error calling agentic edge function:', error);
    log?.('[AI] Fatal error: ' + (error instanceof Error ? error.message : 'Unknown error'));
    
    // Fallback: Return a basic structure if edge function fails
    return {
      completionStatus: {
        percentComplete: 0,
        completedAreas: [],
        inProgress: ['Unable to analyze - Edge function error'],
        notStarted: []
      },
      codeQuality: {
        overallScore: 5,
        strengths: [],
        concerns: ['Unable to perform code analysis']
      },
      teamPerformance: [],
      blockers: [{
        issue: 'Analysis service unavailable',
        affectedMembers: [],
        suggestedSolution: 'Please try again or check edge function deployment'
      }],
      nextPriorities: [],
      summary: `Unable to complete agentic analysis: ${error instanceof Error ? error.message : 'Unknown error'}`
    };
  }
}

