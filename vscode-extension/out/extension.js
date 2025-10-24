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
const ai_analyze_1 = require("./ai_analyze");
const dotenv_1 = require("dotenv");
const authService_1 = require("./authService");
const supabaseConfig_1 = require("./supabaseConfig");
// NEW (Jira): command module import
const createJiraTasks_1 = require("./commands/createJiraTasks");

// Load environment variables from .env file in project root
(0, dotenv_1.config)({ path: path.join(__dirname, "../../.env") });

// Global variables for OAuth callback handling
let authService;
let extensionContext;

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
    (0, ai_analyze_1.activateCodeReviewer)(context);

    // Load environment variables from multiple possible locations
    (0, dotenv_1.config)({ path: path.join(__dirname, "..", ".env") });
    (0, dotenv_1.config)({ path: path.join(__dirname, "../../.env") });

    vscode.window.showInformationMessage("AI Collab Agent activated");

    // Store context globally for callback server
    extensionContext = context;

    // Initialize authentication service
    try {
        authService = new authService_1.AuthService();
        authService.initialize();
    }
    catch (error) {
        vscode.window.showErrorMessage(`Authentication setup failed: ${error instanceof Error ? error.message : "Unknown error"}`);
        return;
    }

    // Register URI handler for custom protocol
    const handleUri = vscode.window.registerUriHandler({
        handleUri(uri) {
            console.log("=== OAuth Callback Debug ===");
            console.log("Full URI:", uri.toString());
            console.log("Scheme:", uri.scheme);
            console.log("Authority:", uri.authority);
            console.log("Query:", uri.query);
            if (uri.scheme === "vscode" && uri.authority === "ai-collab-agent.auth") {
                console.log("OAuth callback received via VS Code URI");
                // Extract tokens from query parameters
                const urlParams = new URLSearchParams(uri.query);
                const accessToken = urlParams.get('access_token');
                const refreshToken = urlParams.get('refresh_token');
                console.log("Parsed tokens:", {
                    accessToken: accessToken ? accessToken.substring(0, 20) + "..." : "None",
                    refreshToken: refreshToken ? refreshToken.substring(0, 20) + "..." : "None"
                });
                if (accessToken) {
                    console.log("Access token received, setting session...");
                    authService
                        .setSessionFromTokens(accessToken, refreshToken || undefined)
                        .then(() => {
                        console.log("Session set successfully");
                        vscode.window.showInformationMessage("Authentication successful! Redirecting to main app...");
                        setTimeout(() => {
                            openMainPanel(extensionContext, authService);
                        }, 1000);
                    })
                        .catch((error) => {
                        console.error("Error setting session:", error);
                        vscode.window.showErrorMessage("Authentication failed: " + error.message);
                    });
                }
                else {
                    console.error("No access token found in callback");
                    vscode.window.showErrorMessage("Authentication failed: No access token received");
                }
            }
            else {
                console.log("URI not recognized:", uri.toString());
            }
        },
    });
    context.subscriptions.push(handleUri);

    // ---- Debug/health command
    const hello = vscode.commands.registerCommand("aiCollab.debugHello", () => {
        vscode.window.showInformationMessage("Hello from AI Collab Agent!");
    });
    context.subscriptions.push(hello);

    // ---- Debug authentication status
    const debugAuth = vscode.commands.registerCommand("aiCollab.debugAuth", () => {
        const user = authService.getCurrentUser();
        const session = authService.getCurrentSession();
        const isAuth = authService.isAuthenticated();
        console.log("Auth Debug Info:", {
            user,
            session: session ? {
                access_token: session.access_token?.substring(0, 20) + "...",
                expires_at: session.expires_at,
                user: session.user?.id
            } : null,
            isAuthenticated: isAuth
        });
        vscode.window.showInformationMessage(`Auth Status: ${isAuth ? 'Authenticated' : 'Not authenticated'}\n` +
            `User: ${user ? user.email : 'None'}\n` +
            `Session: ${session ? 'Active' : 'None'}`);
    });
    context.subscriptions.push(debugAuth);

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
        // Check if user is authenticated
        if (!authService.isAuthenticated()) {
            // Show login page
            const loginPanel = vscode.window.createWebviewPanel("aiCollabLogin", "AI Collab Agent - Login", vscode.ViewColumn.Active, {
                enableScripts: true,
                retainContextWhenHidden: true,
                localResourceRoots: [
                    vscode.Uri.file(path.join(context.extensionPath, "media")),
                ],
            });
            loginPanel.webview.html = await getLoginHtml(loginPanel.webview, context);
            // Handle login messages
            loginPanel.webview.onDidReceiveMessage(async (msg) => {
                switch (msg.type) {
                    case "checkAuthStatus": {
                        const user = authService.getCurrentUser();
                        loginPanel.webview.postMessage({
                            type: "authStatus",
                            payload: {
                                authenticated: !!user,
                                user: user,
                            },
                        });
                        break;
                    }
                    case "signIn": {
                        const { email, password } = msg.payload;
                        const result = await authService.signIn(email, password);
                        if (result.user) {
                            loginPanel.webview.postMessage({
                                type: "authSuccess",
                                payload: {
                                    user: result.user,
                                    message: "Successfully signed in!",
                                },
                            });
                            loginPanel.dispose();
                            openMainPanel(context, authService);
                        }
                        else {
                            loginPanel.webview.postMessage({
                                type: "authError",
                                payload: { message: result.error || "Sign in failed" },
                            });
                        }
                        break;
                    }
                    case "signUp": {
                        const { email, password, name } = msg.payload;
                        const result = await authService.signUp(email, password, name);
                        if (result.user) {
                            loginPanel.webview.postMessage({
                                type: "authSuccess",
                                payload: {
                                    user: result.user,
                                    message: "Account created successfully! Please check your email to verify your account.",
                                },
                            });
                            loginPanel.dispose();
                            openMainPanel(context, authService);
                        }
                        else {
                            loginPanel.webview.postMessage({
                                type: "authError",
                                payload: { message: result.error || "Sign up failed" },
                            });
                        }
                        break;
                    }
                    case "signInWithGoogle": {
                        try {
                            const result = await authService.signInWithGoogle();
                            if (result.error) {
                                loginPanel.webview.postMessage({
                                    type: "authError",
                                    payload: { message: result.error },
                                });
                            }
                            else {
                                loginPanel.webview.postMessage({
                                    type: "authSuccess",
                                    payload: {
                                        user: null,
                                        message: "Opening browser for Google authentication...",
                                    },
                                });
                            }
                        }
                        catch (error) {
                            loginPanel.webview.postMessage({
                                type: "authError",
                                payload: {
                                    message: error instanceof Error
                                        ? error.message
                                        : "Failed to open Google authentication",
                                },
                            });
                        }
                        break;
                    }
                    case "signInWithGithub": {
                        try {
                            const result = await authService.signInWithGithub();
                            if (result.error) {
                                loginPanel.webview.postMessage({
                                    type: "authError",
                                    payload: { message: result.error },
                                });
                            }
                            else {
                                loginPanel.webview.postMessage({
                                    type: "authSuccess",
                                    payload: {
                                        user: null,
                                        message: "Opening browser for GitHub authentication...",
                                    },
                                });
                            }
                        }
                        catch (error) {
                            loginPanel.webview.postMessage({
                                type: "authError",
                                payload: {
                                    message: error instanceof Error
                                        ? error.message
                                        : "Failed to open GitHub authentication",
                                },
                            });
                        }
                        break;
                    }
                    case "signOut": {
                        const result = await authService.signOut();
                        if (result.error) {
                            loginPanel.webview.postMessage({
                                type: "authError",
                                payload: { message: result.error },
                            });
                        }
                        else {
                            loginPanel.webview.postMessage({
                                type: "authSignedOut",
                                payload: {},
                            });
                        }
                        break;
                    }
                }
            });
            // Listen for auth state changes
            authService.onAuthStateChange((user) => {
                if (user) {
                    loginPanel.webview.postMessage({
                        type: "authSuccess",
                        payload: {
                            user: user,
                            message: "Successfully authenticated!",
                        },
                    });
                    loginPanel.dispose();
                    openMainPanel(context, authService);
                }
            });
            return;
        }
        // User is authenticated, open main panel
        openMainPanel(context, authService);
    });
    context.subscriptions.push(open);

    // NEW (Jira): palette command to create Jira tasks
    const createJira = vscode.commands.registerCommand(
        "ai.createJiraTasks",
        (...args) => (0, createJiraTasks_1.createJiraTasksCmd)(context, ...(args || []))
    );
    context.subscriptions.push(createJira);
}

