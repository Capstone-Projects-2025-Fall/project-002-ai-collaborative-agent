import * as vscode from "vscode";
import * as crypto from "crypto";
import * as path from "path";
import { DatabaseService, Project, Profile } from "./databaseService";
import { AuthService } from "./authService";
import { getPeerSuggestionEdgeFunctionUrl, getSupabaseAnonKey } from "./supabaseConfig";

// TypeScript Interfaces
export interface AIPeerSuggestionRequest {
  codeSnippet: string;
  languageId: string;
  cursorPosition: { line: number; character: number };
  fileName?: string; 
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
  contextHash?: string;
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
  generatedQuestion?: string; 
}

// Configuration
const DEBOUNCE_DELAY_MS = 5 * 1000; 
const DUPLICATE_PREVENTION_WINDOW_MS = 10 * 60 * 1000; 
const COOLDOWN_PERIOD_MS = 5 * 60 * 1000; 
const INACTIVITY_THRESHOLD_MS = 60 * 1000; 
const UNDO_DETECTION_WINDOW_MS = 10 * 1000; 
const MIN_UNDO_COUNT = 3; 

const COMPLEX_LIBRARIES = [
  "tensorflow", "pytorch", "keras", "spark", "kubernetes", "docker",
  "react", "vue", "angular", "next", "nuxt", "gatsby",
  "express", "fastapi", "django", "flask", "spring", "nestjs"
];

export class PeerSuggestionService {
  private debounceTimer: NodeJS.Timeout | undefined;
  private recentSuggestions: Map<string, number> = new Map(); 
  private lastSuggestionTime: number = 0; 
  private isEnabled: boolean = true;
  
  // Undo tracking
  private documentHistory: Map<string, Array<{ content: string; timestamp: number }>> = new Map();
  private undoCounts: Map<string, number> = new Map(); 
  private lastUndoCheck: Map<string, number> = new Map(); 
  
  // Inactivity tracking
  private lastEditTime: Map<string, number> = new Map(); 
  private inactivityTimer: NodeJS.Timeout | undefined;
  
  // Struggle indicators collection
  private struggleIndicators: Map<string, Set<string>> = new Map(); 

  // UI Components
  private statusBarItem: vscode.StatusBarItem;
  private currentSuggestion: AIPeerSuggestionResponse | null = null;

  constructor(
    private context: vscode.ExtensionContext,
    private databaseService: DatabaseService,
    private authService: AuthService,
    private getActiveProjectContext: () => Promise<Project | null>
  ) {
    this.statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    this.context.subscriptions.push(this.statusBarItem);

    const viewCommandId = 'aiCollab.viewPeerSuggestion';
    const viewCommand = vscode.commands.registerCommand(viewCommandId, () => {
        if (this.currentSuggestion) {
            this.presentSuggestionModal(this.currentSuggestion);
        }
    });
    this.context.subscriptions.push(viewCommand);
    this.statusBarItem.command = viewCommandId;

    this.startEditorMonitoring();
  }

  // Helper to immediately reset UI if no project is active
  private clearState(): void {
      this.statusBarItem.hide();
      this.currentSuggestion = null;
      if (this.debounceTimer) {
          clearTimeout(this.debounceTimer);
          this.debounceTimer = undefined;
      }
      // We don't clear history or recent suggestions, just the UI and pending triggers
  }

  private startEditorMonitoring(): void {
    const changeListener = vscode.workspace.onDidChangeTextDocument(
      async (event) => {
        if (!this.isEnabled) return;

        // 1. STRICT PROJECT CHECK
        // If this returns null, we clear everything immediately.
        const project = await this.getActiveProjectContext();
        if (!project) {
            this.clearState();
            return;
        }

        const activeEditor = vscode.window.activeTextEditor;
        if (!activeEditor || activeEditor.document !== event.document) return;

        const filePath = event.document.uri.fsPath;
        const now = Date.now();

        this.lastEditTime.set(filePath, now);
        this.trackDocumentChange(filePath, event.document.getText(), now);
        this.detectUndoPattern(filePath, event, now);

        if (this.debounceTimer) clearTimeout(this.debounceTimer);

        this.debounceTimer = setTimeout(() => {
          this.checkForStruggle();
        }, DEBOUNCE_DELAY_MS);
      },
      null,
      this.context.subscriptions
    );

    const diagnosticListener = vscode.languages.onDidChangeDiagnostics(
      async () => {
        if (!this.isEnabled) return;

        const project = await this.getActiveProjectContext();
        if (!project) {
            this.clearState();
            return;
        }

        if (this.debounceTimer) clearTimeout(this.debounceTimer);

        this.debounceTimer = setTimeout(() => {
          this.checkForStruggle();
        }, DEBOUNCE_DELAY_MS);
      },
      null,
      this.context.subscriptions
    );

    this.startInactivityMonitoring();

    this.context.subscriptions.push(changeListener, diagnosticListener);
  }

