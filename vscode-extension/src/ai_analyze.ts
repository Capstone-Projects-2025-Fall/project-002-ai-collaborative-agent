import * as vscode from 'vscode';
import fetch from 'node-fetch';

let statusBarItem: vscode.StatusBarItem;
let resultsPanel: vscode.WebviewPanel | undefined;
let extensionContext: vscode.ExtensionContext;
let autoAnalyzeTimer: NodeJS.Timeout | undefined;
let isAutoAnalyzeEnabled = true;

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

        // Opens setup dialog
        const configureCommand = vscode.commands.registerCommand('ai-code-reviewer.configure', async () => {
            await configureApiEndpoint();
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

    const document = editor.document;
    const fullCode = document.getText();
    
    // Skip if file is empty or too small
    if (fullCode.trim().length < 10) {
        console.log('File too small to analyze');
        return;
    }

    const config = vscode.workspace.getConfiguration('aiCodeReviewer');
    const apiEndpoint = config.get<string>('apiEndpoint');
    
    // Get API key from secure storage
    const apiKey = await extensionContext.secrets.get('supabaseApiKey');

    if (!apiEndpoint || !apiKey) {
        console.log('API not configured, skipping auto-analyze');
        return;
    }

    // Show a subtle notification that analysis is happening
    vscode.window.setStatusBarMessage('$(sync~spin) Analyzing code...', 3000);

    try {
        const headers: Record<string, string> = {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`,
            'apikey': apiKey
        };

        const response = await fetch(apiEndpoint, {
            method: 'POST',
            headers: headers,
            body: JSON.stringify({
                code: fullCode,
                fileName: document.fileName,
                language: document.languageId
            })
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(`API Error ${response.status}: ${errorData.error || 'Unknown error'}`);
        }

        const data = await response.json();

        // Update results panel silently (don't force it to show)
        showResultsPanel(data.message, fullCode, document.fileName);

        // Show subtle completion message
        vscode.window.setStatusBarMessage('$(check) Analysis complete', 3000);

    } catch (error: any) {
        console.error('Auto-analysis error:', error);
        // Don't show intrusive error messages for auto-analyze
        vscode.window.setStatusBarMessage('$(warning) Analysis failed', 3000);
    }
}

function showResultsPanel(analysisResult?: string, originalCode?: string, fileName?: string) {
    // Brings the panel out
    if (resultsPanel) {
        // Update the results without revealing (less intrusive)
        if (analysisResult) {
            updateResultsPanel(analysisResult, originalCode || '', fileName);
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
        updateResultsPanel(analysisResult, originalCode || '', fileName);
    } else {
        resultsPanel.webview.html = getWebviewContent('', '', '');
    }
}

function updateResultsPanel(analysisResult: string, originalCode: string, fileName?: string) {
    if (resultsPanel) {
        resultsPanel.webview.html = getWebviewContent(analysisResult, originalCode, fileName);
    }
}

function getWebviewContent(analysisResult: string, originalCode: string, fileName?: string): string {
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

            .file-name {
                font-size: 14px;
                color: var(--vscode-descriptionForeground);
                margin-top: 5px;
            }
            
            .code-section {
                background: var(--vscode-textCodeBlock-background);
                border: 1px solid var(--vscode-panel-border);
                border-radius: 8px;
                padding: 15px;
                margin: 15px 0;
                font-family: var(--vscode-editor-font-family);
                font-size: var(--vscode-editor-font-size);
            }
            
            .code-section h3 {
                margin: 0 0 10px 0;
                color: var(--vscode-textLink-foreground);
                font-size: 16px;
            }
            
            .code-content {
                white-space: pre-wrap;
                word-wrap: break-word;
                background: var(--vscode-editor-background);
                border: 1px solid var(--vscode-input-border);
                border-radius: 4px;
                padding: 12px;
                max-height: 400px;
                overflow-y: auto;
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
                AI Code Review Results
                <span class="auto-analyze-badge">Auto-Analyzed</span>
            </h1>
            ${fileName ? `<div class="file-name">${escapeHtml(fileName)}</div>` : ''}
        </div>
        
        ${analysisResult ? `
            <div class="analysis-section">
                <h3>Analysis Results</h3>
                <div class="analysis-content">${formatAnalysisResult(analysisResult)}</div>
            </div>
            
            <div class="code-section">
                <h3>Analyzed Code</h3>
                <div class="code-content">${escapeHtml(originalCode)}</div>
            </div>
            
            <div class="timestamp">
                Analysis completed at ${new Date().toLocaleString()}
            </div>
        ` : `
            <div class="empty-state">
                <h2>Waiting for Auto-Analysis</h2>
                <p>The active file will be automatically analyzed every 5 minutes.</p>
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

async function configureApiEndpoint() {
    const config = vscode.workspace.getConfiguration('aiCodeReviewer');
    const currentEndpoint = config.get<string>('apiEndpoint', '');

    const newEndpoint = await vscode.window.showInputBox({
        prompt: 'Enter your Supabase function URL',
        placeHolder: 'Get this from your Supabase dashboard > Settings > API',
        value: currentEndpoint,
        validateInput: (value) => {
            if (!value.trim()) {
                return 'URL cannot be empty';
            }
            if (!value.startsWith('https://')) {
                return 'URL must start with https://';
            }
            return null;
        }
    });

    if (newEndpoint) {
        await config.update('apiEndpoint', newEndpoint, vscode.ConfigurationTarget.Global);
        
        // API key will be stored in VS code's secure storage
        const newApiKey = await vscode.window.showInputBox({
            prompt: 'Enter your Supabase API key (anon or service_role)',
            placeHolder: 'Get this from your Supabase dashboard > Settings > API',
            password: true,
            validateInput: (value) => {
                if (!value.trim()) {
                    return 'API key cannot be empty';
                }
                return null;
            }
        });

        if (newApiKey) {
            await extensionContext.secrets.store('supabaseApiKey', newApiKey);
            vscode.window.showInformationMessage('API endpoint and key configured successfully!');
            
            // Start auto-analyze after configuration
            if (isAutoAnalyzeEnabled) {
                startAutoAnalyze();
            }
        } else {
            vscode.window.showInformationMessage('API endpoint configured (but no API key provided)');
        }
        
        updateStatusBar();
    }
}

async function updateStatusBar() {
    const config = vscode.workspace.getConfiguration('aiCodeReviewer');
    const apiEndpoint = config.get<string>('apiEndpoint');
    const apiKey = await extensionContext.secrets.get('supabaseApiKey');
    
    if (apiEndpoint && apiKey) {
        if (isAutoAnalyzeEnabled) {
            statusBarItem.text = '$(sync~spin) AI Reviewer (Auto)';
            statusBarItem.tooltip = 'AI Code Reviewer - Auto-analyzing every 5 minutes\nClick to configure';
        } else {
            statusBarItem.text = '$(circle-slash) AI Reviewer (Off)';
            statusBarItem.tooltip = 'AI Code Reviewer - Auto-analyze disabled\nClick to configure';
        }
        statusBarItem.backgroundColor = undefined;
    } else {
        statusBarItem.text = '$(warning) Setup Required';
        statusBarItem.tooltip = 'Click to configure AI Code Reviewer';
        statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
    }
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