"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.activate = activate;
exports.deactivate = deactivate;
const vscode = require("vscode");
const vsls = require("vsls/vscode");
async function activate(context) {
    vscode.window.showInformationMessage('AI Collab Agent activated');
    context.subscriptions.push(vscode.commands.registerCommand('aiCollab.debugHello', () => {
        vscode.window.showInformationMessage('Hello from AI Collab Agent!');
    }));
    const liveShare = (await vsls.getApi());
    liveShare?.onDidChangeSession((e) => console.log('[AI Collab] Live Share role:', e.session?.role));
    context.subscriptions.push(vscode.commands.registerCommand('aiCollab.openPanel', async () => {
        if (!ensureWorkspaceOpen())
            return;
        const panel = vscode.window.createWebviewPanel('aiCollabPanel', 'AI Collab Agent', vscode.ViewColumn.Active, { enableScripts: true, retainContextWhenHidden: true });
        panel.webview.html = getHtml(panel.webview, context);
        let hostService = null;
        let guestService = null;
        if (liveShare?.session?.role === vsls.Role.Host) {
            hostService = await liveShare.shareService('aiCollab.service');
            if (!hostService) {
                vscode.window.showWarningMessage('Could not share Live Share service. Start a Live Share session as Host.');
            }
            else {
                hostService.onRequest('allocate', (args) => {
                    const [payload] = args;
                    return mockAllocate(payload);
                });
                hostService.onRequest('createTeam', async (args) => {
                    const [payload] = args;
                    await context.workspaceState.update('aiCollab.team', payload);
                    hostService.notify('teamUpdated', payload);
                    return { ok: true };
                });
            }
        }
        else if (liveShare?.session?.role === vsls.Role.Guest) {
            guestService = await liveShare.getSharedService('aiCollab.service');
            if (!guestService) {
                vscode.window.showWarningMessage('Host service not found. Ask the host to open the panel.');
            }
            else {
                guestService.onNotify('teamUpdated', (payload) => {
                    panel.webview.postMessage({ type: 'teamSaved', payload });
                });
            }
        }
        async function pushTeamToWebview() {
            const team = await context.workspaceState.get('aiCollab.team');
            panel.webview.postMessage({ type: 'teamLoaded', payload: team ?? null });
        }
        await pushTeamToWebview();
        panel.webview.onDidReceiveMessage(async (msg) => {
            switch (msg.type) {
                case 'init': {
                    await pushTeamToWebview();
                    break;
                }
                case 'createTeam': {
                    if (liveShare?.session?.role === vsls.Role.Guest && guestService) {
                        await guestService.request('createTeam', msg.payload);
                    }
                    else {
                        await context.workspaceState.update('aiCollab.team', msg.payload);
                        hostService?.notify('teamUpdated', msg.payload);
                        panel.webview.postMessage({ type: 'teamSaved' });
                    }
                    break;
                }
                case 'allocateTasks': {
                    const saved = (await context.workspaceState.get('aiCollab.team'));
                    const input = {
                        requirements: msg.payload?.requirements ?? '',
                        members: msg.payload?.members?.length ? msg.payload.members : (saved?.members ?? [])
                    };
                    if (liveShare?.session?.role === vsls.Role.Guest && guestService) {
                        const allocation = await guestService.request('allocate', [input]);
                        panel.webview.postMessage({ type: 'allocation', payload: allocation });
                    }
                    else {
                        const allocation = mockAllocate(input);
                        panel.webview.postMessage({ type: 'allocation', payload: allocation });
                    }
                    break;
                }
            }
        });
    }));
}
function deactivate() { }
function ensureWorkspaceOpen() {
    if (!vscode.workspace.workspaceFolders?.length) {
        vscode.window.showErrorMessage('Open a folder/workspace first.');
        return false;
    }
    return true;
}
function getHtml(webview, context) {
    const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(context.extensionUri, 'media', 'main.js'));
    const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(context.extensionUri, 'media', 'main.css'));
    const nonce = String(Math.random());
    return /* html */ `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy"
    content="default-src 'none'; img-src ${webview.cspSource} https:;
             style-src ${webview.cspSource} 'unsafe-inline';
             script-src 'nonce-${nonce}';"/>
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
function mockAllocate(input) {
    const tasks = input.requirements.split('\n').map(s => s.trim()).filter(Boolean);
    const members = input.members?.length ? input.members : [{ name: 'unassigned', skills: [] }];
    const out = {};
    let i = 0;
    for (const t of tasks) {
        const m = members[i % members.length].name || 'unassigned';
        (out[m] ||= []).push(t);
        i++;
    }
    return out;
}
//# sourceMappingURL=extension.js.map