import * as vscode from "vscode";
import * as fs from "fs/promises";
import * as path from "path";
import * as vsls from "vsls/vscode";
import { activateCodeReviewer } from "./ai_analyze";
import { AuthService, AuthUser } from "./authService";
import { DatabaseService, Profile, Project, ProjectMember, AIPrompt } from "./databaseService";
import { getSupabaseClient, getEdgeFunctionUrl, getSupabaseAnonKey, getSupabaseUrl } from "./supabaseConfig";

// No .env loading needed; using hardcoded config in supabaseConfig

// Global variables for OAuth callback handling
let authService: AuthService;
let databaseService: DatabaseService;
let extensionContext: vscode.ExtensionContext;

// Helper function to get the full path to our data file
function getDataFilePath(): string | undefined {
	const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
	if (!workspaceFolder) {
		return undefined; // No open folder
	}
	// We'll store our data in a hidden file in the root of the workspace
	return path.join(workspaceFolder.uri.fsPath, ".aiCollabData.json");
}

// Helper function to load all data from the database
async function loadInitialData(): Promise<any> {
  if (!authService.isAuthenticated()) {
    return { users: [], projects: [], promptCount: 0 };
  }

  const user = authService.getCurrentUser();
  if (!user) {
    return { users: [], projects: [], promptCount: 0 };
  }

  try {
    // Get user's profile
    // Note: getProfile expects auth.users.id, but we need profile.id for database operations
    let profile = await databaseService.getProfile(user.id);
    
    // If profile doesn't exist, create one
    if (!profile) {
      console.log('Creating new profile for user:', user.id);
      console.log('User object:', user);
      profile = await databaseService.createProfile(
        user.id,
        user.name || user.email || 'User',
        '',
        '',
        ''
      );
    }
    
    if (!profile) {
      console.error('Failed to get or create profile');
      return { users: [], projects: [], promptCount: 0 };
    }
    
    // Use profile.id for all database operations (not user.id which is auth.users.id)
    const profileId = profile.id;
    
    // Get user's projects (both as owner and as member)
    const projects = await databaseService.getProjectsForUser(profileId);
    
    // Get project members for each project and include owner_id
    const projectsWithMembers = await Promise.all(
      projects.map(async (project) => {
        const members = await databaseService.getProjectMembers(project.id);
        return {
          ...project,
          selectedMemberIds: members.map(m => m.user_id),
          owner_id: project.owner_id  // Ensure owner_id is included
        };
      })
    );

    // Get all profiles from user's projects (for team members display)
    const allProfiles = await databaseService.getAllProfilesForUserProjects(profileId);

    // Get AI prompts count
    const allPrompts = await Promise.all(
      projects.map(project => databaseService.getAIPromptsForProject(project.id))
    );
    const promptCount = allPrompts.flat().length;

    return {
      currentUser: profile, // Current user's profile for editing
      users: allProfiles, // All team members from user's projects
      projects: projectsWithMembers,
      promptCount
    };
  } catch (error) {
    console.error("Error loading data from database:", error);
    return { users: [], projects: [], promptCount: 0 };
  }
}

// Helper function to save data to the database
async function saveInitialData(data: any): Promise<void> {
  if (!authService.isAuthenticated()) {
    vscode.window.showErrorMessage("Please log in to save data.");
    return;
  }

  const user = authService.getCurrentUser();
  if (!user) {
    vscode.window.showErrorMessage("User not found. Please log in again.");
    return;
  }

  try {
    // Update user profile if provided
    if (data.users && data.users.length > 0) {
      const userData = data.users[0];
      await databaseService.updateProfile(user.id, {
        name: userData.name || '',
        skills: Array.isArray(userData.skills) ? userData.skills.join(', ') : (userData.skills || ''),
        programming_languages: Array.isArray(userData.programming_languages) ? userData.programming_languages.join(', ') : (userData.programming_languages || ''),
        willing_to_work_on: userData.willing_to_work_on || ''
      });
    }

    // Note: Projects are now managed individually through the database
    // The saveInitialData function is mainly used for profile updates
    console.log("Data saved to database successfully");
  } catch (error) {
    console.error("Failed to save data to database:", error);
    vscode.window.showErrorMessage("Failed to save data to database.");
  }
}

