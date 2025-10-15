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
const supabaseConfig_1 = require("./supabaseConfig");
// SUPABASE DATABASE FUNCTIONS
// Load all users from Supabase
async function loadUsersFromSupabase() {
    try {
        const supabase = (0, supabaseConfig_1.getSupabaseClient)();
        const { data, error } = await supabase
            .from("users")
            .select("*")
            .order("created_at", { ascending: false });
        if (error) {
            console.error("Error loading users:", error);
            return [];
        }
        return data || [];
    }
    catch (error) {
        console.error("Failed to load users from Supabase:", error);
        return [];
    }
}
// Load all projects with their team members from Supabase
async function loadProjectsFromSupabase() {
    try {
        const supabase = (0, supabaseConfig_1.getSupabaseClient)();
        // First, get all projects
        const { data: projects, error: projectsError } = await supabase
            .from("projects")
            .select("*")
            .order("created_at", { ascending: false });
        if (projectsError) {
            console.error("Error loading projects:", projectsError);
            return [];
        }
        if (!projects || projects.length === 0) {
            return [];
        }
        // For each project, get its team members
        const projectsWithMembers = await Promise.all(projects.map(async (project) => {
            const { data: members, error: membersError } = await supabase
                .from("project_members")
                .select("user_id")
                .eq("project_id", project.id);
            if (membersError) {
                console.error("Error loading project members:", membersError);
                return { ...project, selectedMemberIds: [] };
            }
            const selectedMemberIds = members?.map((m) => m.user_id) || [];
            return { ...project, selectedMemberIds };
        }));
        return projectsWithMembers;
    }
    catch (error) {
        console.error("Failed to load projects from Supabase:", error);
        return [];
    }
}
// Get prompt count from Supabase
async function getPromptCount() {
    try {
        const supabase = (0, supabaseConfig_1.getSupabaseClient)();
        const { count, error } = await supabase
            .from("ai_prompts")
            .select("*", { count: "exact", head: true });
        if (error) {
            console.error("Error getting prompt count:", error);
            return 0;
        }
        return count || 0;
    }
    catch (error) {
        console.error("Failed to get prompt count:", error);
        return 0;
    }
}
// Load all data from Supabase
async function loadDataFromSupabase() {
    const users = await loadUsersFromSupabase();
    const projects = await loadProjectsFromSupabase();
    const promptCount = await getPromptCount();
    return {
        users,
        projects,
        promptCount,
    };
}
// Save a new user to Supabase
async function saveUserToSupabase(user) {
    try {
        const supabase = (0, supabaseConfig_1.getSupabaseClient)();
        const { data, error } = await supabase
            .from("users")
            .insert([user])
            .select()
            .single();
        if (error) {
            console.error("Error saving user:", error);
            throw new Error(error.message);
        }
        return data;
    }
    catch (error) {
        console.error("Failed to save user to Supabase:", error);
        throw error;
    }
}
// Save a new project to Supabase
async function saveProjectToSupabase(project, selectedMemberIds) {
    try {
        const supabase = (0, supabaseConfig_1.getSupabaseClient)();
        // Insert the project
        const { data: projectData, error: projectError } = await supabase
            .from("projects")
            .insert([project])
            .select()
            .single();
        if (projectError) {
            console.error("Error saving project:", projectError);
            throw new Error(projectError.message);
        }
        // Insert project members
        if (selectedMemberIds.length > 0) {
            const projectMembers = selectedMemberIds.map((userId) => ({
                project_id: projectData.id,
                user_id: userId,
            }));
            const { error: membersError } = await supabase
                .from("project_members")
                .insert(projectMembers);
            if (membersError) {
                console.error("Error saving project members:", membersError);
                // Don't throw here, project is already saved
            }
        }
        return projectData;
    }
    catch (error) {
        console.error("Failed to save project to Supabase:", error);
        throw error;
    }
}
// Delete a user from Supabase
async function deleteUserFromSupabase(userId) {
    try {
        const supabase = (0, supabaseConfig_1.getSupabaseClient)();
        const { error } = await supabase.from("users").delete().eq("id", userId);
        if (error) {
            console.error("Error deleting user:", error);
            throw new Error(error.message);
        }
    }
    catch (error) {
        console.error("Failed to delete user from Supabase:", error);
        throw error;
    }
}
// Delete a project from Supabase
async function deleteProjectFromSupabase(projectId) {
    try {
        const supabase = (0, supabaseConfig_1.getSupabaseClient)();
        const { error } = await supabase
            .from("projects")
            .delete()
            .eq("id", projectId);
        if (error) {
            console.error("Error deleting project:", error);
            throw new Error(error.message);
        }
    }
    catch (error) {
        console.error("Failed to delete project from Supabase:", error);
        throw error;
    }
}
// Call the Edge Function to generate AI response
async function callAIEdgeFunction(project, users) {
    try {
        const edgeFunctionUrl = (0, supabaseConfig_1.getEdgeFunctionUrl)();
        const supabase = (0, supabaseConfig_1.getSupabaseClient)();
        // Use the anon key directly for authentication
        const response = await fetch(edgeFunctionUrl, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${(0, supabaseConfig_1.getSupabaseAnonKey)()}`,
            },
            body: JSON.stringify({
                project,
                users,
            }),
        });
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Edge function error: ${response.status} - ${errorText}`);
        }
        const data = await response.json();
        return data.message || data.response || "No response from AI";
    }
    catch (error) {
        console.error("Failed to call AI edge function:", error);
        throw error;
    }
}
// Save AI prompt and response to Supabase
async function saveAIPromptToSupabase(projectId, promptContent, aiResponse) {
    try {
        const supabase = (0, supabaseConfig_1.getSupabaseClient)();
        const { error } = await supabase.from("ai_prompts").insert([
            {
                project_id: projectId,
                prompt_content: promptContent,
                ai_response: aiResponse,
            },
        ]);
        if (error) {
            console.error("Error saving AI prompt:", error);
            // Don't throw, this is not critical
        }
    }
    catch (error) {
        console.error("Failed to save AI prompt to Supabase:", error);
    }
}
function activate(context) {
    vscode.window.showInformationMessage("AI Collab Agent activated (Supabase)");
    // ---- Debug/health command
    const hello = vscode.commands.registerCommand("aiCollab.debugHello", () => {
        vscode.window.showInformationMessage("Hello from AI Collab Agent!");
    });
    context.subscriptions.push(hello);
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
        panel.webview.onDidReceiveMessage(async (msg) => {
            switch (msg.type) {
                case "loadData": {
                    try {
                        const data = await loadDataFromSupabase();
                        panel.webview.postMessage({
                            type: "dataLoaded",
                            payload: data,
                        });
                    }
                    catch (error) {
                        vscode.window.showErrorMessage(`Failed to load data: ${error.message}`);
                        panel.webview.postMessage({
                            type: "dataLoaded",
                            payload: { users: [], projects: [], promptCount: 0 },
                        });
                    }
                    break;
                }
                case "addUser": {
                    try {
                        const { user } = msg.payload;
                        const savedUser = await saveUserToSupabase(user);
                        if (savedUser) {
                            vscode.window.showInformationMessage(`Team member ${user.name} added successfully!`);
                            // Reload data
                            const data = await loadDataFromSupabase();
                            panel.webview.postMessage({
                                type: "dataLoaded",
                                payload: data,
                            });
                        }
                    }
                    catch (error) {
                        vscode.window.showErrorMessage(`Failed to add user: ${error.message}`);
                    }
                    break;
                }
                case "createProject": {
                    try {
                        const { project, selectedMemberIds } = msg.payload;
                        const savedProject = await saveProjectToSupabase(project, selectedMemberIds);
                        if (savedProject) {
                            vscode.window.showInformationMessage(`Project ${project.name} created successfully!`);
                            // Reload data
                            const data = await loadDataFromSupabase();
                            panel.webview.postMessage({
                                type: "dataLoaded",
                                payload: data,
                            });
                        }
                    }
                    catch (error) {
                        vscode.window.showErrorMessage(`Failed to create project: ${error.message}`);
                    }
                    break;
                }
                case "deleteUser": {
                    try {
                        const { userId } = msg.payload;
                        await deleteUserFromSupabase(userId);
                        vscode.window.showInformationMessage("Team member removed successfully!");
                        // Reload data
                        const data = await loadDataFromSupabase();
                        panel.webview.postMessage({
                            type: "dataLoaded",
                            payload: data,
                        });
                    }
                    catch (error) {
                        vscode.window.showErrorMessage(`Failed to remove user: ${error.message}`);
                    }
                    break;
                }
                case "deleteProject": {
                    try {
                        const { projectId } = msg.payload;
                        await deleteProjectFromSupabase(projectId);
                        vscode.window.showInformationMessage("Project removed successfully!");
                        // Reload data
                        const data = await loadDataFromSupabase();
                        panel.webview.postMessage({
                            type: "dataLoaded",
                            payload: data,
                        });
                    }
                    catch (error) {
                        vscode.window.showErrorMessage(`Failed to remove project: ${error.message}`);
                    }
                    break;
                }
                case "generatePrompt": {
                    try {
                        const { projectId } = msg.payload;
                        // Load current data
                        const currentData = await loadDataFromSupabase();
                        const projectToPrompt = currentData.projects.find((p) => p.id === projectId);
                        if (!projectToPrompt) {
                            vscode.window.showErrorMessage("Project not found for AI prompt generation.");
                            panel.webview.postMessage({
                                type: "promptGenerationError",
                                payload: { message: "Project not found." },
                            });
                            break;
                        }
                        // Filter team members for this project
                        const teamMembersForPrompt = currentData.users.filter((user) => projectToPrompt.selectedMemberIds.includes(user.id));
                        // Show loading state
                        panel.webview.postMessage({
                            type: "promptGenerating",
                            payload: { message: "Calling AI to analyze your project..." },
                        });
                        // Call the Edge Function to get AI response
                        let aiResponse;
                        try {
                            aiResponse = await callAIEdgeFunction(projectToPrompt, teamMembersForPrompt);
                        }
                        catch (aiError) {
                            vscode.window.showErrorMessage(`AI generation failed: ${aiError.message}`);
                            panel.webview.postMessage({
                                type: "promptGenerationError",
                                payload: {
                                    message: `AI generation failed: ${aiError.message}`,
                                },
                            });
                            break;
                        }
                        // Create the prompt content for display
                        const teamMemberDetails = teamMembersForPrompt
                            .map((user, index) => `Team Member ${index + 1}:
Name: ${user.name}
Skills: ${user.skills}
Programming Languages: ${user.programming_languages}
Willing to work on: ${user.willing_to_work_on || "Not specified"}

`)
                            .join("");
                        const promptContent = `PROJECT ANALYSIS AND TEAM OPTIMIZATION REQUEST

=== PROJECT INFORMATION ===
Project Name: ${projectToPrompt.name}
Created: ${new Date(projectToPrompt.created_at).toLocaleString()}

Project Description:
${projectToPrompt.description}

Project Goals:
${projectToPrompt.goals || "Not specified"}

Project Requirements:
${projectToPrompt.requirements || "Not specified"}

=== TEAM COMPOSITION ===
Team Size: ${teamMembersForPrompt.length} members

${teamMemberDetails}

=== AI ANALYSIS RESPONSE ===

${aiResponse}`;
                        // Save to file
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
                        // Save to Supabase
                        await saveAIPromptToSupabase(projectId, promptContent, aiResponse);
                        // Send response to webview
                        panel.webview.postMessage({
                            type: "promptGeneratedFromExtension",
                            payload: { prompt: aiResponse },
                        });
                        // Reload data to update prompt count
                        const updatedData = await loadDataFromSupabase();
                        panel.webview.postMessage({
                            type: "dataLoaded",
                            payload: updatedData,
                        });
                        vscode.window.showInformationMessage(`AI analysis completed for project: ${projectToPrompt.name}`);
                    }
                    catch (error) {
                        vscode.window.showErrorMessage(`Failed to generate prompt: ${error.message}`);
                        panel.webview.postMessage({
                            type: "promptGenerationError",
                            payload: { message: error.message },
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
    });
    context.subscriptions.push(open);
}
function deactivate() { }
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
            connect-src https://*.supabase.co;
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
