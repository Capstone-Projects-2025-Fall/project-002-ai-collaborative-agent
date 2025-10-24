// VS Code entry (registers commands)

import * as vscode from "vscode"; //imports VS Code API so we can access commands, windows, settings, etc...

import { createJiraTasksCmd } from "./commands/createJiraTasks"; // imports main command function that generates Jira tasks using AI




export function activate(context: vscode.ExtensionContext) {//Called when the extension is activated (when user triggers any command)
  // Primary command: “AI: Create Jira Tasks”
  const createJira = vscode.commands.registerCommand(//register the main command: appears as “AI: Create Jira Tasks” in VS Code’s Command Palette (f5)
    "ai.createJiraTasks", //// command ID (must match package.json)
    () => createJiraTasksCmd(context) // calls main function
  );

  // Optional helper/test command to confirm the extension is active (helpful for debuging )
  const hello = vscode.commands.registerCommand(
    "aiCollab.debugHello", // command ID (must match package.json)
    () => vscode.window.showInformationMessage("AI Collab Agent is active!") //confirms extension is work 
  );

  context.subscriptions.push(createJira, hello); //Add both commands to the extension’s subscriptions
}

export function deactivate() { //Called when the extension is deactivated (VS Code shuts down or disables it)
  
}
