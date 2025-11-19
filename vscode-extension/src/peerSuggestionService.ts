import * as vscode from "vscode";
import * as crypto from "crypto";
import { DatabaseService, Project, Profile } from "./databaseService";
import { AuthService } from "./authService";
import { getPeerSuggestionEdgeFunctionUrl, getSupabaseAnonKey } from "./supabaseConfig";

// TypeScript Interfaces
export interface AIPeerSuggestionRequest {
  codeSnippet: string;
  languageId: string;
  cursorPosition: { line: number; character: number };
  diagnostics: Array<{
    severity: number;
    message: string;
    range: { start: { line: number; character: number }; end: { line: number; character: number } };
  }>;
  projectContext: {
    id: string;
    name: string;
    description: string;
    goals: string;
    requirements: string;
  } | null;
  teamMembers: Array<{
    id: string;
    name: string;
    skills: string;
    programmingLanguages: string;
  }>;
  currentUserId: string;
  contextHash?: string; // For duplicate detection
}

export interface AIPeerSuggestionResponse {
  hasSuggestion: boolean;
  message?: string;
  recommendedPeer?: {
    id: string;
    name: string;
    reason: string;
  };
  confidence?: number;
  problemDomain?: string;
}

// Configuration
const DEBOUNCE_DELAY_MS = 5000; // 5 seconds
const DUPLICATE_PREVENTION_WINDOW_MS = 10 * 60 * 1000; // 10 minutes

// Complex library imports that might indicate struggle
const COMPLEX_LIBRARIES = [
  "tensorflow", "pytorch", "keras", "spark", "kubernetes", "docker",
  "react", "vue", "angular", "next", "nuxt", "gatsby",
  "express", "fastapi", "django", "flask", "spring", "nestjs"
];

export class PeerSuggestionService {
  private debounceTimer: NodeJS.Timeout | undefined;
  private recentSuggestions: Map<string, number> = new Map(); // contextHash -> timestamp
  private isEnabled: boolean = true;

  constructor(
    private context: vscode.ExtensionContext,
    private databaseService: DatabaseService,
    private authService: AuthService,
    private getActiveProjectContext: () => Promise<Project | null>
  ) {
    this.startEditorMonitoring();
  }

  private startEditorMonitoring(): void {
    // Monitor document changes with debouncing
    const changeListener = vscode.workspace.onDidChangeTextDocument(
      (event) => {
        if (!this.isEnabled) {
          return;
        }

        // Only monitor active editor
        const activeEditor = vscode.window.activeTextEditor;
        if (!activeEditor || activeEditor.document !== event.document) {
          return;
        }

        // Clear existing timer
        if (this.debounceTimer) {
          clearTimeout(this.debounceTimer);
        }

        // Set new debounce timer
        this.debounceTimer = setTimeout(() => {
          this.checkForStruggle();
        }, DEBOUNCE_DELAY_MS);
      },
      null,
      this.context.subscriptions
    );

    // Monitor diagnostics changes
    const diagnosticListener = vscode.languages.onDidChangeDiagnostics(
      () => {
        if (!this.isEnabled) {
          return;
        }

        // Trigger check after a short delay to let diagnostics update
        if (this.debounceTimer) {
          clearTimeout(this.debounceTimer);
        }

        this.debounceTimer = setTimeout(() => {
          this.checkForStruggle();
        }, DEBOUNCE_DELAY_MS);
      },
      null,
      this.context.subscriptions
    );

    this.context.subscriptions.push(changeListener, diagnosticListener);
  }

  private async checkForStruggle(): Promise<void> {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      return;
    }

    const document = editor.document;
    const languageId = document.languageId;

    // Get code snippet around cursor (50 lines before and after)
    const cursorPosition = editor.selection.active;
    const startLine = Math.max(0, cursorPosition.line - 50);
    const endLine = Math.min(document.lineCount - 1, cursorPosition.line + 50);
    const codeSnippet = document.getText(
      new vscode.Range(startLine, 0, endLine, document.lineAt(endLine).text.length)
    );

    // Check for struggle indicators
    const hasStruggle = await this.detectStruggleIndicators(
      document,
      cursorPosition,
      codeSnippet
    );

    if (!hasStruggle) {
      return;
    }