  private trackDocumentChange(filePath: string, content: string, timestamp: number): void {
    if (!this.documentHistory.has(filePath)) {
      this.documentHistory.set(filePath, []);
    }
    const history = this.documentHistory.get(filePath)!;
    history.push({ content, timestamp });
    if (history.length > 10) history.shift();
  }

  private detectUndoPattern(filePath: string, event: vscode.TextDocumentChangeEvent, now: number): void {
    const history = this.documentHistory.get(filePath);
    if (!history || history.length < 2) return;

    const currentContent = event.document.getText();
    const previousContent = history[history.length - 2].content;
    
    if (currentContent === previousContent) {
      const lastCheck = this.lastUndoCheck.get(filePath) || 0;
      
      if (now - lastCheck > UNDO_DETECTION_WINDOW_MS) {
        this.undoCounts.set(filePath, 1);
      } else {
        const currentCount = this.undoCounts.get(filePath) || 0;
        this.undoCounts.set(filePath, currentCount + 1);
      }
      
      this.lastUndoCheck.set(filePath, now);
      
      if ((this.undoCounts.get(filePath) || 0) >= MIN_UNDO_COUNT) {
        this.addStruggleIndicator(filePath, "frequent_undos");
      }
    }
  }

  private startInactivityMonitoring(): void {
    this.inactivityTimer = setInterval(async () => {
      if (!this.isEnabled) return;

      const project = await this.getActiveProjectContext();
      if (!project) {
          this.clearState();
          return;
      }

      const editor = vscode.window.activeTextEditor;
      if (!editor) return;

      const filePath = editor.document.uri.fsPath;
      const lastEdit = this.lastEditTime.get(filePath);
      
      if (lastEdit) {
        const inactivityDuration = Date.now() - lastEdit;
        
        if (inactivityDuration >= INACTIVITY_THRESHOLD_MS) {
          const diagnostics = vscode.languages.getDiagnostics(editor.document.uri);
          const hasErrors = diagnostics.some(d => d.severity === vscode.DiagnosticSeverity.Error);
          
          if (hasErrors) {
            this.addStruggleIndicator(filePath, "prolonged_inactivity_with_errors");
            
            if (this.debounceTimer) clearTimeout(this.debounceTimer);
            this.debounceTimer = setTimeout(() => {
              this.checkForStruggle();
            }, 5000); 
          }
        }
      }
    }, 30 * 1000); 

    this.context.subscriptions.push({
      dispose: () => {
        if (this.inactivityTimer) clearInterval(this.inactivityTimer);
      },
    });
  }

  private addStruggleIndicator(filePath: string, indicator: string): void {
    if (!this.struggleIndicators.has(filePath)) {
      this.struggleIndicators.set(filePath, new Set());
    }
    this.struggleIndicators.get(filePath)!.add(indicator);
  }

  private getStruggleIndicators(filePath: string): Set<string> {
    return this.struggleIndicators.get(filePath) || new Set();
  }

  private clearStruggleIndicators(filePath: string): void {
    this.struggleIndicators.delete(filePath);
  }

  private async checkForStruggle(): Promise<void> {
    // 1. STRICT PROJECT CHECK
    const project = await this.getActiveProjectContext();
    if (!project) {
        this.clearState();
        return;
    }

    const now = Date.now();
    if (now - this.lastSuggestionTime < COOLDOWN_PERIOD_MS) return;

    const editor = vscode.window.activeTextEditor;
    if (!editor) return;

    const document = editor.document;
    const languageId = document.languageId;
    const filePath = document.uri.fsPath;

    const cursorPosition = editor.selection.active;
    const startLine = Math.max(0, cursorPosition.line - 50);
    const endLine = Math.min(document.lineCount - 1, cursorPosition.line + 50);
    const codeSnippet = document.getText(
      new vscode.Range(startLine, 0, endLine, document.lineAt(endLine).text.length)
    );

    const struggleIndicators = this.getStruggleIndicators(filePath);
    
    // Check for indicators
    const hasStruggle = await this.detectStruggleIndicators(
      document,
      cursorPosition,
      codeSnippet,
      struggleIndicators
    );

    // 3. AUTO-DISMISS: If the user fixed the struggle, clear the UI.
    if (!hasStruggle || struggleIndicators.size < 1) {
        this.clearState();
        return;
    }

    try {
      const request = await this.constructAIPeerSuggestionRequest(
        codeSnippet,
        languageId,
        cursorPosition,
        document
      );

      if (!request) return;

      const contextHash = this.generateContextHash(request);
      if (this.isDuplicateSuggestion(contextHash)) return;

      const response = await this.callAISuggestionService(request);

      if (response && response.hasSuggestion && response.recommendedPeer) {
        this.recordSuggestion(contextHash);
        this.lastSuggestionTime = now;
        this.clearStruggleIndicators(filePath);
        
        this.presentSuggestionNotification(response);
      }
    } catch (error) {
      console.error("Error in peer suggestion check:", error);
    }
  }

