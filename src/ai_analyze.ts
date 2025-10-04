import * as vscode from 'vscode';
import fetch from 'node-fetch';

let statusBarItem: vscode.StatusBarItem;
let resultsPanel: vscode.WebviewPanel | undefined;
let extensionContext: vscode.ExtensionContext;
let codeLensProvider: AnalyzeCodeLensProvider;

//Dislays the analyze code button when you highlight the code
class AnalyzeCodeLensProvider implements vscode.CodeLensProvider {
    private _onDidChangeCodeLenses: vscode.EventEmitter<void> = new vscode.EventEmitter<void>();
    public readonly onDidChangeCodeLenses: vscode.Event<void> = this._onDidChangeCodeLenses.event;

    public provideCodeLenses(document: vscode.TextDocument, token: vscode.CancellationToken): vscode.CodeLens[] | Thenable<vscode.CodeLens[]> {
        const editor = vscode.window.activeTextEditor;
        if (!editor || editor.document !== document) {
            return [];
        }

        const selection = editor.selection;
        if (selection.isEmpty) {
            return [];
        }

        const selectedText = document.getText(selection).trim();
        if (selectedText.length <= 10) {
            return [];
        }

        const config = vscode.workspace.getConfiguration('aiCodeReviewer');
        if (!config.get('showInlineButton', true)) {
            return [];
        }

        const range = new vscode.Range(selection.start.line, 0, selection.start.line, 0);
        const codeLens = new vscode.CodeLens(range, {
            title: "Analyze Code ↓",
            command: "ai-code-reviewer.analyzeCode",
            arguments: []
        });

        return [codeLens];
    }

    public refresh(): void {
        this._onDidChangeCodeLenses.fire();
    }
}


export function activate(context: vscode.ExtensionContext) {
    console.log('AI Code Reviewer extension is now active!');
    
    extensionContext = context;

    //Creates the bar at the bottom right to show if the ai analyzer is active or not
    statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    statusBarItem.command = 'ai-code-reviewer.configure';
    context.subscriptions.push(statusBarItem);

    //Makes the analyze button appear
    codeLensProvider = new AnalyzeCodeLensProvider();
    const codeLensDisposable = vscode.languages.registerCodeLensProvider(
        { scheme: 'file' },
        codeLensProvider
    );

    //Calls the supabase function
    const analyzeCommand = vscode.commands.registerCommand('ai-code-reviewer.analyzeCode', async () => {
        await analyzeSelectedCode();
    });

    //Shows the result panel on the right
    const showResultsCommand = vscode.commands.registerCommand('ai-code-reviewer.showResults', () => {
        showResultsPanel();
    });

    //Opens setup dialog
    const configureCommand = vscode.commands.registerCommand('ai-code-reviewer.configure', async () => {
        await configureApiEndpoint();
    });

    //Update the analyze button whe you highlight other things
    const selectionChangeListener = vscode.window.onDidChangeTextEditorSelection((event) => {
        setTimeout(() => {
            codeLensProvider.refresh();
        }, 50);
    });

    const activeEditorChangeListener = vscode.window.onDidChangeActiveTextEditor((editor) => {
        if (editor) {
            codeLensProvider.refresh();
        }
    });

    context.subscriptions.push(
        analyzeCommand,
        showResultsCommand,
        configureCommand,
        selectionChangeListener,
        activeEditorChangeListener,
        codeLensDisposable
    );

    updateStatusBar();
}

