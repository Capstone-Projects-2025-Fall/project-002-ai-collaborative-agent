"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.activate = activate;
exports.deactivate = deactivate;
const vscode = require("vscode");
function activate(context) {
    // show a toast so we know the extension actually activated
    vscode.window.showInformationMessage('AI Collab Agent activated');
    // ---- Debug/health command: appears as “AI Collab Agent: Hello (debug)”
    const hello = vscode.commands.registerCommand('aiCollab.debugHello', () => {
        vscode.window.showInformationMessage('Hello from AI Collab Agent!');
    });
    context.subscriptions.push(hello);
    // ---- Main command: opens the webview panel
    const open = vscode.commands.registerCommand('aiCollab.openPanel', () => {
        const panel = vscode.window.createWebviewPanel('aiCollabPanel', // internal view type
        'AI Collab Agent', // tab title
        vscode.ViewColumn.Active, // where to show
        {
            enableScripts: true, // allow JS in webview
            retainContextWhenHidden: true // keep state when hidden
        });
        panel.webview.html = getHtml(panel.webview, context);
        // receive messages from the webview
        panel.webview.onDidReceiveMessage(async (msg) => {
            switch (msg.type) {
                case 'createTeam': {
                    // persist team payload in workspace storage (simple local state)
                    await context.workspaceState.update('aiCollab.team', msg.payload);
                    vscode.window.showInformationMessage(`Team "${msg.payload.teamName}" saved.`);
                    panel.webview.postMessage({ type: 'teamSaved' });
                    break;
                }
                case 'allocateTasks': {
                    const allocation = mockAllocate(msg.payload);
                    panel.webview.postMessage({ type: 'allocation', payload: allocation });
                    break;
                }
                default:
                    // no-op
                    break;
            }
        });
    });
    context.subscriptions.push(open);
}
function deactivate() {
    // nothing to clean up yet
}
/**
 * Build the HTML string for the webview.
 */
function getHtml(webview, context) {
    const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(context.extensionUri, 'media', 'main.js'));
    const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(context.extensionUri, 'media', 'main.css'));
    // simple nonce to satisfy CSP for our inline script reference
    const nonce = String(Math.random());
    return /* html */ `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta
    http-equiv="Content-Security-Policy"
    content="default-src 'none'; img-src ${webview.cspSource} https:; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';"
  />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <link href="${styleUri}" rel="stylesheet" />
  <title>AI Collab Agent</title>
</head>
<body>
  <div class="container">
    <h1>AI Collab Agent (Starter)</h1>

    <section>
      <h2>Create Team & Problem</h2>
      <form id="team-form">
        <label>Team Name <input id="team-name" required /></label>
        <label>Problem Statement <textarea id="problem" required></textarea></label>
        <label>Members (comma-separated) <input id="members" placeholder="alice:python, bob:react" /></label>
        <button type="submit">Create Team</button>
      </form>
      <div id="team-status" class="status"></div>
    </section>

    <section>
      <h2>Allocate Tasks</h2>
      <form id="alloc-form">
        <label>Requirements
          <textarea id="requirements" placeholder="- build API\n- create UI\n- write tests"></textarea>
        </label>
        <button type="submit">Allocate</button>
      </form>
      <pre id="alloc-output"></pre>
    </section>
  </div>

  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
}
/**
 * Very simple round-robin allocator used until we wire a real agent API.
 */
function mockAllocate(input) {
    const tasks = input.requirements
        .split('\n')
        .map(s => s.trim())
        .filter(Boolean);
    const members = (input.members && input.members.length)
        ? input.members
        : [{ name: 'unassigned', skills: [] }];
    const out = {};
    let i = 0;
    for (const t of tasks) {
        const m = members[i % members.length].name || 'unassigned';
        (out[m] ||= []).push(t);
        i++;
    }
    return out;
}
