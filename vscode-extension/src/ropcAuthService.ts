// src/ropcAuthService.ts

import * as vscode from "vscode";
import { SupabaseClient, createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";

// --- Configuration Constants ---
const AUTH0_DOMAIN = process.env.AUTH0_DOMAIN;
const AUTH0_CLIENT_ID = process.env.AUTH0_CLIENT_ID;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const AUTH0_SCOPE = process.env.AUTH0_SCOPE;
const TOKEN_SECRET_KEY = process.env.TOKEN_SECRET_KEY;
const REFRESH_TOKEN_SECRET_KEY = process.env.REFRESH_TOKEN_SECRET_KEY;

export class RopcAuthService {
  private supabase: SupabaseClient | undefined;

  constructor(private readonly context: vscode.ExtensionContext) {}

  public async login(email: string, password: string): Promise<boolean> {
    // FIX #1: Validate ALL required environment variables
    if (
      !AUTH0_DOMAIN ||
      !AUTH0_CLIENT_ID ||
      !TOKEN_SECRET_KEY ||
      !REFRESH_TOKEN_SECRET_KEY
    ) {
      vscode.window.showErrorMessage(
        "Authentication environment variables are not configured correctly in the .env file."
      );
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
        await this.context.secrets.store(
          REFRESH_TOKEN_SECRET_KEY,
          json.refresh_token
        );

        vscode.window.showInformationMessage("Successfully logged in!");

        await this.getSupabaseClient();
        return true;
      } else {
        throw new Error("Login failed: No tokens returned.");
      }
    } catch (err: any) {
      vscode.window.showErrorMessage(`Login failed: ${err.message}`); // Corrected line
      return false;
    }
  }

  // FIX #2: Added full implementation for getSupabaseClient
  public async getSupabaseClient(): Promise<SupabaseClient | undefined> {
    if (this.supabase) {
      return this.supabase;
    }

    // Check for secrets and Supabase config
    const accessToken = await this.context.secrets.get(TOKEN_SECRET_KEY!);
    const refreshToken = await this.context.secrets.get(
      REFRESH_TOKEN_SECRET_KEY!
    );

    if (!accessToken || !refreshToken || !SUPABASE_URL || !SUPABASE_ANON_KEY) {
      return undefined;
    }

    this.supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    await this.supabase.auth.setSession({
      access_token: accessToken,
      refresh_token: refreshToken,
    });

    return this.supabase;
  }

  // FIX #2: Added full implementation for logout
  public async logout() {
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
