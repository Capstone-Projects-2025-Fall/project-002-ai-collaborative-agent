//createJiraTasks.ts — Command: generate backlog via AI → create Jira issues
// This command asks the user to describe a project, give project key, user email and api key, then generates a backlog via AI,
// then creates corresponding Jira issues in the target Jira project.
// In this (improved version compared to previous) version,  ALWAYS ask the user for Jira credentials at runtime
// and NEVER reuse stored/saved credentials. That way every run can be done
// by a different user / different Jira project without leaking anything/ relying on previous info that might cause mismatch errors.

//import VS Code API so we can show input boxes, messages, etc...
import * as vscode from "vscode";       // used for prompts and UI

// import helper functions from internal modules
import { generateBacklogFromDescription } from "../lib/ai";    //Function that sends the user’s description to AI and gets a task list
import { createIssuesFromBacklog } from "../lib/jira";         //Function that takes the AI task list and creates issues in Jira


// Main entry point for the "AI: Create Jira Tasks" command
export async function createJiraTasksCmd(ctx: vscode.ExtensionContext) { // ctx is VS Code extension context, not used for secrets anymore but kept for API consistency
  try {                                                                  // wrap everything in try/catch so we can show friendly errors

    
    // 1) Collect Jira connection info from the user (every run)
    //    We DO NOT pull from VS Code settings OR secret storage.
    //    We ask fresh each time so different users / projects can run safely.

    // Ask for Jira Cloud base URL (example: https://your-company.atlassian.net)
    let baseUrl =
      (await vscode.window.showInputBox({
        prompt: "Jira Cloud base URL (e.g. https://your-team.atlassian.net)", // ask user where their Jira lives
        ignoreFocusOut: true,    // keep dialog open even if user clicks away
      })) || "";        // default to empty string if user cancels
    baseUrl = baseUrl.trim();      // remove accidental spaces

    // Ask for the Jira Project Key (short code for the project, e.g. "MOBILE" or "CCS")
    let projectKey =
      (await vscode.window.showInputBox({
        prompt: "Jira Project Key (e.g. STAR, TUFF, ENG)",    // this becomes fields.project.key in Jira payload
        ignoreFocusOut: true,
      })) || "";
    projectKey = projectKey.trim();    // clean it up

    // Ask for Jira account email. This MUST match the owner of the API token we will send.
    let email =
      (await vscode.window.showInputBox({
        prompt: "Jira account email (the one tied to the API token)",       // Atlassian account email
        ignoreFocusOut: true,
      })) || "";
    email = email.trim();         // clean before use

    // Ask for Jira API Token.
    // (new update): We DO NOT write this token to ctx.secrets or settings because we don't want mismatch errors.
    let token =
      (await vscode.window.showInputBox({
        prompt: "Jira API Token",           // personal token created in Atlassian account
        password: true,          // mask input visually
        ignoreFocusOut: true,
      })) || "";
    token = token.trim();           // remove stray whitespace so auth header is correct

    // Basic validation: if any field is missing, we can't continue.
    if (!baseUrl || !projectKey || !email || !token) {        // Make sure none of the required inputs are empty
      throw new Error(
        "Missing Jira credentials. You must enter base URL, project key, email, and API token." // explain to user what is wrong
      );
    }

    
    // 2) Ask the user to describe the project they want to backlog
    //    This text will be sent to the AI model to produce epics/tasks.
    

    const description = await vscode.window.showInputBox({
      prompt: "Describe your project to generate a Jira backlog",           // high level product description
      placeHolder:
        "e.g., Build a fitness app that tracks workouts and suggests plans…", // hint/example to guide the user
      ignoreFocusOut: true,
    });
    if (!description) {       // if they cancel or leave blank, we just stop quietly
      return;
    }

    
    // 3) Use AI to generate a backlog (Markdown text with '- [ ] Task' lines)
    //    generateBacklogFromDescription() calls our AI layer (OpenAI or local model)
    //    and returns text that contains epics/acceptance criteria/tasks.
    

    const ai = await generateBacklogFromDescription(description);           // send user description to AI and get structured backlog text back
          // ai.text is expected to be a markdown-ish string with task bullets

    
    // 4) Send that backlog to Jira and create issues
    //    createIssuesFromBacklog() will:
    //    - parse each "- [ ] some task" line
    //    - build Jira issue payloads (summary, description, etc.)
    //    - call Jira's REST API /rest/api/3/issue for each task
    

    const created = await createIssuesFromBacklog({
      baseUrl,             // Jira site URL (the one the user just typed)
      email,         // Jira email (used for Basic Auth user part)
      token,       // Jira API token (used for Basic Auth password part)
      projectKey,      // Jira project key to attach issues to
      backlogMarkdown: ai.text,   // AI-generated backlog text, which we will parse into tasks
    });

    
    // 5) Tell the user how it went
    //    We show how many issues were successfully created in Jira.
    

    const info = `Created ${created.length} Jira issue(s) in project ${projectKey}`; // friendly summary shown to the user
    vscode.window.showInformationMessage(info);                                     // pop-up success toast in VS Code UI

  } catch (err: any) {     // if anything above threw (network error, Jira 400, etc…)
    const msg = (err?.message || String(err)).slice(0, 1000);     // pull a readable error message and cap length
    vscode.window.showErrorMessage(`Create Jira Tasks failed: ${msg}`);    // show it to the user in VS Code
    throw err;       // rethrow so it also surfaces in debug console
  }
}
