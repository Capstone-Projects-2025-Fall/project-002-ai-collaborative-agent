"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.activateCodeReviewer = activateCodeReviewer;
exports.deactivate = deactivate;
const vscode = __importStar(require("vscode"));
let statusBarItem;
let resultsPanel;
let extensionContext;
let autoAnalyzeTimer;
let isAutoAnalyzeEnabled = true;
let notificationCallback;
// Change tracking
let changeLog = [];
let lastAnalysisTime = new Date();
let significantChangesCount = 0;
let fileHashes = new Map();
let editCount = new Map(); // Track edits per file
let lastEditTime = new Map();
const SUPABASE_EDGE_FUNCTION_URL = "https://ptthofpfrmhhmvmbzgxx.supabase.co/functions/v1/ai-analyze";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB0dGhvZnBmcm1oaG12bWJ6Z3h4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTgxMjIzMTUsImV4cCI6MjA3MzY5ODMxNX0.vmIQd2JlfigERJTG5tkFGpoRgqBOj0FudEvGDzNd5Ko";
// Thresholds for intervention
const SIGNIFICANT_CHANGE_THRESHOLD = 10; // Number of significant changes before analyzing
const TIME_BASED_CHECK_INTERVAL = 20; // Minutes between time-based checks
const LINES_CHANGED_THRESHOLD = 30; // Consider it significant if 20+ lines changed
function activateCodeReviewer(context, addNotification) {
    try {
        console.log('AI Code Assistant extension is now active!');
        extensionContext = context;
        notificationCallback = addNotification;
        statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
        statusBarItem.command = 'ai-code-reviewer.analyzeCode';
        context.subscriptions.push(statusBarItem);
        const analyzeCommand = vscode.commands.registerCommand('ai-code-reviewer.analyzeCode', async () => {
            await analyzeCurrentFile(true); // Force analysis
        });
        const showResultsCommand = vscode.commands.registerCommand('ai-code-reviewer.showResults', () => {
            showResultsPanel();
        });
        const configureCommand = vscode.commands.registerCommand('ai-code-reviewer.configure', async () => {
            vscode.window.showInformationMessage('AI Code Assistant is monitoring your changes...');
        });
        const toggleAutoAnalyzeCommand = vscode.commands.registerCommand('ai-code-reviewer.toggleAutoAnalyze', async () => {
            isAutoAnalyzeEnabled = !isAutoAnalyzeEnabled;
            if (isAutoAnalyzeEnabled) {
                startAutoAnalyze();
                vscode.window.showInformationMessage('Smart monitoring enabled');
            }
            else {
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
        context.subscriptions.push(analyzeCommand, showResultsCommand, configureCommand, toggleAutoAnalyzeCommand, changeListener, saveListener);
        updateStatusBar();
        if (isAutoAnalyzeEnabled) {
            startAutoAnalyze();
        }
    }
    catch (error) {
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
function logChange(filePath, changeType, linesChanged, details) {
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
function handleDocumentChange(event) {
    const filePath = event.document.uri.fsPath;
    const now = new Date();
    // Track total lines changed
    let totalLinesAffected = 0;
    let hasSignificantChange = false;
    let changeDetails = [];
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
    const editsInLastMinute = Array.from(lastEditTime.entries()).filter(([_, time]) => (now.getTime() - time.getTime()) / 1000 < 60).length;
    if (editsInLastMinute >= 100) {
        console.log(`Rapid editing detected: ${editsInLastMinute} edits in last minute`);
        analyzeCurrentFile(false, 'Rapid editing detected');
        // Reset counters
        editCount.clear();
        lastEditTime.clear();
    }
    // 3. Continuous editing in one file
    const fileEditCount = editCount.get(filePath) || 0;
    const lastEdit = lastEditTime.get(filePath);
    if (fileEditCount >= 1000 && lastEdit) {
        const minutesSinceFirstEdit = (now.getTime() - lastEdit.getTime()) / 1000 / 60;
        if (minutesSinceFirstEdit < 60) {
            console.log(`Intensive editing: ${fileEditCount} edits in ${minutesSinceFirstEdit.toFixed(1)} minutes`);
            analyzeCurrentFile(false, `Intensive work session detected`);
            editCount.set(filePath, 0);
        }
    }
}
async function handleFileSave(document) {
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
        const recentChanges = changeLog.filter(c => (now.getTime() - c.timestamp.getTime()) / 1000 / 60 < TIME_BASED_CHECK_INTERVAL);
        if (recentChanges.length > 0) {
            console.log(`Time-based check: ${recentChanges.length} changes in last ${TIME_BASED_CHECK_INTERVAL} minutes`);
            await analyzeCurrentFile(false, `Routine check: ${recentChanges.length} recent changes`);
        }
    }
    // Condition 2: Pattern detection - rapid changes
    const lastMinuteChanges = changeLog.filter(c => (now.getTime() - c.timestamp.getTime()) / 1000 / 60 < 1);
    if (lastMinuteChanges.length >= 10) {
        console.log('Rapid changes detected, analyzing...');
        await analyzeCurrentFile(false, 'Rapid editing detected');
    }
    // Condition 3: Multiple files changed
    const last5MinChanges = changeLog.filter(c => (now.getTime() - c.timestamp.getTime()) / 1000 / 60 < 5);
    const uniqueFiles = new Set(last5MinChanges.map(c => c.file));
    if (uniqueFiles.size >= 3) {
        console.log(`Multiple files changed: ${uniqueFiles.size} files`);
        await analyzeCurrentFile(false, `Changes across ${uniqueFiles.size} files`);
    }
}
async function analyzeCurrentFile(forceAnalysis = false, reason) {
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
    // Check for unsaved changes
    const hasUnsavedChanges = vscode.workspace.textDocuments.some(doc => doc.isDirty);
    const statusPrefix = hasUnsavedChanges ? '$(sync~spin) Analyzing unsaved changes' : '$(sync~spin) Analyzing';
    const statusMessage = reason ? `${statusPrefix}: ${reason}` : statusPrefix;
    vscode.window.setStatusBarMessage(statusMessage, 3000);
    try {
        const currentFilePath = editor.document.uri.fsPath;
        const folderPath = require('path').dirname(currentFilePath);
        const folderContents = await readFolderRecursively(folderPath);
        if (folderContents.length === 0) {
            vscode.window.setStatusBarMessage('$(info) No files to analyze', 3000);
            return;
        }
        // Count how many files have unsaved changes
        const unsavedCount = folderContents.filter(f => {
            const fullPath = require('path').join(folderPath, f.fileName);
            return vscode.workspace.textDocuments.some(doc => doc.uri.fsPath === fullPath && doc.isDirty);
        }).length;
        if (unsavedCount > 0) {
            console.log(`Analyzing ${unsavedCount} file(s) with unsaved changes`);
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
                changeContext: recentChangeSummary,
                unsavedFiles: unsavedCount
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
        // Parse the response to determine severity - check both old and new formats
        const hasErrors = data.message.includes('🚨 ERRORS');
        const hasWarnings = data.message.includes('⚠️ WARNINGS');
        const hasCritical = data.message.includes('🔴') &&
            (data.message.includes('CRITICAL') || data.message.includes('LOGIC ERRORS'));
        const hasImprovements = data.message.includes('🟡') &&
            (data.message.includes('IMPROVEMENTS') || data.message.includes('CODE QUALITY'));
        // Only intervene if there are issues or forced
        if (hasErrors || hasWarnings || hasCritical || hasImprovements || forceAnalysis) {
            const analysisReason = unsavedCount > 0
                ? `${reason || 'Analysis'} (${unsavedCount} unsaved file${unsavedCount > 1 ? 's' : ''})`
                : reason;
            showResultsPanel(data.message, folderContents.length, folderPath, analysisReason);
            if (hasErrors || hasCritical) {
                vscode.window.setStatusBarMessage('$(error) Issues detected - check AI Assistant', 5000);
                if (notificationCallback) {
                    notificationCallback(`AI analysis found critical issues in ${folderContents.length} file(s)`, 'error');
                }
            }
            else if (hasWarnings || hasImprovements) {
                vscode.window.setStatusBarMessage('$(warning) Warnings - check AI Assistant', 5000);
                if (notificationCallback) {
                    notificationCallback(`AI analysis found warnings in ${folderContents.length} file(s)`, 'warning');
                }
            }
            else {
                vscode.window.setStatusBarMessage('$(check) Analysis complete', 3000);
                if (notificationCallback) {
                    notificationCallback(`AI analysis complete - ${folderContents.length} file(s) analyzed`, 'success');
                }
            }
        }
        else {
            // Silently update without showing panel
            updateResultsPanel(data.message, folderContents.length, folderPath, reason);
            vscode.window.setStatusBarMessage('$(check) Looking good!', 2000);
            if (notificationCallback) {
                notificationCallback(`Code looks good - ${folderContents.length} file(s) analyzed`, 'success');
            }
        }
        // Clear old change logs after successful analysis
        changeLog = changeLog.filter(c => (new Date().getTime() - c.timestamp.getTime()) / 1000 / 60 < 10);
        updateStatusBar();
    }
    catch (error) {
        console.error('Analysis error:', error);
        vscode.window.setStatusBarMessage('$(warning) Analysis failed', 3000);
        if (notificationCallback) {
            notificationCallback(`AI analysis failed: ${error.message || 'Unknown error'}`, 'error');
        }
    }
}
function getRecentChangeSummary() {
    const now = new Date();
    const recentChanges = changeLog.filter(c => (now.getTime() - c.timestamp.getTime()) / 1000 / 60 < 10);
    if (recentChanges.length === 0)
        return '';
    const uniqueFiles = new Set(recentChanges.map(c => require('path').basename(c.file)));
    const totalLinesChanged = recentChanges.reduce((sum, c) => sum + (c.linesChanged || 0), 0);
    return `Recent activity: ${recentChanges.length} changes across ${uniqueFiles.size} file(s), ~${totalLinesChanged} lines modified`;
}
function simpleHash(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash;
    }
    return hash.toString();
}
async function readFolderRecursively(folderPath) {
    const fs = require('fs').promises;
    const path = require('path');
    const files = [];
    const codeExtensions = ['.js', '.ts', '.jsx', '.tsx', '.py', '.java', '.cpp', '.c', '.cs', '.go', '.rb', '.php', '.swift', '.kt', '.rs', '.html', '.css', '.scss', '.json', '.xml', '.yaml', '.yml', '.sql', '.sh'];
    const ignoreFolders = ['node_modules', '.git', 'dist', 'build', 'out', '.vscode', 'coverage', '.next', '__pycache__'];
    async function readDir(dirPath) {
        try {
            const entries = await fs.readdir(dirPath, { withFileTypes: true });
            for (const entry of entries) {
                const fullPath = path.join(dirPath, entry.name);
                if (entry.isDirectory()) {
                    if (!ignoreFolders.includes(entry.name)) {
                        await readDir(fullPath);
                    }
                }
                else if (entry.isFile()) {
                    const ext = path.extname(entry.name).toLowerCase();
                    if (codeExtensions.includes(ext)) {
                        try {
                            // CRITICAL FIX: Check if file is currently open in editor
                            // If so, use the unsaved content from the editor instead of disk
                            const openDoc = vscode.workspace.textDocuments.find(doc => doc.uri.fsPath === fullPath);
                            let content;
                            if (openDoc) {
                                // Use unsaved content from editor (includes unsaved changes!)
                                content = openDoc.getText();
                                console.log(`Using unsaved content for: ${entry.name}`);
                            }
                            else {
                                // Read from disk
                                content = await fs.readFile(fullPath, 'utf-8');
                            }
                            // Skip very large files (>100KB)
                            if (content.length < 100000) {
                                files.push({
                                    fileName: path.relative(folderPath, fullPath),
                                    content: content,
                                    language: ext.substring(1)
                                });
                            }
                        }
                        catch (err) {
                            console.log(`Could not read file: ${fullPath}`);
                        }
                    }
                }
            }
        }
        catch (err) {
            console.log(`Could not read directory: ${dirPath}`);
        }
    }
    await readDir(folderPath);
    return files;
}
function showChangeLogPanel() {
    const panel = vscode.window.createWebviewPanel('aiChangeLog', 'AI Assistant - Change Log', vscode.ViewColumn.Beside, {
        enableScripts: true
    });
    const now = new Date();
    const recentChanges = changeLog.slice(-20).reverse();
    let changeHtml = '<div class="change-list">';
    if (recentChanges.length === 0) {
        changeHtml += '<p style="text-align: center; color: #6f7b87;">No recent changes tracked</p>';
    }
    else {
        recentChanges.forEach(change => {
            const timeAgo = Math.floor((now.getTime() - change.timestamp.getTime()) / 1000 / 60);
            const fileName = require('path').basename(change.file);
            let icon = '✏️';
            let changeTypeText = 'Edit';
            if (change.changeType === 'save') {
                icon = '💾';
                changeTypeText = 'Save';
            }
            else if (change.changeType === 'add') {
                icon = '➕';
                changeTypeText = 'Addition';
            }
            else if (change.changeType === 'delete') {
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
                    color: #d0d0d0;
                    background-color: #212227;
                }
                h2 {
                    margin-top: 0;
                    color: #ffc82f;
                }
                .stats {
                    background: #484f57;
                    padding: 15px;
                    border-radius: 6px;
                    margin-bottom: 20px;
                    border-left: 4px solid #ffc82f;
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
                    border-bottom: 1px solid #637074;
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
                    color: #ffc82f;
                }
                .change-meta {
                    font-size: 11px;
                    color: #6f7b87;
                    margin-top: 2px;
                }
                .change-time {
                    font-size: 12px;
                    color: #6f7b87;
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
function showResultsPanel(analysisResult, fileCount, folderPath, reason) {
    if (resultsPanel) {
        resultsPanel.reveal(vscode.ViewColumn.Beside);
        if (analysisResult) {
            updateResultsPanel(analysisResult, fileCount, folderPath, reason);
        }
        return;
    }
    resultsPanel = vscode.window.createWebviewPanel('aiCodeAssistant', 'AI Code Assistant', vscode.ViewColumn.Beside, {
        enableScripts: true,
        retainContextWhenHidden: true
    });
    // Handle messages from the webview
    resultsPanel.webview.onDidReceiveMessage(async (message) => {
        switch (message.type) {
            case 'navigateToLine':
                await navigateToFileLine(message.file, message.line);
                break;
        }
    }, undefined, extensionContext.subscriptions);
    resultsPanel.onDidDispose(() => {
        resultsPanel = undefined;
    });
    if (analysisResult) {
        updateResultsPanel(analysisResult, fileCount, folderPath, reason);
    }
    else {
        resultsPanel.webview.html = getWebviewContent('', 0, '', '');
    }
}
async function navigateToFileLine(fileName, line) {
    try {
        const path = require('path');
        const fs = require('fs');
        // Get workspace folders
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders || workspaceFolders.length === 0) {
            vscode.window.showErrorMessage('No workspace folder open');
            return;
        }
        // Try to resolve the file path
        let targetFilePath;
        if (path.isAbsolute(fileName)) {
            targetFilePath = fileName;
        }
        else {
            // Search for the file in all workspace folders
            for (const folder of workspaceFolders) {
                const candidatePath = path.join(folder.uri.fsPath, fileName);
                if (fs.existsSync(candidatePath)) {
                    targetFilePath = candidatePath;
                    break;
                }
                // Also try searching recursively for the filename
                const baseName = path.basename(fileName);
                const foundPath = await findFileInWorkspace(folder.uri.fsPath, baseName);
                if (foundPath) {
                    targetFilePath = foundPath;
                    break;
                }
            }
        }
        if (!targetFilePath || !fs.existsSync(targetFilePath)) {
            vscode.window.showErrorMessage(`File not found: ${fileName}`);
            return;
        }
        // Open the file
        const document = await vscode.workspace.openTextDocument(targetFilePath);
        const textEditor = await vscode.window.showTextDocument(document, vscode.ViewColumn.One);
        // Navigate to the line (convert to 0-based index)
        const lineIndex = Math.max(0, line - 1);
        const position = new vscode.Position(lineIndex, 0);
        // Set cursor and reveal the line
        textEditor.selection = new vscode.Selection(position, position);
        textEditor.revealRange(new vscode.Range(position, position), vscode.TextEditorRevealType.InCenter);
        // Highlight the line briefly
        const decorationType = vscode.window.createTextEditorDecorationType({
            backgroundColor: 'rgba(255, 200, 47, 0.3)', // #ffc82f with opacity
            isWholeLine: true
        });
        textEditor.setDecorations(decorationType, [new vscode.Range(position, position)]);
        // Remove highlight after 2 seconds
        setTimeout(() => {
            decorationType.dispose();
        }, 2000);
        vscode.window.showInformationMessage(`Navigated to ${path.basename(fileName)}:${line}`);
    }
    catch (error) {
        console.error('Error navigating to line:', error);
        vscode.window.showErrorMessage(`Failed to navigate: ${error}`);
    }
}
async function findFileInWorkspace(folderPath, fileName) {
    const fs = require('fs').promises;
    const path = require('path');
    const ignoreFolders = ['node_modules', '.git', 'dist', 'build', 'out', '.vscode', 'coverage', '.next', '__pycache__'];
    async function searchDir(dirPath) {
        try {
            const entries = await fs.readdir(dirPath, { withFileTypes: true });
            for (const entry of entries) {
                const fullPath = path.join(dirPath, entry.name);
                if (entry.isDirectory()) {
                    if (!ignoreFolders.includes(entry.name)) {
                        const found = await searchDir(fullPath);
                        if (found)
                            return found;
                    }
                }
                else if (entry.isFile()) {
                    if (entry.name === fileName) {
                        return fullPath;
                    }
                }
            }
        }
        catch (err) {
            // Ignore errors (permission denied, etc.)
        }
        return undefined;
    }
    return await searchDir(folderPath);
}
function updateResultsPanel(analysisResult, fileCount, folderPath, reason) {
    if (resultsPanel) {
        resultsPanel.webview.html = getWebviewContent(analysisResult, fileCount, folderPath, reason);
    }
}
function getWebviewContent(analysisResult, fileCount, folderPath, reason) {
    // Check for new AI response format
    const hasCritical = analysisResult.includes('🔴') &&
        (analysisResult.includes('CRITICAL') || analysisResult.includes('LOGIC ERRORS'));
    const hasImprovements = analysisResult.includes('🟡') &&
        (analysisResult.includes('IMPROVEMENTS') || analysisResult.includes('CODE QUALITY'));
    const allGood = analysisResult.includes('✅') ||
        analysisResult.toLowerCase().includes('no logic errors') ||
        analysisResult.toLowerCase().includes('code looks solid');
    // Also check for old format for backwards compatibility
    const hasErrors = analysisResult.includes('🚨 ERRORS');
    const hasWarnings = analysisResult.includes('⚠️ WARNINGS');
    // Palette Colors
    const palette = {
        slateGray: '#6f7b87',
        darkSlate: '#484f57',
        veryDark: '#212227',
        muted: '#637074',
        yellow: '#ffc82f',
        white: '#ffffff',
        red: '#ff6b6b', // Softer red to match dark theme
        green: '#51cf66' // Softer green
    };
    let statusColor = palette.green;
    let statusText = 'All Clear';
    if (hasCritical || hasErrors) {
        statusColor = palette.red;
        statusText = 'Issues Found';
    }
    else if (hasImprovements || hasWarnings) {
        statusColor = palette.yellow;
        statusText = 'Needs Attention';
    }
    else if (allGood) {
        statusColor = palette.green;
        statusText = 'All Clear';
    }
    return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>AI Code Assistant</title>
        <style>
            :root {
                --bg-primary: ${palette.veryDark};
                --bg-secondary: ${palette.darkSlate};
                --text-primary: ${palette.white};
                --text-secondary: ${palette.slateGray};
                --accent-primary: ${palette.yellow};
                --border-color: ${palette.muted};
            }

            body {
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                line-height: 1.6;
                color: var(--text-primary);
                background-color: var(--bg-primary);
                padding: 24px;
                margin: 0;
            }
            
            .header {
                display: flex;
                align-items: center;
                gap: 15px;
                margin-bottom: 24px;
                padding-bottom: 16px;
                border-bottom: 1px solid var(--border-color);
            }
            
            .status-indicator {
                width: 14px;
                height: 14px;
                border-radius: 50%;
                background-color: ${statusColor};
                box-shadow: 0 0 10px ${statusColor}40;
                animation: pulse 2s infinite;
            }
            
            @keyframes pulse {
                0% { box-shadow: 0 0 0 0 ${statusColor}40; }
                70% { box-shadow: 0 0 0 6px ${statusColor}00; }
                100% { box-shadow: 0 0 0 0 ${statusColor}00; }
            }
            
            .header h1 {
                margin: 0;
                font-size: 24px;
                color: var(--text-primary);
                font-weight: 700;
                letter-spacing: -0.5px;
            }

            .header h1 span {
                color: var(--accent-primary);
            }
            
            .intervention-reason {
                background: rgba(255, 200, 47, 0.1);
                border-left: 3px solid var(--accent-primary);
                padding: 12px 16px;
                margin-bottom: 20px;
                font-size: 13px;
                border-radius: 4px;
                color: #e0e0e0;
            }
            
            .meta-info {
                font-size: 13px;
                color: var(--text-primary);
                margin-bottom: 24px;
                display: flex;
                flex-direction: column;
                gap: 4px;
            }

            .meta-item {
                display: flex;
                align-items: center;
                gap: 6px;
            }
            
            .analysis-container {
                background: transparent;
            }

            /* Bullet point sections */
            .analysis-section {
                margin-bottom: 24px;
            }

            .section-header {
                font-size: 16px;
                font-weight: 700;
                margin-bottom: 12px;
                padding-bottom: 8px;
                border-bottom: 2px solid var(--border-color);
                display: flex;
                align-items: center;
                gap: 8px;
                text-transform: uppercase;
                letter-spacing: 0.5px;
            }

            .section-header.critical {
                color: ${palette.red};
                border-bottom-color: ${palette.red};
            }

            .section-header.improvements {
                color: ${palette.yellow};
                border-bottom-color: ${palette.yellow};
            }

            .section-header.quick-win {
                color: #4cc9f0;
                border-bottom-color: #4cc9f0;
            }

            .issue-list {
                display: flex;
                flex-direction: column;
                gap: 12px;
                padding: 0;
                margin: 12px 0;
            }

            .issue-item {
                padding: 12px 16px 12px 40px;
                border-radius: 6px;
                background: var(--bg-secondary);
                border-left: 3px solid var(--border-color);
                position: relative;
                transition: all 0.2s ease;
                line-height: 1.8;
            }

            .issue-item:hover {
                transform: translateX(4px);
                box-shadow: 0 2px 8px rgba(0,0,0,0.2);
            }

            .issue-item.critical {
                border-left-color: ${palette.red};
                background: rgba(255, 107, 107, 0.08);
            }

            .issue-item.improvement {
                border-left-color: ${palette.yellow};
                background: rgba(255, 200, 47, 0.08);
            }

            .issue-item.quick-win {
                border-left-color: #4cc9f0;
                background: rgba(76, 201, 240, 0.08);
            }

            .issue-item::before {
                content: "●";
                position: absolute;
                left: 16px;
                top: 14px;
                font-size: 10px;
                color: var(--border-color);
            }

            .issue-item.critical::before {
                color: ${palette.red};
            }

            .issue-item.improvement::before {
                color: ${palette.yellow};
            }

            .issue-item.quick-win::before {
                color: #4cc9f0;
            }

            /* Hint styling - make it appear on second line */
            .issue-item .hint {
                display: block;
                margin-top: 6px;
                padding-left: 8px;
                font-style: italic;
                opacity: 0.9;
            }
            
            .file-reference {
                color: var(--bg-primary);
                background-color: var(--accent-primary);
                text-decoration: none;
                cursor: pointer;
                padding: 2px 8px;
                border-radius: 4px;
                font-family: 'SF Mono', Monaco, 'Cascadia Code', monospace;
                font-size: 12px;
                font-weight: 600;
                transition: all 0.2s ease;
                display: inline-block;
                margin: 0 2px;
            }
            
            .file-reference:hover {
                transform: translateY(-2px);
                box-shadow: 0 4px 8px rgba(255, 200, 47, 0.3);
            }
            
            .empty-state {
                text-align: center;
                padding: 60px 20px;
                color: var(--text-secondary);
                background: var(--bg-secondary);
                border-radius: 12px;
                border: 1px dashed var(--border-color);
            }
            
            .empty-state h2 {
                margin: 20px 0 10px 0;
                color: var(--accent-primary);
            }
            
            .timestamp {
                color: var(--text-secondary);
                font-size: 11px;
                text-align: center;
                margin-top: 30px;
                padding-top: 20px;
                border-top: 1px solid var(--border-color);
                opacity: 0.6;
            }

            .help-text {
                font-size: 12px;
                color: var(--text-primary);
                margin-bottom: 16px;
                padding: 10px 14px;
                background: var(--bg-secondary);
                border-radius: 6px;
                border-left: 3px solid var(--accent-primary);
            }

            .success-message {
                display: flex;
                align-items: center;
                justify-content: center;
                gap: 10px;
                padding: 24px;
                background: rgba(81, 207, 102, 0.1);
                border-radius: 8px;
                border: 1px solid ${palette.green};
                color: ${palette.green};
                font-size: 16px;
                font-weight: 600;
                text-align: center;
            }

            .result-content {
                font-size: 14px;
                line-height: 1.8;
            }
        </style>
    </head>
    <body>
        <div class="header">
            <div class="status-indicator"></div>
            <h1>AI <span>Code</span> Analysis</h1>
        </div>
        
        ${analysisResult ? `
            ${reason ? `
                <div class="intervention-reason">
                    <strong>Trigger:</strong> ${escapeHtml(reason)}
                </div>
            ` : ''}
            
            ${folderPath || fileCount ? `
                <div class="meta-info">
                    ${folderPath ? `<div class="meta-item"><span>📁</span> ${escapeHtml(folderPath)}</div>` : ''}
                    ${fileCount ? `<div class="meta-item"><span>📄</span> Analyzed ${fileCount} file${fileCount !== 1 ? 's' : ''}</div>` : ''}
                </div>
            ` : ''}
            
            <div class="help-text">
                💡 Click any file reference (e.g. <span style="color: var(--accent-primary); font-family: monospace;">filename.ts:42</span>) to jump to code
            </div>
            
            <div class="analysis-container">
                ${formatAnalysisResult(analysisResult)}
            </div>
            
            <div class="timestamp">
                Analyzed at ${new Date().toLocaleTimeString()}
            </div>
        ` : `
            <div class="empty-state">
                <h2>👀 Monitoring Active</h2>
                <p>I'm watching your code for significant changes.</p>
                <div style="margin-top: 30px; text-align: left; font-size: 13px; max-width: 300px; margin-left: auto; margin-right: auto;">
                    <div style="margin-bottom: 8px;"><strong>Triggers:</strong></div>
                    <div style="display: flex; gap: 8px; margin-bottom: 6px;">
                        <span style="color: var(--accent-primary);">•</span> ${SIGNIFICANT_CHANGE_THRESHOLD}+ significant edits
                    </div>
                    <div style="display: flex; gap: 8px; margin-bottom: 6px;">
                        <span style="color: var(--accent-primary);">•</span> Rapid editing (15+/min)
                    </div>
                    <div style="display: flex; gap: 8px; margin-bottom: 6px;">
                        <span style="color: var(--accent-primary);">•</span> Large unsaved blocks
                    </div>
                </div>
            </div>
        `}

        <script>
            const vscode = acquireVsCodeApi();
            
            // Add click handlers to all file references
            document.addEventListener('DOMContentLoaded', () => {
                document.querySelectorAll('.file-reference').forEach(element => {
                    element.addEventListener('click', () => {
                        const file = element.getAttribute('data-file');
                        const line = parseInt(element.getAttribute('data-line'));
                        
                        if (file && line) {
                            vscode.postMessage({
                                type: 'navigateToLine',
                                file: file,
                                line: line
                            });
                        }
                    });
                });
            });
        </script>
    </body>
    </html>`;
}
function escapeHtml(text) {
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}
function formatAnalysisResult(result) {
    let formatted = escapeHtml(result);
    // Split into lines for processing
    const lines = formatted.split('\n');
    let output = '';
    let currentSection = '';
    let inList = false;
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        // Detect section headers
        if (line.match(/^🔴\s*(CRITICAL|LOGIC ERRORS)/i)) {
            if (inList) {
                output += '</div></div>';
                inList = false;
            }
            output += '<div class="analysis-section">';
            output += '<div class="section-header critical">🔴 Critical Issues</div>';
            output += '<div class="issue-list">';
            currentSection = 'critical';
            inList = true;
            continue;
        }
        if (line.match(/^🟡\s*(IMPROVEMENTS|CODE QUALITY)/i)) {
            if (inList) {
                output += '</div></div>';
                inList = false;
            }
            output += '<div class="analysis-section">';
            output += '<div class="section-header improvements">🟡 Improvements</div>';
            output += '<div class="issue-list">';
            currentSection = 'improvements';
            inList = true;
            continue;
        }
        if (line.match(/^💡\s*QUICK WIN/i)) {
            if (inList) {
                output += '</div></div>';
                inList = false;
            }
            output += '<div class="analysis-section">';
            output += '<div class="section-header quick-win">💡 Quick Win</div>';
            output += '<div class="issue-list">';
            currentSection = 'quick-win';
            inList = true;
            continue;
        }
        if (line.match(/^✅/i)) {
            if (inList) {
                output += '</div></div>';
                inList = false;
            }
            output += '<div class="success-message">✅ ' + line.substring(line.indexOf('✅') + 1).trim() + '</div>';
            continue;
        }
        // Process list items (lines starting with - or •)
        if (inList && line.match(/^[-•]\s/)) {
            let content = line.substring(2).trim();
            // Check if the content has "Hint:" and split it
            const hintMatch = content.match(/^(.*?)(\s+Hint:\s+.*)$/i);
            if (hintMatch) {
                const mainText = hintMatch[1].trim();
                const hintText = hintMatch[2].trim();
                content = `${mainText}<span class="hint">${hintText}</span>`;
            }
            const className = currentSection === 'critical' ? 'critical' :
                currentSection === 'improvements' ? 'improvement' :
                    'quick-win';
            output += `<div class="issue-item ${className}">${content}</div>`;
            continue;
        }
        // Regular text
        if (line.length > 0) {
            if (inList) {
                output += '</div></div>';
                inList = false;
            }
            output += '<div style="margin-bottom: 8px;">' + line + '</div>';
        }
    }
    // Close any open lists
    if (inList) {
        output += '</div></div>';
    }
    // Make file references clickable
    output = output.replace(/\b([\w-]+\.[\w]+):(\d+)\b/g, '<span class="file-reference" data-file="$1" data-line="$2">$1:$2</span>');
    output = output.replace(/\bin\s+([\w-]+\.[\w]+)(?::|\s+line\s+)(\d+)\b/gi, 'in <span class="file-reference" data-file="$1" data-line="$2">$1:$2</span>');
    output = output.replace(/\bline\s+(\d+)\s+(?:in|of)\s+([\w-]+\.[\w]+)\b/gi, '<span class="file-reference" data-file="$2" data-line="$1">line $1 in $2</span>');
    return `<div class="result-content">${output}</div>`;
}
async function updateStatusBar() {
    if (isAutoAnalyzeEnabled) {
        statusBarItem.text = '$(eye) Pallas Watch';
        statusBarItem.tooltip = 'Monitoring for changes\nClick to run AI analysis';
    }
    else {
        statusBarItem.text = '$(eye-closed) Pallas Watch';
        statusBarItem.tooltip = 'Monitoring disabled\nClick to run AI analysis';
    }
    statusBarItem.backgroundColor = undefined;
    statusBarItem.show();
}
function deactivate() {
    stopAutoAnalyze();
    if (statusBarItem) {
        statusBarItem.dispose();
    }
    if (resultsPanel) {
        resultsPanel.dispose();
    }
}
//# sourceMappingURL=ai_analyze.js.map