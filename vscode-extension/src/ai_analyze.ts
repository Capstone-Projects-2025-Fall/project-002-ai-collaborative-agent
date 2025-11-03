import * as vscode from 'vscode';

let statusBarItem: vscode.StatusBarItem;
let resultsPanel: vscode.WebviewPanel | undefined;
let extensionContext: vscode.ExtensionContext;
let autoAnalyzeTimer: NodeJS.Timeout | undefined;
let isAutoAnalyzeEnabled = true;

// Change tracking
let changeLog: Array<{
    file: string;
    timestamp: Date;
    changeType: 'save' | 'edit' | 'delete' | 'add';
    linesChanged?: number;
    details?: string;
}> = [];
let lastAnalysisTime: Date = new Date();
let significantChangesCount = 0;
let fileHashes: Map<string, string> = new Map();
let editCount: Map<string, number> = new Map(); // Track edits per file
let lastEditTime: Map<string, Date> = new Map();

const SUPABASE_EDGE_FUNCTION_URL="https://ptthofpfrmhhmvmbzgxx.supabase.co/functions/v1/ai-analyze";
const SUPABASE_ANON_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB0dGhvZnBmcm1oaG12bWJ6Z3h4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTgxMjIzMTUsImV4cCI6MjA3MzY5ODMxNX0.vmIQd2JlfigERJTG5tkFGpoRgqBOj0FudEvGDzNd5Ko"

// Thresholds for intervention
const SIGNIFICANT_CHANGE_THRESHOLD = 3; // Number of significant changes before analyzing
const TIME_BASED_CHECK_INTERVAL = 10; // Minutes between time-based checks
const LINES_CHANGED_THRESHOLD = 20; // Consider it significant if 20+ lines changed

export function activateCodeReviewer(context: vscode.ExtensionContext) {
    try {
        console.log('AI Code Assistant extension is now active!');
        
        extensionContext = context;

        statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
        statusBarItem.command = 'ai-code-reviewer.showChangeLog';
        context.subscriptions.push(statusBarItem);

        const analyzeCommand = vscode.commands.registerCommand('ai-code-reviewer.analyzeCode', async () => {
            await analyzeCurrentFile(true); // Force analysis
        });

        const showResultsCommand = vscode.commands.registerCommand('ai-code-reviewer.showResults', () => {
            showResultsPanel();
        });

        const showChangeLogCommand = vscode.commands.registerCommand('ai-code-reviewer.showChangeLog', () => {
            showChangeLogPanel();
        });

        const configureCommand = vscode.commands.registerCommand('ai-code-reviewer.configure', async () => {
            vscode.window.showInformationMessage('AI Code Assistant is monitoring your changes...');
        });

        const toggleAutoAnalyzeCommand = vscode.commands.registerCommand('ai-code-reviewer.toggleAutoAnalyze', async () => {
            isAutoAnalyzeEnabled = !isAutoAnalyzeEnabled;
            if (isAutoAnalyzeEnabled) {
                startAutoAnalyze();
                vscode.window.showInformationMessage('Smart monitoring enabled');
            } else {
                stopAutoAnalyze();
                vscode.window.showInformationMessage('Smart monitoring disabled');
            }
            updateStatusBar();
        });

        // Listen for document changes (while editing)
        const changeListener = vscode.workspace.onDidChangeTextDocument((event) => {
            if (isAutoAnalyzeEnabled && event.document === vscode.window.activeTextEditor?.document) {
                handleDocumentChange(event);
            }
        });

        // Listen for file saves
        const saveListener = vscode.workspace.onDidSaveTextDocument((document) => {
            if (isAutoAnalyzeEnabled && vscode.window.activeTextEditor?.document === document) {
                handleFileSave(document);
            }
        });

        context.subscriptions.push(
            analyzeCommand,
            showResultsCommand,
            showChangeLogCommand,
            configureCommand,
            toggleAutoAnalyzeCommand,
            changeListener,
            saveListener
        );

        updateStatusBar();
        
        if (isAutoAnalyzeEnabled) {
            startAutoAnalyze();
        }
    } catch (error) {
        console.error('Error activating Code Assistant:', error);
        vscode.window.showErrorMessage('Failed to activate Code Assistant: ' + error);
    }
}