  private async detectStruggleIndicators(
    document: vscode.TextDocument,
    cursorPosition: vscode.Position,
    codeSnippet: string,
    existingIndicators: Set<string>
  ): Promise<boolean> {
    const filePath = document.uri.fsPath;
    let hasStruggle = false;

    // 1. Diagnostics check
    const diagnostics = vscode.languages.getDiagnostics(document.uri);
    const relevantDiagnostics = diagnostics.filter((d) => {
      const range = d.range;
      const distance = Math.abs(range.start.line - cursorPosition.line);
      return distance <= 20 && (d.severity === vscode.DiagnosticSeverity.Error || d.severity === vscode.DiagnosticSeverity.Warning);
    });

    if (relevantDiagnostics.length > 0) {
      this.addStruggleIndicator(filePath, "diagnostics_errors");
      hasStruggle = true;
    }

    // 2. Comment check
    const commentPatterns = [
      /\/\/\s*(TODO|FIXME|HELP|HACK|XXX|BUG)/i,
      /#\s*(TODO|FIXME|HELP|HACK|XXX|BUG)/i,
      /\/\*\s*(TODO|FIXME|HELP|HACK|XXX|BUG)/i,
    ];

    for (const pattern of commentPatterns) {
      if (pattern.test(codeSnippet)) {
        this.addStruggleIndicator(filePath, "todo_fixme_comments");
        hasStruggle = true;
        break;
      }
    }

    // 3. Complex Library check (only flag if errors exist or other indicators)
    const importLines = codeSnippet.split("\n").filter((line) =>
      /^(import|from|require|using)\s+/.test(line.trim())
    );

    let hasComplexImport = false;
    for (const line of importLines) {
      for (const lib of COMPLEX_LIBRARIES) {
        if (line.toLowerCase().includes(lib.toLowerCase())) {
          hasComplexImport = true;
          break;
        }
      }
    }
    if (hasComplexImport && (relevantDiagnostics.length > 0 || existingIndicators.size > 0)) {
         this.addStruggleIndicator(filePath, "complex_library_import");
         hasStruggle = true;
    }

    // 4. Logic Errors
    const logicErrors = this.detectLogicErrors(codeSnippet, document.languageId);
    if (logicErrors.length > 0) {
      this.addStruggleIndicator(filePath, "logic_errors");
      hasStruggle = true;
    }

    if (existingIndicators.size > 0) {
      hasStruggle = true;
    }

    return hasStruggle;
  }

