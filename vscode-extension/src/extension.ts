import * as vscode from "vscode";
// import * as fs from "fs/promises";
// import * as path from "path";
import * as vsls from "vsls/vscode";
import * as fs from "fs";
import * as path from "path";

// Helper function to get the full path to our data file
function getDataFilePath(): string | undefined {
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
  if (!workspaceFolder) {
    return undefined; // No open folder
  }
  // We'll store our data in a hidden file in the root of the workspace
  return path.join(workspaceFolder.uri.fsPath, ".aiCollabData.json");
}


type Member = { name: string; skills: string[] };
type AllocateInput = { requirements: string; members: Member[] };

export async function activate(context: vscode.ExtensionContext) {
	// show a toast so we know the extension actually activated
	vscode.window.showInformationMessage("AI Collab Agent activated");

	// ---- Debug/health command
	const hello = vscode.commands.registerCommand("aiCollab.debugHello", () => {
		vscode.window.showInformationMessage("Hello from AI Collab Agent!");
	});
	context.subscriptions.push(hello);

	const liveShare = (await vsls.getApi()) as vsls.LiveShare | null;
	liveShare?.onDidChangeSession((e) =>
		console.log("[AI Collab] Live Share role:", e.session?.role)
	);
	// ---- Main command: opens the webview panel
	const open = vscode.commands.registerCommand("aiCollab.openPanel", () => {
		const panel = vscode.window.createWebviewPanel(
			"aiCollabPanel", // internal view type
			"AI Collab Agent - Team Platform", // tab title
			vscode.ViewColumn.Active, // where to show
			{
				enableScripts: true, // allow JS in webview
				retainContextWhenHidden: true, // keep state when hidden
			}
		);

		// Add status bar button
		const statusBarItem = vscode.window.createStatusBarItem(
			vscode.StatusBarAlignment.Right,
			100
		);
		statusBarItem.text = "$(rocket) AI Collab";
		statusBarItem.tooltip = "Open AI Collab Panel";
		statusBarItem.command = "aiCollab.openPanel";
		statusBarItem.show();
		context.subscriptions.push(statusBarItem);

		context.subscriptions.push(
			vscode.commands.registerCommand("aiCollab.openPanel", async () => {
				if (!ensureWorkspaceOpen()) return;

				const panel = vscode.window.createWebviewPanel(
					"aiCollabPanel",
					"AI Collab Agent",
					vscode.ViewColumn.Active,
					{ enableScripts: true, retainContextWhenHidden: true }
				);
				// panel.webview.html = getHtml(panel.webview, context);

				let hostService: vsls.SharedService | null = null;
				let guestService: vsls.SharedServiceProxy | null = null;

				if (liveShare?.session?.role === vsls.Role.Host) {
					hostService = await liveShare.shareService("aiCollab.service");
					if (!hostService) {
						vscode.window.showWarningMessage(
							"Could not share Live Share service. Start a Live Share session as Host."
						);
					} else {
						hostService.onRequest("allocate", (args: any[]) => {
							const [payload] = args as [AllocateInput];
							return mockAllocate(payload);
						});
						hostService.onRequest("createTeam", async (args: any[]) => {
							const [payload] = args as [any];
							await context.workspaceState.update("aiCollab.team", payload);
							hostService!.notify("teamUpdated", payload);
							return { ok: true as const };
						});
					}
				} else if (liveShare?.session?.role === vsls.Role.Guest) {
					guestService = await liveShare.getSharedService("aiCollab.service");
					if (!guestService) {
						vscode.window.showWarningMessage(
							"Host service not found. Ask the host to open the panel."
						);
					} else {
						guestService.onNotify("teamUpdated", (payload: any) => {
							panel.webview.postMessage({ type: "teamSaved", payload });
						});
					}
				}
				async function pushTeamToWebview() {
					const team = await context.workspaceState.get("aiCollab.team");
					panel.webview.postMessage({
						type: "teamLoaded",
						payload: team ?? null,
					});
				}
				await pushTeamToWebview();

    // receive messages from the webview
    panel.webview.onDidReceiveMessage(async (msg: any) => {
      switch (msg.type) {
        case "saveData": {
          const filePath = getDataFilePath();
          if (!filePath) {
            vscode.window.showErrorMessage(
              "Please open a folder in your workspace to save data."
            );
            break;
          }

          try {
            // Combine all data into a single object to save
            const dataToSave = {
              users: msg.payload.users || [],
              projects: msg.payload.projects || [],
              promptCount: msg.payload.promptCount || 0,
            };
            // Stringify with formatting (null, 2) for readability
            const jsonString = JSON.stringify(dataToSave, null, 2);
            await fs.writeFile(filePath, jsonString, "utf-8");

            vscode.window.showInformationMessage(
              "Team data saved to .aiCollabData.json!"
            );
          } catch (error) {
            console.error("Failed to save data:", error);
            vscode.window.showErrorMessage("Failed to save team data to file.");
          }
          break;
        }

        case "loadData": {
          const filePath = getDataFilePath();
          let data = { users: [], projects: [], promptCount: 0 }; // Default empty state

          if (filePath) {
            try {
              const fileContent = await fs.readFile(filePath, "utf-8");
              data = JSON.parse(fileContent);
            } catch (error) {
              // This is expected if the file doesn't exist yet (first run).
              // We'll just proceed with the default empty state.
              console.log("Data file not found, using default state.");
            }
          }

          panel.webview.postMessage({
            type: "dataLoaded",
            payload: data,
          });
          break;
        }

        case "generatePrompt": {
          const { project, prompt } = msg.payload;
          const doc = await vscode.workspace.openTextDocument({
            content: prompt,
            language: "markdown",
          });
          await vscode.window.showTextDocument(doc, {
            viewColumn: vscode.ViewColumn.Beside,
          });
          vscode.window.showInformationMessage(
            `AI Prompt generated for project: ${project.name}`
          );
          break;
        }
        case "showError": {
          vscode.window.showErrorMessage(msg.payload.message);
          break;
        }
        case "showSuccess": {
          vscode.window.showInformationMessage(msg.payload.message);
          break;
        }
        default:
          break;
      }
    });

				// Load data when panel is created
				panel.webview.postMessage({ type: "requestData" });
			})
		);
		context.subscriptions.push(open);
	});
}

