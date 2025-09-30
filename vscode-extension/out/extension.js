"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.activate = activate;
exports.deactivate = deactivate;

const vscode = require("vscode");
const vsls = require("vsls/vscode");
const fs = require("fs");
const path = require("path");

async function activate(context) {
	vscode.window.showInformationMessage("AI Collab Agent activated");

	// Acitvate extension
	context.subscriptions.push(
		vscode.commands.registerCommand("aiCollab.debugHello", () => {
			vscode.window.showInformationMessage("Hello from AI Collab Agent!");
		})
	);

	// Ensure liveshare is available
	const liveShare = await vsls.getApi();
	liveShare?.onDidChangeSession((e) =>
		console.log("[AI Collab] Live Share role:", e.session?.role)
	);

	// Add status bar button
	const statusBarItem = vscode.window.createStatusBarItem(
		vscode.StatusBarAlignment.Left,
		100
	);
	statusBarItem.text = "$(organization) Collab Agent"; //or feedback
	statusBarItem.tooltip = "Open AI Collab Panel";
	statusBarItem.command = "aiCollab.openPanel";
	statusBarItem.show();
	context.subscriptions.push(statusBarItem);

	// Main Panel Command
	const openPanelCommand = vscode.commands.registerCommand(
		"aiCollab.openPanel",
		async () => {
			if (!ensureWorkspaceOpen()) return;

			const panel = vscode.window.createWebviewPanel(
				"aiCollabPanel",
				"AI Collab Agent",
				vscode.ViewColumn.Active,
				{ enableScripts: true, retainContextWhenHidden: true }
			);

			panel.webview.html = getHtml(panel.webview, context);

			let hostService = null;
			let guestService = null;

			if (liveShare?.session?.role === vsls.Role.Host) {
				hostService = await liveShare.shareService("aiCollab.service");

				if (!hostService) {
					vscode.window.showWarningMessage(
						"Could not share Live Share service. Start a Live Share session as Host."
					);
				} else {
					hostService.onRequest("allocate", (args) => {
						const [payload] = args;
						return mockAllocate(payload);
					});
					hostService.onRequest("createTeam", async (args) => {
						const [payload] = args;
						await context.workspaceState.update("aiCollab.team", payload);
						hostService.notify("teamUpdated", payload);
						return { ok: true };
					});
				}
			} else if (liveShare?.session?.role === vsls.Role.Guest) {
				guestService = await liveShare.getSharedService("aiCollab.service");
				if (!guestService) {
					vscode.window.showWarningMessage(
						"Host service not found. Ask the host to open the panel."
					);
				} else {
					guestService.onNotify("teamUpdated", (payload) => {
						panel.webview.postMessage({ type: "teamSaved", payload });
					});
				}
			}

			// Function to push team data to webview
			async function pushTeamToWebview() {
				const team = await context.workspaceState.get("aiCollab.team");
				panel.webview.postMessage({
					type: "teamLoaded",
					payload: team ?? null,
				});
			}

			// Handle messages from the webview
			panel.webview.onDidReceiveMessage(async (msg) => {
				switch (msg.type) {
					case "saveData": {
						// Save all application data to workspace storage
						await context.workspaceState.update(
							"aiCollab.users",
							msg.payload.users
						);
						await context.workspaceState.update(
							"aiCollab.projects",
							msg.payload.projects
						);
						await context.workspaceState.update(
							"aiCollab.promptCount",
							msg.payload.promptCount
						);
						vscode.window.showInformationMessage(
							"Team data saved successfully!"
						);
						break;
					}
					case "loadData": {
						// Load saved data and send back to webview
						const users = await context.workspaceState.get(
							"aiCollab.users",
							[]
						);
						const projects = await context.workspaceState.get(
							"aiCollab.projects",
							[]
						);
						const promptCount = await context.workspaceState.get(
							"aiCollab.promptCount",
							0
						);
						panel.webview.postMessage({
							type: "dataLoaded",
							payload: { users, projects, promptCount },
						});
						break;
					}
					case "generatePrompt": {
						// Generate AI prompt and potentially integrate with AI APIs
						const { project, prompt } = msg.payload;
						// Show the generated prompt in a new document
						const doc = await vscode.workspace.openTextDocument({
							content: prompt,
							language: "markdown",
						});
						await vscode.window.showTextDocument(doc);
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
					case "allocateTasks": {
						const allocation = mockAllocate(msg.payload);
						panel.webview.postMessage({
							type: "allocation",
							payload: allocation,
						});
						break;
					}
					case "init": {
						await pushTeamToWebview();
					}
					case "createTeam": {
						if (liveShare?.session?.role === vsls.Role.Guest && guestService) {
							await guestService.request("createTeam", msg.payload);
						} else {
							await context.workspaceState.update("aiCollab.team", msg.payload);
							hostService?.notify("teamUpdated", msg.payload);
							panel.webview.postMessage({ type: "teamSaved" });
						}
						break;
					}
					case "allocateTasks": {
						const saved = await context.workspaceState.get("aiCollab.team");
						const input = {
							requirements: msg.payload?.requirements ?? "",
							members: msg.payload?.members?.length
								? msg.payload.members
								: saved?.members ?? [],
						};
						if (liveShare?.session?.role === vsls.Role.Guest && guestService) {
							const allocation = await guestService.request("allocate", [
								input,
							]);
							panel.webview.postMessage({
								type: "allocation",
								payload: allocation,
							});
						} else {
							const allocation = mockAllocate(input);
							panel.webview.postMessage({
								type: "allocation",
								payload: allocation,
							});
						}
						break;
					}
					default:
						// no-op
						break;
				}
			});

			// When the panel is first created, load any existing team data
			await pushTeamToWebview();
			// Load data when panel is created
			panel.webview.postMessage({ type: "requestData" });
		}
	);

	// Register the command
	context.subscriptions.push(openPanelCommand);
}

function deactivate() {
	// nothing to clean up yet
}

function ensureWorkspaceOpen() {
	if (!vscode.workspace.workspaceFolders?.length) {
		vscode.window.showErrorMessage("Open a folder/workspace first.");
		return false;
	}
	return true;
}

function getHtml(webview, context) {
	const htmlPath = path.join(context.extensionPath, "src", "webview.html");
	let html = fs.readFileSync(htmlPath, "utf8");
	html = html.replace(/{{cspSource}}/g, webview.cspSource);
	html = html.replace(/{{nonce}}/g, String(Math.random()));
	return html;
}
/**
 * Very simple round-robin allocator used until we wire a real agent API.
 */
function mockAllocate(input) {
	const tasks = input.requirements
		.split("\n")
		.map((s) => s.trim())
		.filter(Boolean);
	const members =
		input.members && input.members.length
			? input.members
			: [{ name: "unassigned", skills: [] }];
	const out = {};
	let i = 0;
	for (const t of tasks) {
		const m = members[i % members.length].name || "unassigned";
		(out[m] ||= []).push(t);
		i++;
	}
	return out;
}