async function analyzeSelectedCode() {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        vscode.window.showErrorMessage('No active editor found');
        return;
    }

    const selection = editor.selection;
    if (selection.isEmpty) {
        vscode.window.showWarningMessage('Please select some code to analyze');
        return;
    }

    const selectedCode = editor.document.getText(selection);
    const config = vscode.workspace.getConfiguration('aiCodeReviewer');
    const apiEndpoint = config.get<string>('apiEndpoint');
    
    // Get API key from secure storage
    const apiKey = await extensionContext.secrets.get('supabaseApiKey');

    if (!apiEndpoint || !apiKey) {
        const result = await vscode.window.showErrorMessage(
            'API endpoint or key not configured. Please configure your Supabase function URL and API key.',
            'Configure Now'
        );
        if (result === 'Configure Now') {
            await configureApiEndpoint();
        }
        return;
    }

    await vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: 'AI Code Reviewer',
        cancellable: true
    }, async (progress, token) => {
        progress.report({ increment: 0, message: 'Analyzing code' });

        try {
            const headers: Record<string, string> = {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`,
                'apikey': apiKey
            };

            //Sends the selected code to the suoabase function
            const response = await fetch(apiEndpoint, {
                method: 'POST',
                headers: headers,
                body: JSON.stringify({
                    code: selectedCode
                })
            });

            progress.report({ increment: 50, message: 'Processing AI response...' });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(`API Error ${response.status}: ${errorData.error || 'Unknown error'}`);
            }

            const data = await response.json();
            progress.report({ increment: 100, message: 'Analysis complete!' });

            codeLensProvider.refresh();

            showResultsPanel(data.message, selectedCode);

            const viewResults = await vscode.window.showInformationMessage(
                'Code analysis completed!',
                'View Results'
            );

            if (viewResults === 'View Results' && resultsPanel) {
                resultsPanel.reveal();
            }

        } catch (error: any) {
            vscode.window.showErrorMessage(`Analysis failed: ${error.message}`);
            console.error('Analysis error:', error);
        }
    });
}

function showResultsPanel(analysisResult?: string, originalCode?: string) {
    //Brings the panel out
    if (resultsPanel) {
        resultsPanel.reveal();
        //Update the results
        if (analysisResult) {
            updateResultsPanel(analysisResult, originalCode || '');
        }
        return;
    }

    resultsPanel = vscode.window.createWebviewPanel(
        'aiCodeReviewResults',
        'AI Code Review Results',
        //opens on the right side of the code
        vscode.ViewColumn.Beside,
        {
            enableScripts: true,
            retainContextWhenHidden: true
        }
    );

    //Clears the panel when the you close it
    resultsPanel.onDidDispose(() => {
        resultsPanel = undefined;
    });

    if (analysisResult) {
        updateResultsPanel(analysisResult, originalCode || '');
    } else {
        resultsPanel.webview.html = getWebviewContent('', '');
    }
}

//Puts the data into the panel
function updateResultsPanel(analysisResult: string, originalCode: string) {
    if (resultsPanel) {
        resultsPanel.webview.html = getWebviewContent(analysisResult, originalCode);
    }
}

//Front end for the Ppnel that appears on the right side when you click analzye code
function getWebviewContent(analysisResult: string, originalCode: string): string {
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
                max-height: 200px;
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
            
            .loading {
                text-align: center;
                padding: 40px;
                color: var(--vscode-descriptionForeground);
            }
            
            .loading::after {
                content: '';
                display: inline-block;
                width: 20px;
                height: 20px;
                border: 2px solid var(--vscode-descriptionForeground);
                border-radius: 50%;
                border-top-color: var(--vscode-textLink-foreground);
                animation: spin 1s linear infinite;
                margin-left: 10px;
            }
            
            @keyframes spin {
                to { transform: rotate(360deg); }
            }
        </style>
    </head>
    <body>
        <div class="header">
            <h1>AI Code Review Results</h1>
        </div>
        
        ${analysisResult ? `
            <div class="code-section">
                <h3>Analyzed Code</h3>
                <div class="code-content">${escapeHtml(originalCode)}</div>
            </div>
            
            <div class="analysis-section">
                <h3>Analysis Results</h3>
                <div class="analysis-content">${formatAnalysisResult(analysisResult)}</div>
            </div>
            
            <div class="timestamp">
                Analysis completed at ${new Date().toLocaleString()}
            </div>
        ` : `
            <div class="empty-state">
                <h2>Ready for Code Analysis</h2>
                <p>Select some code in your editor and click the "Analyze Code" button or use <strong>Cmd+Shift+A</strong> to get started.</p>
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
        
        //API key will be stored in VS code's secure storage
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
        statusBarItem.text = 'AI Reviewer';
        statusBarItem.tooltip = 'AI Code Reviewer - Ready';
        statusBarItem.backgroundColor = undefined;
    } else {
        statusBarItem.text = 'Setup Required';
        statusBarItem.tooltip = 'Click to configure AI Code Reviewer';
        statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
    }
    
    statusBarItem.show();
}

export function deactivate() {
    if (statusBarItem) {
        statusBarItem.dispose();
    }
    if (resultsPanel) {
        resultsPanel.dispose();
    }
}