export function deactivate() {}

function ensureWorkspaceOpen(): boolean {
	if (!vscode.workspace.workspaceFolders?.length) {
		vscode.window.showErrorMessage("Open a folder/workspace first.");
		return false;
	}
	return true;
}

/**
 * Build the HTML string for the webview with our Team Collaboration Platform
 */
function getHtml(
	webview: vscode.Webview,
	context: vscode.ExtensionContext,
	data: any
): string {
	const htmlPath = path.join(context.extensionPath, "src", "webview.html");
	let html = fs.readFileSync(htmlPath, "utf8");

	// Replace placeholders with dynamic data
	html = html.replace(/{{cspSource}}/g, webview.cspSource);
	html = html.replace(/{{nonce}}/g, String(Math.random()));
	html = html.replace(/{{userCount}}/g, data.userCount);
	html = html.replace(/{{projectCount}}/g, data.projectCount);
	html = html.replace(/{{promptCount}}/g, data.promptCount);

	return html;
}

function mockAllocate(input: AllocateInput) {
	const tasks = input.requirements
		.split("\n")
		.map((s) => s.trim())
		.filter(Boolean);
	const members = input.members?.length
		? input.members
		: [{ name: "unassigned", skills: [] }];
	const out: Record<string, string[]> = {};
	let i = 0;
	for (const t of tasks) {
		const m = members[i % members.length].name || "unassigned";
		(out[m] ||= []).push(t);
		i++;
	}
	return out;
}

function getNonce() {
  let text = "";
  const possible =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}
