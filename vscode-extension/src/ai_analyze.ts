import * as vscode from 'vscode';

let statusBarItem: vscode.StatusBarItem;
let resultsPanel: vscode.WebviewPanel | undefined;
let extensionContext: vscode.ExtensionContext;
let autoAnalyzeTimer: NodeJS.Timeout | undefined;
let isAutoAnalyzeEnabled = true;

const SUPABASE_EDGE_FUNCTION_URL="https://ptthofpfrmhhmvmbzgxx.supabase.co/functions/v1/ai-analyze";
const SUPABASE_ANON_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB0dGhvZnBmcm1oaG12bWJ6Z3h4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTgxMjIzMTUsImV4cCI6MjA3MzY5ODMxNX0.vmIQd2JlfigERJTG5tkFGpoRgqBOj0FudEvGDzNd5Ko"
export function activateCodeReviewer(context: vscode.ExtensionContext) {
    try {
        console.log('AI Code Reviewer extension is now active!');
        
        extensionContext = context;

        // Creates the bar at the bottom right to show if the ai analyzer is active or not
        statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
        statusBarItem.command = 'ai-code-reviewer.configure';
        context.subscriptions.push(statusBarItem);
        console.log('Status bar item created');

        // Command to manually trigger analysis
        const analyzeCommand = vscode.commands.registerCommand('ai-code-reviewer.analyzeCode', async () => {
            await analyzeCurrentFile();
        });

        // Shows the result panel on the right
        const showResultsCommand = vscode.commands.registerCommand('ai-code-reviewer.showResults', () => {
            showResultsPanel();
        });

        // Opens setup dialog (kept for potential future configuration needs)
        const configureCommand = vscode.commands.registerCommand('ai-code-reviewer.configure', async () => {
            vscode.window.showInformationMessage('API credentials are pre-configured. No setup needed!');
        });

        // Toggle auto-analyze on/off
        const toggleAutoAnalyzeCommand = vscode.commands.registerCommand('ai-code-reviewer.toggleAutoAnalyze', async () => {
            isAutoAnalyzeEnabled = !isAutoAnalyzeEnabled;
            if (isAutoAnalyzeEnabled) {
                startAutoAnalyze();
                vscode.window.showInformationMessage('Auto-analyze enabled');
            } else {
                stopAutoAnalyze();
                vscode.window.showInformationMessage('Auto-analyze disabled');
            }
            updateStatusBar();
        });

        // Listen for file saves to trigger analysis
        const saveListener = vscode.workspace.onDidSaveTextDocument((document) => {
            if (isAutoAnalyzeEnabled && vscode.window.activeTextEditor?.document === document) {
                analyzeCurrentFile();
            }
        });

        context.subscriptions.push(
            analyzeCommand,
            showResultsCommand,
            configureCommand,
            toggleAutoAnalyzeCommand,
            saveListener
        );

        updateStatusBar();
        
        // Start auto-analyze if enabled
        if (isAutoAnalyzeEnabled) {
            startAutoAnalyze();
        }
        
        console.log('updateStatusBar() called');
    } catch (error) {
        console.error('Error activating Code Reviewer:', error);
        vscode.window.showErrorMessage('Failed to activate Code Reviewer: ' + error);
    }
}

function startAutoAnalyze() {
    stopAutoAnalyze(); // Clear any existing timer
    
    // Get the interval from settings (in minutes)
    const config = vscode.workspace.getConfiguration('aiCodeReviewer');
    const intervalMinutes = config.get<number>('autoAnalyzeInterval', 5);
    const intervalMs = intervalMinutes * 60 * 1000; // Convert to milliseconds
    
    // Run at the specified interval (don't run immediately on start)
    autoAnalyzeTimer = setInterval(() => {
        analyzeCurrentFile();
    }, intervalMs);
    
    console.log(`Auto-analyze started with ${intervalMinutes} minute interval`);
}

function stopAutoAnalyze() {
    if (autoAnalyzeTimer) {
        clearInterval(autoAnalyzeTimer);
        autoAnalyzeTimer = undefined;
    }
}

