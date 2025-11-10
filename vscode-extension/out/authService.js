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
exports.AuthService = void 0;
const vscode = __importStar(require("vscode"));
const http = __importStar(require("http"));
const url = __importStar(require("url"));
const supabaseConfig_1 = require("./supabaseConfig");
class AuthService {
    supabase;
    currentUser = null;
    currentSession = null;
    localServer = null;
    constructor() {
        // Use shared Supabase client configured in supabaseConfig
        this.supabase = (0, supabaseConfig_1.getSupabaseClient)();
    }
    async initialize() {
        try {
            // Check for existing session
            const { data: { session }, error, } = await this.supabase.auth.getSession();
            if (error) {
                console.error("Error getting session:", error);
                return;
            }
            if (session) {
                this.currentSession = session;
                this.currentUser = this.mapUser(session.user);
            }
        }
        catch (error) {
            console.error("Error initializing auth service:", error);
        }
    }
    async signUp(email, password, name) {
        try {
            const { data, error } = await this.supabase.auth.signUp({
                email,
                password,
                options: {
                    data: {
                        name: name || email.split("@")[0],
                    },
                },
            });
            if (error) {
                return { user: null, error: error.message };
            }
            if (data.user) {
                this.currentUser = this.mapUser(data.user);
                this.currentSession = data.session;
                return { user: this.currentUser, error: null };
            }
            return { user: null, error: "Sign up failed" };
        }
        catch (error) {
            return {
                user: null,
                error: error instanceof Error ? error.message : "Unknown error",
            };
        }
    }
    async signIn(email, password) {
        try {
            const { data, error } = await this.supabase.auth.signInWithPassword({
                email,
                password,
            });
            if (error) {
                return { user: null, error: error.message };
            }
            if (data.user) {
                this.currentUser = this.mapUser(data.user);
                this.currentSession = data.session;
                return { user: this.currentUser, error: null };
            }
            return { user: null, error: "Sign in failed" };
        }
        catch (error) {
            return {
                user: null,
                error: error instanceof Error ? error.message : "Unknown error",
            };
        }
    }
    async signInWithGoogle() {
        try {
            console.log("Starting Google OAuth with local server...");
            // Start local server to receive OAuth callback
            const callbackUrl = await this.startLocalServer();
            console.log("Local server started on:", callbackUrl);
            // Get the OAuth URL from Supabase with local callback
            const { data, error } = await this.supabase.auth.signInWithOAuth({
                provider: "google",
                options: {
                    redirectTo: callbackUrl,
                    skipBrowserRedirect: true,
                },
            });
            if (error) {
                console.error("Supabase OAuth error:", error);
                this.stopLocalServer();
                return { user: null, error: error.message };
            }
            if (data.url) {
                console.log("Opening OAuth URL:", data.url);
                // Open the OAuth URL in the default browser using VS Code's cross-platform API
                try {
                    await vscode.env.openExternal(vscode.Uri.parse(data.url));
                    return { user: null, error: null };
                }
                catch (openError) {
                    console.error("Error opening browser:", openError);
                    this.stopLocalServer();
                    return {
                        user: null,
                        error: openError instanceof Error ? openError.message : "Failed to open browser",
                    };
                }
            }
            console.error("No OAuth URL received from Supabase");
            this.stopLocalServer();
            return { user: null, error: "Failed to get OAuth URL" };
        }
        catch (error) {
            console.error("Google OAuth exception:", error);
            this.stopLocalServer();
            return {
                user: null,
                error: error instanceof Error ? error.message : "Unknown error",
            };
        }
    }
    async signInWithGithub() {
        try {
            // Start local server to receive OAuth callback
            const callbackUrl = await this.startLocalServer();
            console.log("Local server started on:", callbackUrl);
            // Get the OAuth URL from Supabase with local callback
            const { data, error } = await this.supabase.auth.signInWithOAuth({
                provider: "github",
                options: {
                    redirectTo: callbackUrl,
                    skipBrowserRedirect: true,
                },
            });
            if (error) {
                this.stopLocalServer();
                return { user: null, error: error.message };
            }
            if (data.url) {
                console.log("Opening OAuth URL:", data.url);
                // Open the OAuth URL in the default browser using VS Code's cross-platform API
                try {
                    await vscode.env.openExternal(vscode.Uri.parse(data.url));
                    return { user: null, error: null };
                }
                catch (openError) {
                    console.error("Error opening browser:", openError);
                    this.stopLocalServer();
                    return {
                        user: null,
                        error: openError instanceof Error ? openError.message : "Failed to open browser",
                    };
                }
            }
            this.stopLocalServer();
            return { user: null, error: "Failed to get OAuth URL" };
        }
        catch (error) {
            this.stopLocalServer();
            return {
                user: null,
                error: error instanceof Error ? error.message : "Unknown error",
            };
        }
    }
    async signOut() {
        try {
            const { error } = await this.supabase.auth.signOut();
            if (error) {
                return { error: error.message };
            }
            this.currentUser = null;
            this.currentSession = null;
            return { error: null };
        }
        catch (error) {
            return {
                error: error instanceof Error ? error.message : "Unknown error",
            };
        }
    }
    getCurrentUser() {
        return this.currentUser;
    }
    getCurrentSession() {
        return this.currentSession;
    }
    isAuthenticated() {
        return this.currentUser !== null && this.currentSession !== null;
    }
    async setSessionFromTokens(accessToken, refreshToken) {
        try {
            // Set the session directly on the existing Supabase client
            const { data, error } = await this.supabase.auth.setSession({
                access_token: accessToken,
                refresh_token: refreshToken || "",
            });
            if (error) {
                throw new Error(error.message);
            }
            if (data.session) {
                this.currentSession = data.session;
                this.currentUser = this.mapUser(data.session.user);
                console.log("Session set successfully:", {
                    user: this.currentUser,
                    sessionExists: !!this.currentSession
                });
            }
        }
        catch (error) {
            console.error("Error setting session:", error);
            throw new Error(error instanceof Error ? error.message : "Failed to set session");
        }
    }
    onAuthStateChange(callback) {
        const { data } = this.supabase.auth.onAuthStateChange((event, session) => {
            try {
                if (event === "SIGNED_IN" && session) {
                    this.currentSession = session;
                    this.currentUser = this.mapUser(session.user);
                    callback?.(this.currentUser);
                }
                else if (event === "SIGNED_OUT") {
                    this.currentSession = null;
                    this.currentUser = null;
                    callback?.(null);
                }
            }
            catch (err) {
                console.warn("Auth state callback after panel disposed", err.message);
            }
        });
        return () => {
            try {
                data.subscription.unsubscribe();
            }
            catch (err) {
                console.warn("Error unsubscribing from auth state change:", err.message);
            }
        };
    }
    mapUser(user) {
        return {
            id: user.id,
            email: user.email || "",
            name: user.user_metadata?.name ||
                user.user_metadata?.full_name ||
                user.email?.split("@")[0],
            avatar_url: user.user_metadata?.avatar_url || user.user_metadata?.picture,
        };
    }
    startLocalServer() {
        return new Promise((resolve, reject) => {
            if (this.localServer) {
                this.localServer.close();
            }
            const port = 3000;
            this.localServer = http.createServer((req, res) => {
                console.log("=== Local Server Debug ===");
                console.log("Request received:", req.url);
                console.log("Request method:", req.method);
                const parsedUrl = url.parse(req.url || '', true);
                // Check for tokens in query parameters
                let accessToken = parsedUrl.query?.access_token;
                let refreshToken = parsedUrl.query?.refresh_token;
                console.log("Parsed URL:", parsedUrl);
                console.log("Access token:", accessToken ? accessToken.substring(0, 20) + "..." : "None");
                console.log("Refresh token:", refreshToken ? refreshToken.substring(0, 20) + "..." : "None");
                if (accessToken) {
                    console.log("Setting session with tokens...");
                    // Set the session and close the server
                    this.setSessionFromTokens(accessToken, refreshToken)
                        .then(() => {
                        console.log("Session set successfully in local server");
                        res.writeHead(200, { 'Content-Type': 'text/html' });
                        res.end(`
              <!DOCTYPE html>
              <html>
                <head>
                  <title>Authentication Successful</title>
                  <style>
                    body { font-family: Arial, sans-serif; text-align: center; padding: 50px; }
                    .success { color: #27ae60; }
                  </style>
                </head>
                <body>
                  <h1 class="success">Authentication Successful!</h1>
                  <p>You can close this window and return to VS Code.</p>
                  <script>
                    setTimeout(() => {
                      window.close();
                    }, 2000);
                  </script>
                </body>
              </html>
            `);
                        this.stopLocalServer();
                    })
                        .catch((error) => {
                        console.error("Error setting session in local server:", error);
                        res.writeHead(500, { 'Content-Type': 'text/html' });
                        res.end(`
              <!DOCTYPE html>
              <html>
                <head>
                  <title>Authentication Failed</title>
                  <style>
                    body { font-family: Arial, sans-serif; text-align: center; padding: 50px; }
                    .error { color: #e74c3c; }
                  </style>
                </head>
                <body>
                  <h1 class="error">Authentication Failed</h1>
                  <p>Error: ${error.message}</p>
                  <p>Please try again in VS Code.</p>
                </body>
              </html>
            `);
                        this.stopLocalServer();
                    });
                }
                else {
                    // Serve a page that can handle hash fragments
                    res.writeHead(200, { 'Content-Type': 'text/html' });
                    res.end(`
          <!DOCTYPE html>
          <html>
            <head>
              <title>Processing Authentication...</title>
              <style>
                body { font-family: Arial, sans-serif; text-align: center; padding: 50px; }
                .loading { color: #3498db; }
              </style>
            </head>
            <body>
              <h1 class="loading">Processing Authentication...</h1>
              <p>Please wait while we process your authentication...</p>
              <script>
                // Extract tokens from hash fragment
                const hash = window.location.hash.substring(1);
                const params = new URLSearchParams(hash);
                const accessToken = params.get('access_token');
                const refreshToken = params.get('refresh_token');
                
                console.log('Hash:', hash);
                console.log('Access token:', accessToken ? accessToken.substring(0, 20) + '...' : 'None');
                console.log('Refresh token:', refreshToken ? refreshToken.substring(0, 20) + '...' : 'None');
                
                if (accessToken) {
                  // Redirect to the same URL but with query parameters
                  const newUrl = window.location.origin + window.location.pathname + 
                    '?access_token=' + encodeURIComponent(accessToken) + 
                    (refreshToken ? '&refresh_token=' + encodeURIComponent(refreshToken) : '');
                  console.log('Redirecting to:', newUrl);
                  window.location.href = newUrl;
                } else {
                  document.body.innerHTML = '<h1 class="error">Authentication Error</h1><p>No access token received.</p>';
                }
              </script>
            </body>
          </html>
        `);
                }
            });
            this.localServer.listen(port, 'localhost', () => {
                console.log("Local server started on port:", port);
                resolve(`http://localhost:${port}`);
            });
            this.localServer.on('error', (error) => {
                console.error('Local server error:', error);
                reject(error);
            });
        });
    }
    stopLocalServer() {
        if (this.localServer) {
            this.localServer.close();
            this.localServer = null;
        }
    }
}
exports.AuthService = AuthService;
//# sourceMappingURL=authService.js.map