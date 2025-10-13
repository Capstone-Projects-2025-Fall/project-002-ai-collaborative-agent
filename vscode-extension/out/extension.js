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
exports.activate = activate;
exports.deactivate = deactivate;
const vscode = __importStar(require("vscode"));
const fs = __importStar(require("fs/promises"));
const path = __importStar(require("path"));
const vsls = __importStar(require("vsls/vscode"));
// Helper function to get the full path to our data file
function getDataFilePath() {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
        return undefined; // No open folder
    }
    // We'll store our data in a hidden file in the root of the workspace
    return path.join(workspaceFolder.uri.fsPath, ".aiCollabData.json");
}
// Helper function to load all data from the file
async function loadInitialData() {
    const filePath = getDataFilePath();
    let data = {
        users: [],
        projects: [],
        promptCount: 0,
    };
    if (filePath) {
        try {
            const fileContent = await fs.readFile(filePath, "utf-8");
            const parsedData = JSON.parse(fileContent);
            data.users = parsedData.users || [];
            data.projects = parsedData.projects || [];
            data.promptCount = parsedData.promptCount || 0;
        }
        catch (error) {
            console.log("Data file not found or invalid, using default state.");
        }
    }
    // Ensure selectedMemberIds is an array for all projects (backward compatibility/safety)
    data.projects = data.projects.map((projectData) => ({
        ...projectData,
        selectedMemberIds: Array.isArray(projectData.selectedMemberIds)
            ? projectData.selectedMemberIds
            : [],
    }));
    return data;
}
// Helper function to save all data to the file
async function saveInitialData(data) {
    const filePath = getDataFilePath();
    if (!filePath) {
        vscode.window.showErrorMessage("Please open a folder in your workspace to save data.");
        return;
    }
    try {
        const jsonString = JSON.stringify(data, null, 2);
        await fs.writeFile(filePath, jsonString, "utf-8");
    }
    catch (error) {
        console.error("Failed to save data:", error);
        vscode.window.showErrorMessage("Failed to save team data to file.");
    }
}
async function activate(context) {
    vscode.window.showInformationMessage("AI Collab Agent activated");
    // ---- Debug/health command
    const hello = vscode.commands.registerCommand("aiCollab.debugHello", () => {
        vscode.window.showInformationMessage("Hello from AI Collab Agent!");
    });
    context.subscriptions.push(hello);
    const liveShare = (await vsls.getApi());
    liveShare?.onDidChangeSession((e) => console.log("[AI Collab] Live Share role:", e.session?.role));
    // Add status bar button
    const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 1);
    statusBarItem.text = "$(squirrel) AI Collab Agent";
    statusBarItem.tooltip = "Open AI Collab Panel";
    statusBarItem.command = "aiCollab.openPanel";
    statusBarItem.show();
    context.subscriptions.push(statusBarItem);
    // ---- Main command: opens the webview panel
    const open = vscode.commands.registerCommand("aiCollab.openPanel", async () => {
        const panel = vscode.window.createWebviewPanel("aiCollabPanel", "AI Collab Agent - Team Platform", vscode.ViewColumn.Active, {
            enableScripts: true,
            retainContextWhenHidden: true,
            localResourceRoots: [
                vscode.Uri.file(path.join(context.extensionPath, "media")),
            ],
        });
        panel.webview.html = await getHtml(panel.webview, context);
        // Handle messages from the webview
        panel.webview.onDidReceiveMessage(async (message) => {
            if (message.type === "openFile") {
                try {
                    // Open a folder selection dialog
                    const options = {
                        canSelectFiles: false,
                        canSelectFolders: true,
                        canSelectMany: false,
                        openLabel: "Open Folder",
                        defaultUri: vscode.Uri.file(require("os").homedir()), // Default to the user's home directory
                    };
                    const folderUri = await vscode.window.showOpenDialog(options);
                    if (folderUri && folderUri.length > 0) {
                        const selectedFolder = folderUri[0].fsPath;
                        // List files in the selected folder
                        const files = await vscode.workspace.fs.readDirectory(vscode.Uri.file(selectedFolder));
                        // Open the first file in the folder (or prompt the user to select one)
                        const firstFile = files.find(([name, type]) => type === vscode.FileType.File);
                        if (firstFile) {
                            const filePath = path.join(selectedFolder, firstFile[0]);
                            const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(filePath));
                            await vscode.window.showTextDocument(doc);
                            vscode.window.showInformationMessage(`Opened file: ${filePath}`);
                            try {
                                /// Start a Live Share session
                                const liveShare = await vsls.getApi(); // Get the Live Share API
                                if (!liveShare) {
                                    vscode.window.showErrorMessage("Live Share extension is not installed or not available.");
                                    return;
                                }
                                await liveShare.share(); // May return undefined even if successful
                                // Check if session is active
                                if (liveShare.session && liveShare.session.id) {
                                    vscode.window.showInformationMessage("Live Share session started!");
                                    console.log("Live Share session info:", liveShare.session);
                                }
                                else {
                                    vscode.window.showErrorMessage("Failed to start Live Share session.");
                                }
                            }
                            catch (error) {
                                console.error("Error starting Live Share session:", error);
                                vscode.window.showErrorMessage("An error occurred while starting Live Share.");
                            }
                        }
                        else {
                            vscode.window.showWarningMessage("No files found in the selected folder.");
                        }
                    }
                    else {
                        vscode.window.showWarningMessage("No folder selected.");
                    }
                }
                catch (error) {
                    vscode.window.showErrorMessage(`Failed to open file: ${error instanceof Error ? error.message : "Unknown error"}`);
                }
            }
        });
        // Live Share service setup
        let hostService = null;
        let guestService = null;
        if (liveShare?.session?.role === vsls.Role.Host) {
            hostService = await liveShare.shareService("aiCollab.service");
            if (!hostService) {
                vscode.window.showWarningMessage("Could not share Live Share service. Start a Live Share session as Host.");
            }
            else {
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
        }
        else if (liveShare?.session?.role === vsls.Role.Guest) {
            guestService = await liveShare.getSharedService("aiCollab.service");
            if (!guestService) {
                vscode.window.showWarningMessage("Host service not found. Ask the host to open the panel.");
            }
            else {
                guestService.onNotify("teamUpdated", (payload) => {
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
        panel.webview.onDidReceiveMessage(async (msg) => {
            switch (msg.type) {
                case "saveData": {
                    await saveInitialData(msg.payload);
                    vscode.window.showInformationMessage("Team data saved to .aiCollabData.json!");
                    break;
                }
                case "loadData": {
                    const data = await loadInitialData();
                    panel.webview.postMessage({
                        type: "dataLoaded",
                        payload: data,
                    });
                    break;
                }
                case "generatePrompt": {
                    const { projectId } = msg.payload;
                    const currentData = await loadInitialData();
                    const projectToPrompt = currentData.projects.find((p) => p.id == projectId);
                    if (!projectToPrompt) {
                        vscode.window.showErrorMessage("Project not found for AI prompt generation.");
                        panel.webview.postMessage({
                            type: "promptGenerationError",
                            payload: { message: "Project not found." },
                        });
                        break;
                    }
                    // --- FIX APPLIED HERE: Robust ID comparison ---
                    const teamMembersForPrompt = currentData.users.filter((user) => 
                    // Convert all IDs to string for reliable comparison
                    projectToPrompt.selectedMemberIds
                        .map((id) => String(id))
                        .includes(String(user.id)));
                    // --- END FIX ---
                    // Create the detailed string ONLY from the filtered members
                    const teamMemberDetails = teamMembersForPrompt
                        .map((user, index) => `Team Member ${index + 1}:
Name: ${user.name}
Skills: ${user.skills}
Programming Languages: ${user.programmingLanguages}
Willing to work on: ${user.willingToWorkOn || "Not specified"}

`)
                        .join("");
                    const promptContent = `PROJECT ANALYSIS AND TEAM OPTIMIZATION REQUEST

=== PROJECT INFORMATION ===
Project Name: ${projectToPrompt.name}
Created: ${new Date(projectToPrompt.createdAt).toLocaleString()}

Project Description:
${projectToPrompt.description}

Project Goals:
${projectToPrompt.goals}

Project Requirements:
${projectToPrompt.requirements}

=== TEAM COMPOSITION ===
Team Size: ${teamMembersForPrompt.length} members

${teamMemberDetails}

=== AI ANALYSIS REQUEST ===

Please analyze this project and team composition and provide:

1. TEAM ANALYSIS:
   - Evaluate if the current team has the right skill mix for the project requirements
   - Identify any skill gaps or redundancies
   - Assess team member compatibility based on their stated interests

2. PROJECT FEASIBILITY:
   - Analyze if the project goals are achievable with the current team
   - Identify potential challenges based on requirements vs. available skills
   - Suggest timeline considerations

3. ROLE ASSIGNMENTS:
   - Recommend specific roles for each team member based on their skills
   - Suggest who should lead different aspects of the project
   - Identify collaboration opportunities between team members

4. OPTIMIZATION RECOMMENDATIONS:
   - Suggest additional skills that might be needed
   - Recommend training or resource allocation
   - Propose project structure and workflow improvements

5. RISK ASSESSMENT:
   - Identify potential project risks based on team composition
   - Suggest mitigation strategies
   - Highlight critical success factors

6. DELIVERABLES MAPPING:
   - Break down project requirements into specific deliverables
   - Map deliverables to team member capabilities
   - Suggest milestone structure

Give me a specific message for EACH team member, detailing them what they need to do RIGHT NOW and in the FUTURE. Give each user the exact things they need to work on according also to their skills.`;
                    const tempFileName = `AI_Prompt_${projectToPrompt.name.replace(/[^a-zA-Z0-9]/g, "_")}_${Date.now()}.txt`;
                    const workspaceFolders = vscode.workspace.workspaceFolders;
                    if (workspaceFolders) {
                        const filePath = vscode.Uri.joinPath(workspaceFolders[0].uri, tempFileName);
                        await fs.writeFile(filePath.fsPath, promptContent, "utf-8");
                        await vscode.window.showTextDocument(filePath, {
                            viewColumn: vscode.ViewColumn.Beside,
                            preview: false,
                        });
                    }
                    currentData.promptCount++;
                    await saveInitialData(currentData);
                    panel.webview.postMessage({
                        type: "dataLoaded",
                        payload: currentData,
                    });
                    panel.webview.postMessage({
                        type: "promptGeneratedFromExtension",
                        payload: { prompt: promptContent },
                    });
                    vscode.window.showInformationMessage(`AI Prompt generated for project: ${projectToPrompt.name} and saved to ${tempFileName}`);
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
    });
    context.subscriptions.push(open);
}
function deactivate() { }
function ensureWorkspaceOpen() {
    if (!vscode.workspace.workspaceFolders?.length) {
        vscode.window.showErrorMessage("Open a folder/workspace first.");
        return false;
    }
    return true;
}
async function getHtml(webview, context) {
    const nonce = getNonce();
    const htmlPath = path.join(context.extensionPath, "media", "webview.html");
    let htmlContent = await fs.readFile(htmlPath, "utf-8");
    htmlContent = htmlContent
        .replace(/<head>/, `<head>
        <meta http-equiv="Content-Security-Policy" content="
            default-src 'none';
            style-src ${webview.cspSource} 'unsafe-inline';
            img-src ${webview.cspSource} https:;
            script-src 'nonce-${nonce}';
        ">`)
        .replace(/<script>/, `<script nonce="${nonce}">`);
    return htmlContent;
}
function getNonce() {
    let text = "";
    const possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    for (let i = 0; i < 32; i++) {
        text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
}
function mockAllocate(payload) {
    throw new Error("Function not implemented.");
}
