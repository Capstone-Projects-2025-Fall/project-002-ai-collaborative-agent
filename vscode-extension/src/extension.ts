import * as vscode from "vscode";
import * as fs from "fs/promises";
import * as path from "path";
import * as vsls from "vsls/vscode";
import { activateCodeReviewer } from "./ai_analyze";
import { AuthService, AuthUser } from "./authService";
import { DatabaseService, Profile, Project, ProjectMember, AIPrompt } from "./databaseService";
import { getSupabaseClient, getEdgeFunctionUrl, getSupabaseAnonKey, getSupabaseUrl } from "./supabaseConfig";
import { createJiraTasksCmd, JiraTaskOptions } from "./commands/createJiraTasks";
import { TimelineManager } from './timelineManager';
import { PeerSuggestionService } from "./peerSuggestionService";

// No .env loading needed; using hardcoded config in supabaseConfig

// Global variables for OAuth callback handling
let authService: AuthService;
let databaseService: DatabaseService;
let extensionContext: vscode.ExtensionContext;
let timelineManager: TimelineManager;
let peerSuggestionService: PeerSuggestionService | undefined;

type CachedJiraProfile = {
  baseUrl?: string;
  projectKey?: string;
  email?: string;
  token?: string;
  projectPrompt?: string;
};

const JIRA_PROFILE_KEY_PREFIX = "jiraProfile:";

function getCachedJiraProfile(userId: string): CachedJiraProfile | undefined {
  if (!extensionContext) {
    return undefined;
  }
  return extensionContext.globalState.get<CachedJiraProfile>(
    JIRA_PROFILE_KEY_PREFIX + userId
  );
}

async function setCachedJiraProfile(
  userId: string,
  profile?: CachedJiraProfile
) {
  if (!extensionContext) {
    return;
  }
  const hasValues =
    profile &&
    Object.values(profile).some(
      (value) => value !== undefined && value !== null && String(value).trim() !== ""
    );
  if (!hasValues) {
    await extensionContext.globalState.update(
      JIRA_PROFILE_KEY_PREFIX + userId,
      undefined
    );
    return;
  }
  await extensionContext.globalState.update(
    JIRA_PROFILE_KEY_PREFIX + userId,
    profile
  );
}
// Reopens AICollab UI when new workplace 
const GLOBAL_STATE_KEY = "reopenAiCollabAgent";
// When new workspace is open, liveshare begins
const GLOBAL_LIVESHARE_KEY = "reopenLiveShareSession";

// LLM API Key Management
const LLM_API_KEY_SECRET = "llm_api_key";
const ACTIVE_PROJECT_KEY = "activeProjectId";

// API Key Management Functions
async function getLLMApiKey(): Promise<string | undefined> {
  if (!extensionContext) {
    return undefined;
  }
  return await extensionContext.secrets.get(LLM_API_KEY_SECRET);
}

async function setLLMApiKey(key: string): Promise<void> {
  if (!extensionContext) {
    return;
  }
  await extensionContext.secrets.store(LLM_API_KEY_SECRET, key);
}

// Active Project Tracking Functions
async function getActiveProjectContext(): Promise<Project | null> {
  if (!extensionContext || !databaseService) {
    return null;
  }
  
  const activeProjectId = extensionContext.globalState.get<string>(ACTIVE_PROJECT_KEY);
  if (!activeProjectId) {
    return null;
  }

  try {
    // Get all projects for current user to find the active one
    const user = authService.getCurrentUser();
    if (!user) {
      return null;
    }
    
    const profile = await databaseService.getProfile(user.id);
    if (!profile) {
      return null;
    }

    const projects = await databaseService.getProjectsForUser(profile.id);
    return projects.find(p => p.id === activeProjectId) || null;
  } catch (error) {
    console.error("Error getting active project context:", error);
    return null;
  }
}