// Function to open the main application panel
async function openMainPanel(context, authService) {
    const panel = vscode.window.createWebviewPanel("aiCollabPanel", "AI Collab Agent - Team Platform", vscode.ViewColumn.Active, {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [
            vscode.Uri.file(path.join(context.extensionPath, "media")),
        ],
    });
    panel.webview.html = await getHtml(panel.webview, context);
    panel.webview.onDidReceiveMessage(async (msg) => {
        switch (msg.type) {
            case "openFile": {
                try {
                    const options = {
                        canSelectFiles: false,
                        canSelectFolders: true,
                        canSelectMany: false,
                        openLabel: "Open Folder",
                        defaultUri: vscode.Uri.file(require("os").homedir()),
                    };
                    const folderUri = await vscode.window.showOpenDialog(options);
                    if (folderUri && folderUri.length > 0) {
                        const selectedFolder = folderUri[0].fsPath;
                        const files = await vscode.workspace.fs.readDirectory(vscode.Uri.file(selectedFolder));
                        const firstFile = files.find(([name, type]) => type === vscode.FileType.File);
                        if (firstFile) {
                            const filePath = path.join(selectedFolder, firstFile[0]);
                            const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(filePath));
                            await vscode.window.showTextDocument(doc);
                            vscode.window.showInformationMessage(`Opened file: ${filePath}`);
                            try {
                                const liveShare = await vsls.getApi();
                                if (!liveShare) {
                                    vscode.window.showErrorMessage("Live Share extension is not installed or not available.");
                                    return;
                                }
                                await liveShare.share();
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
                break;
            }
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
                const teamMembersForPrompt = currentData.users.filter((user) =>
                    projectToPrompt.selectedMemberIds
                        .map((id) => String(id))
                        .includes(String(user.id)));
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
                try {
                    vscode.window.showInformationMessage("Generating AI analysis...");
                    const edgeFunctionUrl = (0, supabaseConfig_1.getEdgeFunctionUrl)();
                    const anonKey = (0, supabaseConfig_1.getSupabaseAnonKey)();
                    const response = await fetch(edgeFunctionUrl, {
                        method: "POST",
                        headers: {
                            "Content-Type": "application/json",
                            "Authorization": `Bearer ${anonKey}`,
                        },
                        body: JSON.stringify({
                            project: projectToPrompt,
                            users: teamMembersForPrompt
                        }),
                    });
                    if (!response.ok) {
                        throw new Error(`Edge function error: ${response.statusText}`);
                    }
                    const aiResult = await response.json();
                    const aiResponse = aiResult.message || aiResult.response || "No response received";
                    const supabase = (0, supabaseConfig_1.getSupabaseClient)();
                    await supabase.from("ai_prompts").insert([{
                            project_id: projectToPrompt.id,
                            prompt_content: promptContent,
                            ai_response: aiResponse,
                        }]);
                    const tempFileName = `AI_Response_${projectToPrompt.name.replace(/[^a-zA-Z0-9]/g, "_")}_${Date.now()}.txt`;
                    const workspaceFolders = vscode.workspace.workspaceFolders;
                    if (workspaceFolders) {
                        const fullContent = `${promptContent}\n\n${"=".repeat(80)}\nAI RESPONSE:\n${"=".repeat(80)}\n\n${aiResponse}`;
                        const filePath = vscode.Uri.joinPath(workspaceFolders[0].uri, tempFileName);
                        await fs.writeFile(filePath.fsPath, fullContent, "utf-8");
                        await vscode.window.showTextDocument(filePath, {
                            viewColumn: vscode.ViewColumn.Beside,
                            preview: false,
                        });
                    }
                    panel.webview.postMessage({
                        type: "aiResponseReceived",
                        payload: {
                            prompt: promptContent,
                            response: aiResponse
                        },
                    });
                    vscode.window.showInformationMessage(`✅ AI analysis complete for project: ${projectToPrompt.name}`);
                }
                catch (error) {
                    vscode.window.showErrorMessage(`Failed to generate AI response: ${error.message}`);
                    panel.webview.postMessage({
                        type: "promptGenerationError",
                        payload: { message: error.message },
                    });
                }
                break;
            }

            // NEW (Jira): webview freeform → create Jira tasks
            case "createJiraFromDescription": {
                try {
                    const description = msg?.payload?.description || "";
                    if (!description.trim()) {
                        throw new Error("No description provided.");
                    }
                    const result = await (0, createJiraTasks_1.createJiraTasksCmd)(extensionContext, { description });
                    panel.webview.postMessage({
                        type: "jiraCreated",
                        payload: {
                            message: result?.message || "Jira issues created!",
                            issues: result?.issues || []
                        }
                    });
                } catch (err) {
                    panel.webview.postMessage({
                        type: "jiraError",
                        payload: { message: err instanceof Error ? err.message : "Failed to create Jira issues." }
                    });
                }
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
}

function deactivate() {
    // Clean up resources if needed
}

async function getLoginHtml(webview, context) {
    const nonce = getNonce();
    const htmlPath = path.join(context.extensionPath, "media", "login.html");
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
//# sourceMappingURL=extension.js.map