async function analyzeCurrentFile() {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        console.log('No active editor found for auto-analyze');
        return;
    }

    // Use hardcoded credentials
    const apiEndpoint = SUPABASE_EDGE_FUNCTION_URL;
    const apiKey = SUPABASE_ANON_KEY;

    if (!apiEndpoint || !apiKey) {
        console.log('API credentials not configured in code');
        vscode.window.showErrorMessage('API credentials missing. Please check extension configuration.');
        return;
    }

    // Show a subtle notification that analysis is happening
    vscode.window.setStatusBarMessage('$(sync~spin) Analyzing folder...', 5000);

    try {
        // Get the folder containing the current file
        const currentFilePath = editor.document.uri.fsPath;
        const folderPath = require('path').dirname(currentFilePath);
        
        // Read all files in the folder
        const folderContents = await readFolderRecursively(folderPath);
        
        if (folderContents.length === 0) {
            console.log('No files found to analyze');
            vscode.window.setStatusBarMessage('$(warning) No files to analyze', 3000);
            return;
        }

        const headers: Record<string, string> = {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`,
            'apikey': apiKey
        };

        const response = await fetch(apiEndpoint, {
            method: 'POST',
            headers: headers,
            body: JSON.stringify({
                files: folderContents,
                folderPath: folderPath,
                currentFile: currentFilePath
            })
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(`API Error ${response.status}: ${errorData.error || 'Unknown error'}`);
        }

        const data = await response.json();

        // Create a summary of all analyzed files
        const filesSummary = folderContents.map(f => f.fileName).join('\n');

        // Update results panel silently (don't force it to show)
        showResultsPanel(data.message, filesSummary, folderPath, folderContents.length);

        // Show subtle completion message
        vscode.window.setStatusBarMessage(`$(check) Analyzed ${folderContents.length} files`, 3000);

    } catch (error: any) {
        console.error('Auto-analysis error:', error);
        // Don't show intrusive error messages for auto-analyze
        vscode.window.setStatusBarMessage('$(warning) Analysis failed', 3000);
    }
}

async function readFolderRecursively(folderPath: string): Promise<Array<{fileName: string, content: string, language: string}>> {
    const fs = require('fs').promises;
    const path = require('path');
    const files: Array<{fileName: string, content: string, language: string}> = [];
    
    // File extensions to include
    const codeExtensions = ['.js', '.ts', '.jsx', '.tsx', '.py', '.java', '.cpp', '.c', '.cs', '.go', '.rb', '.php', '.swift', '.kt', '.rs', '.html', '.css', '.scss', '.json', '.xml', '.yaml', '.yml', '.sql', '.sh'];
    
    // Folders to ignore
    const ignoreFolders = ['node_modules', '.git', 'dist', 'build', 'out', '.vscode', 'coverage', '.next', '__pycache__'];
    
    async function readDir(dirPath: string) {
        try {
            const entries = await fs.readdir(dirPath, { withFileTypes: true });
            
            for (const entry of entries) {
                const fullPath = path.join(dirPath, entry.name);
                
                if (entry.isDirectory()) {
                    // Skip ignored folders
                    if (!ignoreFolders.includes(entry.name)) {
                        await readDir(fullPath);
                    }
                } else if (entry.isFile()) {
                    const ext = path.extname(entry.name).toLowerCase();
                    
                    // Only include code files
                    if (codeExtensions.includes(ext)) {
                        try {
                            const content = await fs.readFile(fullPath, 'utf-8');
                            
                            // Skip very large files (>100KB)
                            if (content.length < 100000) {
                                files.push({
                                    fileName: path.relative(folderPath, fullPath),
                                    content: content,
                                    language: ext.substring(1) // Remove the dot
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
    }
    
    await readDir(folderPath);
    return files;
}

function showResultsPanel(analysisResult?: string, filesSummary?: string, folderPath?: string, fileCount?: number) {
    // Brings the panel out
    if (resultsPanel) {
        // Update the results without revealing (less intrusive)
        if (analysisResult) {
            updateResultsPanel(analysisResult, filesSummary || '', folderPath, fileCount);
        }
        return;
    }

    resultsPanel = vscode.window.createWebviewPanel(
        'aiCodeReviewResults',
        'AI Code Review Results',
        // Opens on the right side of the code
        vscode.ViewColumn.Beside,
        {
            enableScripts: true,
            retainContextWhenHidden: true
        }
    );

    // Clears the panel when you close it
    resultsPanel.onDidDispose(() => {
        resultsPanel = undefined;
    });

    if (analysisResult) {
        updateResultsPanel(analysisResult, filesSummary || '', folderPath, fileCount);
    } else {
        resultsPanel.webview.html = getWebviewContent('', '', '', 0);
    }
}

function updateResultsPanel(analysisResult: string, filesSummary: string, folderPath?: string, fileCount?: number) {
    if (resultsPanel) {
        resultsPanel.webview.html = getWebviewContent(analysisResult, filesSummary, folderPath, fileCount);
    }
}

function getWebviewContent(analysisResult: string, filesSummary: string, folderPath?: string, fileCount?: number): string {
    return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>AI Code Review Results</title>
        <style>
            body {
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                line-height: 1.6;
                color: var(--vscode-editor-foreground);
                background-color: var(--vscode-editor-background);
                padding: 20px;
                margin: 0;
            }
            
            .header {
                border-bottom: 1px solid var(--vscode-panel-border);
                padding-bottom: 15px;
                margin-bottom: 20px;
            }
            
            .header h1 {
                margin: 0;
                color: var(--vscode-textLink-foreground);
                font-size: 24px;
                display: flex;
                align-items: center;
                gap: 10px;
            }

            .folder-info {
                font-size: 14px;
                color: var(--vscode-descriptionForeground);
                margin-top: 5px;
            }

            .file-count {
                display: inline-block;
                background: var(--vscode-badge-background);
                color: var(--vscode-badge-foreground);
                padding: 2px 8px;
                border-radius: 10px;
                font-size: 12px;
                margin-left: 10px;
            }
            
            .files-section {
                background: var(--vscode-textCodeBlock-background);
                border: 1px solid var(--vscode-panel-border);
                border-radius: 8px;
                padding: 15px;
                margin: 15px 0;
                font-family: var(--vscode-editor-font-family);
                font-size: var(--vscode-editor-font-size);
            }
            
            .files-section h3 {
                margin: 0 0 10px 0;
                color: var(--vscode-textLink-foreground);
                font-size: 16px;
            }
            
            .files-content {
                white-space: pre-wrap;
                word-wrap: break-word;
                background: var(--vscode-editor-background);
                border: 1px solid var(--vscode-input-border);
                border-radius: 4px;
                padding: 12px;
                max-height: 200px;
                overflow-y: auto;
                font-size: 12px;
            }
            
            .analysis-section {
                background: var(--vscode-editor-background);
                border: 1px solid var(--vscode-panel-border);
                border-radius: 8px;
                padding: 20px;
                margin: 15px 0;
            }
            
            .analysis-section h3 {
                margin: 0 0 15px 0;
                color: var(--vscode-textLink-foreground);
                font-size: 18px;
            }
            
            .analysis-content {
                line-height: 1.7;
                white-space: pre-wrap;
                word-wrap: break-word;
            }
            
            .empty-state {
                text-align: center;
                padding: 60px 20px;
                color: var(--vscode-descriptionForeground);
            }
            
            .empty-state h2 {
                margin: 20px 0 10px 0;
                color: var(--vscode-textLink-foreground);
            }
            
            .timestamp {
                color: var(--vscode-descriptionForeground);
                font-size: 12px;
                text-align: right;
                margin-top: 20px;
                padding-top: 15px;
                border-top: 1px solid var(--vscode-panel-border);
            }

            .auto-analyze-badge {
                display: inline-block;
                background: var(--vscode-badge-background);
                color: var(--vscode-badge-foreground);
                padding: 2px 8px;
                border-radius: 10px;
                font-size: 12px;
                margin-left: 10px;
            }
        </style>
    </head>
    <body>
        <div class="header">
            <h1>
                AI Folder Analysis
                <span class="auto-analyze-badge">Auto-Analyzed</span>
                ${fileCount ? `<span class="file-count">${fileCount} files</span>` : ''}
            </h1>
            ${folderPath ? `<div class="folder-info">${escapeHtml(folderPath)}</div>` : ''}
        </div>
        
        ${analysisResult ? `
            <div class="analysis-section">
                <h3>Analysis Results</h3>
                <div class="analysis-content">${formatAnalysisResult(analysisResult)}</div>
            </div>
            
            <div class="files-section">
                <h3>Analyzed Files</h3>
                <div class="files-content">${escapeHtml(filesSummary)}</div>
            </div>
            
            <div class="timestamp">
                Analysis completed at ${new Date().toLocaleString()}
            </div>
        ` : `
            <div class="empty-state">
                <h2>Waiting for Auto-Analysis</h2>
                <p>The folder containing the active file will be automatically analyzed every 5 minutes.</p>
                <p>You can also manually trigger analysis using the command palette.</p>
            </div>
        `}
    </body>
    </html>`;
}

function escapeHtml(text: string): string {
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function formatAnalysisResult(result: string): string {
    return result
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        .replace(/\n\n/g, '</p><p>')
        .replace(/\n/g, '<br>');
}

async function updateStatusBar() {
    // Always show as configured since credentials are hardcoded
    if (isAutoAnalyzeEnabled) {
        statusBarItem.text = '$(sync~spin) AI Reviewer (Auto)';
        statusBarItem.tooltip = 'AI Code Reviewer - Auto-analyzing every 5 minutes\nClick for info';
    } else {
        statusBarItem.text = '$(circle-slash) AI Reviewer (Off)';
        statusBarItem.tooltip = 'AI Code Reviewer - Auto-analyze disabled\nClick for info';
    }
    statusBarItem.backgroundColor = undefined;
    statusBarItem.show();
}

export function deactivate() {
    stopAutoAnalyze();
    
    if (statusBarItem) {
        statusBarItem.dispose();
    }
    if (resultsPanel) {
        resultsPanel.dispose();
    }
}