async function setActiveProject(projectId: string | null): Promise<void> {
  if (!extensionContext) {
    return;
  }
  if (projectId) {
    await extensionContext.globalState.update(ACTIVE_PROJECT_KEY, projectId);
  } else {
    await extensionContext.globalState.update(ACTIVE_PROJECT_KEY, undefined);
  }
}


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
    
    // Apply Jira profile caching if available
    const cachedJiraProfile = getCachedJiraProfile(user.id);
    if (profile && cachedJiraProfile) {
      profile = {
        ...profile,
        jira_base_url:
          cachedJiraProfile.baseUrl ?? profile.jira_base_url ?? null,
        jira_project_key:
          cachedJiraProfile.projectKey ?? profile.jira_project_key ?? null,
        jira_email: cachedJiraProfile.email ?? profile.jira_email ?? null,
        jira_api_token:
          cachedJiraProfile.token ?? profile.jira_api_token ?? null,
        jira_project_prompt:
          cachedJiraProfile.projectPrompt ??
          profile.jira_project_prompt ??
          null,
      };
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

    const sanitizedProfiles = allProfiles.map((profileItem: Profile) => {
      const cached =
        profileItem.id === user.id ? cachedJiraProfile : undefined;
      return {
        ...profileItem,
        jira_base_url:
          cached?.baseUrl ?? profileItem.jira_base_url ?? null,
        jira_project_key:
          cached?.projectKey ?? profileItem.jira_project_key ?? null,
        jira_email: cached?.email ?? profileItem.jira_email ?? null,
        jira_api_token: null,
        jira_project_prompt:
          cached?.projectPrompt ?? profileItem.jira_project_prompt ?? null,
      };
    });

    return {
      currentUser: profile, // Current user's profile for editing
      users: sanitizedProfiles, // All team members from user's projects (Jira tokens stripped)
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

  // Store context globally first
  extensionContext = context;

  // Initialize Timeline Manager
  timelineManager = new TimelineManager(context);
  context.subscriptions.push(timelineManager);

  const createJiraCmd = vscode.commands.registerCommand(
    "ai.createJiraTasks",
    async (options?: Partial<JiraTaskOptions>) => {
      return await createJiraTasksCmd(context, options);
    }
  );
  context.subscriptions.push(createJiraCmd);

  // Register LLM API key configuration command
  const setLLMKeyCmd = vscode.commands.registerCommand(
    "aiCollab.setLLMApiKey",
    async () => {
      const currentKey = await getLLMApiKey();
      const prompt = currentKey
        ? "Enter your LLM API key (leave empty to clear):"
        : "Enter your LLM API key:";
      
      const apiKey = await vscode.window.showInputBox({
        prompt,
        password: true,
        placeHolder: "sk-...",
        ignoreFocusOut: true,
      });

      if (apiKey === undefined) {
        return; // User cancelled
      }

      if (apiKey === "") {
        await setLLMApiKey("");
        vscode.window.showInformationMessage("LLM API key cleared.");
      } else {
        await setLLMApiKey(apiKey);
        vscode.window.showInformationMessage("LLM API key saved successfully.");
      }
    }
  );
  context.subscriptions.push(setLLMKeyCmd);

  // Initialize authentication service
  try {
    authService = new AuthService();
    await authService.initialize();
  } catch (error) {
    vscode.window.showErrorMessage(
      `Authentication setup failed: ${
        error instanceof Error ? error.message : "Unknown error"
      }`
    );
    return;
  }

  // Try to restore Supabase session from SecretStorage
  const accessToken = await context.secrets.get("supabase_access_token");
  const refreshToken = await context.secrets.get("supabase_refresh_token");

  if (accessToken) {
    try {
      await authService.setSessionFromTokens(accessToken, refreshToken || undefined);
      console.log("Restored Supabase session");
    } catch (err) {
      console.error("Failed to restore session:", err);
      await extensionContext.secrets.delete("supabase_access_token");
      await extensionContext.secrets.delete("supabase_refresh_token");
    }
  }

  // keep secrets in sync when auth state changes
  authService.onAuthStateChange(async (user) => {
    if (user) {
      const session = authService.getCurrentSession();
      if (session) {
        await extensionContext.secrets.store("supabase_access_token", session.access_token);
        await extensionContext.secrets.store("supabase_refresh_token", session.refresh_token);
        console.log(" Stored updated Supabase tokens");
      }
    } else {
      await extensionContext.secrets.delete("supabase_access_token");
      await extensionContext.secrets.delete("supabase_refresh_token");
      console.log("Cleared Supabase tokens on logout");
    }
  });

  // Auto-start Live Share session 
  const shouldStartLiveShare = context.globalState.get(GLOBAL_LIVESHARE_KEY);
  if (shouldStartLiveShare) {
    await context.globalState.update(GLOBAL_LIVESHARE_KEY, false);

    setTimeout(async () => {
      try {
        const liveShare = await vsls.getApi();
        if (liveShare) {
          await liveShare.share();
          vscode.window.showInformationMessage("Live Share session restarted automatically!");
          console.log("Auto Live Share session:", liveShare.session);
        } else {
          vscode.window.showErrorMessage("Live Share API unavailable on reload.");
        }
      } catch (err) {
        console.error("Auto-Live Share restart failed:", err);
      }
    }, 2000); // delay to let extension host finish loading
  }

  vscode.window.showInformationMessage("AI Collab Agent activated");

  // Store context globally for callback server
  extensionContext = context;

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

  // Initialize peer suggestion service (after auth and database services are ready)
  // Note: This will be initialized lazily when needed, or can be enabled via command
  // For now, we'll initialize it but it will only work when user is authenticated
  try {
    // Only initialize if user is authenticated
    if (authService.isAuthenticated()) {
      peerSuggestionService = new PeerSuggestionService(
        context,
        databaseService,
        authService,
        getActiveProjectContext
      );
      context.subscriptions.push({
        dispose: () => {
          peerSuggestionService?.dispose();
        },
      });
    }
  } catch (error) {
    console.error("Failed to initialize peer suggestion service:", error);
  }

  // Re-initialize peer suggestion service when auth state changes
  authService.onAuthStateChange(async (user) => {
    if (user && !peerSuggestionService) {
      try {
        peerSuggestionService = new PeerSuggestionService(
          context,
          databaseService,
          authService,
          getActiveProjectContext
        );
        context.subscriptions.push({
          dispose: () => {
            peerSuggestionService?.dispose();
          },
        });
      } catch (error) {
        console.error("Failed to initialize peer suggestion service on auth change:", error);
      }
    } else if (!user && peerSuggestionService) {
      peerSuggestionService.dispose();
      peerSuggestionService = undefined;
    }
  });

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
       // First, try to restore session from stored tokens if not already authenticated
      if (!authService.isAuthenticated()) {
        const accessToken = await context.secrets.get("supabase_access_token");
        const refreshToken = await context.secrets.get("supabase_refresh_token");
        
        if (accessToken) {
          try {
            await authService.setSessionFromTokens(accessToken, refreshToken || undefined);
            console.log("Restored session from stored tokens");
          } catch (err) {
            console.error("Failed to restore session from stored tokens:", err);
            // Clear invalid tokens
            await context.secrets.delete("supabase_access_token");
            await context.secrets.delete("supabase_refresh_token");
          }
        }
      }

      // Check if user is authenticated (after attempting restoration)
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
                const session = authService.getCurrentSession();
                if (session) {
                  await context.secrets.store("supabase_access_token", session.access_token);
                  await context.secrets.store("supabase_refresh_token", session.refresh_token);
                }
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
                const session = authService.getCurrentSession();
                if (session) {
                  await context.secrets.store("supabase_access_token", session.access_token);
                  await context.secrets.store("supabase_refresh_token", session.refresh_token);
                }
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
              const session = authService.getCurrentSession();
              if (session) {
                await context.secrets.store("supabase_access_token", session.access_token);
                await context.secrets.store("supabase_refresh_token", session.refresh_token);
              }
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
              const session = authService.getCurrentSession();
              if (session) {
                await context.secrets.store("supabase_access_token", session.access_token);
                await context.secrets.store("supabase_refresh_token", session.refresh_token);
              }
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
                await context.secrets.delete("supabase_access_token");
                await context.secrets.delete("supabase_refresh_token");
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

// Parse AI response - tries JSON first, falls back to text parsing
function parseAIResponse(response: string, teamMembers: any[]): any {
  // Try to parse as JSON first
  try {
    // Extract JSON from response if it's wrapped in markdown code blocks
    let jsonStr = response.trim();
    const jsonMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
      jsonStr = jsonMatch[1].trim();
    }
    
    // Try to find JSON object in the response
    const jsonStart = jsonStr.indexOf('{');
    const jsonEnd = jsonStr.lastIndexOf('}');
    if (jsonStart !== -1 && jsonEnd !== -1 && jsonEnd > jsonStart) {
      jsonStr = jsonStr.substring(jsonStart, jsonEnd + 1);
    }
    
    const parsed = JSON.parse(jsonStr);
    if (parsed && typeof parsed === 'object') {
      return parsed;
    }
  } catch (e) {
    // Not JSON, continue to text parsing
  }

  // Fallback: Parse text format
  return parseTextResponse(response, teamMembers);
}

// Parse text-based AI response
function parseTextResponse(response: string, teamMembers: any[]): any {
  const result: any = {
    teamAnalysis: { summary: '', skillMix: '', gaps: [], redundancies: [], compatibility: '' },
    feasibility: { isFeasible: true, assessment: '', challenges: [], timeline: '' },
    roleAssignments: [],
    optimization: { recommendations: [], training: [], structure: '' },
    risks: { identified: [], mitigation: [], successFactors: [] },
    deliverables: []
  };

  const lines = response.split('\n');
  let currentSection = '';
  let currentContent: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    
    // Detect section headers
    if (line.match(/^1\.?\s*TEAM\s*ANALYSIS/i)) {
      currentSection = 'teamAnalysis';
      currentContent = [];
      continue;
    } else if (line.match(/^2\.?\s*PROJECT\s*FEASIBILITY/i)) {
      currentSection = 'feasibility';
      currentContent = [];
      continue;
    } else if (line.match(/^3\.?\s*ROLE\s*ASSIGNMENTS/i)) {
      currentSection = 'roleAssignments';
      currentContent = [];
      continue;
    } else if (line.match(/^4\.?\s*OPTIMIZATION/i)) {
      currentSection = 'optimization';
      currentContent = [];
      continue;
    } else if (line.match(/^5\.?\s*RISK/i)) {
      currentSection = 'risks';
      currentContent = [];
      continue;
    } else if (line.match(/^6\.?\s*DELIVERABLES/i)) {
      currentSection = 'deliverables';
      currentContent = [];
      continue;
    }

    // Process content based on current section
    if (currentSection && line) {
      currentContent.push(line);
      
      // Extract structured data
      if (currentSection === 'teamAnalysis') {
        result.teamAnalysis.summary = currentContent.join(' ').substring(0, 500);
        if (line.toLowerCase().includes('gap')) {
          result.teamAnalysis.gaps.push(line.replace(/^[-•]\s*/, ''));
        }
      } else if (currentSection === 'feasibility') {
        result.feasibility.assessment = currentContent.join(' ').substring(0, 500);
        if (line.toLowerCase().includes('challenge') || line.toLowerCase().includes('difficult')) {
          result.feasibility.challenges.push(line.replace(/^[-•]\s*/, ''));
        }
        if (line.toLowerCase().includes('timeline') || line.toLowerCase().includes('time')) {
          result.feasibility.timeline = line;
        }
        if (line.toLowerCase().includes('feasible') || line.toLowerCase().includes('achievable')) {
          result.feasibility.isFeasible = !line.toLowerCase().includes('not');
        }
      } else if (currentSection === 'roleAssignments') {
        // Look for team member names
        for (const member of teamMembers) {
          if (line.includes(member.name)) {
            const existing = result.roleAssignments.find((r: any) => r.memberName === member.name);
            if (!existing) {
              result.roleAssignments.push({
                memberName: member.name,
                role: extractRole(line),
                tasks: { immediate: [], future: [] },
                responsibilities: [],
                collaboration: ''
              });
            }
            const assignment = result.roleAssignments.find((r: any) => r.memberName === member.name);
            if (line.includes('now') || line.includes('immediate') || line.includes('right now')) {
              assignment.tasks.immediate.push(line.replace(/^[-•]\s*/, ''));
            } else if (line.includes('future') || line.includes('later')) {
              assignment.tasks.future.push(line.replace(/^[-•]\s*/, ''));
            } else {
              assignment.responsibilities.push(line.replace(/^[-•]\s*/, ''));
            }
          }
        }
      } else if (currentSection === 'optimization') {
        if (line.startsWith('-') || line.startsWith('•')) {
          result.optimization.recommendations.push(line.replace(/^[-•]\s*/, ''));
        }
      } else if (currentSection === 'risks') {
        if (line.startsWith('-') || line.startsWith('•')) {
          if (line.toLowerCase().includes('mitigation') || line.toLowerCase().includes('mitigate')) {
            result.risks.mitigation.push(line.replace(/^[-•]\s*/, ''));
          } else {
            result.risks.identified.push(line.replace(/^[-•]\s*/, ''));
          }
        }
      } else if (currentSection === 'deliverables') {
        if (line.startsWith('-') || line.startsWith('•')) {
          result.deliverables.push({
            name: line.replace(/^[-•]\s*/, ''),
            description: '',
            assignedTo: '',
            milestone: '',
            timeline: ''
          });
        }
      }
    }
  }

  // Ensure all team members have assignments
  for (const member of teamMembers) {
    if (!result.roleAssignments.find((r: any) => r.memberName === member.name)) {
      result.roleAssignments.push({
        memberName: member.name,
        role: 'Team Member',
        tasks: { immediate: [], future: [] },
        responsibilities: [],
        collaboration: ''
      });
    }
  }

  return result;
}