function startAutoAnalyze() {
    stopAutoAnalyze();
    
    // Check every minute to see if we should intervene
    const intervalMs = 60 * 1000; // 1 minute
    
    autoAnalyzeTimer = setInterval(() => {
        checkIfShouldIntervene();
        cleanupOldEditCounts();
    }, intervalMs);
}

function cleanupOldEditCounts() {
    const now = new Date();
    const staleThreshold = 10 * 60 * 1000; // 10 minutes
    
    // Remove edit counts for files that haven't been edited in 10 minutes
    for (const [filePath, lastEdit] of lastEditTime.entries()) {
        if (now.getTime() - lastEdit.getTime() > staleThreshold) {
            editCount.delete(filePath);
            lastEditTime.delete(filePath);
        }
    }
}

function stopAutoAnalyze() {
    if (autoAnalyzeTimer) {
        clearInterval(autoAnalyzeTimer);
        autoAnalyzeTimer = undefined;
    }
}

function logChange(filePath: string, changeType: 'save' | 'edit' | 'delete' | 'add', linesChanged?: number, details?: string) {
    changeLog.push({
        file: filePath,
        timestamp: new Date(),
        changeType,
        linesChanged,
        details
    });

    // Keep only last 100 changes
    if (changeLog.length > 100) {
        changeLog = changeLog.slice(-100);
    }

    updateStatusBar();
}

function handleDocumentChange(event: vscode.TextDocumentChangeEvent) {
    const filePath = event.document.uri.fsPath;
    const now = new Date();
    
    // Track total lines changed
    let totalLinesAffected = 0;
    let hasSignificantChange = false;
    let changeDetails: string[] = [];

    event.contentChanges.forEach(change => {
        const linesAdded = change.text.split('\n').length - 1;
        const linesRemoved = change.range.end.line - change.range.start.line;
        const netChange = Math.abs(linesAdded - linesRemoved);
        
        totalLinesAffected += netChange;

        // Detect types of changes
        if (change.text.includes('function') || change.text.includes('const ') || change.text.includes('class ')) {
            changeDetails.push('new code structure');
            hasSignificantChange = true;
        }
        if (change.rangeLength > 100) {
            changeDetails.push('large deletion');
            hasSignificantChange = true;
        }
        if (change.text.length > 100) {
            changeDetails.push('large addition');
            hasSignificantChange = true;
        }
    });

    // Track edit frequency for this file
    const currentCount = editCount.get(filePath) || 0;
    editCount.set(filePath, currentCount + 1);
    lastEditTime.set(filePath, now);

    // Log the change
    const changeType = totalLinesAffected > 0 ? (event.contentChanges[0].text ? 'add' : 'delete') : 'edit';
    logChange(filePath, changeType, totalLinesAffected, changeDetails.join(', '));

    // Check for intervention triggers (without saving)
    
    // 1. Large unsaved change
    if (totalLinesAffected >= 30) {
        console.log(`Large edit detected: ${totalLinesAffected} lines`);
        significantChangesCount++;
        
        if (significantChangesCount >= 2) {
            analyzeCurrentFile(false, `Large unsaved changes: ${totalLinesAffected} lines`);
            significantChangesCount = 0;
            editCount.set(filePath, 0);
        }
    }

    // 2. Rapid editing (many small changes quickly)
    const editsInLastMinute = Array.from(lastEditTime.entries()).filter(([_, time]) => 
        (now.getTime() - time.getTime()) / 1000 < 60
    ).length;

    if (editsInLastMinute >= 15) {
        console.log(`Rapid editing detected: ${editsInLastMinute} edits in last minute`);
        analyzeCurrentFile(false, 'Rapid editing detected');
        // Reset counters
        editCount.clear();
        lastEditTime.clear();
    }

    // 3. Continuous editing in one file
    const fileEditCount = editCount.get(filePath) || 0;
    const lastEdit = lastEditTime.get(filePath);
    
    if (fileEditCount >= 25 && lastEdit) {
        const minutesSinceFirstEdit = (now.getTime() - lastEdit.getTime()) / 1000 / 60;
        if (minutesSinceFirstEdit < 5) {
            console.log(`Intensive editing: ${fileEditCount} edits in ${minutesSinceFirstEdit.toFixed(1)} minutes`);
            analyzeCurrentFile(false, `Intensive work session detected`);
            editCount.set(filePath, 0);
        }
    }
}

