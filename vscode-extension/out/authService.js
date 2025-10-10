"use strict";
// src/authService.ts
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
const nanoid_1 = require("nanoid");
const crypto_1 = require("crypto");
const supabase_js_1 = require("@supabase/supabase-js");
// --- Configuration Constants ---
// Replace with your actual Auth0 and Supabase details
const AUTH0_DOMAIN = "YOUR_AUTH0_DOMAIN"; // e.g., 'dev-12345.us.auth0.com'
const AUTH0_CLIENT_ID = "YOUR_AUTH0_CLIENT_ID";
const SUPABASE_URL = "YOUR_SUPABASE_URL"; // e.g., 'https://xyz.supabase.co'
const SUPABASE_ANON_KEY = "YOUR_SUPABASE_ANON_KEY";
const AUTH0_SCOPE = "openid profile email offline_access";
const CALLBACK_PORT = 54321;
const REDIRECT_URI = `http://localhost:${CALLBACK_PORT}/callback`;
const TOKEN_SECRET_KEY = "my-extension.auth0-token";
const REFRESH_TOKEN_SECRET_KEY = "my-extension.auth0-refresh-token";
// A simple in-memory store for the verifier and state
const authStore = {
    codeVerifier: "",
    state: "",
};
class AuthService {
    context;
    server;
    supabase;
    constructor(context) {
        this.context = context;
    }
    // Public method to get the Supabase client
    async getSupabaseClient() {
        if (this.supabase) {
            return this.supabase;
        }
        const session = await this.getSession();
        if (!session) {
            return undefined;
        }
        // Initialize Supabase client
        this.supabase = (0, supabase_js_1.createClient)(SUPABASE_URL, SUPABASE_ANON_KEY);
        // Set the session from Auth0 token
        await this.supabase.auth.setSession({
            access_token: session.accessToken,
            refresh_token: session.refreshToken,
        });
        return this.supabase;
    }
    // --- Login Flow ---
    async login() {
        this.startServer();
        authStore.state = (0, nanoid_1.nanoid)();
        authStore.codeVerifier = (0, nanoid_1.nanoid)(64);
        const codeChallenge = (0, crypto_1.createHash)("sha256")
            .update(authStore.codeVerifier)
            .digest("base64")
            .replace(/\+/g, "-")
            .replace(/\//g, "_")
            .replace(/=/g, "");
        const authUrl = vscode.Uri.parse(`https://${AUTH0_DOMAIN}/authorize?` +
            `response_type=code` +
            `&client_id=${AUTH0_CLIENT_ID}` +
            `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}` +
            `&scope=${encodeURIComponent(AUTH0_SCOPE)}` +
            `&state=${authStore.state}` +
            `&code_challenge=${codeChallenge}` +
            `&code_challenge_method=S256`);
        vscode.env.openExternal(authUrl);
    }
    // --- Logout Flow ---
    async logout() {
        await this.context.secrets.delete(TOKEN_SECRET_KEY);
        await this.context.secrets.delete(REFRESH_TOKEN_SECRET_KEY);
        this.supabase = undefined; // Clear the client
        vscode.window.showInformationMessage("Successfully logged out!");
        const logoutUrl = vscode.Uri.parse(`https://${AUTH0_DOMAIN}/v2/logout?` +
            `client_id=${AUTH0_CLIENT_ID}` +
            `&returnTo=${encodeURIComponent("vscode://your-publisher.your-extension-name/logged-out")}`);
        vscode.env.openExternal(logoutUrl);
    }
    // --- Session Management ---
    async getSession() {
        const accessToken = await this.context.secrets.get(TOKEN_SECRET_KEY);
        const refreshToken = await this.context.secrets.get(REFRESH_TOKEN_SECRET_KEY);
        if (!accessToken || !refreshToken) {
            return undefined;
        }
        return { accessToken, refreshToken };
    }
    // --- Private Helper Methods ---
    startServer() {
        if (this.server) {
            return;
        }
        this.server = http.createServer(async (req, res) => {
            const url = new URL(req.url, `http://${req.headers.host}`);
            const code = url.searchParams.get("code");
            const state = url.searchParams.get("state");
            if (state !== authStore.state) {
                res.writeHead(400, { "Content-Type": "text/plain" });
                res.end("Invalid state parameter.");
                return;
            }
            if (code) {
                res.writeHead(200, { "Content-Type": "text/plain" });
                res.end("Authentication successful! You can close this window.");
                this.stopServer();
                await this.exchangeCodeForToken(code);
            }
            else {
                res.writeHead(400, { "Content-Type": "text/plain" });
                res.end("No authorization code found.");
            }
        });
        this.server.listen(CALLBACK_PORT, () => {
            console.log(`Auth server listening on port ${CALLBACK_PORT}`);
        });
    }
    stopServer() {
        this.server?.close();
        this.server = undefined;
    }
    async exchangeCodeForToken(code) {
        const tokenUrl = `https://${AUTH0_DOMAIN}/oauth/token`;
        const body = new URLSearchParams({
            grant_type: "authorization_code",
            client_id: AUTH0_CLIENT_ID,
            code: code,
            redirect_uri: REDIRECT_URI,
            code_verifier: authStore.codeVerifier,
        });
        try {
            const response = await fetch(tokenUrl, {
                method: "POST",
                headers: { "Content-Type": "application/x-www-form-urlencoded" },
                body: body.toString(),
            });
            const json = await response.json();
            if (json.access_token && json.refresh_token) {
                // Store tokens securely!
                await this.context.secrets.store(TOKEN_SECRET_KEY, json.access_token);
                await this.context.secrets.store(REFRESH_TOKEN_SECRET_KEY, json.refresh_token);
                vscode.window.showInformationMessage("Successfully logged in!");
                // Re-initialize the supabase client with the new session
                this.supabase = undefined;
                await this.getSupabaseClient();
            }
            else {
                throw new Error("Failed to get tokens.");
            }
        }
        catch (err) {
            vscode.window.showErrorMessage(`Error during token exchange: ${err.message}`);
            import { createClient, SupabaseClient, User, Session, } from "@supabase/supabase-js";
            import * as vscode from "vscode";
            export class AuthService {
                supabase;
                supabaseUrl;
                currentUser = null;
                currentSession = null;
                constructor() {
                    // Get Supabase configuration from environment variables
                    const supabaseUrl = process.env.SUPABASE_URL;
                    const supabaseKey = process.env.SUPABASE_ANON_KEY;
                    if (!supabaseUrl || !supabaseKey) {
                        throw new Error("Supabase configuration missing. Please set SUPABASE_URL and SUPABASE_ANON_KEY in your .env file.");
                    }
                    this.supabaseUrl = supabaseUrl;
                    this.supabase = (0, supabase_js_2.createClient)(supabaseUrl, supabaseKey);
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
                        // Get the OAuth URL from Supabase
                        const { data, error } = await this.supabase.auth.signInWithOAuth({
                            provider: "google",
                            options: {
                                redirectTo: `${this.supabaseUrl}/functions/v1/auth-callback`,
                                skipBrowserRedirect: true,
                            },
                        });
                        if (error) {
                            return { user: null, error: error.message };
                        }
                        if (data.url) {
                            // Open the OAuth URL in the default browser using VS Code's URI handler
                            const { exec } = require("child_process");
                            const command = process.platform === "win32"
                                ? "start"
                                : process.platform === "darwin"
                                    ? "open"
                                    : "xdg-open";
                            exec(`${command} "${data.url}"`);
                            return { user: null, error: null };
                        }
                        return { user: null, error: "Failed to get OAuth URL" };
                    }
                    catch (error) {
                        return {
                            user: null,
                            error: error instanceof Error ? error.message : "Unknown error",
                        };
                    }
                }
                async signInWithGithub() {
                    try {
                        // Get the OAuth URL from Supabase
                        const { data, error } = await this.supabase.auth.signInWithOAuth({
                            provider: "github",
                            options: {
                                redirectTo: `${this.supabaseUrl}/functions/v1/auth-callback`,
                                skipBrowserRedirect: true,
                            },
                        });
                        if (error) {
                            return { user: null, error: error.message };
                        }
                        if (data.url) {
                            // Open the OAuth URL in the default browser using VS Code's URI handler
                            const { exec } = require("child_process");
                            const command = process.platform === "win32"
                                ? "start"
                                : process.platform === "darwin"
                                    ? "open"
                                    : "xdg-open";
                            exec(`${command} "${data.url}"`);
                            return { user: null, error: null };
                        }
                        return { user: null, error: "Failed to get OAuth URL" };
                    }
                    catch (error) {
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
                        }
                    }
                    catch (error) {
                        throw new Error(error instanceof Error ? error.message : "Failed to set session");
                    }
                }
                onAuthStateChange(callback) {
                    return this.supabase.auth.onAuthStateChange((event, session) => {
                        if (event === "SIGNED_IN" && session) {
                            this.currentSession = session;
                            this.currentUser = this.mapUser(session.user);
                            callback(this.currentUser);
                        }
                        else if (event === "SIGNED_OUT") {
                            this.currentSession = null;
                            this.currentUser = null;
                            callback(null);
                        }
                    }).data.subscription.unsubscribe;
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
            }
        }
    }
}
exports.AuthService = AuthService;
