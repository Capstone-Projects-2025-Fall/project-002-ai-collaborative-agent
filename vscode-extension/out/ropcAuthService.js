"use strict";
// src/ropcAuthService.ts
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
exports.RopcAuthService = void 0;
const vscode = __importStar(require("vscode"));
const supabase_js_1 = require("@supabase/supabase-js");
// --- Configuration Constants ---
const AUTH0_DOMAIN = process.env.AUTH0_DOMAIN;
const AUTH0_CLIENT_ID = process.env.AUTH0_CLIENT_ID;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const AUTH0_SCOPE = process.env.AUTH0_SCOPE;
const TOKEN_SECRET_KEY = process.env.TOKEN_SECRET_KEY;
const REFRESH_TOKEN_SECRET_KEY = process.env.REFRESH_TOKEN_SECRET_KEY;
class RopcAuthService {
    context;
    supabase;
    constructor(context) {
        this.context = context;
    }
    async login(email, password) {
        // FIX #1: Validate ALL required environment variables
        if (!AUTH0_DOMAIN ||
            !AUTH0_CLIENT_ID ||
            !TOKEN_SECRET_KEY ||
            !REFRESH_TOKEN_SECRET_KEY) {
            vscode.window.showErrorMessage("Authentication environment variables are not configured correctly in the .env file.");
            return false;
        }
        const tokenUrl = `https://${AUTH0_DOMAIN}/oauth/token`;
        const body = new URLSearchParams({
            grant_type: "password",
            client_id: AUTH0_CLIENT_ID,
            username: email,
            password: password,
            scope: AUTH0_SCOPE || "openid profile email offline_access",
        });
        try {
            const response = await fetch(tokenUrl, {
                method: "POST",
                headers: { "Content-Type": "application/x-www-form-urlencoded" },
                body: body.toString(),
            });
            const json = await response.json();
            if (json.error) {
                throw new Error(`${json.error_description || json.error}`);
            }
            if (json.access_token && json.refresh_token) {
                // These calls are now safe because the variables were validated above.
                await this.context.secrets.store(TOKEN_SECRET_KEY, json.access_token);
                await this.context.secrets.store(REFRESH_TOKEN_SECRET_KEY, json.refresh_token);
                vscode.window.showInformationMessage("Successfully logged in!");
                await this.getSupabaseClient();
                return true;
            }
            else {
                throw new Error("Login failed: No tokens returned.");
            }
        }
        catch (err) {
            vscode.window.showErrorMessage(`Login failed: ${err.message}`); // Corrected line
            return false;
        }
    }
    // FIX #2: Added full implementation for getSupabaseClient
    async getSupabaseClient() {
        if (this.supabase) {
            return this.supabase;
        }
        // Check for secrets and Supabase config
        const accessToken = await this.context.secrets.get(TOKEN_SECRET_KEY);
        const refreshToken = await this.context.secrets.get(REFRESH_TOKEN_SECRET_KEY);
        if (!accessToken || !refreshToken || !SUPABASE_URL || !SUPABASE_ANON_KEY) {
            return undefined;
        }
        this.supabase = (0, supabase_js_1.createClient)(SUPABASE_URL, SUPABASE_ANON_KEY);
        await this.supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
        });
        return this.supabase;
    }
    // FIX #2: Added full implementation for logout
    async logout() {
        if (!TOKEN_SECRET_KEY || !REFRESH_TOKEN_SECRET_KEY) {
            // Handle case where env vars might be missing, although unlikely
            return;
        }
        await this.context.secrets.delete(TOKEN_SECRET_KEY);
        await this.context.secrets.delete(REFRESH_TOKEN_SECRET_KEY);
        this.supabase = undefined;
        vscode.window.showInformationMessage("Successfully logged out!");
    }
}
exports.RopcAuthService = RopcAuthService;