async function handleFileSave(document: vscode.TextDocument) {
    const filePath = document.uri.fsPath;
    const content = document.getText();
    const newHash = simpleHash(content);
    const oldHash = fileHashes.get(filePath);

    // Calculate how much changed
    let linesChanged = 0;
    if (oldHash && oldHash !== newHash) {
        const lines = content.split('\n').length;
        linesChanged = Math.abs(lines - (parseInt(oldHash.split('-')[1]) || 0));
    }

    fileHashes.set(filePath, `${newHash}-${content.split('\n').length}`);
    
    logChange(filePath, 'save', linesChanged);

    // Check if this is a significant change
    if (linesChanged >= LINES_CHANGED_THRESHOLD) {
        significantChangesCount++;
        console.log(`Significant change detected: ${linesChanged} lines changed. Count: ${significantChangesCount}`);
    }

    // Immediate intervention if significant changes threshold reached
    if (significantChangesCount >= SIGNIFICANT_CHANGE_THRESHOLD) {
        console.log('Threshold reached, analyzing now...');
        await analyzeCurrentFile(false, 'Multiple significant changes detected');
        significantChangesCount = 0; // Reset counter
    }
}

async function checkIfShouldIntervene() {
    const now = new Date();
    const minutesSinceLastAnalysis = (now.getTime() - lastAnalysisTime.getTime()) / 1000 / 60;

    // Condition 1: Time-based check (every X minutes if there are changes)
    if (minutesSinceLastAnalysis >= TIME_BASED_CHECK_INTERVAL && changeLog.length > 0) {
        const recentChanges = changeLog.filter(c => 
            (now.getTime() - c.timestamp.getTime()) / 1000 / 60 < TIME_BASED_CHECK_INTERVAL
        );
        
        if (recentChanges.length > 0) {
            console.log(`Time-based check: ${recentChanges.length} changes in last ${TIME_BASED_CHECK_INTERVAL} minutes`);
            await analyzeCurrentFile(false, `Routine check: ${recentChanges.length} recent changes`);
        }
    }

    // Condition 2: Pattern detection - rapid changes
    const lastMinuteChanges = changeLog.filter(c => 
        (now.getTime() - c.timestamp.getTime()) / 1000 / 60 < 1
    );
    
    if (lastMinuteChanges.length >= 10) {
        console.log('Rapid changes detected, analyzing...');
        await analyzeCurrentFile(false, 'Rapid editing detected');
    }

    // Condition 3: Multiple files changed
    const last5MinChanges = changeLog.filter(c => 
        (now.getTime() - c.timestamp.getTime()) / 1000 / 60 < 5
    );
    const uniqueFiles = new Set(last5MinChanges.map(c => c.file));
    
    if (uniqueFiles.size >= 3) {
        console.log(`Multiple files changed: ${uniqueFiles.size} files`);
        await analyzeCurrentFile(false, `Changes across ${uniqueFiles.size} files`);
    }
}