export async function activate(context: vscode.ExtensionContext) {
  activateCodeReviewer(context);
  // Environment variables are not required; configuration is hardcoded

  vscode.window.showInformationMessage("AI Collab Agent activated");

  // Store context globally for callback server
  extensionContext = context;

  // Initialize authentication service
  try {
    authService = new AuthService();
    authService.initialize();
  } catch (error) {
    vscode.window.showErrorMessage(
      `Authentication setup failed: ${
        error instanceof Error ? error.message : "Unknown error"
      }`
    );
    return;
  }

  // Initialize database service
  try {
    const supabaseUrl = getSupabaseUrl();
    const supabaseAnonKey = getSupabaseAnonKey();
    databaseService = new DatabaseService(supabaseUrl, supabaseAnonKey);
  } catch (error) {
    vscode.window.showErrorMessage(
      `Database setup failed: ${
        error instanceof Error ? error.message : "Unknown error"
      }`
    );
    return;
  }

  // Register URI handler for custom protocol
  // In your URI handler, add this additional check:
const handleUri = vscode.window.registerUriHandler({
  handleUri(uri: vscode.Uri) {
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

        // Set the session in Supabase
        authService
          .setSessionFromTokens(accessToken, refreshToken || undefined)
          .then(() => {
            console.log("Session set successfully");
            vscode.window.showInformationMessage(
              "Authentication successful! Redirecting to main app..."
            );

            // Open the main panel after successful authentication
            setTimeout(() => {
              openMainPanel(extensionContext, authService);
            }, 1000);
          })
          .catch((error) => {
            console.error("Error setting session:", error);
            vscode.window.showErrorMessage(
              "Authentication failed: " + error.message
            );
          });
      } else {
        console.error("No access token found in callback");
        vscode.window.showErrorMessage(
          "Authentication failed: No access token received"
        );
      }
    } else {
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
    
    vscode.window.showInformationMessage(
      `Auth Status: ${isAuth ? 'Authenticated' : 'Not authenticated'}\n` +
      `User: ${user ? user.email : 'None'}\n` +
      `Session: ${session ? 'Active' : 'None'}`
    );
  });
  context.subscriptions.push(debugAuth);

  const liveShare = (await vsls.getApi()) as vsls.LiveShare | null;
	liveShare?.onDidChangeSession((e) =>
		console.log("[AI Collab] Live Share role:", e.session?.role)
	);

	// Add status bar button
	const statusBarItem = vscode.window.createStatusBarItem(
		vscode.StatusBarAlignment.Left,
		1
	);
	statusBarItem.text = "$(squirrel) AI Collab Agent";
	statusBarItem.tooltip = "Open AI Collab Panel";
	statusBarItem.command = "aiCollab.openPanel";
	statusBarItem.show();
	context.subscriptions.push(statusBarItem);

  // ---- Main command: opens the webview panel
  const open = vscode.commands.registerCommand(
    "aiCollab.openPanel",
    async () => {
      // Check if user is authenticated
      if (!authService.isAuthenticated()) {
        // Show login page
        const loginPanel = vscode.window.createWebviewPanel(
          "aiCollabLogin",
          "AI Collab Agent - Login",
          vscode.ViewColumn.Active,
          {
            enableScripts: true,
            retainContextWhenHidden: true,
            localResourceRoots: [
              vscode.Uri.file(path.join(context.extensionPath, "media")),
            ],
          }
        );

        loginPanel.webview.html = await getLoginHtml(
          loginPanel.webview,
          context
        );

        // Handle login messages
        loginPanel.webview.onDidReceiveMessage(async (msg: any) => {
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
                // Close login panel and open main panel
                loginPanel.dispose();
                openMainPanel(context, authService);
              } else {
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
                    message:
                      "Account created successfully! Please check your email to verify your account.",
                  },
                });
                // Close login panel and open main panel
                loginPanel.dispose();
                openMainPanel(context, authService);
              } else {
                loginPanel.webview.postMessage({
                  type: "authError",
                  payload: { message: result.error || "Sign up failed" },
                });
              }
              break;
            }

            case "signInWithGoogle": {
              try {
                console.log("Starting Google OAuth...");
                const result = await authService.signInWithGoogle();
                console.log("Google OAuth result:", result);

                if (result.error) {
                  console.error("Google OAuth error:", result.error);
                  loginPanel.webview.postMessage({
                    type: "authError",
                    payload: { message: result.error },
                  });
                } else {
                  console.log("Google OAuth URL opened successfully");
                  // Show message that browser will open
                  loginPanel.webview.postMessage({
                    type: "authSuccess",
                    payload: {
                      user: null,
                      message: "Opening browser for Google authentication...",
                    },
                  });
                }
              } catch (error) {
                console.error("Google OAuth exception:", error);
                loginPanel.webview.postMessage({
                  type: "authError",
                  payload: {
                    message:
                      error instanceof Error
                        ? error.message
                        : "Failed to open Google authentication",
                  },
                });
              }
              break;
            }

            case "signInWithGithub": {
              try {
                console.log("Starting GitHub OAuth...");
                const result = await authService.signInWithGithub();
                console.log("GitHub OAuth result:", result);

                if (result.error) {
                  console.error("GitHub OAuth error:", result.error);
                  loginPanel.webview.postMessage({
                    type: "authError",
                    payload: { message: result.error },
                  });
                } else {
                  console.log("GitHub OAuth URL opened successfully");
                  // Show message that browser will open
                  loginPanel.webview.postMessage({
                    type: "authSuccess",
                    payload: {
                      user: null,
                      message: "Opening browser for GitHub authentication...",
                    },
                  });
                }
              } catch (error) {
                console.error("GitHub OAuth exception:", error);
                loginPanel.webview.postMessage({
                  type: "authError",
                  payload: {
                    message:
                      error instanceof Error
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
              } else {
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
            // Close login panel and open main panel
            loginPanel.dispose();
            openMainPanel(context, authService);
          }
        });

        return;
      }

      // User is authenticated, open main panel
      openMainPanel(context, authService);
    }
  );
  context.subscriptions.push(open);
}

