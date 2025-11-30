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
const authService_1 = require("./authService");
const databaseService_1 = require("./databaseService");
const supabaseConfig_1 = require("./supabaseConfig");
const createJiraTasks_1 = require("./commands/createJiraTasks");
// No .env loading needed; using hardcoded config in supabaseConfig
// Global variables for OAuth callback handling
let authService;
let databaseService;
let extensionContext;
// Global notification system
let notificationsProvider;
let notifications = [];
// Constants for storage
const NOTIFICATIONS_STORAGE_KEY = 'aiCollab.notifications';
// Load notifications from persistent storage
async function loadNotifications() {
    if (!extensionContext) {
        return;
    }
    const stored = extensionContext.globalState.get(NOTIFICATIONS_STORAGE_KEY);
    if (stored && Array.isArray(stored)) {
        // Convert timestamp strings back to Date objects
        notifications = stored.map(n => ({
            ...n,
            timestamp: new Date(n.timestamp)
        }));
        console.log(`Loaded ${notifications.length} notifications from storage`);
    }
}
// Save notifications to persistent storage
async function saveNotifications() {
    if (!extensionContext) {
        return;
    }
    // Convert Date objects to strings for storage
    const toStore = notifications.map(n => ({
        ...n,
        timestamp: n.timestamp.toISOString()
    }));
    await extensionContext.globalState.update(NOTIFICATIONS_STORAGE_KEY, toStore);
    console.log(`Saved ${notifications.length} notifications to storage`);
}
// Notifications Tree Provider for Activity Bar
class NotificationsTreeProvider {
    _onDidChangeTreeData = new vscode.EventEmitter();
    onDidChangeTreeData = this._onDidChangeTreeData.event;
    refresh() {
        this._onDidChangeTreeData.fire();
    }
    getTreeItem(element) {
        return element;
    }
    getChildren(element) {
        if (element) {
            return Promise.resolve([]);
        }
        if (notifications.length === 0) {
            const emptyItem = new NotificationItem('No notifications', '', 'info', new Date(), true, vscode.TreeItemCollapsibleState.None);
            emptyItem.command = undefined;
            return Promise.resolve([emptyItem]);
        }
        return Promise.resolve(notifications.map(notif => {
            const item = new NotificationItem(notif.message, notif.id, notif.type, notif.timestamp, notif.read, vscode.TreeItemCollapsibleState.None);
            // Add command to mark as read or show details
            item.command = {
                command: 'aiCollab.notificationClicked',
                title: 'View Notification',
                arguments: [notif.id]
            };
            return item;
        }));
    }
}
class NotificationItem extends vscode.TreeItem {
    message;
    notificationId;
    type;
    timestamp;
    isRead;
    collapsibleState;
    constructor(message, notificationId, type, timestamp, isRead, collapsibleState) {
        super(message, collapsibleState);
        this.message = message;
        this.notificationId = notificationId;
        this.type = type;
        this.timestamp = timestamp;
        this.isRead = isRead;
        this.collapsibleState = collapsibleState;
        // Set icon based on type
        const iconMap = {
            info: new vscode.ThemeIcon('info', new vscode.ThemeColor('notificationsInfoIcon.foreground')),
            success: new vscode.ThemeIcon('pass', new vscode.ThemeColor('testing.iconPassed')),
            warning: new vscode.ThemeIcon('warning', new vscode.ThemeColor('notificationsWarningIcon.foreground')),
            error: new vscode.ThemeIcon('error', new vscode.ThemeColor('notificationsErrorIcon.foreground'))
        };
        this.iconPath = iconMap[type];
        // Show unread indicator and timestamp
        if (!isRead && notificationId) {
            this.description = '● ' + this.getTimeAgo(timestamp);
        }
        else if (notificationId) {
            this.description = this.getTimeAgo(timestamp);
        }
        // Tooltip with full message
        this.tooltip = `${message}\n${timestamp.toLocaleString()}`;
        // Context value for menu items
        this.contextValue = isRead ? 'readNotification' : 'unreadNotification';
        // Add resource states for inline delete button
        if (notificationId) {
            this.resourceUri = vscode.Uri.parse(`notification:${notificationId}`);
        }
    }
    getTimeAgo(date) {
        const seconds = Math.floor((new Date().getTime() - date.getTime()) / 1000);
        const intervals = {
            year: 31536000,
            month: 2592000,
            week: 604800,
            day: 86400,
            hour: 3600,
            minute: 60
        };
        for (const [unit, secondsInUnit] of Object.entries(intervals)) {
            const interval = Math.floor(seconds / secondsInUnit);
            if (interval >= 1) {
                return interval === 1 ? `1 ${unit} ago` : `${interval} ${unit}s ago`;
            }
        }
        return 'just now';
    }
}
// Function to update notification badge - now updates tree view
function updateNotificationBadge() {
    if (notificationsProvider) {
        notificationsProvider.refresh();
    }
}
// Function to add notification - now globally accessible
function addNotification(message, type = 'info', projectId, projectName) {
    const notification = {
        id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
        type,
        message,
        timestamp: new Date(),
        read: false,
        projectId,
        projectName
    };
    notifications.unshift(notification);
    // Keep only last 50 notifications
    if (notifications.length > 50) {
        notifications = notifications.slice(0, 50);
    }
    updateNotificationBadge();
    // Save to persistent storage
    saveNotifications().catch(err => {
        console.error('Failed to save notifications:', err);
    });
    // Also show a VS Code notification for important messages
    if (type === 'error') {
        vscode.window.showErrorMessage(message);
    }
    else if (type === 'warning') {
        vscode.window.showWarningMessage(message);
    }
}
const JIRA_PROFILE_KEY_PREFIX = "jiraProfile:";
function getCachedJiraProfile(userId) {
    if (!extensionContext) {
        return undefined;
    }
    return extensionContext.globalState.get(JIRA_PROFILE_KEY_PREFIX + userId);
}
async function setCachedJiraProfile(userId, profile) {
    if (!extensionContext) {
        return;
    }
    const hasValues = profile &&
        Object.values(profile).some((value) => value !== undefined && value !== null && String(value).trim() !== "");
    if (!hasValues) {
        await extensionContext.globalState.update(JIRA_PROFILE_KEY_PREFIX + userId, undefined);
        return;
    }
    await extensionContext.globalState.update(JIRA_PROFILE_KEY_PREFIX + userId, profile);
}
// Reopens AICollab UI when new workplace 
const GLOBAL_STATE_KEY = "reopenAiCollabAgent";
// When new workspace is open, liveshare begins
const GLOBAL_LIVESHARE_KEY = "reopenLiveShareSession";
// Helper function to get the full path to our data file
function getDataFilePath() {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
        return undefined; // No open folder
    }
    // We'll store our data in a hidden file in the root of the workspace
    return path.join(workspaceFolder.uri.fsPath, ".aiCollabData.json");
}
// Helper function to load all data from the database
async function loadInitialData() {
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
            profile = await databaseService.createProfile(user.id, user.name || user.email || 'User', '', '', '');
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
                jira_base_url: cachedJiraProfile.baseUrl ?? profile.jira_base_url ?? null,
                jira_project_key: cachedJiraProfile.projectKey ?? profile.jira_project_key ?? null,
                jira_email: cachedJiraProfile.email ?? profile.jira_email ?? null,
                jira_api_token: cachedJiraProfile.token ?? profile.jira_api_token ?? null,
                jira_project_prompt: cachedJiraProfile.projectPrompt ??
                    profile.jira_project_prompt ??
                    null,
            };
        }
        // Use profile.id for all database operations (not user.id which is auth.users.id)
        const profileId = profile.id;
        // Get user's projects (both as owner and as member)
        const projects = await databaseService.getProjectsForUser(profileId);
        // Get project members for each project and include owner_id
        const projectsWithMembers = await Promise.all(projects.map(async (project) => {
            const members = await databaseService.getProjectMembers(project.id);
            return {
                ...project,
                selectedMemberIds: members.map(m => m.user_id),
                owner_id: project.owner_id // Ensure owner_id is included
            };
        }));
        // Get all profiles from user's projects (for team members display)
        const allProfiles = await databaseService.getAllProfilesForUserProjects(profileId);
        // Get AI prompts count
        const allPrompts = await Promise.all(projects.map(project => databaseService.getAIPromptsForProject(project.id)));
        const promptCount = allPrompts.flat().length;
        const sanitizedProfiles = allProfiles.map((profileItem) => {
            const cached = profileItem.id === user.id ? cachedJiraProfile : undefined;
            return {
                ...profileItem,
                jira_base_url: cached?.baseUrl ?? profileItem.jira_base_url ?? null,
                jira_project_key: cached?.projectKey ?? profileItem.jira_project_key ?? null,
                jira_email: cached?.email ?? profileItem.jira_email ?? null,
                jira_api_token: null,
                jira_project_prompt: cached?.projectPrompt ?? profileItem.jira_project_prompt ?? null,
            };
        });
        return {
            currentUser: profile, // Current user's profile for editing
            users: sanitizedProfiles, // All team members from user's projects (Jira tokens stripped)
            projects: projectsWithMembers,
            promptCount
        };
    }
    catch (error) {
        console.error("Error loading data from database:", error);
        return { users: [], projects: [], promptCount: 0 };
    }
}
// Helper function to save data to the database
async function saveInitialData(data) {
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
    }
    catch (error) {
        console.error("Failed to save data to database:", error);
        vscode.window.showErrorMessage("Failed to save data to database.");
    }
}
async function activate(context) {
    // Store context globally first
    extensionContext = context;
    // Load persisted notifications
    await loadNotifications();
    // Initialize code reviewer with notification callback
    (0, ai_analyze_1.activateCodeReviewer)(context, addNotification);
    // ============ NOTIFICATION SYSTEM SETUP ============
    // Initialize notifications tree provider
    notificationsProvider = new NotificationsTreeProvider();
    // Register the tree view for the Activity Bar
    const treeView = vscode.window.createTreeView('aiCollabNotificationsView', {
        treeDataProvider: notificationsProvider,
        showCollapseAll: false
    });
    context.subscriptions.push(treeView);
    // Update badge to show unread count
    let updateBadgeCount = () => {
        const unreadCount = notifications.filter(n => !n.read).length;
        if (unreadCount > 0) {
            treeView.badge = {
                tooltip: `${unreadCount} unread notification${unreadCount > 1 ? 's' : ''}`,
                value: unreadCount
            };
        }
        else {
            treeView.badge = undefined;
        }
    };
    // Call updateBadgeCount whenever notifications change
    const originalRefresh = notificationsProvider.refresh.bind(notificationsProvider);
    notificationsProvider.refresh = () => {
        originalRefresh();
        updateBadgeCount();
    };
    // Command when notification is clicked
    const notificationClickedCmd = vscode.commands.registerCommand('aiCollab.notificationClicked', async (notificationId) => {
        const notification = notifications.find(n => n.id === notificationId);
        if (notification && !notification.read) {
            notification.read = true;
            notificationsProvider.refresh();
            await saveNotifications();
        }
    });
    context.subscriptions.push(notificationClickedCmd);
    // Command to mark all as read
    const markAllReadCmd = vscode.commands.registerCommand('aiCollab.markAllNotificationsRead', async () => {
        notifications.forEach(n => n.read = true);
        notificationsProvider.refresh();
        await saveNotifications();
        vscode.window.showInformationMessage('All notifications marked as read');
    });
    context.subscriptions.push(markAllReadCmd);
    // Command to clear all notifications
    const clearAllCmd = vscode.commands.registerCommand('aiCollab.clearAllNotifications', async () => {
        notifications = [];
        notificationsProvider.refresh();
        await saveNotifications();
        vscode.window.showInformationMessage('All notifications cleared');
    });
    context.subscriptions.push(clearAllCmd);
    // Command to delete a single notification
    const deleteNotificationCmd = vscode.commands.registerCommand('aiCollab.deleteNotification', async (item) => {
        // Handle both string ID (from code) and TreeItem (from context menu)
        const notificationId = typeof item === 'string' ? item : item.notificationId;
        if (!notificationId) {
            console.error('No notification ID provided to deleteNotification command');
            return;
        }
        notifications = notifications.filter(n => n.id !== notificationId);
        notificationsProvider.refresh();
        await saveNotifications();
    });
    context.subscriptions.push(deleteNotificationCmd);
    // Keep the old showNotifications command for backward compatibility (opens panel view)
    const showNotificationsCmd = vscode.commands.registerCommand("aiCollab.showNotifications", () => {
        const panel = vscode.window.createWebviewPanel("aiCollabNotifications", "AI Collab Notifications", vscode.ViewColumn.Beside, {
            enableScripts: true,
            retainContextWhenHidden: true
        });
        panel.webview.html = getNotificationsHtml(panel.webview);
        // Send initial notifications
        panel.webview.postMessage({
            type: 'notificationsLoaded',
            payload: { notifications }
        });
        // Handle messages from webview
        panel.webview.onDidReceiveMessage(async (msg) => {
            switch (msg.type) {
                case 'markAsRead': {
                    const { id } = msg.payload;
                    const notification = notifications.find(n => n.id === id);
                    if (notification) {
                        notification.read = true;
                        notificationsProvider.refresh();
                        await saveNotifications();
                        panel.webview.postMessage({
                            type: 'notificationsLoaded',
                            payload: { notifications }
                        });
                    }
                    break;
                }
                case 'markAllAsRead': {
                    notifications.forEach(n => n.read = true);
                    notificationsProvider.refresh();
                    await saveNotifications();
                    panel.webview.postMessage({
                        type: 'notificationsLoaded',
                        payload: { notifications }
                    });
                    break;
                }
                case 'clearAll': {
                    notifications = [];
                    notificationsProvider.refresh();
                    await saveNotifications();
                    panel.webview.postMessage({
                        type: 'notificationsLoaded',
                        payload: { notifications }
                    });
                    break;
                }
                case 'deleteNotification': {
                    const { id } = msg.payload;
                    notifications = notifications.filter(n => n.id !== id);
                    notificationsProvider.refresh();
                    await saveNotifications();
                    panel.webview.postMessage({
                        type: 'notificationsLoaded',
                        payload: { notifications }
                    });
                    break;
                }
            }
        });
    });
    context.subscriptions.push(showNotificationsCmd);
    // ============ END NOTIFICATION SYSTEM SETUP ============
    const createJiraCmd = vscode.commands.registerCommand("ai.createJiraTasks", async (options) => {
        return await (0, createJiraTasks_1.createJiraTasksCmd)(context, options);
    });
    context.subscriptions.push(createJiraCmd);
    // Initialize authentication service
    try {
        authService = new authService_1.AuthService();
        await authService.initialize();
    }
    catch (error) {
        vscode.window.showErrorMessage(`Authentication setup failed: ${error instanceof Error ? error.message : "Unknown error"}`);
        return;
    }
    // Try to restore Supabase session from SecretStorage
    const accessToken = await context.secrets.get("supabase_access_token");
    const refreshToken = await context.secrets.get("supabase_refresh_token");
    if (accessToken) {
        try {
            await authService.setSessionFromTokens(accessToken, refreshToken || undefined);
            console.log("Restored Supabase session");
        }
        catch (err) {
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
        }
        else {
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
                }
                else {
                    vscode.window.showErrorMessage("Live Share API unavailable on reload.");
                }
            }
            catch (err) {
                console.error("Auto-Live Share restart failed:", err);
            }
        }, 2000); // delay to let extension host finish loading
    }
    vscode.window.showInformationMessage("AI Collab Agent activated");
    // Store context globally for callback server
    extensionContext = context;
    // Initialize database service
    try {
        const supabaseUrl = (0, supabaseConfig_1.getSupabaseUrl)();
        const supabaseAnonKey = (0, supabaseConfig_1.getSupabaseAnonKey)();
        databaseService = new databaseService_1.DatabaseService(supabaseUrl, supabaseAnonKey);
    }
    catch (error) {
        vscode.window.showErrorMessage(`Database setup failed: ${error instanceof Error ? error.message : "Unknown error"}`);
        return;
    }
    // Register URI handler for custom protocol
    // In your URI handler, add this additional check:
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
                    // Set the session in Supabase
                    authService
                        .setSessionFromTokens(accessToken, refreshToken || undefined)
                        .then(() => {
                        console.log("Session set successfully");
                        vscode.window.showInformationMessage("Authentication successful! Redirecting to main app...");
                        // Open the main panel after successful authentication
                        setTimeout(() => {
                            vscode.commands.executeCommand("aiCollab.openPanel");
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
        // First, try to restore session from stored tokens if not already authenticated
        if (!authService.isAuthenticated()) {
            const accessToken = await context.secrets.get("supabase_access_token");
            const refreshToken = await context.secrets.get("supabase_refresh_token");
            if (accessToken) {
                try {
                    await authService.setSessionFromTokens(accessToken, refreshToken || undefined);
                    console.log("Restored session from stored tokens");
                }
                catch (err) {
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
                            const session = authService.getCurrentSession();
                            if (session) {
                                await context.secrets.store("supabase_access_token", session.access_token);
                                await context.secrets.store("supabase_refresh_token", session.refresh_token);
                            }
                            loginPanel.webview.postMessage({
                                type: "authSuccess",
                                payload: {
                                    user: result.user,
                                    message: "Account created successfully! Please check your email to verify your account.",
                                },
                            });
                            // Close login panel and open main panel
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
                            }
                            else {
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
                        }
                        catch (error) {
                            console.error("Google OAuth exception:", error);
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
                            }
                            else {
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
                        }
                        catch (error) {
                            console.error("GitHub OAuth exception:", error);
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
                    setTimeout(() => {
                        vscode.commands.executeCommand("aiCollab.openPanel");
                    }, 100);
                }
            });
            return;
        }
        // User is authenticated, open main panel
        openMainPanel(context, authService);
    });
    context.subscriptions.push(open);
}
// Parse AI response - tries JSON first, falls back to text parsing
function parseAIResponse(response, teamMembers) {
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
    }
    catch (e) {
        // Not JSON, continue to text parsing
    }
    // Fallback: Parse text format
    return parseTextResponse(response, teamMembers);
}
// Parse text-based AI response
function parseTextResponse(response, teamMembers) {
    const result = {
        teamAnalysis: { summary: '', skillMix: '', gaps: [], redundancies: [], compatibility: '' },
        feasibility: { isFeasible: true, assessment: '', challenges: [], timeline: '' },
        roleAssignments: [],
        optimization: { recommendations: [], training: [], structure: '' },
        risks: { identified: [], mitigation: [], successFactors: [] },
        deliverables: []
    };
    const lines = response.split('\n');
    let currentSection = '';
    let currentContent = [];
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        // Detect section headers
        if (line.match(/^1\.?\s*TEAM\s*ANALYSIS/i)) {
            currentSection = 'teamAnalysis';
            currentContent = [];
            continue;
        }
        else if (line.match(/^2\.?\s*PROJECT\s*FEASIBILITY/i)) {
            currentSection = 'feasibility';
            currentContent = [];
            continue;
        }
        else if (line.match(/^3\.?\s*ROLE\s*ASSIGNMENTS/i)) {
            currentSection = 'roleAssignments';
            currentContent = [];
            continue;
        }
        else if (line.match(/^4\.?\s*OPTIMIZATION/i)) {
            currentSection = 'optimization';
            currentContent = [];
            continue;
        }
        else if (line.match(/^5\.?\s*RISK/i)) {
            currentSection = 'risks';
            currentContent = [];
            continue;
        }
        else if (line.match(/^6\.?\s*DELIVERABLES/i)) {
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
            }
            else if (currentSection === 'feasibility') {
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
            }
            else if (currentSection === 'roleAssignments') {
                // Look for team member names
                for (const member of teamMembers) {
                    if (line.includes(member.name)) {
                        const existing = result.roleAssignments.find((r) => r.memberName === member.name);
                        if (!existing) {
                            result.roleAssignments.push({
                                memberName: member.name,
                                role: extractRole(line),
                                tasks: { immediate: [], future: [] },
                                responsibilities: [],
                                collaboration: ''
                            });
                        }
                        const assignment = result.roleAssignments.find((r) => r.memberName === member.name);
                        if (line.includes('now') || line.includes('immediate') || line.includes('right now')) {
                            assignment.tasks.immediate.push(line.replace(/^[-•]\s*/, ''));
                        }
                        else if (line.includes('future') || line.includes('later')) {
                            assignment.tasks.future.push(line.replace(/^[-•]\s*/, ''));
                        }
                        else {
                            assignment.responsibilities.push(line.replace(/^[-•]\s*/, ''));
                        }
                    }
                }
            }
            else if (currentSection === 'optimization') {
                if (line.startsWith('-') || line.startsWith('•')) {
                    result.optimization.recommendations.push(line.replace(/^[-•]\s*/, ''));
                }
            }
            else if (currentSection === 'risks') {
                if (line.startsWith('-') || line.startsWith('•')) {
                    if (line.toLowerCase().includes('mitigation') || line.toLowerCase().includes('mitigate')) {
                        result.risks.mitigation.push(line.replace(/^[-•]\s*/, ''));
                    }
                    else {
                        result.risks.identified.push(line.replace(/^[-•]\s*/, ''));
                    }
                }
            }
            else if (currentSection === 'deliverables') {
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
        if (!result.roleAssignments.find((r) => r.memberName === member.name)) {
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
function extractRole(text) {
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
async function getCurrentUserProfileId(authService, databaseService) {
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
        console.log('Extension: Received message from webview:', { type: msg.type, payload: msg.payload });
        switch (msg.type) {
            case "createJiraTasks": {
                try {
                    const payload = msg?.payload;
                    const result = await vscode.commands.executeCommand("ai.createJiraTasks", payload);
                    const createdCount = Array.isArray(result) ? result.length : 0;
                    const message = createdCount > 0
                        ? `Created ${createdCount} Jira issue(s) for project ${payload?.projectKey ?? ""}`.trim()
                        : "No Jira issues were created. Please verify your backlog or credentials.";
                    panel.webview.postMessage({
                        type: "jiraCreated",
                        payload: { message },
                    });
                    addNotification(message, createdCount > 0 ? 'success' : 'warning');
                }
                catch (err) {
                    const errorMessage = err?.message || "Failed to create Jira tasks.";
                    panel.webview.postMessage({
                        type: "jiraError",
                        payload: { message: errorMessage },
                    });
                    addNotification(errorMessage, 'error');
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
                        addNotification(`Opened folder: ${selectedFolder.fsPath}`, 'success');
                        try {
                            /// Start a Live Share session
                            const liveShare = await vsls.getApi(); // Get the Live Share API
                            if (!liveShare) {
                                vscode.window.showErrorMessage("Live Share extension is not installed or not available.");
                                addNotification("Live Share extension is not available", 'error');
                                return;
                            }
                            await liveShare.share(); // May return undefined even if successful
                            // Check if session is active
                            if (liveShare.session && liveShare.session.id) {
                                vscode.window.showInformationMessage("Live Share session started!");
                                addNotification("Live Share session started!", 'success');
                                console.log("Live Share session info:", liveShare.session);
                            }
                            else {
                                vscode.window.showErrorMessage("Failed to start Live Share session.");
                                addNotification("Failed to start Live Share session", 'error');
                            }
                        }
                        catch (error) {
                            console.error("Error starting Live Share session:", error);
                            vscode.window.showErrorMessage("An error occurred while starting Live Share.");
                            addNotification("Error starting Live Share session", 'error');
                        }
                    }
                    else {
                        vscode.window.showWarningMessage("No folder selected.");
                    }
                }
                catch (error) {
                    vscode.window.showErrorMessage(`Failed to open file: ${error instanceof Error ? error.message : "Unknown error"}`);
                    addNotification(`Failed to open file: ${error instanceof Error ? error.message : "Unknown error"}`, 'error');
                }
                break;
            }
            case "saveData": {
                await saveInitialData(msg.payload);
                vscode.window.showInformationMessage("Team data saved to database!");
                addNotification("Team data saved to database!", 'success');
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
                    addNotification("Project not found for AI prompt generation", 'error');
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
Skills: ${user.skills || "Not specified"}
Programming Languages: ${user.programming_languages || "Not specified"}
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
                    addNotification(`Generating AI analysis for project: ${projectToPrompt.name}`, 'info', projectToPrompt.id, projectToPrompt.name);
                    const edgeFunctionUrl = (0, supabaseConfig_1.getEdgeFunctionUrl)();
                    const anonKey = (0, supabaseConfig_1.getSupabaseAnonKey)();
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
                    const supabase = (0, supabaseConfig_1.getSupabaseClient)();
                    await supabase.from("ai_prompts").insert([{
                            project_id: projectToPrompt.id,
                            prompt_content: promptContent,
                            ai_response: aiResponse,
                        }]);
                    // Save to file
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
                    vscode.window.showInformationMessage(`✅ AI analysis complete for project: ${projectToPrompt.name}`);
                    addNotification(`AI analysis complete for project: ${projectToPrompt.name}`, 'success', projectToPrompt.id, projectToPrompt.name);
                }
                catch (error) {
                    vscode.window.showErrorMessage(`Failed to generate AI response: ${error.message}`);
                    panel.webview.postMessage({
                        type: "promptGenerationError",
                        payload: { message: error.message },
                    });
                    addNotification(`Failed to generate AI response: ${error.message}`, 'error', projectToPrompt.id, projectToPrompt.name);
                }
                break;
            }
            case "showError": {
                vscode.window.showErrorMessage(msg.payload.message);
                addNotification(msg.payload.message, 'error');
                break;
            }
            case "showSuccess": {
                vscode.window.showInformationMessage(msg.payload.message);
                addNotification(msg.payload.message, 'success');
                break;
            }
            case "createProject": {
                const { name, description, goals, requirements } = msg.payload;
                const profileId = await getCurrentUserProfileId(authService, databaseService);
                if (!profileId) {
                    vscode.window.showErrorMessage("Please log in to create a project.");
                    addNotification("Please log in to create a project", 'error');
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
                        addNotification(`Project "${name}" created successfully!`, 'success', project.id, name);
                        // Reload data to show the new project
                        const data = await loadInitialData();
                        panel.webview.postMessage({
                            type: "dataLoaded",
                            payload: data,
                        });
                    }
                    else {
                        console.log('Project creation failed - no project returned');
                        vscode.window.showErrorMessage("Failed to create project.");
                        addNotification("Failed to create project", 'error');
                    }
                }
                catch (error) {
                    console.error("Error creating project:", error);
                    vscode.window.showErrorMessage("Failed to create project.");
                    addNotification("Failed to create project", 'error');
                }
                break;
            }
            case "deleteProject": {
                const { projectId } = msg.payload;
                console.log('Extension: deleteProject received:', { projectId });
                // Show confirmation dialog using VS Code's native dialog
                const confirmResult = await vscode.window.showWarningMessage('Are you sure you want to delete this project? This action cannot be undone.', { modal: true }, 'Delete', 'Cancel');
                if (confirmResult !== 'Delete') {
                    console.log('Extension: Delete cancelled by user');
                    break;
                }
                const profileId = await getCurrentUserProfileId(authService, databaseService);
                console.log('Extension: Profile ID for delete:', { profileId });
                if (!profileId) {
                    console.error('Extension: No profile ID found for delete');
                    vscode.window.showErrorMessage("Please log in to delete a project.");
                    addNotification("Please log in to delete a project", 'error');
                    break;
                }
                try {
                    console.log('Extension: Calling deleteProject with:', { projectId, profileId });
                    const success = await databaseService.deleteProject(projectId, profileId);
                    console.log('Extension: deleteProject result:', { success });
                    if (success) {
                        vscode.window.showInformationMessage("Project deleted successfully!");
                        addNotification("Project deleted successfully!", 'success');
                        // Reload data to reflect the deletion
                        const data = await loadInitialData();
                        panel.webview.postMessage({
                            type: "dataLoaded",
                            payload: data,
                        });
                    }
                    else {
                        console.error('Extension: deleteProject returned false');
                        vscode.window.showErrorMessage("Failed to delete project. You may not be the owner.");
                        addNotification("Failed to delete project. You may not be the owner.", 'error');
                    }
                }
                catch (error) {
                    console.error("Extension: Error deleting project:", error);
                    vscode.window.showErrorMessage(`Failed to delete project: ${error instanceof Error ? error.message : 'Unknown error'}`);
                    addNotification(`Failed to delete project: ${error instanceof Error ? error.message : 'Unknown error'}`, 'error');
                }
                break;
            }
            case "leaveProject": {
                const { projectId } = msg.payload;
                console.log('Extension: leaveProject received:', { projectId });
                // Show confirmation dialog using VS Code's native dialog
                const confirmResult = await vscode.window.showWarningMessage('Are you sure you want to leave this project?', { modal: true }, 'Leave', 'Cancel');
                if (confirmResult !== 'Leave') {
                    console.log('Extension: Leave cancelled by user');
                    break;
                }
                const profileId = await getCurrentUserProfileId(authService, databaseService);
                console.log('Extension: Profile ID for leave:', { profileId });
                if (!profileId) {
                    console.error('Extension: No profile ID found for leave');
                    vscode.window.showErrorMessage("Please log in to leave a project.");
                    addNotification("Please log in to leave a project", 'error');
                    break;
                }
                try {
                    console.log('Extension: Calling leaveProject with:', { projectId, profileId });
                    const success = await databaseService.leaveProject(projectId, profileId);
                    console.log('Extension: leaveProject result:', { success });
                    if (success) {
                        vscode.window.showInformationMessage("Left project successfully!");
                        addNotification("Left project successfully!", 'success');
                        // Reload data to reflect leaving
                        const data = await loadInitialData();
                        panel.webview.postMessage({
                            type: "dataLoaded",
                            payload: data,
                        });
                    }
                    else {
                        console.error('Extension: leaveProject returned false');
                        vscode.window.showErrorMessage("Failed to leave project. If you're the owner, you must delete the project instead.");
                        addNotification("Failed to leave project. If you're the owner, you must delete the project instead.", 'error');
                    }
                }
                catch (error) {
                    console.error("Extension: Error leaving project:", error);
                    vscode.window.showErrorMessage(`Failed to leave project: ${error instanceof Error ? error.message : 'Unknown error'}`);
                    addNotification(`Failed to leave project: ${error instanceof Error ? error.message : 'Unknown error'}`, 'error');
                }
                break;
            }
            case "updateProject": {
                const { projectId, name, description, goals, requirements } = msg.payload;
                const profileId = await getCurrentUserProfileId(authService, databaseService);
                if (!profileId) {
                    vscode.window.showErrorMessage("Please log in to update a project.");
                    addNotification("Please log in to update a project", 'error');
                    break;
                }
                if (!name || !name.trim()) {
                    vscode.window.showErrorMessage("Project name is required.");
                    addNotification("Project name is required", 'error');
                    break;
                }
                if (!description || !description.trim()) {
                    vscode.window.showErrorMessage("Project description is required.");
                    addNotification("Project description is required", 'error');
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
                        addNotification(`Project "${name}" updated successfully!`, 'success', projectId, name);
                        // Reload data to show the updated project
                        const data = await loadInitialData();
                        panel.webview.postMessage({
                            type: "dataLoaded",
                            payload: data,
                        });
                    }
                    else {
                        vscode.window.showErrorMessage("Failed to update project. You may not have permission.");
                        addNotification("Failed to update project. You may not have permission.", 'error');
                    }
                }
                catch (error) {
                    console.error("Error updating project:", error);
                    vscode.window.showErrorMessage("Failed to update project.");
                    addNotification("Failed to update project", 'error');
                }
                break;
            }
            case "removeProjectMember": {
                const { projectId, memberId } = msg.payload;
                // Show confirmation dialog using VS Code's native dialog
                const confirmResult = await vscode.window.showWarningMessage('Are you sure you want to remove this member from the project?', { modal: true }, 'Remove', 'Cancel');
                if (confirmResult !== 'Remove') {
                    console.log('Extension: Remove member cancelled by user');
                    break;
                }
                const profileId = await getCurrentUserProfileId(authService, databaseService);
                if (!profileId) {
                    vscode.window.showErrorMessage("Please log in to remove a member.");
                    addNotification("Please log in to remove a member", 'error');
                    break;
                }
                try {
                    const success = await databaseService.removeProjectMember(projectId, memberId, profileId);
                    if (success) {
                        vscode.window.showInformationMessage("Member removed from project successfully!");
                        addNotification("Member removed from project successfully!", 'success');
                        // Reload data to reflect the change
                        const data = await loadInitialData();
                        panel.webview.postMessage({
                            type: "dataLoaded",
                            payload: data,
                        });
                    }
                    else {
                        vscode.window.showErrorMessage("Failed to remove member. You must be the project owner.");
                        addNotification("Failed to remove member. You must be the project owner.", 'error');
                    }
                }
                catch (error) {
                    console.error("Error removing project member:", error);
                    vscode.window.showErrorMessage("Failed to remove member.");
                    addNotification("Failed to remove member", 'error');
                }
                break;
            }
            case "joinProject": {
                const { inviteCode } = msg.payload;
                const user = authService.getCurrentUser();
                if (!user) {
                    vscode.window.showErrorMessage("Please log in to join a project.");
                    addNotification("Please log in to join a project", 'error');
                    break;
                }
                try {
                    const { inviteCode } = msg.payload;
                    const user = authService.getCurrentUser();
                    if (!user) {
                        vscode.window.showErrorMessage("Please log in to join a project.");
                        addNotification("Please log in to join a project", 'error');
                        break;
                    }
                    const profileId = await getCurrentUserProfileId(authService, databaseService);
                    if (!profileId) {
                        vscode.window.showErrorMessage("Please log in to join a project.");
                        addNotification("Please log in to join a project", 'error');
                        break;
                    }
                    console.log('Joining project with code:', { inviteCode, profileId });
                    const project = await databaseService.joinProjectByCode(inviteCode, profileId);
                    if (project) {
                        vscode.window.showInformationMessage(`Successfully joined project "${project.name}"!`);
                        addNotification(`Successfully joined project "${project.name}"!`, 'success', project.id, project.name);
                        // Reload data to show the new project
                        const data = await loadInitialData();
                        panel.webview.postMessage({
                            type: "dataLoaded",
                            payload: data,
                        });
                    }
                    else {
                        vscode.window.showErrorMessage("Invalid invite code or failed to join project.");
                        addNotification("Invalid invite code or failed to join project", 'error');
                    }
                }
                catch (error) {
                    console.error("Error joining project:", error);
                    vscode.window.showErrorMessage("Failed to join project.");
                    addNotification("Failed to join project", 'error');
                }
                break;
            }
            case "updateProfile": {
                const { name, skills, programmingLanguages, willingToWorkOn, jiraBaseUrl, jiraProjectKey, jiraEmail, jiraApiToken, jiraProjectPrompt, } = msg.payload;
                const user = authService.getCurrentUser();
                if (!user) {
                    vscode.window.showErrorMessage("Please log in to update your profile.");
                    panel.webview.postMessage({
                        type: 'profileUpdateError',
                        payload: { message: 'Please log in to update your profile' }
                    });
                    addNotification("Please log in to update your profile", 'error');
                    break;
                }
                if (!name || !name.trim()) {
                    vscode.window.showErrorMessage("Name is required.");
                    panel.webview.postMessage({
                        type: 'profileUpdateError',
                        payload: { message: 'Name is required' }
                    });
                    addNotification("Name is required", 'error');
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
                        addNotification("Profile updated successfully!", 'success');
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
                    }
                    else {
                        panel.webview.postMessage({
                            type: 'profileUpdateError',
                            payload: { message: 'Failed to update profile' }
                        });
                        addNotification("Failed to update profile", 'error');
                    }
                }
                catch (error) {
                    console.error('Error updating profile:', error);
                    panel.webview.postMessage({
                        type: 'profileUpdateError',
                        payload: { message: error.message || 'Failed to update profile' }
                    });
                    addNotification(error.message || 'Failed to update profile', 'error');
                }
                break;
            }
            case "oldUpdateProfile": {
                const { name, skills, languages, preferences } = msg.payload;
                const user = authService.getCurrentUser();
                if (!user) {
                    vscode.window.showErrorMessage("Please log in to update your profile.");
                    addNotification("Please log in to update your profile", 'error');
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
                        addNotification("Profile updated successfully!", 'success');
                        // Reload data to show the updated profile
                        const data = await loadInitialData();
                        panel.webview.postMessage({
                            type: "dataLoaded",
                            payload: data,
                        });
                    }
                    else {
                        vscode.window.showErrorMessage("Failed to update profile.");
                        addNotification("Failed to update profile", 'error');
                    }
                }
                catch (error) {
                    console.error("Error updating profile:", error);
                    vscode.window.showErrorMessage("Failed to update profile.");
                    addNotification("Failed to update profile", 'error');
                }
                break;
            }
            case "migrateFromJSON": {
                const user = authService.getCurrentUser();
                if (!user) {
                    vscode.window.showErrorMessage("Please log in to migrate data.");
                    addNotification("Please log in to migrate data", 'error');
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
                                addNotification("Data migrated successfully from JSON file!", 'success');
                                // Archive the old file
                                const archivePath = filePath.replace('.json', '_archived.json');
                                await fs.rename(filePath, archivePath);
                                // Reload data from database
                                const data = await loadInitialData();
                                panel.webview.postMessage({
                                    type: "dataLoaded",
                                    payload: data,
                                });
                            }
                            else {
                                vscode.window.showErrorMessage("Failed to migrate data from JSON file.");
                                addNotification("Failed to migrate data from JSON file", 'error');
                            }
                        }
                        catch (error) {
                            vscode.window.showInformationMessage("No existing JSON data found to migrate.");
                            addNotification("No existing JSON data found to migrate", 'info');
                        }
                    }
                    else {
                        vscode.window.showInformationMessage("No workspace folder open for JSON migration.");
                        addNotification("No workspace folder open for JSON migration", 'info');
                    }
                }
                catch (error) {
                    console.error("Error during migration:", error);
                    vscode.window.showErrorMessage("Failed to migrate data.");
                    addNotification("Failed to migrate data", 'error');
                }
                break;
            }
            case "signOut": {
                try {
                    await authService.signOut();
                }
                catch (err) {
                    console.error("Error during sign out:", err);
                }
                try {
                    if (panel && panel.webview) {
                        panel.dispose();
                    }
                }
                catch (err) {
                    console.warn("Panel already disposed", err);
                }
                vscode.window.showInformationMessage("Signed out successfully.");
                addNotification("Signed out successfully", 'info');
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
function getNotificationsHtml(webview) {
    const nonce = getNonce();
    return `<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<meta http-equiv="Content-Security-Policy" content="
		default-src 'none';
		style-src ${webview.cspSource} 'unsafe-inline';
		script-src 'nonce-${nonce}';
	">
	<title>Notifications</title>
	<style>
		* {
			margin: 0;
			padding: 0;
			box-sizing: border-box;
		}
		
		body {
			font-family: var(--vscode-font-family);
			color: var(--vscode-foreground);
			background-color: var(--vscode-editor-background);
			padding: 20px;
		}
		
		.header {
			display: flex;
			justify-content: space-between;
			align-items: center;
			margin-bottom: 20px;
			padding-bottom: 10px;
			border-bottom: 1px solid var(--vscode-panel-border);
		}
		
		.header h1 {
			font-size: 24px;
			font-weight: 600;
		}
		
		.header-actions {
			display: flex;
			gap: 10px;
		}
		
		.btn {
			padding: 6px 12px;
			border: none;
			border-radius: 4px;
			cursor: pointer;
			font-size: 13px;
			background-color: var(--vscode-button-background);
			color: var(--vscode-button-foreground);
		}
		
		.btn:hover {
			background-color: var(--vscode-button-hoverBackground);
		}
		
		.btn-secondary {
			background-color: var(--vscode-button-secondaryBackground);
			color: var(--vscode-button-secondaryForeground);
		}
		
		.btn-secondary:hover {
			background-color: var(--vscode-button-secondaryHoverBackground);
		}
		
		.notifications-list {
			display: flex;
			flex-direction: column;
			gap: 10px;
		}
		
		.notification-item {
			padding: 15px;
			border-radius: 6px;
			border-left: 4px solid;
			background-color: var(--vscode-editor-background);
			border-color: var(--vscode-panel-border);
			transition: all 0.2s;
		}
		
		.notification-item:hover {
			background-color: var(--vscode-list-hoverBackground);
		}
		
		.notification-item.unread {
			background-color: var(--vscode-list-inactiveSelectionBackground);
		}
		
		.notification-item.info {
			border-left-color: var(--vscode-notificationsInfoIcon-foreground);
		}
		
		.notification-item.success {
			border-left-color: #4caf50;
		}
		
		.notification-item.warning {
			border-left-color: var(--vscode-notificationsWarningIcon-foreground);
		}
		
		.notification-item.error {
			border-left-color: var(--vscode-notificationsErrorIcon-foreground);
		}
		
		.notification-header {
			display: flex;
			justify-content: space-between;
			align-items: flex-start;
			margin-bottom: 8px;
		}
		
		.notification-type {
			display: inline-flex;
			align-items: center;
			gap: 5px;
			padding: 2px 8px;
			border-radius: 12px;
			font-size: 11px;
			font-weight: 600;
			text-transform: uppercase;
		}
		
		.notification-type.info {
			background-color: rgba(0, 122, 204, 0.2);
			color: var(--vscode-notificationsInfoIcon-foreground);
		}
		
		.notification-type.success {
			background-color: rgba(76, 175, 80, 0.2);
			color: #4caf50;
		}
		
		.notification-type.warning {
			background-color: rgba(255, 152, 0, 0.2);
			color: var(--vscode-notificationsWarningIcon-foreground);
		}
		
		.notification-type.error {
			background-color: rgba(244, 67, 54, 0.2);
			color: var(--vscode-notificationsErrorIcon-foreground);
		}
		
		.notification-actions {
			display: flex;
			gap: 8px;
		}
		
		.icon-btn {
			background: none;
			border: none;
			cursor: pointer;
			padding: 4px;
			opacity: 0.7;
			color: var(--vscode-foreground);
		}
		
		.icon-btn:hover {
			opacity: 1;
		}
		
		.notification-message {
			font-size: 14px;
			line-height: 1.5;
			margin-bottom: 8px;
		}
		
		.notification-meta {
			display: flex;
			gap: 15px;
			font-size: 12px;
			color: var(--vscode-descriptionForeground);
		}
		
		.notification-project {
			font-weight: 500;
		}
		
		.empty-state {
			text-align: center;
			padding: 60px 20px;
			color: var(--vscode-descriptionForeground);
		}
		
		.empty-state svg {
			width: 64px;
			height: 64px;
			margin-bottom: 16px;
			opacity: 0.3;
		}
	</style>
</head>
<body>
	<div class="header">
		<h1>🔔 Notifications</h1>
		<div class="header-actions">
			<button class="btn btn-secondary" onclick="markAllAsRead()">Mark All Read</button>
			<button class="btn btn-secondary" onclick="clearAll()">Clear All</button>
		</div>
	</div>
	
	<div id="notificationsList" class="notifications-list">
		<div class="empty-state">
			<svg viewBox="0 0 24 24" fill="currentColor">
				<path d="M12 22c1.1 0 2-.9 2-2h-4c0 1.1.9 2 2 2zm6-6v-5c0-3.07-1.63-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.64 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2zm-2 1H8v-6c0-2.48 1.51-4.5 4-4.5s4 2.02 4 4.5v6z"/>
			</svg>
			<p>No notifications yet</p>
		</div>
	</div>

	<script nonce="${nonce}">
		const vscode = acquireVsCodeApi();
		
		window.addEventListener('message', event => {
			const message = event.data;
			
			if (message.type === 'notificationsLoaded') {
				renderNotifications(message.payload.notifications);
			}
		});
		
		function renderNotifications(notifications) {
			const container = document.getElementById('notificationsList');
			
			if (!notifications || notifications.length === 0) {
				container.innerHTML = \`
					<div class="empty-state">
						<svg viewBox="0 0 24 24" fill="currentColor">
							<path d="M12 22c1.1 0 2-.9 2-2h-4c0 1.1.9 2 2 2zm6-6v-5c0-3.07-1.63-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.64 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2zm-2 1H8v-6c0-2.48 1.51-4.5 4-4.5s4 2.02 4 4.5v6z"/>
						</svg>
						<p>No notifications yet</p>
					</div>
				\`;
				return;
			}
			
			container.innerHTML = notifications.map(notification => {
				const timestamp = new Date(notification.timestamp);
				const timeAgo = getTimeAgo(timestamp);
				const readClass = notification.read ? '' : 'unread';
				
				return \`
					<div class="notification-item \${notification.type} \${readClass}">
						<div class="notification-header">
							<span class="notification-type \${notification.type}">\${notification.type}</span>
							<div class="notification-actions">
								\${!notification.read ? \`<button class="icon-btn" onclick="markAsRead('\${notification.id}')" title="Mark as read">✓</button>\` : ''}
								<button class="icon-btn" onclick="deleteNotification('\${notification.id}')" title="Delete">×</button>
							</div>
						</div>
						<div class="notification-message">\${escapeHtml(notification.message)}</div>
						<div class="notification-meta">
							<span>\${timeAgo}</span>
							\${notification.projectName ? \`<span class="notification-project">📁 \${escapeHtml(notification.projectName)}</span>\` : ''}
						</div>
					</div>
				\`;
			}).join('');
		}
		
		function markAsRead(id) {
			vscode.postMessage({ type: 'markAsRead', payload: { id } });
		}
		
		function markAllAsRead() {
			vscode.postMessage({ type: 'markAllAsRead', payload: {} });
		}
		
		function clearAll() {
			vscode.postMessage({ type: 'clearAll', payload: {} });
		}
		
		function deleteNotification(id) {
			vscode.postMessage({ type: 'deleteNotification', payload: { id } });
		}
		
		function getTimeAgo(date) {
			const seconds = Math.floor((new Date() - date) / 1000);
			
			const intervals = {
				year: 31536000,
				month: 2592000,
				week: 604800,
				day: 86400,
				hour: 3600,
				minute: 60,
				second: 1
			};
			
			for (const [unit, secondsInUnit] of Object.entries(intervals)) {
				const interval = Math.floor(seconds / secondsInUnit);
				if (interval >= 1) {
					return interval === 1 ? \`1 \${unit} ago\` : \`\${interval} \${unit}s ago\`;
				}
			}
			
			return 'just now';
		}
		
		function escapeHtml(text) {
			const div = document.createElement('div');
			div.textContent = text;
			return div.innerHTML;
		}
	</script>
</body>
</html>`;
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