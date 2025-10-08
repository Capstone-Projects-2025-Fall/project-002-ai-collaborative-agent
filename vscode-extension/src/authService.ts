// src/authService.ts

import * as vscode from "vscode";
import * as http from "http";
import { nanoid } from "nanoid";
import { createHash } from "crypto";
import { SupabaseClient, createClient } from "@supabase/supabase-js";

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

export class AuthService {
  private server: http.Server | undefined;
  private supabase: SupabaseClient | undefined;

  constructor(private readonly context: vscode.ExtensionContext) {}

  // Public method to get the Supabase client
  public async getSupabaseClient(): Promise<SupabaseClient | undefined> {
    if (this.supabase) {
      return this.supabase;
    }

    const session = await this.getSession();
    if (!session) {
      return undefined;
    }

    // Initialize Supabase client
    this.supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    // Set the session from Auth0 token
    await this.supabase.auth.setSession({
      access_token: session.accessToken,
      refresh_token: session.refreshToken,
    });

    return this.supabase;
  }

  // --- Login Flow ---
  public async login() {
    this.startServer();

    authStore.state = nanoid();
    authStore.codeVerifier = nanoid(64);

    const codeChallenge = createHash("sha256")
      .update(authStore.codeVerifier)
      .digest("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=/g, "");

    const authUrl = vscode.Uri.parse(
      `https://${AUTH0_DOMAIN}/authorize?` +
        `response_type=code` +
        `&client_id=${AUTH0_CLIENT_ID}` +
        `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}` +
        `&scope=${encodeURIComponent(AUTH0_SCOPE)}` +
        `&state=${authStore.state}` +
        `&code_challenge=${codeChallenge}` +
        `&code_challenge_method=S256`
    );

    vscode.env.openExternal(authUrl);
  }

  // --- Logout Flow ---
  public async logout() {
    await this.context.secrets.delete(TOKEN_SECRET_KEY);
    await this.context.secrets.delete(REFRESH_TOKEN_SECRET_KEY);
    this.supabase = undefined; // Clear the client
    vscode.window.showInformationMessage("Successfully logged out!");

    const logoutUrl = vscode.Uri.parse(
      `https://${AUTH0_DOMAIN}/v2/logout?` +
        `client_id=${AUTH0_CLIENT_ID}` +
        `&returnTo=${encodeURIComponent(
          "vscode://your-publisher.your-extension-name/logged-out"
        )}`
    );
    vscode.env.openExternal(logoutUrl);
  }

  // --- Session Management ---
  private async getSession(): Promise<
    { accessToken: string; refreshToken: string } | undefined
  > {
    const accessToken = await this.context.secrets.get(TOKEN_SECRET_KEY);
    const refreshToken = await this.context.secrets.get(
      REFRESH_TOKEN_SECRET_KEY
    );
    if (!accessToken || !refreshToken) {
      return undefined;
    }
    return { accessToken, refreshToken };
  }

  // --- Private Helper Methods ---

  private startServer() {
    if (this.server) {
      return;
    }
    this.server = http.createServer(async (req, res) => {
      const url = new URL(req.url!, `http://${req.headers.host}`);
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
      } else {
        res.writeHead(400, { "Content-Type": "text/plain" });
        res.end("No authorization code found.");
      }
    });

    this.server.listen(CALLBACK_PORT, () => {
      console.log(`Auth server listening on port ${CALLBACK_PORT}`);
    });
  }

  private stopServer() {
    this.server?.close();
    this.server = undefined;
  }

  private async exchangeCodeForToken(code: string) {
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
        await this.context.secrets.store(
          REFRESH_TOKEN_SECRET_KEY,
          json.refresh_token
        );
        vscode.window.showInformationMessage("Successfully logged in!");

        // Re-initialize the supabase client with the new session
        this.supabase = undefined;
        await this.getSupabaseClient();
      } else {
        throw new Error("Failed to get tokens.");
      }
    } catch (err: any) {
      vscode.window.showErrorMessage(
        `Error during token exchange: ${err.message}`
      );
    }
  }

  private async ensureUserProfile(supabase: SupabaseClient) {
    // 1. Get the current user from Supabase auth
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      console.error("No user found.");
      return;
    }

    // 2. Check if a profile already exists
    const { data: profile } = await supabase
      .from("profiles")
      .select("id")
      .eq("id", user.id)
      .single();

    // 3. If no profile exists, create one with default or user-provided data.
    if (!profile) {
      const { error } = await supabase.from("profiles").upsert({
        id: user.id, // This links it to the auth.users table
        name: "thomas", // You would get this from user input or Auth0 metadata
        skills: "ml",
        programming_languages: "python",
        willing_to_work_on: "backend logic",
      });

      if (error) {
        console.error("Error creating user profile:", error.message);
      } else {
        console.log("User profile successfully created!");
      }
    }
  }
}
