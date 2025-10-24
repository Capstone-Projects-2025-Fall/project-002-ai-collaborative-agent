// src/commands/createJiraTasks.ts — Command: generate backlog via AI → create Jira issues

import * as vscode from "vscode";                              // used for prompts and config

// from: "../ai" / "../jira"
import { generateBacklogFromDescription } from "../lib/ai" //Function that sends the user’s description to AI and gets a task list
import { createIssuesFromBacklog } from "../lib/jira"; //Function that takes the AI task list and creates issues in Jira




export async function createJiraTasksCmd(ctx: vscode.ExtensionContext) {
  try {
    const cfg = vscode.workspace.getConfiguration(); //Get access to VS Code settings (like jira.baseUrl, jira.email, etc...)
    
    //Read Jira settings from VS Code configuration (entered by user in dev window or saved in safe storage from prvious entry)
    const baseUrl = (cfg.get<string>("jira.baseUrl") || "").trim(); // Jira site URL (e.g: https://yourteam.atlassian.net)
    let projectKey = (cfg.get<string>("jira.projectKey") || "").trim(); // Jira project key
    let email = (cfg.get<string>("jira.email") || "").trim(); // Jira account email (both entered from users)

    // Try to get the API token securely from SecretStorage first, then fallback to settings.json if not found
    let token =
      (await ctx.secrets.get("jira.apiToken")) || //get token from secret storage first 
      (cfg.get<string>("jira.apiToken") || ""); //or get it from user input 
    token = token.trim(); //removes extra spaces or invisible characters at the beginning or end of the token string to avoid mismatch errors

    // Ask user for any missing fields
    if (!projectKey) {
      projectKey =
        (await vscode.window.showInputBox({
          prompt: "Jira Project Key (e.g. PROJ)",
          ignoreFocusOut: true, // keeps prompt open
        })) || "";
      projectKey = projectKey.trim();
    }
    if (!email) { //same thing repeated for other fields
      email =
        (await vscode.window.showInputBox({
          prompt: "Jira Email",
          ignoreFocusOut: true,
        })) || "";
      email = email.trim();
    }
    if (!token) {
      token =
        (await vscode.window.showInputBox({
          prompt: "Jira API Token",
          password: true,
          ignoreFocusOut: true,
        })) || "";
      token = token.trim();
      if (token) await ctx.secrets.store("jira.apiToken", token); // store securely
    }

    if (!baseUrl || !projectKey || !email || !token) { //If any required Jira info is missing, stop and show an error message
      throw new Error(
        "Missing Jira credentials. Configure jira.baseUrl, projectKey, email, and apiToken."
      );
    }

    // Collect project description from user
    const description = await vscode.window.showInputBox({
      prompt: "Describe your project to generate a Jira backlog",
      placeHolder:
        "e.g., Build a VS Code extension that generates tasks and pushes to Jira…",
      ignoreFocusOut: true,
    });
    if (!description) return; //If user cancels or leaves it blank, stop the command

    // 1) Generate backlog (Markdown with '- [ ] Task' lines)
    const ai = await generateBacklogFromDescription(description);

    // 2) Create Jira issues (split by '- [ ]')
    const created = await createIssuesFromBacklog({
      baseUrl,
      email,
      token,
      projectKey,
      backlogMarkdown: ai.text,
    });

    // Report back to the user, show how many issues were created 
    const info = `Created ${created.length} Jira issue(s) in ${projectKey}`;
    vscode.window.showInformationMessage(info);
  } catch (err: any) {
    const msg = (err?.message || String(err)).slice(0, 1000);
    vscode.window.showErrorMessage(`Create Jira Tasks failed: ${msg}`);
    throw err;
  }
}
