// src/LoginWebview.ts

import * as vscode from "vscode";

// Define the shape of the message we expect from the webview
interface LoginMessage {
  command: "login";
  payload: {
    email?: string;
    password?: string;
  };
}

export class LoginWebviewPanel {
  public static currentPanel: LoginWebviewPanel | undefined;
  private readonly _panel: vscode.WebviewPanel;
  private _disposables: vscode.Disposable[] = [];

  private constructor(
    panel: vscode.WebviewPanel,
    extensionUri: vscode.Uri,
    onLogin: (email: string, pass: string) => void
  ) {
    this._panel = panel;

    this._panel.onDidDispose(() => this.dispose(), null, this._disposables);
    this._panel.webview.html = this._getHtmlForWebview(
      this._panel.webview,
      extensionUri
    );

    // Handle messages from the webview
    this._panel.webview.onDidReceiveMessage(
      (message: LoginMessage) => {
        switch (message.command) {
          case "login":
            const { email, password } = message.payload;
            if (email && password) {
              onLogin(email, password);
              // You might want to close the panel on successful login
              this.dispose();
            } else {
              vscode.window.showErrorMessage(
                "Email and password are required."
              );
            }
            return;
        }
      },
      null,
      this._disposables
    );
  }

  public static createOrShow(
    extensionUri: vscode.Uri,
    onLogin: (email: string, pass: string) => void
  ) {
    const column = vscode.window.activeTextEditor
      ? vscode.window.activeTextEditor.viewColumn
      : undefined;

    // If we already have a panel, show it.
    if (LoginWebviewPanel.currentPanel) {
      LoginWebviewPanel.currentPanel._panel.reveal(column);
      return;
    }

    // Otherwise, create a new panel.
    const panel = vscode.window.createWebviewPanel(
      "myExtensionLogin",
      "My Extension Login",
      column || vscode.ViewColumn.One,
      { enableScripts: true }
    );

    LoginWebviewPanel.currentPanel = new LoginWebviewPanel(
      panel,
      extensionUri,
      onLogin
    );
  }

  public dispose() {
    LoginWebviewPanel.currentPanel = undefined;
    this._panel.dispose();
    while (this._disposables.length) {
      const x = this._disposables.pop();
      if (x) {
        x.dispose();
      }
    }
  }

  private _getHtmlForWebview(
    webview: vscode.Webview,
    extensionUri: vscode.Uri
  ) {
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
