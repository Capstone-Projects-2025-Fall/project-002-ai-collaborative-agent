"use strict";
// src/LoginWebview.ts
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
exports.LoginWebviewPanel = void 0;
const vscode = __importStar(require("vscode"));
class LoginWebviewPanel {
    static currentPanel;
    _panel;
    _disposables = [];
    constructor(panel, extensionUri, onLogin) {
        this._panel = panel;
        this._panel.onDidDispose(() => this.dispose(), null, this._disposables);
        this._panel.webview.html = this._getHtmlForWebview(this._panel.webview, extensionUri);
        // Handle messages from the webview
        this._panel.webview.onDidReceiveMessage((message) => {
            switch (message.command) {
                case "login":
                    const { email, password } = message.payload;
                    if (email && password) {
                        onLogin(email, password);
                        // You might want to close the panel on successful login
                        this.dispose();
                    }
                    else {
                        vscode.window.showErrorMessage("Email and password are required.");
                    }
                    return;
            }
        }, null, this._disposables);
    }
    static createOrShow(extensionUri, onLogin) {
        const column = vscode.window.activeTextEditor
            ? vscode.window.activeTextEditor.viewColumn
            : undefined;
        // If we already have a panel, show it.
        if (LoginWebviewPanel.currentPanel) {
            LoginWebviewPanel.currentPanel._panel.reveal(column);
            return;
        }
        // Otherwise, create a new panel.
        const panel = vscode.window.createWebviewPanel("myExtensionLogin", "My Extension Login", column || vscode.ViewColumn.One, { enableScripts: true });
        LoginWebviewPanel.currentPanel = new LoginWebviewPanel(panel, extensionUri, onLogin);
    }
    dispose() {
        LoginWebviewPanel.currentPanel = undefined;
        this._panel.dispose();
        while (this._disposables.length) {
            const x = this._disposables.pop();
            if (x) {
                x.dispose();
            }
        }
    }
    _getHtmlForWebview(webview, extensionUri) {
        // This is a simplified example. In a real extension, you'd use a templating engine.
        return `<!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>Login</title>
                <style>
                    body { font-family: var(--vscode-font-family); color: var(--vscode-editor-foreground); }
                    .container { padding: 20px; }
                    input { width: 100%; padding: 8px; margin-bottom: 10px; border: 1px solid var(--vscode-input-border); background: var(--vscode-input-background); color: var(--vscode-input-foreground); border-radius: 4px; }
                    button { background: var(--vscode-button-background); color: var(--vscode-button-foreground); padding: 10px 15px; border: none; border-radius: 4px; cursor: pointer; }
                    button:hover { background: var(--vscode-button-hoverBackground); }
                </style>
            </head>
            <body>
                <div class="container">
                    <h1>Login to My Extension</h1>
                    <form id="login-form">
                        <label for="email">Email</label>
                        <input type="email" id="email" required>
                        <label for="password">Password</label>
                        <input type="password" id="password" required>
                        <button type="submit">Login</button>
                    </form>
                </div>
                <script>
                    const vscode = acquireVsCodeApi();
                    const form = document.getElementById('login-form');
                    form.addEventListener('submit', (event) => {
                        event.preventDefault();
                        const email = document.getElementById('email').value;
                        const password = document.getElementById('password').value;
                        vscode.postMessage({
                            command: 'login',
                            payload: { email, password }
                        });
                    });
                </script>
            </body>
            </html>`;
    }
}
exports.LoginWebviewPanel = LoginWebviewPanel;
