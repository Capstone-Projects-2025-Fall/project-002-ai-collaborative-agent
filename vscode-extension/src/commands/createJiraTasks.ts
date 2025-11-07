import * as vscode from "vscode";
import { generateBacklogFromDescription, determineTaskRange } from "../lib/ai";
import { createIssuesFromBacklog } from "../lib/jira";

export interface JiraTaskOptions {
  baseUrl: string;
  projectKey: string;
  email: string;
  token: string;
  description: string;
}

function sanitize(input?: string | null): string {
  return (input ?? "").trim();
}

async function ensureValue(
  current: string,
  promptOptions: vscode.InputBoxOptions
): Promise<string> {
  if (current) {
    return current;
  }

  const response = await vscode.window.showInputBox(promptOptions);
  return sanitize(response);
}

export async function createJiraTasksCmd(
  ctx: vscode.ExtensionContext,
  options?: Partial<JiraTaskOptions>
) {
  try {
    let baseUrl = sanitize(options?.baseUrl);
    let projectKey = sanitize(options?.projectKey);
    let email = sanitize(options?.email);
    let token = sanitize(options?.token);
    let description = sanitize(options?.description);

    baseUrl = await ensureValue(baseUrl, {
      prompt: "Jira Cloud base URL (e.g. https://your-team.atlassian.net)",
      ignoreFocusOut: true,
    });

    projectKey = await ensureValue(projectKey, {
      prompt: "Jira Project Key (e.g. STAR, TUFF, ENG)",
      ignoreFocusOut: true,
    });

    email = await ensureValue(email, {
      prompt: "Jira account email (the one tied to the API token)",
      ignoreFocusOut: true,
    });

    if (!token) {
      token = sanitize(
        await vscode.window.showInputBox({
          prompt: "Jira API Token",
          password: true,
          ignoreFocusOut: true,
        })
      );
    }

    if (!baseUrl || !projectKey || !email || !token) {
      throw new Error(
        "Missing Jira credentials. Please provide base URL, project key, email, and API token."
      );
    }

    description = await ensureValue(description, {
      prompt: "Describe your project to generate a Jira backlog",
      placeHolder:
        "e.g., Build a fitness app that tracks workouts and suggests plans…",
      ignoreFocusOut: true,
    });

    if (!description) {
      vscode.window.showWarningMessage(
        "Jira backlog creation cancelled: no project description provided."
      );
      return;
    }

    const created = await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: "Generating Jira Tasks",
        cancellable: false,
      },
      async (progress) => {
        progress.report({ message: "Analyzing project scope..." });
        const taskRange = determineTaskRange(description);
        const ai = await generateBacklogFromDescription(description);

        progress.report({ message: "Creating issues in Jira..." });
        return await createIssuesFromBacklog({
          baseUrl,
          email,
          token,
          projectKey,
          backlogMarkdown: ai.text,
          minTasks: taskRange.min,
          maxTasks: taskRange.max,
        });
      }
    );

    const info = `Created ${created.length} Jira issue(s) in project ${projectKey}`;
    vscode.window.showInformationMessage(info);

    return created;
  } catch (err: any) {
    const msg = (err?.message || String(err)).slice(0, 1000);
    vscode.window.showErrorMessage(`Create Jira Tasks failed: ${msg}`);
    throw err;
  }
}
