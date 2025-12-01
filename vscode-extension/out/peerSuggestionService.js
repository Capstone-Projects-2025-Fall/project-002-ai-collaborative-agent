"use strict";
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
exports.PeerSuggestionService = void 0;
const vscode = __importStar(require("vscode"));
const crypto = __importStar(require("crypto"));
const path = __importStar(require("path"));
const supabaseConfig_1 = require("./supabaseConfig");
// Configuration - Optimized to minimize API calls
const DEBOUNCE_DELAY_MS = 5 * 1000; // 5 seconds (make it much faster)
const DUPLICATE_PREVENTION_WINDOW_MS = 10 * 60 * 1000; // 10 minutes
const COOLDOWN_PERIOD_MS = 5 * 60 * 1000; // 5 minutes cooldown after suggestion
const INACTIVITY_THRESHOLD_MS = 60 * 1000; // 1 minute of inactivity (make it faster)
const UNDO_DETECTION_WINDOW_MS = 10 * 1000; // 10 seconds window for undo detection
const MIN_UNDO_COUNT = 2; // Minimum undos to trigger (make it more responsive)
// Complex library imports that might indicate struggle
const COMPLEX_LIBRARIES = [
    "tensorflow", "pytorch", "keras", "spark", "kubernetes", "docker",
    "react", "vue", "angular", "next", "nuxt", "gatsby",
    "express", "fastapi", "django", "flask", "spring", "nestjs"
];
class PeerSuggestionService {
    context;
    databaseService;
    authService;
    getActiveProjectContext;
    debounceTimer;
    recentSuggestions = new Map(); // contextHash -> timestamp
    lastSuggestionTime = 0; // Cooldown tracking
    isEnabled = true;
    // Undo tracking
    documentHistory = new Map();
    undoCounts = new Map(); // file -> undo count in window
    lastUndoCheck = new Map(); // file -> last check timestamp
    // Inactivity tracking
    lastEditTime = new Map(); // file -> last edit timestamp
    inactivityTimer;
    // Struggle indicators collection
    struggleIndicators = new Map(); // file -> set of indicators
    constructor(context, databaseService, authService, getActiveProjectContext) {
        this.context = context;
        this.databaseService = databaseService;
        this.authService = authService;
        this.getActiveProjectContext = getActiveProjectContext;
        this.startEditorMonitoring();
    }
    startEditorMonitoring() {
        // Monitor document changes with debouncing and undo tracking
        const changeListener = vscode.workspace.onDidChangeTextDocument((event) => {
            if (!this.isEnabled) {
                return;
            }
            // Only monitor active editor
            const activeEditor = vscode.window.activeTextEditor;
            if (!activeEditor || activeEditor.document !== event.document) {
                return;
            }
            const filePath = event.document.uri.fsPath;
            const now = Date.now();
            // Track edit time for inactivity detection
            this.lastEditTime.set(filePath, now);
            // Track document history for undo detection
            this.trackDocumentChange(filePath, event.document.getText(), now);
            // Check for undo patterns
            this.detectUndoPattern(filePath, event, now);
            // Clear existing timer
            if (this.debounceTimer) {
                clearTimeout(this.debounceTimer);
            }
            // Set new debounce timer (longer delay to reduce API calls)
            this.debounceTimer = setTimeout(() => {
                this.checkForStruggle();
            }, DEBOUNCE_DELAY_MS);
        }, null, this.context.subscriptions);
        // Monitor diagnostics changes
        const diagnosticListener = vscode.languages.onDidChangeDiagnostics(() => {
            if (!this.isEnabled) {
                return;
            }
            // Trigger check after delay to let diagnostics update
            if (this.debounceTimer) {
                clearTimeout(this.debounceTimer);
            }
            this.debounceTimer = setTimeout(() => {
                this.checkForStruggle();
            }, DEBOUNCE_DELAY_MS);
        }, null, this.context.subscriptions);
        // Start inactivity monitoring
        this.startInactivityMonitoring();
        this.context.subscriptions.push(changeListener, diagnosticListener);
    }
    trackDocumentChange(filePath, content, timestamp) {
        if (!this.documentHistory.has(filePath)) {
            this.documentHistory.set(filePath, []);
        }
        const history = this.documentHistory.get(filePath);
        history.push({ content, timestamp });
        // Keep only last 10 versions
        if (history.length > 10) {
            history.shift();
        }
    }
    detectUndoPattern(filePath, event, now) {
        const history = this.documentHistory.get(filePath);
        if (!history || history.length < 2) {
            return;
        }
        // Check if content reverted to previous version (undo pattern)
        const currentContent = event.document.getText();
        const previousContent = history[history.length - 2].content;
        // If current content matches a previous version, it might be an undo
        if (currentContent === previousContent) {
            const lastCheck = this.lastUndoCheck.get(filePath) || 0;
            // Reset count if outside window
            if (now - lastCheck > UNDO_DETECTION_WINDOW_MS) {
                this.undoCounts.set(filePath, 1);
            }
            else {
                const currentCount = this.undoCounts.get(filePath) || 0;
                this.undoCounts.set(filePath, currentCount + 1);
            }
            this.lastUndoCheck.set(filePath, now);
            // If multiple undos detected, add as struggle indicator
            if ((this.undoCounts.get(filePath) || 0) >= MIN_UNDO_COUNT) {
                this.addStruggleIndicator(filePath, "frequent_undos");
            }
        }
    }
    startInactivityMonitoring() {
        // Check for inactivity every 30 seconds
        this.inactivityTimer = setInterval(() => {
            if (!this.isEnabled) {
                return;
            }
            const editor = vscode.window.activeTextEditor;
            if (!editor) {
                return;
            }
            const filePath = editor.document.uri.fsPath;
            const lastEdit = this.lastEditTime.get(filePath);
            if (lastEdit) {
                const inactivityDuration = Date.now() - lastEdit;
                // Check if inactive but file has diagnostics
                if (inactivityDuration >= INACTIVITY_THRESHOLD_MS) {
                    const diagnostics = vscode.languages.getDiagnostics(editor.document.uri);
                    const hasErrors = diagnostics.some(d => d.severity === vscode.DiagnosticSeverity.Error);
                    if (hasErrors) {
                        this.addStruggleIndicator(filePath, "prolonged_inactivity_with_errors");
                        // Trigger check after a delay
                        if (this.debounceTimer) {
                            clearTimeout(this.debounceTimer);
                        }
                        this.debounceTimer = setTimeout(() => {
                            this.checkForStruggle();
                        }, 5000); // Shorter delay for inactivity (already waited 2 minutes)
                    }
                }
            }
        }, 30 * 1000); // Check every 30 seconds
        this.context.subscriptions.push({
            dispose: () => {
                if (this.inactivityTimer) {
                    clearInterval(this.inactivityTimer);
                }
            },
        });
    }
    addStruggleIndicator(filePath, indicator) {
        if (!this.struggleIndicators.has(filePath)) {
            this.struggleIndicators.set(filePath, new Set());
        }
        this.struggleIndicators.get(filePath).add(indicator);
    }
    getStruggleIndicators(filePath) {
        return this.struggleIndicators.get(filePath) || new Set();
    }
    clearStruggleIndicators(filePath) {
        this.struggleIndicators.delete(filePath);
    }
    async checkForStruggle() {
        // Check cooldown period
        const now = Date.now();
        if (now - this.lastSuggestionTime < COOLDOWN_PERIOD_MS) {
            return; // Still in cooldown, skip to save API calls
        }
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            return;
        }
        const document = editor.document;
        const languageId = document.languageId;
        const filePath = document.uri.fsPath;
        // Get code snippet around cursor (50 lines before and after)
        const cursorPosition = editor.selection.active;
        const startLine = Math.max(0, cursorPosition.line - 50);
        const endLine = Math.min(document.lineCount - 1, cursorPosition.line + 50);
        const codeSnippet = document.getText(new vscode.Range(startLine, 0, endLine, document.lineAt(endLine).text.length));
        // Check for struggle indicators (including new ones)
        const struggleIndicators = this.getStruggleIndicators(filePath);
        const hasStruggle = await this.detectStruggleIndicators(document, cursorPosition, codeSnippet, struggleIndicators);
        // Only proceed if we have multiple indicators or strong single indicator
        if (!hasStruggle || struggleIndicators.size < 1) {
            return;
        }
        // Collect context and make suggestion request
        try {
            const request = await this.constructAIPeerSuggestionRequest(codeSnippet, languageId, cursorPosition, document);
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
                this.lastSuggestionTime = now; // Update cooldown
                this.clearStruggleIndicators(filePath); // Clear indicators after suggestion
                this.presentSuggestion(response);
            }
        }
        catch (error) {
            console.error("Error in peer suggestion check:", error);
        }
    }
    async detectStruggleIndicators(document, cursorPosition, codeSnippet, existingIndicators) {
        const filePath = document.uri.fsPath;
        let hasStruggle = false;
        // 1. Check for persistent diagnostics (errors/warnings)
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
        // 2. Check for TODO/FIXME/HELP comments
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
        // 3. Check for complex library imports
        const importLines = codeSnippet.split("\n").filter((line) => /^(import|from|require|using)\s+/.test(line.trim()));
        for (const line of importLines) {
            for (const lib of COMPLEX_LIBRARIES) {
                if (line.toLowerCase().includes(lib.toLowerCase())) {
                    this.addStruggleIndicator(filePath, "complex_library_import");
                    hasStruggle = true;
                    break;
                }
            }
        }
        // 4. Check for logic errors (function name vs implementation mismatch)
        const logicErrors = this.detectLogicErrors(codeSnippet, document.languageId);
        if (logicErrors.length > 0) {
            this.addStruggleIndicator(filePath, "logic_errors");
            hasStruggle = true;
        }
        // 5. Check existing indicators (from undo/inactivity detection)
        if (existingIndicators.size > 0) {
            hasStruggle = true;
        }
        return hasStruggle;
    }
    detectLogicErrors(codeSnippet, languageId) {
        const errors = [];
        const lines = codeSnippet.split("\n");
        // Simple heuristic-based logic error detection
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            // Check for function definitions - improved regex patterns
            let functionMatch = null;
            let functionName = "";
            // Pattern 1: function functionName() or functionName() {
            functionMatch = line.match(/(?:function|def|fn)\s+(\w+)\s*[\(:]/);
            if (functionMatch) {
                functionName = functionMatch[1];
            }
            // Pattern 2: const/let/var functionName = ( or const/let/var functionName = async (
            if (!functionMatch) {
                functionMatch = line.match(/(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s*)?\(/);
                if (functionMatch) {
                    functionName = functionMatch[1];
                }
            }
            // Pattern 3: class methods
            if (!functionMatch) {
                functionMatch = line.match(/(\w+)\s*\([^)]*\)\s*[:{]/);
                if (functionMatch) {
                    functionName = functionMatch[1];
                }
            }
            if (functionMatch && functionName) {
                const functionNameLower = functionName.toLowerCase();
                // Look ahead for function body (next 30 lines to capture more context)
                const functionBody = lines.slice(i, Math.min(i + 30, lines.length)).join("\n");
                const functionBodyLower = functionBody.toLowerCase();
                // Check for common logic mismatches
                if (functionNameLower.includes("add") || functionNameLower.includes("sum") || functionNameLower.includes("plus")) {
                    // Check if function primarily subtracts
                    const subtractOps = (functionBody.match(/-/g) || []).length;
                    const addOps = (functionBody.match(/\+/g) || []).length;
                    if (subtractOps > addOps && subtractOps > 2) {
                        errors.push(`Function "${functionName}" appears to subtract instead of add`);
                    }
                }
                if (functionNameLower.includes("get") && (functionNameLower.includes("user") || functionNameLower.includes("data"))) {
                    if (!functionBody.match(/return|yield|await|fetch/i)) {
                        errors.push(`Function "${functionName}" may not return data as expected`);
                    }
                }
                if (functionNameLower.includes("delete") || functionNameLower.includes("remove")) {
                    if (functionBodyLower.includes("add") || functionBodyLower.includes("insert") || functionBodyLower.includes("push") || functionBodyLower.includes("create")) {
                        errors.push(`Function "${functionName}" appears to add/create instead of delete/remove`);
                    }
                }
                // Check if function has TODO/FIXME but is being called
                if (functionBody.match(/(TODO|FIXME|HACK|XXX|BUG)/i)) {
                    // Check if function is called elsewhere in snippet
                    const functionCallPattern = new RegExp(`\\b${functionName}\\s*\\(`, "g");
                    const callMatches = codeSnippet.match(functionCallPattern);
                    if (callMatches && callMatches.length > 0) {
                        errors.push(`Function "${functionName}" has TODO/FIXME but is being called`);
                    }
                }
            }
        }
        return errors;
    }
    async constructAIPeerSuggestionRequest(codeSnippet, languageId, cursorPosition, document) {
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
        // Extract file name for better question generation
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
    async getRelevantTeamMembers(projectId) {
        try {
            const members = await this.databaseService.getProfilesForProject(projectId);
            const currentUser = this.authService.getCurrentUser();
            if (!currentUser) {
                return members;
            }
            // Filter out current user (don't suggest yourself)
            return members.filter((member) => member.id !== currentUser.id);
        }
        catch (error) {
            console.error("Error getting relevant team members:", error);
            return [];
        }
    }
    generateContextHash(request) {
        // Create a hash from code snippet, language, and cursor position
        const hashInput = `${request.codeSnippet.substring(0, 200)}|${request.languageId}|${request.cursorPosition.line}|${request.cursorPosition.character}`;
        return crypto.createHash("md5").update(hashInput).digest("hex");
    }
    isDuplicateSuggestion(contextHash) {
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
    recordSuggestion(contextHash) {
        this.recentSuggestions.set(contextHash, Date.now());
    }
    async callAISuggestionService(request) {
        try {
            const edgeFunctionUrl = (0, supabaseConfig_1.getPeerSuggestionEdgeFunctionUrl)();
            const anonKey = (0, supabaseConfig_1.getSupabaseAnonKey)();
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
            return data;
        }
        catch (error) {
            console.error("Error calling AI suggestion service:", error);
            return null;
        }
    }
    async presentSuggestion(response) {
        if (!response.recommendedPeer || !response.message) {
            return;
        }
        const peerName = response.recommendedPeer.name;
        const message = response.message;
        const askAction = `Ask ${peerName} Now`;
        const dismissAction = "Dismiss";
        const selected = await vscode.window.showInformationMessage(message, askAction, dismissAction);
        if (selected === askAction) {
            await this.openScratchpadWithContext(response);
        }
    }
    async openScratchpadWithContext(response) {
        if (!response.recommendedPeer) {
            return;
        }
        const peer = response.recommendedPeer;
        const project = await this.getActiveProjectContext();
        const editor = vscode.window.activeTextEditor;
        // Get file name (just the filename, not full path)
        const fileName = editor ? path.basename(editor.document.fileName) : "current file";
        const filePath = editor ? editor.document.fileName : "";
        // Get code snippet around cursor for context
        let codeContext = "";
        if (editor) {
            const cursorPosition = editor.selection.active;
            const startLine = Math.max(0, cursorPosition.line - 10);
            const endLine = Math.min(editor.document.lineCount - 1, cursorPosition.line + 10);
            const codeSnippet = editor.document.getText(new vscode.Range(startLine, 0, endLine, editor.document.lineAt(endLine).text.length));
            codeContext = `\`\`\`${editor.document.languageId}\n${codeSnippet}\n\`\`\``;
        }
        // Use AI-generated question if available, otherwise create a template
        const question = response.generatedQuestion ||
            `Hey ${peer.name}, on file ${fileName} I'm having issues. Can you help me debug it? Let's start a Live Share session!`;
        // Create the collaboration text with context 
        let collaborationText = question;
        // Add context information about the issue if available
        if (editor && codeContext) {
            // Skip complex function name detection that might give incorrect results
            // Keep the original message structure that already includes file context
            // The user can see where the issue is coming from via the file name
        }
        try {
            await vscode.env.clipboard.writeText(collaborationText);
            vscode.window.showInformationMessage("Collaboration text copied to clipboard!");
        }
        catch (error) {
            console.error("Error copying to clipboard:", error);
            vscode.window.showErrorMessage("Failed to copy collaboration text to clipboard");
        }
    }
    enable() {
        this.isEnabled = true;
    }
    disable() {
        this.isEnabled = false;
        if (this.debounceTimer) {
            clearTimeout(this.debounceTimer);
            this.debounceTimer = undefined;
        }
    }
    dispose() {
        this.disable();
        this.recentSuggestions.clear();
    }
}
exports.PeerSuggestionService = PeerSuggestionService;
//# sourceMappingURL=peerSuggestionService.js.map