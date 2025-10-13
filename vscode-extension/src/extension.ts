import * as vscode from "vscode";
import * as fs from "fs/promises";
import * as path from "path";

// Helper function to get the full path to our data file
function getDataFilePath(): string | undefined {
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
  if (!workspaceFolder) {
    return undefined; // No open folder
  }
  // We'll store our data in a hidden file in the root of the workspace
  return path.join(workspaceFolder.uri.fsPath, ".aiCollabData.json");
}

// Helper function to load all data from the file
export async function loadInitialData(): Promise<any> {
  const filePath = getDataFilePath();
  let data: { users: any[]; projects: any[]; promptCount: number } = {
    users: [],
    projects: [],
    promptCount: 0,
  };

  if (filePath) {
    try {
      const fileContent = await fs.readFile(filePath, "utf-8");
      const parsedData = JSON.parse(fileContent);

      data.users = parsedData.users || [];
      data.projects = parsedData.projects || [];
      data.promptCount = parsedData.promptCount || 0;
    } catch (error) {
      console.log("Data file not found or invalid, using default state.");
    }
  }

  // Ensure selectedMemberIds is an array for all projects (backward compatibility/safety)
  data.projects = data.projects.map((projectData: any) => ({
    ...projectData,
    selectedMemberIds: Array.isArray(projectData.selectedMemberIds)
      ? projectData.selectedMemberIds
      : [],
  }));

  return data;
}

// Helper function to save all data to the file
export async function saveInitialData(data: any): Promise<void> {
  const filePath = getDataFilePath();
  if (!filePath) {
    vscode.window.showErrorMessage(
      "Please open a folder in your workspace to save data."
    );
    return;
  }
  try {
    const jsonString = JSON.stringify(data, null, 2);
    await fs.writeFile(filePath, jsonString, "utf-8");
  } catch (error) {
    console.error("Failed to save data:", error);
    vscode.window.showErrorMessage("Failed to save team data to file.");
  }
}

export function createPromptForProject(
  projectToPrompt: any,
  allUsers: any[]
): string {
  if (!projectToPrompt) {
    return ""; // Or throw an error, which we can test for!
  }

  const teamMembersForPrompt = allUsers.filter((user: any) =>
    projectToPrompt.selectedMemberIds
      .map((id: any) => String(id))
      .includes(String(user.id))
  );

  const teamMemberDetails = teamMembersForPrompt
    .map(
      (user: any, index: number) =>
        `Team Member ${index + 1}:
          Name: ${user.name}
          Skills: ${user.skills}
          Programming Languages: ${user.programmingLanguages}
          Willing to work on: ${user.willingToWorkOn || "Not specified"}
          `
    )
    .join("");

  const promptContent = `PROJECT ANALYSIS AND TEAM OPTIMIZATION REQUEST

=== PROJECT INFORMATION ===
Project Name: ${projectToPrompt.name}
Created: ${new Date(projectToPrompt.createdAt).toLocaleString()}

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

Give me a specific message for EACH team member, detailing them what they need to do RIGHT NOW and in the FUTURE. Give each user the exact things they need to work on according also to their skills.`;

  return promptContent;
}

export function activate(context: vscode.ExtensionContext) {
  vscode.window.showInformationMessage("AI Collab Agent activated");

  // ---- Debug/health command
  const hello = vscode.commands.registerCommand("aiCollab.debugHello", () => {
    vscode.window.showInformationMessage("Hello from AI Collab Agent!");
  });
  context.subscriptions.push(hello);

  // ---- Main command: opens the webview panel
  const open = vscode.commands.registerCommand(
    "aiCollab.openPanel",
    async () => {
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
        switch (msg.type) {
          case "saveData": {
            await saveInitialData(msg.payload);
            vscode.window.showInformationMessage(
              "Team data saved to .aiCollabData.json!"
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

          case "generatePrompt": {
            const { projectId } = msg.payload;

            const currentData = await loadInitialData();
            const projectToPrompt = currentData.projects.find(
              (p: any) => p.id == projectId
            );
            const promptContent = createPromptForProject(
              projectToPrompt,
              currentData.users
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

            const tempFileName = `AI_Prompt_${projectToPrompt.name.replace(
              /[^a-zA-Z0-9]/g,
              "_"
            )}_${Date.now()}.txt`;
            const workspaceFolders = vscode.workspace.workspaceFolders;
            if (workspaceFolders) {
              const filePath = vscode.Uri.joinPath(
                workspaceFolders[0].uri,
                tempFileName
              );
              await fs.writeFile(filePath.fsPath, promptContent, "utf-8");
              await vscode.window.showTextDocument(filePath, {
                viewColumn: vscode.ViewColumn.Beside,
                preview: false,
              });
            }

            currentData.promptCount++;
            await saveInitialData(currentData);

            panel.webview.postMessage({
              type: "dataLoaded",
              payload: currentData,
            });
            panel.webview.postMessage({
              type: "promptGeneratedFromExtension",
              payload: { prompt: promptContent },
            });

            vscode.window.showInformationMessage(
              `AI Prompt generated for project: ${projectToPrompt.name} and saved to ${tempFileName}`
            );
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
          default:
            break;
        }
      });
    }
  );
  context.subscriptions.push(open);
}

export function deactivate() {}

async function getHtml(
  webview: vscode.Webview,
  context: vscode.ExtensionContext
): Promise<string> {
  const nonce = getNonce();

  const htmlPath = path.join(context.extensionPath, "media", "webview.html");

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

function getNonce() {
  let text = "";
  const possible =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}