// Helper to extract role from text
function extractRole(text: string): string {
  const rolePatterns = [
    /(?:as\s+)?(?:a\s+)?(back[- ]?end|front[- ]?end|full[- ]?stack|database|devops|ui\/ux|designer|developer|engineer|architect|lead|manager)/i,
    /(?:role|position)[:\s]+([^,\.]+)/i
  ];
  
  for (const pattern of rolePatterns) {
    const match = text.match(pattern);
    if (match) {
      return match[1].trim();
    }
  }
  
  return 'Team Member';
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
      case "createJiraTasks": {
        try {
          const payload: Partial<JiraTaskOptions> | undefined = msg?.payload;
          const result: any = await vscode.commands.executeCommand(
            "ai.createJiraTasks",
            payload
          );
          const createdCount = Array.isArray(result) ? result.length : 0;
          panel.webview.postMessage({
            type: "jiraCreated",
            payload: {
              message:
                createdCount > 0
                  ? `Created ${createdCount} Jira issue(s) for project ${payload?.projectKey ?? ""}`.trim()
                  : "No Jira issues were created. Please verify your backlog or credentials.",
            },
          });
        } catch (err: any) {
          panel.webview.postMessage({
            type: "jiraError",
            payload: {
              message: err?.message || "Failed to create Jira tasks.",
            },
          });
        }
        break;
      }
      
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
							const selectedFolder = folderUri[0];

              // Remember to reopen AI Collab panel and Live Share after reload
              await extensionContext.globalState.update(GLOBAL_STATE_KEY, true);
              await extensionContext.globalState.update(GLOBAL_LIVESHARE_KEY, true);

              // Open the folder as a workspace (will reload VS Code)
              await vscode.commands.executeCommand("vscode.openFolder", selectedFolder, false);

              vscode.window.showInformationMessage(`Opened folder: ${selectedFolder.fsPath}`);

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

      case "setActiveProject": {
        const { projectId } = msg.payload;
        await setActiveProject(projectId || null);
        console.log("Active project set to:", projectId);
        break;
      }

      case "generatePrompt": {
        const { projectId } = msg.payload;
        
        // Also set as active project when generating prompt
        if (projectId) {
          await setActiveProject(projectId);
        }

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

Give me a specific message for EACH team member, detailing them what they need to do RIGHT NOW and in the FUTURE. Give each user the exact things they need to work on according also to their skills.

IMPORTANT: Please respond in valid JSON format with the following structure:
{
  "teamAnalysis": {
    "summary": "Overall team assessment",
    "skillMix": "Evaluation of skill mix",
    "gaps": ["List of skill gaps"],
    "redundancies": ["List of redundancies"],
    "compatibility": "Team compatibility assessment"
  },
  "feasibility": {
    "isFeasible": true,
    "assessment": "Feasibility assessment",
    "challenges": ["List of challenges"],
    "timeline": "Timeline considerations"
  },
  "roleAssignments": [
    {
      "memberName": "Team member name",
      "role": "Assigned role",
      "tasks": {
        "immediate": ["Tasks to do right now"],
        "future": ["Future tasks"]
      },
      "responsibilities": ["List of responsibilities"],
      "collaboration": "Collaboration opportunities"
    }
  ],
  "optimization": {
    "recommendations": ["List of recommendations"],
    "training": ["Training suggestions"],
    "structure": "Project structure suggestions"
  },
  "risks": {
    "identified": ["List of risks"],
    "mitigation": ["Mitigation strategies"],
    "successFactors": ["Critical success factors"]
  },
  "deliverables": [
    {
      "name": "Deliverable name",
      "description": "Description",
      "assignedTo": "Team member name",
      "milestone": "Milestone name",
      "timeline": "Timeline"
    }
  ]
}

If you cannot provide JSON, provide the response in the numbered format as before, and I will parse it.`;

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

          // Parse the AI response (try JSON first, fallback to text parsing)
          const parsedData = parseAIResponse(aiResponse, teamMembersForPrompt);

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

          // Send response back to webview with parsed structured data
          panel.webview.postMessage({
            type: "aiResponseReceived",
            payload: { 
              prompt: promptContent,
              response: aiResponse,
              parsed: parsedData,
              projectName: projectToPrompt.name
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
        const { projectId, name, description, goals, requirements } = msg.payload;
        const profileId = await getCurrentUserProfileId(authService, databaseService);
        
        if (!profileId) {
          vscode.window.showErrorMessage("Please log in to update a project.");
          break;
        }

        if (!name || !name.trim()) {
          vscode.window.showErrorMessage("Project name is required.");
          break;
        }

        if (!description || !description.trim()) {
          vscode.window.showErrorMessage("Project description is required.");
          break;
        }

        try {
          const project = await databaseService.updateProject(projectId, {
            name: name.trim(),
            description: description.trim(),
            goals: goals?.trim() || '',
            requirements: requirements?.trim() || ''
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
        
        // Show confirmation dialog using VS Code's native dialog
        const confirmResult = await vscode.window.showWarningMessage(
          'Are you sure you want to remove this member from the project?',
          { modal: true },
          'Remove',
          'Cancel'
        );
        
        if (confirmResult !== 'Remove') {
          console.log('Extension: Remove member cancelled by user');
          break;
        }
        
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
        const {
          name,
          skills,
          programmingLanguages,
          willingToWorkOn,
          jiraBaseUrl,
          jiraProjectKey,
          jiraEmail,
          jiraApiToken,
          jiraProjectPrompt,
        } = msg.payload;
        const user = authService.getCurrentUser();
        
        if (!user) {
          vscode.window.showErrorMessage("Please log in to update your profile.");
          panel.webview.postMessage({
            type: 'profileUpdateError',
            payload: { message: 'Please log in to update your profile' }
          });
          break;
        }

        if (!name || !name.trim()) {
          vscode.window.showErrorMessage("Name is required.");
          panel.webview.postMessage({
            type: 'profileUpdateError',
            payload: { message: 'Name is required' }
          });
          break;
        }

        try {
          const profile = await databaseService.updateProfile(user.id, {
            name: name.trim(),
            skills,
            programming_languages: programmingLanguages,
            willing_to_work_on: willingToWorkOn,
            jira_base_url: jiraBaseUrl,
            jira_project_key: jiraProjectKey,
            jira_email: jiraEmail,
            jira_api_token: jiraApiToken,
            jira_project_prompt: jiraProjectPrompt,
          });
          if (profile) {
            vscode.window.showInformationMessage("Profile updated successfully!");
            // Cache Jira profile data
            await setCachedJiraProfile(user.id, {
              baseUrl: jiraBaseUrl,
              projectKey: jiraProjectKey,
              email: jiraEmail,
              token: jiraApiToken,
              projectPrompt: jiraProjectPrompt,
            });
            // Reload data to show the updated profile
            const data = await loadInitialData();
            panel.webview.postMessage({
              type: "dataLoaded",
              payload: data,
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

      case "getWorkspaceFiles": {
    try {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) {
            panel.webview.postMessage({
                type: "workspaceFilesError",
                payload: { message: "No workspace folder open" },
            });
            break;
        }

        const files = await getWorkspaceFiles(workspaceFolder.uri.fsPath);
        
        panel.webview.postMessage({
            type: "workspaceFilesLoaded",
            payload: { files },
        });
    } catch (error) {
        panel.webview.postMessage({
            type: "workspaceFilesError",
            payload: {
                message: error instanceof Error ? error.message : "Failed to load files",
            },
        });
    }
    break;
}

case "getFileTimeline": {
    try {
        const { filePath } = msg.payload;
        console.log(`📅 Getting timeline for: ${filePath}`);
        
        // Get REAL timeline data instead of mock
        const timeline = getRealtimeTimeline(filePath);
        
        panel.webview.postMessage({
            type: "timelineDataLoaded",
            payload: { timeline },
        });
        
        console.log(`✅ Sent ${timeline.length} timeline points to webview`);
    } catch (error) {
        console.error('❌ Error getting timeline:', error);
        panel.webview.postMessage({
            type: "timelineError",
            payload: {
                message: error instanceof Error ? error.message : "Failed to load timeline",
            },
        });
    }
    break;
}

case "viewTimelinePoint": {
    try {
        const { pointId } = msg.payload;
        console.log(`👁️ Viewing timeline point: ${pointId}`);
        
        // Get the timeline point with code snapshots
        const point = timelineManager.getTimelinePoint(pointId);
        
        if (!point) {
            panel.webview.postMessage({
                type: "timelinePointError",
                payload: { message: "Timeline point not found" }
            });
            break;
        }
        
        // Send the full point data including code snapshots
        panel.webview.postMessage({
            type: "timelinePointLoaded",
            payload: { point }
        });
        
        console.log(`✅ Sent timeline point with ${point.codeAfter.length} chars of code`);
    } catch (error) {
        console.error('❌ Error viewing timeline point:', error);
        panel.webview.postMessage({
            type: "timelinePointError",
            payload: {
                message: error instanceof Error ? error.message : "Failed to load timeline point"
            }
        });
    }
    break;
}

      case "signOut": {
        try {
          await authService.signOut();
        } catch (err) {
          console.error("Error during sign out:", err);
        }

        try {
          if (panel && panel.webview) {
            panel.dispose();
          }
        } catch (err) {
          console.warn("Panel already disposed", err);
        }
        vscode.window.showInformationMessage("Signed out successfully.");
        setTimeout(() => {
          vscode.commands.executeCommand("aiCollab.openPanel");
        }, 200);
        break;
      }

      default:
        console.warn('Extension: Unknown message type received:', msg.type);
        break;
    }
  });
}

export function deactivate() {
  // Clean up timeline manager
  if (timelineManager) {
    timelineManager.dispose();
  }
}

async function getWorkspaceFiles(
  workspacePath: string
): Promise<Array<{ path: string; name: string; type: string; size: number }>> {
  const fs = require("fs").promises;
  const pathModule = require("path");
  const files: Array<{
    path: string;
    name: string;
    type: string;
    size: number;
  }> = [];

  // File extensions to include
  const codeExtensions = [
    ".js",
    ".ts",
    ".jsx",
    ".tsx",
    ".py",
    ".java",
    ".cpp",
    ".c",
    ".cs",
    ".go",
    ".rb",
    ".php",
    ".swift",
    ".kt",
    ".rs",
    ".html",
    ".css",
    ".scss",
    ".json",
    ".xml",
    ".yaml",
    ".yml",
    ".sql",
    ".sh",
    ".md",
    ".txt",
  ];

  // Folders to ignore
  const ignoreFolders = [
    "node_modules",
    ".git",
    "dist",
    "build",
    "out",
    ".vscode",
    "coverage",
    ".next",
    "__pycache__",
    ".idea",
    "target",
    "bin",
  ];

  async function readDir(dirPath: string, relativePath: string = "") {
    try {
      const entries = await fs.readdir(dirPath, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = pathModule.join(dirPath, entry.name);
        const relPath = pathModule.join(relativePath, entry.name);

        if (entry.isDirectory()) {
          // Skip ignored folders
          if (!ignoreFolders.includes(entry.name)) {
            await readDir(fullPath, relPath);
          }
        } else if (entry.isFile()) {
          const ext = pathModule.extname(entry.name).toLowerCase();

          // Only include relevant files
          if (codeExtensions.includes(ext)) {
            try {
              const stats = await fs.stat(fullPath);
              files.push({
                path: relPath.replace(/\\/g, "/"), // Normalize path separators
                name: entry.name,
                type: ext.substring(1), // Remove the dot
                size: stats.size,
              });
            } catch (err) {
              console.log(`Could not read file stats: ${fullPath}`);
            }
          }
        }
      }
    } catch (err) {
      console.log(`Could not read directory: ${dirPath}`);
    }
  }

  await readDir(workspacePath);
  return files.sort((a, b) => a.path.localeCompare(b.path));
}

// Add this helper function at the bottom of extension.ts (after getWorkspaceFiles)
// This generates mock data for now - we'll replace it with real tracking later

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

  const logoUri = webview.asWebviewUri(
    vscode.Uri.joinPath(context.extensionUri, "media", "logo.png")
  );

	let htmlContent = await fs.readFile(htmlPath, "utf-8");

	htmlContent = htmlContent

      .replace(/\{\{logoUri\}\}/g, logoUri.toString())
      // Inject CSP
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

// ============================================================================
// TIMELINE FEATURE HELPER FUNCTIONS - ADD THESE
// ============================================================================

function getRealtimeTimeline(filePath: string): Array<{
  id: string;
  timestamp: string;
  description: string;
  details: string;
  linesAdded: number;
  linesRemoved: number;
  changeType: string;
}> {
  // Get real timeline data from TimelineManager
  const points = timelineManager.getTimeline(filePath);
  
  // If no points yet, return empty array
  if (points.length === 0) {
    console.log(`📭 No timeline points yet for: ${filePath}`);
    return [];
  }
  
  console.log(`📊 Returning ${points.length} timeline points for: ${filePath}`);
  return points;
}