// Helper function to get the current user's profile ID
async function getCurrentUserProfileId(authService: AuthService, databaseService: DatabaseService): Promise<string | null> {
  const user = authService.getCurrentUser();
  if (!user) {
    console.log('Extension: getCurrentUserProfileId - No user found');
    return null;
  }
  
  console.log('Extension: getCurrentUserProfileId - User ID:', user.id);
  const profile = await databaseService.getProfile(user.id);
  
  if (!profile) {
    console.error('Extension: getCurrentUserProfileId - No profile found for user:', user.id);
    return null;
  }
  
  console.log('Extension: getCurrentUserProfileId - Profile found:', { 
    profileId: profile.id, 
    authUserId: user.id 
  });
  
  // Return profile.id which is used for all database operations
  // (not user.id which is auth.users.id)
  // Note: profiles.id is the primary key, profiles.user_id references auth.users.id
  return profile.id;
}

// Function to open the main application panel
async function openMainPanel(
  context: vscode.ExtensionContext,
  authService: AuthService
) {
  const panel = vscode.window.createWebviewPanel(
    "aiCollabPanel",
    "AI Collab Agent - Team Platform",
    vscode.ViewColumn.Active,
    {
      enableScripts: true,
      retainContextWhenHidden: true,
      localResourceRoots: [
        vscode.Uri.file(path.join(context.extensionPath, "media")),
      ],
    }
  );

  panel.webview.html = await getHtml(panel.webview, context);

  panel.webview.onDidReceiveMessage(async (msg: any) => {
    console.log('Extension: Received message from webview:', { type: msg.type, payload: msg.payload });
    
    switch (msg.type) {
      
      case "openFile": {
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
							const files = await vscode.workspace.fs.readDirectory(
								vscode.Uri.file(selectedFolder)
							);

							// Open the first file in the folder (or prompt the user to select one)
							const firstFile = files.find(
								([name, type]) => type === vscode.FileType.File
							);
							if (firstFile) {
								const filePath = path.join(selectedFolder, firstFile[0]);
								const doc = await vscode.workspace.openTextDocument(
									vscode.Uri.file(filePath)
								);
								await vscode.window.showTextDocument(doc);
								vscode.window.showInformationMessage(
									`Opened file: ${filePath}`
								);

								try {
									/// Start a Live Share session
									const liveShare = await vsls.getApi(); // Get the Live Share API
									if (!liveShare) {
										vscode.window.showErrorMessage(
											"Live Share extension is not installed or not available."
										);
										return;
									}

									await liveShare.share(); // May return undefined even if successful

									// Check if session is active
									if (liveShare.session && liveShare.session.id) {
										vscode.window.showInformationMessage(
											"Live Share session started!"
										);
										console.log("Live Share session info:", liveShare.session);
									} else {
										vscode.window.showErrorMessage(
											"Failed to start Live Share session."
										);
									}
								} catch (error) {
									console.error("Error starting Live Share session:", error);
									vscode.window.showErrorMessage(
										"An error occurred while starting Live Share."
									);
								}
							} else {
								vscode.window.showWarningMessage(
									"No files found in the selected folder."
								);
							}
						} else {
							vscode.window.showWarningMessage("No folder selected.");
						}
					} catch (error) {
						vscode.window.showErrorMessage(
							`Failed to open file: ${
								error instanceof Error ? error.message : "Unknown error"
							}`
						);
					}
        break;
      }
      
      case "saveData": {
        await saveInitialData(msg.payload);
        vscode.window.showInformationMessage(
          "Team data saved to database!"
        );
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
        const projectToPrompt = currentData.projects.find(
          (p: any) => p.id == projectId
        );

        if (!projectToPrompt) {
          vscode.window.showErrorMessage(
            "Project not found for AI prompt generation."
          );
          panel.webview.postMessage({
            type: "promptGenerationError",
            payload: { message: "Project not found." },
          });
          break;
        }

        // --- FIX APPLIED HERE: Robust ID comparison ---
        const teamMembersForPrompt = currentData.users.filter((user: any) =>
          // Convert all IDs to string for reliable comparison
          projectToPrompt.selectedMemberIds
            .map((id: any) => String(id))
            .includes(String(user.id))
        );
        // --- END FIX ---

        // Create the detailed string ONLY from the filtered members
        const teamMemberDetails = teamMembersForPrompt
          .map(
            (user: any, index: number) =>
              `Team Member ${index + 1}:

Name: ${user.name}
Skills: ${user.skills || "Not specified"}
Programming Languages: ${user.programming_languages || "Not specified"}
Willing to work on: ${user.willing_to_work_on || "Not specified"}

`
          )
          .join("");

        const promptContent = `PROJECT ANALYSIS AND TEAM OPTIMIZATION REQUEST

=== PROJECT INFORMATION ===
Project Name: ${projectToPrompt.name}
Created: ${new Date(projectToPrompt.created_at).toLocaleString()}

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

        // Call the Supabase Edge Function to get AI response
        try {
          vscode.window.showInformationMessage("Generating AI analysis...");
          
          const edgeFunctionUrl = getEdgeFunctionUrl();
          const anonKey = getSupabaseAnonKey();
          
          // Send in the format the edge function expects: { project, users }
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

          // Save to database
          const supabase = getSupabaseClient();
          await supabase.from("ai_prompts").insert([{
            project_id: projectToPrompt.id,
            prompt_content: promptContent,
            ai_response: aiResponse,
          }]);

          // Save to file
          const tempFileName = `AI_Response_${projectToPrompt.name.replace(
            /[^a-zA-Z0-9]/g,
            "_"
          )}_${Date.now()}.txt`;
          const workspaceFolders = vscode.workspace.workspaceFolders;
          if (workspaceFolders) {
            const fullContent = `${promptContent}\n\n${"=".repeat(80)}\nAI RESPONSE:\n${"=".repeat(80)}\n\n${aiResponse}`;
            const filePath = vscode.Uri.joinPath(
              workspaceFolders[0].uri,
              tempFileName
            );
            await fs.writeFile(filePath.fsPath, fullContent, "utf-8");
            await vscode.window.showTextDocument(filePath, {
              viewColumn: vscode.ViewColumn.Beside,
              preview: false,
            });
          }

          // Send response back to webview
          panel.webview.postMessage({
            type: "aiResponseReceived",
            payload: { 
              prompt: promptContent,
              response: aiResponse 
            },
          });

          vscode.window.showInformationMessage(
            `✅ AI analysis complete for project: ${projectToPrompt.name}`
          );
        } catch (error: any) {
          vscode.window.showErrorMessage(
            `Failed to generate AI response: ${error.message}`
          );
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

      case "createProject": {
        const { name, description, goals, requirements } = msg.payload;
        const profileId = await getCurrentUserProfileId(authService, databaseService);
        
        if (!profileId) {
          vscode.window.showErrorMessage("Please log in to create a project.");
          break;
        }

        try {
          console.log('Creating project:', { name, description, goals, requirements, profileId });
          const project = await databaseService.createProject(name, description, goals, requirements, profileId);
          console.log('Project created:', project);
          
          if (project) {
            // Add the creator as a project member
            console.log('Adding project member:', { projectId: project.id, profileId });
            const memberResult = await databaseService.addProjectMember(project.id, profileId);
            console.log('Project member added:', memberResult);
            
            vscode.window.showInformationMessage(`Project "${name}" created successfully!`);
            // Reload data to show the new project
            const data = await loadInitialData();
            panel.webview.postMessage({
              type: "dataLoaded",
              payload: data,
            });
          } else {
            console.log('Project creation failed - no project returned');
            vscode.window.showErrorMessage("Failed to create project.");
          }
        } catch (error) {
          console.error("Error creating project:", error);
          vscode.window.showErrorMessage("Failed to create project.");
        }
        break;
      }

      case "deleteProject": {
        const { projectId } = msg.payload;
        console.log('Extension: deleteProject received:', { projectId });
        
        // Show confirmation dialog using VS Code's native dialog
        const confirmResult = await vscode.window.showWarningMessage(
          'Are you sure you want to delete this project? This action cannot be undone.',
          { modal: true },
          'Delete',
          'Cancel'
        );
        
        if (confirmResult !== 'Delete') {
          console.log('Extension: Delete cancelled by user');
          break;
        }
        
        const profileId = await getCurrentUserProfileId(authService, databaseService);
        console.log('Extension: Profile ID for delete:', { profileId });
        
        if (!profileId) {
          console.error('Extension: No profile ID found for delete');
          vscode.window.showErrorMessage("Please log in to delete a project.");
          break;
        }

        try {
          console.log('Extension: Calling deleteProject with:', { projectId, profileId });
          const success = await databaseService.deleteProject(projectId, profileId);
          console.log('Extension: deleteProject result:', { success });
          
          if (success) {
            vscode.window.showInformationMessage("Project deleted successfully!");
            // Reload data to reflect the deletion
            const data = await loadInitialData();
            panel.webview.postMessage({
              type: "dataLoaded",
              payload: data,
            });
          } else {
            console.error('Extension: deleteProject returned false');
            vscode.window.showErrorMessage("Failed to delete project. You may not be the owner.");
          }
        } catch (error) {
          console.error("Extension: Error deleting project:", error);
          vscode.window.showErrorMessage(`Failed to delete project: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
        break;
      }

      case "leaveProject": {
        const { projectId } = msg.payload;
        console.log('Extension: leaveProject received:', { projectId });
        
        // Show confirmation dialog using VS Code's native dialog
        const confirmResult = await vscode.window.showWarningMessage(
          'Are you sure you want to leave this project?',
          { modal: true },
          'Leave',
          'Cancel'
        );
        
        if (confirmResult !== 'Leave') {
          console.log('Extension: Leave cancelled by user');
          break;
        }
        
        const profileId = await getCurrentUserProfileId(authService, databaseService);
        console.log('Extension: Profile ID for leave:', { profileId });
        
        if (!profileId) {
          console.error('Extension: No profile ID found for leave');
          vscode.window.showErrorMessage("Please log in to leave a project.");
          break;
        }

        try {
          console.log('Extension: Calling leaveProject with:', { projectId, profileId });
          const success = await databaseService.leaveProject(projectId, profileId);
          console.log('Extension: leaveProject result:', { success });
          
          if (success) {
            vscode.window.showInformationMessage("Left project successfully!");
            // Reload data to reflect leaving
            const data = await loadInitialData();
            panel.webview.postMessage({
              type: "dataLoaded",
              payload: data,
            });
          } else {
            console.error('Extension: leaveProject returned false');
            vscode.window.showErrorMessage("Failed to leave project. If you're the owner, you must delete the project instead.");
          }
        } catch (error) {
          console.error("Extension: Error leaving project:", error);
          vscode.window.showErrorMessage(`Failed to leave project: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
        break;
      }

      case "updateProject": {
        const { projectId, description, goals, requirements } = msg.payload;
        const profileId = await getCurrentUserProfileId(authService, databaseService);
        
        if (!profileId) {
          vscode.window.showErrorMessage("Please log in to update a project.");
          break;
        }

        try {
          const project = await databaseService.updateProject(projectId, {
            description,
            goals,
            requirements
          }, profileId);
          
          if (project) {
            vscode.window.showInformationMessage("Project updated successfully!");
            // Reload data to show the updated project
            const data = await loadInitialData();
            panel.webview.postMessage({
              type: "dataLoaded",
              payload: data,
            });
          } else {
            vscode.window.showErrorMessage("Failed to update project. You may not have permission.");
          }
        } catch (error) {
          console.error("Error updating project:", error);
          vscode.window.showErrorMessage("Failed to update project.");
        }
        break;
      }

      case "removeProjectMember": {
        const { projectId, memberId } = msg.payload;
        const profileId = await getCurrentUserProfileId(authService, databaseService);
        
        if (!profileId) {
          vscode.window.showErrorMessage("Please log in to remove a member.");
          break;
        }

        try {
          const success = await databaseService.removeProjectMember(projectId, memberId, profileId);
          if (success) {
            vscode.window.showInformationMessage("Member removed from project successfully!");
            // Reload data to reflect the change
            const data = await loadInitialData();
            panel.webview.postMessage({
              type: "dataLoaded",
              payload: data,
            });
          } else {
            vscode.window.showErrorMessage("Failed to remove member. You must be the project owner.");
          }
        } catch (error) {
          console.error("Error removing project member:", error);
          vscode.window.showErrorMessage("Failed to remove member.");
        }
        break;
      }

      case "joinProject": {
        const { inviteCode } = msg.payload;
        const user = authService.getCurrentUser();
        
        if (!user) {
          vscode.window.showErrorMessage("Please log in to join a project.");
          break;
        }

        try {
          const { inviteCode } = msg.payload;
          const user = authService.getCurrentUser();
          
          if (!user) {
            vscode.window.showErrorMessage("Please log in to join a project.");
            break;
          }

          const profileId = await getCurrentUserProfileId(authService, databaseService);
          if (!profileId) {
            vscode.window.showErrorMessage("Please log in to join a project.");
            break;
          }
          
          console.log('Joining project with code:', { inviteCode, profileId });
          const project = await databaseService.joinProjectByCode(inviteCode, profileId);
          
          if (project) {
            vscode.window.showInformationMessage(`Successfully joined project "${project.name}"!`);
            // Reload data to show the new project
            const data = await loadInitialData();
            panel.webview.postMessage({
              type: "dataLoaded",
              payload: data,
            });
          } else {
            vscode.window.showErrorMessage("Invalid invite code or failed to join project.");
          }
        } catch (error) {
          console.error("Error joining project:", error);
          vscode.window.showErrorMessage("Failed to join project.");
        }
        break;
      }

      case "updateProfile": {
        const { skills, programmingLanguages, willingToWorkOn } = msg.payload;
        const user = authService.getCurrentUser();
        
        if (!user) {
          vscode.window.showErrorMessage("Please log in to update your profile.");
          panel.webview.postMessage({
            type: 'profileUpdateError',
            payload: { message: 'Please log in to update your profile' }
          });
          break;
        }

        try {
          const profile = await databaseService.updateProfile(user.id, {
            skills,
            programming_languages: programmingLanguages,
            willing_to_work_on: willingToWorkOn
          });
          if (profile) {
            vscode.window.showInformationMessage("Profile updated successfully!");
            // Send success message to webview
            panel.webview.postMessage({
              type: 'profileUpdated',
              payload: { profile }
            });
          } else {
            panel.webview.postMessage({
              type: 'profileUpdateError',
              payload: { message: 'Failed to update profile' }
            });
          }
        } catch (error: any) {
          console.error('Error updating profile:', error);
          panel.webview.postMessage({
            type: 'profileUpdateError',
            payload: { message: error.message || 'Failed to update profile' }
          });
        }
        break;
      }

      case "oldUpdateProfile": {
        const { name, skills, languages, preferences } = msg.payload;
        const user = authService.getCurrentUser();
        
        if (!user) {
          vscode.window.showErrorMessage("Please log in to update your profile.");
          break;
        }

        try {
          const profile = await databaseService.updateProfile(user.id, {
            name,
            skills,
            programming_languages: languages,
            willing_to_work_on: preferences
          });
          if (profile) {
            vscode.window.showInformationMessage("Profile updated successfully!");
            // Reload data to show the updated profile
            const data = await loadInitialData();
            panel.webview.postMessage({
              type: "dataLoaded",
              payload: data,
            });
          } else {
            vscode.window.showErrorMessage("Failed to update profile.");
          }
        } catch (error) {
          console.error("Error updating profile:", error);
          vscode.window.showErrorMessage("Failed to update profile.");
        }
        break;
      }

      case "migrateFromJSON": {
        const user = authService.getCurrentUser();
        
        if (!user) {
          vscode.window.showErrorMessage("Please log in to migrate data.");
          break;
        }

        try {
          // Try to load existing JSON data
          const filePath = getDataFilePath();
          if (filePath) {
            try {
              const fileContent = await fs.readFile(filePath, "utf-8");
              const jsonData = JSON.parse(fileContent);
              
              const success = await databaseService.migrateFromJSON(jsonData, user.id);
              if (success) {
                vscode.window.showInformationMessage("Data migrated successfully from JSON file!");
                // Archive the old file
                const archivePath = filePath.replace('.json', '_archived.json');
                await fs.rename(filePath, archivePath);
                
                // Reload data from database
                const data = await loadInitialData();
                panel.webview.postMessage({
                  type: "dataLoaded",
                  payload: data,
                });
              } else {
                vscode.window.showErrorMessage("Failed to migrate data from JSON file.");
              }
            } catch (error) {
              vscode.window.showInformationMessage("No existing JSON data found to migrate.");
            }
          } else {
            vscode.window.showInformationMessage("No workspace folder open for JSON migration.");
          }
        } catch (error) {
          console.error("Error during migration:", error);
          vscode.window.showErrorMessage("Failed to migrate data.");
        }
        break;
      }

      default:
        console.warn('Extension: Unknown message type received:', msg.type);
        break;
    }
  });
}

export function deactivate() {
  // Clean up resources if needed
}

async function getLoginHtml(
  webview: vscode.Webview,
  context: vscode.ExtensionContext
): Promise<string> {
  const nonce = getNonce();

  const htmlPath = path.join(context.extensionPath, "media", "login.html");

  let htmlContent = await fs.readFile(htmlPath, "utf-8");

  htmlContent = htmlContent
    .replace(
      /<head>/,
      `<head>
        <meta http-equiv="Content-Security-Policy" content="
            default-src 'none';
            style-src ${webview.cspSource} 'unsafe-inline';
            img-src ${webview.cspSource} https:;
            script-src 'nonce-${nonce}';
        ">`
    )
    .replace(/<script>/, `<script nonce="${nonce}">`);

  return htmlContent;
}

function ensureWorkspaceOpen(): boolean {
	if (!vscode.workspace.workspaceFolders?.length) {
		vscode.window.showErrorMessage("Open a folder/workspace first.");
		return false;
	}
	return true;
}

async function getHtml(
	webview: vscode.Webview,
	context: vscode.ExtensionContext
): Promise<string> {
	const nonce = getNonce();

	const htmlPath = path.join(context.extensionPath, "media", "webview.html");

	let htmlContent = await fs.readFile(htmlPath, "utf-8");

	htmlContent = htmlContent
		.replace(
			/<head>/,
			`<head>
        <meta http-equiv="Content-Security-Policy" content="
            default-src 'none';
            style-src ${webview.cspSource} 'unsafe-inline';
            img-src ${webview.cspSource} https:;
            script-src 'nonce-${nonce}';
        ">`
		)
		.replace(/<script>/, `<script nonce="${nonce}">`);

	return htmlContent;
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
function mockAllocate(payload: { [key: string]: any }): any {
	throw new Error("Function not implemented.");
}