    // Collect context and make suggestion request
    try {
      const request = await this.constructAIPeerSuggestionRequest(
        codeSnippet,
        languageId,
        cursorPosition,
        document
      );

      if (!request) {
        return; // No active project or team members
      }

      // Check for duplicates
      const contextHash = this.generateContextHash(request);
      if (this.isDuplicateSuggestion(contextHash)) {
        return;
      }

      // Call AI service
      const response = await this.callAISuggestionService(request);

      if (response && response.hasSuggestion && response.recommendedPeer) {
        this.recordSuggestion(contextHash);
        this.presentSuggestion(response);
      }
    } catch (error) {
      console.error("Error in peer suggestion check:", error);
    }
  }

  private async detectStruggleIndicators(
    document: vscode.TextDocument,
    cursorPosition: vscode.Position,
    codeSnippet: string
  ): Promise<boolean> {
    // 1. Check for persistent diagnostics (errors/warnings)
    const diagnostics = vscode.languages.getDiagnostics(document.uri);
    const relevantDiagnostics = diagnostics.filter((d) => {
      const range = d.range;
      const distance = Math.abs(range.start.line - cursorPosition.line);
      return distance <= 20 && (d.severity === vscode.DiagnosticSeverity.Error || d.severity === vscode.DiagnosticSeverity.Warning);
    });

    if (relevantDiagnostics.length > 0) {
      return true;
    }

    // 2. Check for TODO/FIXME/HELP comments
    const commentPatterns = [
      /\/\/\s*(TODO|FIXME|HELP|HACK|XXX|BUG)/i,
      /#\s*(TODO|FIXME|HELP|HACK|XXX|BUG)/i,
      /\/\*\s*(TODO|FIXME|HELP|HACK|XXX|BUG)/i,
    ];

    for (const pattern of commentPatterns) {
      if (pattern.test(codeSnippet)) {
        return true;
      }
    }

    // 3. Check for complex library imports
    const importLines = codeSnippet.split("\n").filter((line) =>
      /^(import|from|require|using)\s+/.test(line.trim())
    );

    for (const line of importLines) {
      for (const lib of COMPLEX_LIBRARIES) {
        if (line.toLowerCase().includes(lib.toLowerCase())) {
          return true;
        }
      }
    }

    return false;
  }

  private async constructAIPeerSuggestionRequest(
    codeSnippet: string,
    languageId: string,
    cursorPosition: vscode.Position,
    document: vscode.TextDocument
  ): Promise<AIPeerSuggestionRequest | null> {
    // Get active project context
    const project = await this.getActiveProjectContext();
    if (!project) {
      return null;
    }

    // Get current user
    const user = this.authService.getCurrentUser();
    if (!user) {
      return null;
    }

    // Get relevant team members for the project
    const teamMembers = await this.getRelevantTeamMembers(project.id);
    if (teamMembers.length === 0) {
      return null;
    }

    // Get diagnostics
    const diagnostics = vscode.languages.getDiagnostics(document.uri);
    const relevantDiagnostics = diagnostics
      .filter((d) => {
        const distance = Math.abs(d.range.start.line - cursorPosition.line);
        return distance <= 20;
      })
      .map((d) => ({
        severity: d.severity,
        message: d.message,
        range: {
          start: { line: d.range.start.line, character: d.range.start.character },
          end: { line: d.range.end.line, character: d.range.end.character },
        },
      }));

    // Construct project context
    const projectContext = {
      id: project.id,
      name: project.name,
      description: project.description || "",
      goals: project.goals || "",
      requirements: project.requirements || "",
    };

    // Format team members
    const formattedTeamMembers = teamMembers.map((member) => ({
      id: member.id,
      name: member.name,
      skills: member.skills || "",
      programmingLanguages: member.programming_languages || "",
    }));

    return {
      codeSnippet,
      languageId,
      cursorPosition: {
        line: cursorPosition.line,
        character: cursorPosition.character,
      },
      diagnostics: relevantDiagnostics,
      projectContext,
      teamMembers: formattedTeamMembers,
      currentUserId: user.id,
    };
  }

  private async getRelevantTeamMembers(projectId: string): Promise<Profile[]> {
    try {
      const members = await this.databaseService.getProfilesForProject(projectId);
      const currentUser = this.authService.getCurrentUser();
      
      if (!currentUser) {
        return members;
      }

      // Filter out current user (don't suggest yourself)
      return members.filter((member) => member.id !== currentUser.id);
    } catch (error) {
      console.error("Error getting relevant team members:", error);
      return [];
    }
  }

  private generateContextHash(request: AIPeerSuggestionRequest): string {
    // Create a hash from code snippet, language, and cursor position
    const hashInput = `${request.codeSnippet.substring(0, 200)}|${request.languageId}|${request.cursorPosition.line}|${request.cursorPosition.character}`;
    return crypto.createHash("md5").update(hashInput).digest("hex");
  }

  private isDuplicateSuggestion(contextHash: string): boolean {
    const now = Date.now();
    const lastSuggestionTime = this.recentSuggestions.get(contextHash);

    if (lastSuggestionTime) {
      const timeSinceLastSuggestion = now - lastSuggestionTime;
      if (timeSinceLastSuggestion < DUPLICATE_PREVENTION_WINDOW_MS) {
        return true;
      }
    }

    // Clean up old entries
    for (const [hash, timestamp] of this.recentSuggestions.entries()) {
      if (now - timestamp > DUPLICATE_PREVENTION_WINDOW_MS) {
        this.recentSuggestions.delete(hash);
      }
    }

    return false;
  }

  private recordSuggestion(contextHash: string): void {
    this.recentSuggestions.set(contextHash, Date.now());
  }

  private async callAISuggestionService(
    request: AIPeerSuggestionRequest
  ): Promise<AIPeerSuggestionResponse | null> {
    try {
      const edgeFunctionUrl = getPeerSuggestionEdgeFunctionUrl();
      const anonKey = getSupabaseAnonKey();

      const response = await fetch(edgeFunctionUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${anonKey}`,
          "apikey": anonKey,
        },
        body: JSON.stringify(request),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        console.error(`Supabase Edge Function error: ${response.status} ${response.statusText}`, errorData);
        return null;
      }

      const data = await response.json();
      return data as AIPeerSuggestionResponse;
    } catch (error) {
      console.error("Error calling AI suggestion service:", error);
      return null;
    }
  }

  private async presentSuggestion(response: AIPeerSuggestionResponse): Promise<void> {
    if (!response.recommendedPeer || !response.message) {
      return;
    }

    const peerName = response.recommendedPeer.name;
    const message = response.message;

    const askAction = `Ask ${peerName} Now`;
    const dismissAction = "Dismiss";

    const selected = await vscode.window.showInformationMessage(
      message,
      askAction,
      dismissAction
    );

    if (selected === askAction) {
      await this.openScratchpadWithContext(response);
    }
  }

  private async openScratchpadWithContext(
    response: AIPeerSuggestionResponse
  ): Promise<void> {
    if (!response.recommendedPeer) {
      return;
    }

    const peer = response.recommendedPeer;
    const project = await this.getActiveProjectContext();
    const editor = vscode.window.activeTextEditor;

    const scratchpadContent = `# Collaboration Request for ${peer.name}

## Context
${project ? `**Project:** ${project.name}\n\n**Description:** ${project.description || "N/A"}\n\n` : ""}**Reason for reaching out:** ${peer.reason}

## Current Code Context
${editor ? `**File:** ${editor.document.fileName}\n\n**Language:** ${editor.document.languageId}\n\n` : ""}${editor ? `\`\`\`${editor.document.languageId}\n${editor.document.getText().substring(0, 500)}\n\`\`\`` : ""}

## Question/Request
[Describe what you need help with here]

---
*Generated by AI Collab Agent - Peer Suggestion Feature*
`;

    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders) {
      vscode.window.showErrorMessage("No workspace folder open");
      return;
    }

    const scratchpadPath = vscode.Uri.joinPath(
      workspaceFolders[0].uri,
      `.collab-request-${Date.now()}.md`
    );

    try {
      await vscode.workspace.fs.writeFile(
        scratchpadPath,
        Buffer.from(scratchpadContent, "utf-8")
      );

      const document = await vscode.workspace.openTextDocument(scratchpadPath);
      await vscode.window.showTextDocument(document, vscode.ViewColumn.Beside);
    } catch (error) {
      console.error("Error creating scratchpad:", error);
      vscode.window.showErrorMessage("Failed to create collaboration scratchpad");
    }
  }

  public enable(): void {
    this.isEnabled = true;
  }

  public disable(): void {
    this.isEnabled = false;
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = undefined;
    }
  }

  public dispose(): void {
    this.disable();
    this.recentSuggestions.clear();
  }
}