async function analyzeCurrentFile(forceAnalysis: boolean = false, reason?: string) {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        return;
    }

    const apiEndpoint = SUPABASE_EDGE_FUNCTION_URL;
    const apiKey = SUPABASE_ANON_KEY;

    if (!apiEndpoint || !apiKey) {
        vscode.window.showErrorMessage('API credentials missing.');
        return;
    }

    // Show why we're analyzing
    const statusMessage = reason ? `$(sync~spin) Analyzing: ${reason}` : '$(sync~spin) Analyzing...';
    vscode.window.setStatusBarMessage(statusMessage, 3000);

    try {
        const currentFilePath = editor.document.uri.fsPath;
        const folderPath = require('path').dirname(currentFilePath);
        
        const folderContents = await readFolderRecursively(folderPath);
        
        if (folderContents.length === 0) {
            vscode.window.setStatusBarMessage('$(info) No files to analyze', 3000);
            return;
        }

        // Include change log context in the analysis
        const recentChangeSummary = getRecentChangeSummary();

        const response = await fetch(apiEndpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`,
                'apikey': apiKey
            },
            body: JSON.stringify({
                files: folderContents,
                folderPath: folderPath,
                currentFile: currentFilePath,
                changeContext: recentChangeSummary
            })
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(`API Error ${response.status}: ${errorData.error || 'Unknown error'}`);
        }

        const data = await response.json();

        // Update last analysis time
        lastAnalysisTime = new Date();
        significantChangesCount = 0; // Reset counter

        // Parse the response to determine severity
        const hasErrors = data.message.includes('🚨 ERRORS');
        const hasWarnings = data.message.includes('⚠️ WARNINGS');
        
        // Only intervene if there are issues or forced
        if (hasErrors || hasWarnings || forceAnalysis) {
            showResultsPanel(data.message, folderContents.length, folderPath, reason);
            if (hasErrors) {
                vscode.window.setStatusBarMessage('$(error) Issues detected - check AI Assistant', 5000);
            } else if (hasWarnings) {
                vscode.window.setStatusBarMessage('$(warning) Warnings - check AI Assistant', 5000);
            } else {
                vscode.window.setStatusBarMessage('$(check) Analysis complete', 3000);
            }
        } else {
            // Silently update without showing panel
            updateResultsPanel(data.message, folderContents.length, folderPath, reason);
            vscode.window.setStatusBarMessage('$(check) Looking good!', 2000);
        }

        // Clear old change logs after successful analysis
        changeLog = changeLog.filter(c => 
            (new Date().getTime() - c.timestamp.getTime()) / 1000 / 60 < 10
        );

        updateStatusBar();

    } catch (error: any) {
        console.error('Analysis error:', error);
        vscode.window.setStatusBarMessage('$(warning) Analysis failed', 3000);
    }
}

function getRecentChangeSummary(): string {
    const now = new Date();
    const recentChanges = changeLog.filter(c => 
        (now.getTime() - c.timestamp.getTime()) / 1000 / 60 < 10
    );

    if (recentChanges.length === 0) return '';

    const uniqueFiles = new Set(recentChanges.map(c => require('path').basename(c.file)));
    const totalLinesChanged = recentChanges.reduce((sum, c) => sum + (c.linesChanged || 0), 0);

    return `Recent activity: ${recentChanges.length} changes across ${uniqueFiles.size} file(s), ~${totalLinesChanged} lines modified`;
}

function simpleHash(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash;
    }
    return hash.toString();
}

async function readFolderRecursively(folderPath: string): Promise<Array<{fileName: string, content: string, language: string}>> {
    const fs = require('fs').promises;
    const path = require('path');
    const files: Array<{fileName: string, content: string, language: string}> = [];
    
    const codeExtensions = ['.js', '.ts', '.jsx', '.tsx', '.py', '.java', '.cpp', '.c', '.cs', '.go', '.rb', '.php', '.swift', '.kt', '.rs', '.html', '.css', '.scss', '.json', '.xml', '.yaml', '.yml', '.sql', '.sh'];
    const ignoreFolders = ['node_modules', '.git', 'dist', 'build', 'out', '.vscode', 'coverage', '.next', '__pycache__'];
    
    async function readDir(dirPath: string) {
        try {
            const entries = await fs.readdir(dirPath, { withFileTypes: true });
            
            for (const entry of entries) {
                const fullPath = path.join(dirPath, entry.name);
                
                if (entry.isDirectory()) {
                    if (!ignoreFolders.includes(entry.name)) {
                        await readDir(fullPath);
                    }
                } else if (entry.isFile()) {
                    const ext = path.extname(entry.name).toLowerCase();
                    
                    if (codeExtensions.includes(ext)) {
                        try {
                            const content = await fs.readFile(fullPath, 'utf-8');
                            
                            if (content.length < 100000) {
                                files.push({
                                    fileName: path.relative(folderPath, fullPath),
                                    content: content,
                                    language: ext.substring(1)
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

function showChangeLogPanel() {
    const panel = vscode.window.createWebviewPanel(
        'aiChangeLog',
        'AI Assistant - Change Log',
        vscode.ViewColumn.Beside,
        {
            enableScripts: true
        }
    );

    const now = new Date();
    const recentChanges = changeLog.slice(-20).reverse();

    let changeHtml = '<div class="change-list">';
    if (recentChanges.length === 0) {
        changeHtml += '<p style="text-align: center; color: var(--vscode-descriptionForeground);">No recent changes tracked</p>';
    } else {
        recentChanges.forEach(change => {
            const timeAgo = Math.floor((now.getTime() - change.timestamp.getTime()) / 1000 / 60);
            const fileName = require('path').basename(change.file);
            
            let icon = '✏️';
            let changeTypeText = 'Edit';
            if (change.changeType === 'save') {
                icon = '💾';
                changeTypeText = 'Save';
            } else if (change.changeType === 'add') {
                icon = '➕';
                changeTypeText = 'Addition';
            } else if (change.changeType === 'delete') {
                icon = '➖';
                changeTypeText = 'Deletion';
            }
            
            changeHtml += `
                <div class="change-item">
                    <span class="change-icon">${icon}</span>
                    <div class="change-details">
                        <div class="change-file">${escapeHtml(fileName)}</div>
                        <div class="change-meta">
                            ${changeTypeText}
                            ${change.linesChanged ? ` • ${change.linesChanged} lines` : ''}
                            ${change.details ? ` • ${escapeHtml(change.details)}` : ''}
                        </div>
                    </div>
                    <span class="change-time">${timeAgo}m ago</span>
                </div>
            `;
        });
    }
    changeHtml += '</div>';

    panel.webview.html = `
        <!DOCTYPE html>
        <html>
        <head>
            <style>
                body {
                    font-family: var(--vscode-font-family);
                    padding: 20px;
                    color: var(--vscode-foreground);
                }
                h2 {
                    margin-top: 0;
                }
                .stats {
                    background: var(--vscode-textCodeBlock-background);
                    padding: 15px;
                    border-radius: 6px;
                    margin-bottom: 20px;
                }
                .stat-item {
                    margin: 5px 0;
                }
                .change-list {
                    margin-top: 20px;
                }
                .change-item {
                    display: grid;
                    grid-template-columns: 30px 1fr auto;
                    align-items: center;
                    gap: 10px;
                    padding: 10px 8px;
                    border-bottom: 1px solid var(--vscode-panel-border);
                }
                .change-icon {
                    font-size: 18px;
                }
                .change-details {
                    min-width: 0;
                }
                .change-file {
                    font-weight: 500;
                    white-space: nowrap;
                    overflow: hidden;
                    text-overflow: ellipsis;
                }
                .change-meta {
                    font-size: 11px;
                    color: var(--vscode-descriptionForeground);
                    margin-top: 2px;
                }
                .change-time {
                    font-size: 12px;
                    color: var(--vscode-descriptionForeground);
                    white-space: nowrap;
                }
            </style>
        </head>
        <body>
            <h2>📊 Change Monitoring</h2>
            <div class="stats">
                <div class="stat-item">📝 Total changes tracked: <strong>${changeLog.length}</strong></div>
                <div class="stat-item">✏️ Unsaved edits detected: <strong>${Array.from(editCount.values()).reduce((a, b) => a + b, 0)}</strong></div>
                <div class="stat-item">⚡ Significant changes: <strong>${significantChangesCount}</strong></div>
                <div class="stat-item">🔍 Last analysis: <strong>${Math.floor((now.getTime() - lastAnalysisTime.getTime()) / 1000 / 60)} minutes ago</strong></div>
            </div>
            <h3>Recent Changes</h3>
            ${changeHtml}
        </body>
        </html>
    `;
}

function showResultsPanel(analysisResult?: string, fileCount?: number, folderPath?: string, reason?: string) {
    if (resultsPanel) {
        resultsPanel.reveal(vscode.ViewColumn.Beside);
        if (analysisResult) {
            updateResultsPanel(analysisResult, fileCount, folderPath, reason);
        }
        return;
    }

    resultsPanel = vscode.window.createWebviewPanel(
        'aiCodeAssistant',
        'AI Code Assistant',
        vscode.ViewColumn.Beside,
        {
            enableScripts: true,
            retainContextWhenHidden: true
        }
    );

    resultsPanel.onDidDispose(() => {
        resultsPanel = undefined;
    });

    if (analysisResult) {
        updateResultsPanel(analysisResult, fileCount, folderPath, reason);
    } else {
        resultsPanel.webview.html = getWebviewContent('', 0, '', '');
    }
}

function updateResultsPanel(analysisResult: string, fileCount?: number, folderPath?: string, reason?: string) {
    if (resultsPanel) {
        resultsPanel.webview.html = getWebviewContent(analysisResult, fileCount, folderPath, reason);
    }
}

function getWebviewContent(analysisResult: string, fileCount?: number, folderPath?: string, reason?: string): string {
    const hasErrors = analysisResult.includes('🚨 ERRORS');
    const hasWarnings = analysisResult.includes('⚠️ WARNINGS');
    const allGood = analysisResult.includes('✅');
    
    let statusColor = '#27ae60';
    let statusText = 'All Clear';
    
    if (hasErrors) {
        statusColor = '#e74c3c';
        statusText = 'Issues Found';
    } else if (hasWarnings) {
        statusColor = '#f39c12';
        statusText = 'Needs Attention';
    }
    
    return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>AI Code Assistant</title>
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
                display: flex;
                align-items: center;
                gap: 15px;
                border-bottom: 2px solid ${statusColor};
                padding-bottom: 15px;
                margin-bottom: 20px;
            }
            
            .status-indicator {
                width: 12px;
                height: 12px;
                border-radius: 50%;
                background-color: ${statusColor};
                animation: pulse 2s infinite;
            }
            
            @keyframes pulse {
                0%, 100% { opacity: 1; }
                50% { opacity: 0.5; }
            }
            
            .header h1 {
                margin: 0;
                font-size: 22px;
                color: ${statusColor};
                font-weight: 600;
            }
            
            .intervention-reason {
                background: var(--vscode-inputValidation-infoBackground);
                border-left: 3px solid var(--vscode-inputValidation-infoBorder);
                padding: 10px 15px;
                margin-bottom: 15px;
                font-size: 13px;
                border-radius: 4px;
            }
            
            .meta-info {
                font-size: 13px;
                color: var(--vscode-descriptionForeground);
                margin-bottom: 20px;
                padding: 10px;
                background: var(--vscode-textCodeBlock-background);
                border-radius: 4px;
            }
            
            .analysis-content {
                background: var(--vscode-editor-background);
                border: 1px solid var(--vscode-panel-border);
                border-radius: 6px;
                padding: 20px;
                margin: 15px 0;
                white-space: pre-wrap;
                font-family: var(--vscode-editor-font-family);
                font-size: 14px;
                line-height: 1.7;
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
                font-size: 11px;
                text-align: right;
                margin-top: 15px;
                padding-top: 10px;
                border-top: 1px solid var(--vscode-panel-border);
            }
            
            .analysis-content strong {
                color: ${statusColor};
            }
        </style>
    </head>
    <body>
        <div class="header">
            <div class="status-indicator"></div>
            <h1>${statusText}</h1>
        </div>
        
        ${analysisResult ? `
            ${reason ? `
                <div class="intervention-reason">
                    🔍 <strong>Intervention reason:</strong> ${escapeHtml(reason)}
                </div>
            ` : ''}
            
            ${folderPath || fileCount ? `
                <div class="meta-info">
                    ${folderPath ? `📁 ${escapeHtml(folderPath)}<br>` : ''}
                    ${fileCount ? `📄 Analyzed ${fileCount} file${fileCount !== 1 ? 's' : ''}` : ''}
                </div>
            ` : ''}
            
            <div class="analysis-content">${formatAnalysisResult(analysisResult)}</div>
            
            <div class="timestamp">
                Analyzed at ${new Date().toLocaleString()}
            </div>
        ` : `
            <div class="empty-state">
                <h2>👀 Monitoring Your Code</h2>
                <p>I'm watching for changes and will intervene when needed.</p>
                <p style="font-size: 12px; margin-top: 20px;">
                    I'll alert you when I detect:<br>
                    • ${SIGNIFICANT_CHANGE_THRESHOLD}+ significant changes (saved or unsaved)<br>
                    • 15+ rapid edits in one minute<br>
                    • 30+ lines changed without saving<br>
                    • 25+ edits in one file within 5 minutes<br>
                    • Changes across multiple files<br>
                    • Or every ${TIME_BASED_CHECK_INTERVAL} minutes if there's activity
                </p>
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
    const recentChanges = changeLog.filter(c => 
        (new Date().getTime() - c.timestamp.getTime()) / 1000 / 60 < 5
    );

    if (isAutoAnalyzeEnabled) {
        if (recentChanges.length > 0) {
            statusBarItem.text = `$(eye) AI Assistant (${recentChanges.length})`;
            statusBarItem.tooltip = `Monitoring: ${recentChanges.length} recent changes\nClick to view change log`;
        } else {
            statusBarItem.text = '$(eye) AI Assistant';
            statusBarItem.tooltip = 'Monitoring for changes\nClick to view change log';
        }
    } else {
        statusBarItem.text = '$(eye-closed) AI Assistant';
        statusBarItem.tooltip = 'Monitoring disabled\nClick to view status';
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