  private detectLogicErrors(codeSnippet: string, languageId: string): string[] {
    const errors: string[] = [];
    const lines = codeSnippet.split("\n");

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      
      let functionMatch = line.match(/(?:function|def|fn)\s+(\w+)\s*[\(:]/);
      let functionName = "";
      
      if (functionMatch) functionName = functionMatch[1];
      if (!functionMatch) {
        functionMatch = line.match(/(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s*)?\(/);
        if (functionMatch) functionName = functionMatch[1];
      }
      if (!functionMatch) {
        functionMatch = line.match(/(\w+)\s*\([^)]*\)\s*[:{]/);
        if (functionMatch) functionName = functionMatch[1];
      }
      
      if (functionMatch && functionName) {
        const functionNameLower = functionName.toLowerCase();
        const functionBody = lines.slice(i, Math.min(i + 30, lines.length)).join("\n");
        const functionBodyLower = functionBody.toLowerCase();
        
        // Mismatch: Add vs Subtract
        if (functionNameLower.includes("add") || functionNameLower.includes("sum") || functionNameLower.includes("plus")) {
          const subtractOps = (functionBody.match(/-/g) || []).length;
          const addOps = (functionBody.match(/\+/g) || []).length;
          if (subtractOps > addOps && subtractOps > 2) {
            errors.push(`Function "${functionName}" appears to subtract instead of add`);
          }
        }
        
        // Mismatch: Get without Return
        if (functionNameLower.includes("get") && (functionNameLower.includes("user") || functionNameLower.includes("data"))) {
          if (!functionBody.match(/return|yield|await|fetch/i)) {
            errors.push(`Function "${functionName}" may not return data as expected`);
          }
        }
        
        // Mismatch: Delete with Add keywords
        if (functionNameLower.includes("delete") || functionNameLower.includes("remove")) {
          if (functionBodyLower.includes("add") || functionBodyLower.includes("insert") || functionBodyLower.includes("push") || functionBodyLower.includes("create")) {
             if (!functionBodyLower.includes("event")) {
                errors.push(`Function "${functionName}" appears to add/create instead of delete/remove`);
             }
          }
        }
      }
    }

    return errors;
  }

  private async constructAIPeerSuggestionRequest(
    codeSnippet: string,
    languageId: string,
    cursorPosition: vscode.Position,
    document: vscode.TextDocument
  ): Promise<AIPeerSuggestionRequest | null> {
    const project = await this.getActiveProjectContext();
    if (!project) return null;

    const user = this.authService.getCurrentUser();
    if (!user) return null;

    const teamMembers = await this.getRelevantTeamMembers(project.id);
    if (teamMembers.length === 0) return null;

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

    const projectContext = {
      id: project.id,
      name: project.name,
      description: project.description || "",
      goals: project.goals || "",
      requirements: project.requirements || "",
    };

    const formattedTeamMembers = teamMembers.map((member) => ({
      id: member.id,
      name: member.name,
      skills: member.skills || "",
      programmingLanguages: member.programming_languages || "",
    }));

    const fileName = path.basename(document.fileName);

    return {
      codeSnippet,
      languageId,
      cursorPosition: {
        line: cursorPosition.line,
        character: cursorPosition.character,
      },
      fileName,
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
      if (!currentUser) return members;
      return members.filter((member) => member.id !== currentUser.id);
    } catch (error) {
      return [];
    }
  }

  private generateContextHash(request: AIPeerSuggestionRequest): string {
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

      if (!response.ok) return null;

      const data = await response.json();
      return data as AIPeerSuggestionResponse;
    } catch (error) {
      return null;
    }
  }

  private async presentSuggestionNotification(response: AIPeerSuggestionResponse): Promise<void> {
    if (!response.recommendedPeer || !response.message) return;

    this.currentSuggestion = response;

    // 1. UPDATE STATUS BAR (Persistent)
    this.statusBarItem.text = `$(light-bulb) Suggestion: Ask ${response.recommendedPeer.name}`;
    this.statusBarItem.tooltip = "Click to view AI-generated peer suggestion";
    this.statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
    this.statusBarItem.show();

    // 2. SHOW TOAST (Transient)
    const viewAction = "View Suggestion";
    const dismissAction = "Dismiss";

    const selected = await vscode.window.showInformationMessage(
      `💡 AI Peer Suggestion: ${response.message}`,
      viewAction,
      dismissAction
    );

    if (selected === viewAction) {
        this.presentSuggestionModal(response);
    } else if (selected === dismissAction) {
        this.clearState();
    }
  }

  private async presentSuggestionModal(response: AIPeerSuggestionResponse): Promise<void> {
    if (!response.recommendedPeer) return;

    const peerName = response.recommendedPeer.name;
    const askAction = `Ask ${peerName} Now`;
    const dismissAction = "Dismiss";

    const selected = await vscode.window.showInformationMessage(
      response.message || "Peer suggestion available.",
      { modal: true },
      askAction,
      dismissAction
    );

    if (selected === askAction) {
      await this.openScratchpadWithContext(response);
      this.clearState();
    } else if (selected === dismissAction) {
        this.clearState();
    }
  }

  private async openScratchpadWithContext(
    response: AIPeerSuggestionResponse
  ): Promise<void> {
    if (!response.recommendedPeer) return;

    const peer = response.recommendedPeer;
    const editor = vscode.window.activeTextEditor;
    const fileName = editor ? path.basename(editor.document.fileName) : "current file";
    
    const question = response.generatedQuestion || 
      `Hey ${peer.name}, on file ${fileName} I'm having issues. Can you help me debug it? Let's start a Live Share session!`;

    try {
      await vscode.env.clipboard.writeText(question);
      vscode.window.showInformationMessage("Collaboration text copied to clipboard!");
    } catch (error) {
      console.error("Error copying to clipboard:", error);
      vscode.window.showErrorMessage("Failed to copy collaboration text to clipboard");
    }
  }

  public enable(): void {
    this.isEnabled = true;
  }

  public disable(): void {
    this.isEnabled = false;
    this.clearState();
  }

  public dispose(): void {
    this.disable();
    this.statusBarItem.dispose();
    this.recentSuggestions.clear();
  }
}