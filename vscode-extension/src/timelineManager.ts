/**
 * TimelineManager.ts - ENHANCED with Code Snapshot Storage
 * 
 * Features:
 * - File creation detection
 * - Time-based activity tracking
 * - Lines changed threshold
 * - CODE SNAPSHOT STORAGE - saves actual code for diff viewing
 */

import * as vscode from 'vscode';
import * as path from 'path';

export interface TimelinePoint {
  id: string;
  filePath: string;
  timestamp: string;
  description: string;
  details: string;
  linesAdded: number;
  linesRemoved: number;
  changeType: 'major' | 'minor';
  trigger: 'file_created' | 'significant_change' | 'hourly_checkpoint' | 'manual';
  
  // Code snapshots for diff viewing
  codeBefore: string;
  codeAfter: string;
  
  // Tier 2 - Change Types
  changeTypes: string[];  // ["Function added: login", "Import added: bcrypt"]
  
  // NEW: Tier 2 - Smart Categorization
  category: 'feature' | 'bugfix' | 'refactor' | 'style' | 'docs' | 'test';
}

export class TimelineManager {
  // In-memory storage: Map<filePath, TimelinePoint[]>
  private timelineData: Map<string, TimelinePoint[]> = new Map();
  
  // Track file activity for time-based points
  private fileActivity: Map<string, {
    lastEditTime: number;
    lastCheckpointTime: number;
    linesChanged: number;
    changesSinceLastPoint: number;
    lastKnownContent: string;  // NEW: Track last content for snapshots
  }> = new Map();

  /**
   * TIER 2: Extract function names from code
   * Supports: JavaScript, TypeScript, Python, Java, C++, C#, Go, Ruby, PHP, Swift
   */
  private extractFunctions(code: string): string[] {
    const functions: string[] = [];
    
    // Multi-language function detection
    const patterns = [
      // Python: def function_name(args):
      /def\s+(\w+)\s*\(/g,
      
      // JavaScript/TypeScript: function name() { }
      /function\s+(\w+)\s*\(/g,
      
      // JavaScript/TypeScript: const name = () => { }
      /(?:const|let|var)\s+(\w+)\s*=\s*(?:\([^)]*\)\s*=>|function)/g,
      
      // Java/C++/C#/Swift: type functionName(args) { }
      /(?:public|private|protected|static|async)?\s*(?:void|int|string|bool|float|double|var|func|def)?\s+(\w+)\s*\(/g,
      
      // Ruby: def function_name
      /def\s+(\w+)/g,
      
      // PHP: function function_name(args) { }
      /function\s+(\w+)\s*\(/g,
      
      // Go: func functionName(args) returnType { }
      /func\s+(\w+)\s*\(/g
    ];
    
    for (const pattern of patterns) {
      let match;
      while ((match = pattern.exec(code)) !== null) {
        const functionName = match[1];
        if (functionName && !functions.includes(functionName)) {
          functions.push(functionName);
        }
      }
    }
    
    return functions;
  }
  
  /**
   * TIER 2: Extract class names from code
   * Supports: JavaScript, TypeScript, Python, Java, C++, C#, Swift, Ruby, PHP
   */
  private extractClasses(code: string): string[] {
    const classes: string[] = [];
    
    // Multi-language class detection
    const patterns = [
      // JavaScript/TypeScript/Python/Ruby/Swift: class ClassName
      /class\s+(\w+)/g,
      
      // Java/C++/C#: public/private class ClassName
      /(?:public|private|protected)?\s*class\s+(\w+)/g,
      
      // Swift: struct StructName
      /struct\s+(\w+)/g,
      
      // PHP: class ClassName
      /class\s+(\w+)/g
    ];
    
    for (const pattern of patterns) {
      let match;
      while ((match = pattern.exec(code)) !== null) {
        const className = match[1];
        if (className && !classes.includes(className)) {
          classes.push(className);
        }
      }
    }
    
    return classes;
  }
  
  /**
   * TIER 2: Extract import package names from code
   * Supports: JavaScript, TypeScript, Python, Java, Go, C++, C#, Ruby, PHP
   */
  private extractImports(code: string): string[] {
    const imports: string[] = [];
    
    // Multi-language import detection
    const patterns = [
      // JavaScript/TypeScript: import ... from 'package'
      /import\s+.*?from\s+['"]([^'"]+)['"]/g,
      
      // Python: import package / from package import ...
      /(?:^|\n)import\s+(\w+)/gm,
      /(?:^|\n)from\s+(\w+)\s+import/gm,
      
      // Java: import package.name;
      /import\s+([\w.]+);/g,
      
      // Go: import "package"
      /import\s+"([^"]+)"/g,
      
      // C++: #include <package>
      /#include\s+[<"]([^>"]+)[>"]/g,
      
      // C#: using Package;
      /using\s+([\w.]+);/g,
      
      // Ruby: require 'package'
      /require\s+['"]([^'"]+)['"]/g,
      
      // PHP: use Package;
      /use\s+([\w\\]+);/g
    ];
    
    for (const pattern of patterns) {
      let match;
      while ((match = pattern.exec(code)) !== null) {
        const importName = match[1];
        if (importName && !imports.includes(importName)) {
          imports.push(importName);
        }
      }
    }
    
    return imports;
  }
  
  /**
   * TIER 2: Count comments in code
   * Supports: JavaScript, TypeScript, Python, Java, C++, C#, Go, Ruby, PHP, Shell
   */
  private countComments(code: string): number {
    let count = 0;
    
    // Multi-language comment detection
    const patterns = [
      // JavaScript/TypeScript/Java/C++/C#/Go/PHP: // single-line
      /\/\/.*/g,
      
      // JavaScript/TypeScript/Java/C++/C#/Go: /* multi-line */
      /\/\*[\s\S]*?\*\//g,
      
      // Python/Ruby/Shell: # single-line
      /#.*/g,
      
      // Python: """ docstring """
      /"""[\s\S]*?"""/g,
      /'''[\s\S]*?'''/g
    ];
    
    for (const pattern of patterns) {
      const matches = code.match(pattern);
      if (matches) {
        count += matches.length;
      }
    }
    
    return count;
  }
  
  /**
   * TIER 2: Analyze what changed between two code versions
   */
  private analyzeChangeTypes(codeBefore: string, codeAfter: string): string[] {
    const changeTypes: string[] = [];
    
    // 1. ANALYZE FUNCTIONS
    const functionsBefore = this.extractFunctions(codeBefore);
    const functionsAfter = this.extractFunctions(codeAfter);
    
    const addedFunctions = functionsAfter.filter(f => !functionsBefore.includes(f));
    const removedFunctions = functionsBefore.filter(f => !functionsAfter.includes(f));
    
    if (addedFunctions.length > 0) {
      changeTypes.push(`Function added: ${addedFunctions.join(', ')}`);
    }
    if (removedFunctions.length > 0) {
      changeTypes.push(`Function removed: ${removedFunctions.join(', ')}`);
    }
    
    // 2. ANALYZE CLASSES
    const classesBefore = this.extractClasses(codeBefore);
    const classesAfter = this.extractClasses(codeAfter);
    
    const addedClasses = classesAfter.filter(c => !classesBefore.includes(c));
    const removedClasses = classesBefore.filter(c => !classesAfter.includes(c));
    
    if (addedClasses.length > 0) {
      changeTypes.push(`Class added: ${addedClasses.join(', ')}`);
    }
    if (removedClasses.length > 0) {
      changeTypes.push(`Class removed: ${removedClasses.join(', ')}`);
    }
    
    // 3. ANALYZE IMPORTS
    const importsBefore = this.extractImports(codeBefore);
    const importsAfter = this.extractImports(codeAfter);
    
    const addedImports = importsAfter.filter(i => !importsBefore.includes(i));
    const removedImports = importsBefore.filter(i => !importsAfter.includes(i));
    
    if (addedImports.length > 0) {
      changeTypes.push(`Import added: ${addedImports.join(', ')}`);
    }
    if (removedImports.length > 0) {
      changeTypes.push(`Import removed: ${removedImports.join(', ')}`);
    }
    
    // 4. ANALYZE COMMENTS
    const commentsBefore = this.countComments(codeBefore);
    const commentsAfter = this.countComments(codeAfter);
    
    if (commentsAfter > commentsBefore) {
      changeTypes.push(`Comments added (+${commentsAfter - commentsBefore})`);
    } else if (commentsAfter < commentsBefore) {
      changeTypes.push(`Comments removed (-${commentsBefore - commentsAfter})`);
    }
    
    return changeTypes;
  }
  
  /**
   * TIER 2: Categorize the type of change
   * Returns: 'feature' | 'bugfix' | 'refactor' | 'style' | 'docs' | 'test'
   */
  private categorizeChange(
    filePath: string, 
    codeBefore: string, 
    codeAfter: string, 
    changeTypes: string[]
  ): 'feature' | 'bugfix' | 'refactor' | 'style' | 'docs' | 'test' {
    
    // 1. CHECK FILE PATH for obvious categories (HIGHEST PRIORITY)
    const lowerPath = filePath.toLowerCase();
    
    // Test files - very specific check
    if (lowerPath.includes('/test/') || 
        lowerPath.includes('/tests/') || 
        lowerPath.includes('test_') || 
        lowerPath.includes('.test.') || 
        lowerPath.includes('.spec.') ||
        lowerPath.includes('_test.')) {
      return 'test';
    }
    
    // Documentation files - check extension
    if (lowerPath.endsWith('.md') || 
        lowerPath.endsWith('.txt') || 
        lowerPath.endsWith('.rst') ||
        lowerPath.includes('readme') || 
        lowerPath.includes('doc/') ||
        lowerPath.includes('docs/')) {
      return 'docs';
    }
    
    // 2. CHECK FOR STYLE CHANGES (formatting only) - SECOND PRIORITY
    const codeBeforeNoWhitespace = codeBefore.replace(/\s+/g, '');
    const codeAfterNoWhitespace = codeAfter.replace(/\s+/g, '');
    
    if (codeBeforeNoWhitespace === codeAfterNoWhitespace && codeBefore !== codeAfter) {
      return 'style';
    }
    
    // 3. CHECK FOR BUG FIX PATTERNS - THIRD PRIORITY
    const codeAfterLower = codeAfter.toLowerCase();
    const codeBeforeLower = codeBefore.toLowerCase();
    
    // Check for error handling added
    const errorHandlingAdded = (
      // Try-catch blocks
      (codeAfter.includes('try {') && !codeBefore.includes('try {')) ||
      (codeAfter.includes('try:') && !codeBefore.includes('try:')) ||
      (codeAfter.includes('catch') && !codeBefore.includes('catch')) ||
      (codeAfter.includes('except') && !codeBefore.includes('except')) ||
      (codeAfter.includes('finally') && !codeBefore.includes('finally')) ||
      
      // Null/undefined checks
      (codeAfter.includes('if (') && codeAfter.includes('null') && !codeBefore.includes('null')) ||
      (codeAfter.includes('if (') && codeAfter.includes('undefined') && !codeBefore.includes('undefined')) ||
      (codeAfter.includes('if ') && codeAfter.includes('None') && !codeBefore.includes('None')) ||
      (codeAfter.includes('if not ') && !codeBefore.includes('if not ')) ||
      
      // Error handling keywords
      (codeAfter.includes('Error(') && !codeBefore.includes('Error(')) ||
      (codeAfter.includes('throw ') && !codeBefore.includes('throw ')) ||
      (codeAfter.includes('raise ') && !codeBefore.includes('raise '))
    );
    
    // Check for bug-related keywords in comments or variable names
    const bugKeywords = ['fix', 'bug', 'error', 'issue', 'patch', 'correct', 'repair', 'resolve', 'handle'];
    const hasBugKeywords = bugKeywords.some(keyword => {
      const inAfter = codeAfterLower.includes(keyword);
      const inBefore = codeBeforeLower.includes(keyword);
      return inAfter && !inBefore;
    });
    
    if (errorHandlingAdded || hasBugKeywords) {
      return 'bugfix';
    }
    
    // 4. CHECK FOR REFACTORING - FOURTH PRIORITY
    const functionsRemoved = changeTypes.some(ct => ct.includes('Function removed'));
    const functionsAdded = changeTypes.some(ct => ct.includes('Function added'));
    
    // If functions were both added and removed, likely refactoring
    if (functionsRemoved && functionsAdded) {
      const linesBefore = codeBefore.split('\n').length;
      const linesAfter = codeAfter.split('\n').length;
      const lineDiff = Math.abs(linesAfter - linesBefore);
      
      // If total lines didn't change much, it's refactoring
      if (lineDiff < 15) {
        return 'refactor';
      }
    }
    
    // Renaming detection (similar code structure)
    const similarityThreshold = 0.7;
    const similarity = this.calculateCodeSimilarity(codeBefore, codeAfter);
    if (similarity > similarityThreshold && functionsAdded) {
      return 'refactor';
    }
    
    // 5. CHECK FOR FEATURE (new functionality) - DEFAULT FOR NEW CODE
    const featureIndicators = (
      // New functions/classes
      functionsAdded && !functionsRemoved ||
      changeTypes.some(ct => ct.includes('Class added')) ||
      
      // New imports (usually for new features)
      changeTypes.some(ct => ct.includes('Import added')) ||
      
      // Export keywords (new public API)
      (codeAfter.includes('export ') && !codeBefore.includes('export ')) ||
      (codeAfter.includes('public ') && !codeBefore.includes('public ')) ||
      
      // New endpoints/routes
      (codeAfter.includes('route') && !codeBefore.includes('route')) ||
      (codeAfter.includes('endpoint') && !codeBefore.includes('endpoint')) ||
      (codeAfter.includes('@app.') && !codeBefore.includes('@app.'))
    );
    
    if (featureIndicators) {
      return 'feature';
    }
    
    // 6. DEFAULT: If just adding code without clear indicators, it's a feature
    if (codeAfter.length > codeBefore.length * 1.2) {
      return 'feature';
    }
    
    // 7. LAST RESORT: Refactor
    return 'refactor';
  }
  
  /**
   * Calculate similarity between two code strings (0 to 1)
   */
  private calculateCodeSimilarity(code1: string, code2: string): number {
    const words1 = code1.split(/\s+/).filter(w => w.length > 0);
    const words2 = code2.split(/\s+/).filter(w => w.length > 0);
    
    const set1 = new Set(words1);
    const set2 = new Set(words2);
    
    const intersection = new Set([...set1].filter(x => set2.has(x)));
    const union = new Set([...set1, ...set2]);
    
    return intersection.size / union.size;
  }
  
  // NEW: Cache current file contents
  private fileContentCache: Map<string, string> = new Map();
  
  // Disposables for cleanup
  private disposables: vscode.Disposable[] = [];
  
  // Threshold for "significant change"
  private readonly SIGNIFICANT_CHANGE_THRESHOLD = 20;
  
  // Minimum time between checkpoints (1 hour in milliseconds)
  private readonly CHECKPOINT_INTERVAL = 60 * 60 * 1000;
  
  constructor(private context: vscode.ExtensionContext) {
    this.initialize();
  }
  
  private initialize() {
    console.log('🎬 TimelineManager: Initializing with snapshot support...');
    
    // Watch for file creation
    const fileCreateWatcher = vscode.workspace.onDidCreateFiles((event) => {
      this.handleFileCreation(event);
    });
    this.disposables.push(fileCreateWatcher);
    
    // Watch for file changes
    const fileChangeWatcher = vscode.workspace.onDidChangeTextDocument((event) => {
      this.handleFileChange(event);
    });
    this.disposables.push(fileChangeWatcher);
    
    // Watch for file saves
    const fileSaveWatcher = vscode.workspace.onDidSaveTextDocument((document) => {
      this.handleFileSave(document);
    });
    this.disposables.push(fileSaveWatcher);
    
    console.log('✅ TimelineManager: Initialized with snapshot storage');
  }
  
  /**
   * Get current content of a file
   */
  private async getFileContent(filePath: string): Promise<string> {
    try {
      const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
      if (!workspaceFolder) {
        return '';
      }
      
      const fullPath = path.join(workspaceFolder.uri.fsPath, filePath);
      const document = await vscode.workspace.openTextDocument(fullPath);
      return document.getText();
    } catch (error) {
      console.error(`Failed to read file content: ${filePath}`, error);
      return '';
    }
  }
  
  /**
   * FEATURE 1: File Creation Detection
   */
  private async handleFileCreation(event: vscode.FileCreateEvent) {
    for (const fileUri of event.files) {
      const filePath = this.getRelativePath(fileUri.fsPath);
      
      // Only track code files
      if (!this.isCodeFile(filePath)) {
        continue;
      }
      
      console.log(`📁 TimelineManager: New file created - ${filePath}`);
      
      // Get initial content
      const initialContent = await this.getFileContent(filePath);
      
      // Always create timeline point for new files
      this.createTimelinePoint(filePath, {
        description: 'File created',
        details: `New file added to project`,
        linesAdded: initialContent.split('\n').length,
        linesRemoved: 0,
        changeType: 'major',
        trigger: 'file_created',
        codeBefore: '', // No content before
        codeAfter: initialContent
      });
      
      // Initialize activity tracking
      const activity = {
        lastEditTime: Date.now(),
        lastCheckpointTime: Date.now(),
        linesChanged: 0,
        changesSinceLastPoint: 0,
        lastKnownContent: initialContent
      };
      this.fileActivity.set(filePath, activity);
    }
  }
  
  /**
   * FEATURE 2: Track file changes
   */
  private handleFileChange(event: vscode.TextDocumentChangeEvent) {
    const filePath = this.getRelativePath(event.document.uri.fsPath);
    
    // Only track code files
    if (!this.isCodeFile(filePath)) {
      return;
    }
    
    // Get or create activity tracker for this file
    let activity = this.fileActivity.get(filePath);
    if (!activity) {
      activity = {
        lastEditTime: Date.now(),
        lastCheckpointTime: Date.now(),
        linesChanged: 0,
        changesSinceLastPoint: 0,
        lastKnownContent: event.document.getText()
      };
      this.fileActivity.set(filePath, activity);
    }
    
    // Update activity
    activity.lastEditTime = Date.now();
    
    // Count lines changed in this edit
    let linesChangedNow = 0;
    event.contentChanges.forEach((change) => {
      const newLines = change.text.split('\n').length - 1;
      const oldLines = change.range.end.line - change.range.start.line;
      linesChangedNow += Math.abs(newLines - oldLines);
    });
    
    activity.changesSinceLastPoint += linesChangedNow;
  }
  
  /**
   * FEATURE 3: On save, check for significant changes or time-based checkpoint
   */
  private async handleFileSave(document: vscode.TextDocument) {
    const filePath = this.getRelativePath(document.uri.fsPath);
    
    // Only track code files
    if (!this.isCodeFile(filePath)) {
      return;
    }
    
    const activity = this.fileActivity.get(filePath);
    if (!activity) {
      return;
    }
    
    const now = Date.now();
    const timeSinceLastCheckpoint = now - activity.lastCheckpointTime;
    const changesSinceLastPoint = activity.changesSinceLastPoint;
    
    // Get current content
    const currentContent = document.getText();
    const previousContent = activity.lastKnownContent || '';
    
    // NEW TIER 2: Check if there are structural changes (functions, classes, imports)
    const changeTypes = this.analyzeChangeTypes(previousContent, currentContent);
    const hasStructuralChanges = changeTypes.length > 0;
    
    // FEATURE 2B: Lines Changed Threshold OR Structural Changes Detected
    if (changesSinceLastPoint >= this.SIGNIFICANT_CHANGE_THRESHOLD || hasStructuralChanges) {
      const reason = hasStructuralChanges 
        ? `Structural changes detected: ${changeTypes[0]}${changeTypes.length > 1 ? ` (+${changeTypes.length - 1} more)` : ''}`
        : `${changesSinceLastPoint} lines changed`;
      
      console.log(`📊 TimelineManager: Significant change in ${filePath} - ${reason}`);
      
      this.createTimelinePoint(filePath, {
        description: hasStructuralChanges ? 'Code structure changed' : 'Significant changes',
        details: hasStructuralChanges 
          ? changeTypes.slice(0, 2).join(', ') 
          : 'Major code modifications detected',
        linesAdded: changesSinceLastPoint,
        linesRemoved: 0,
        changeType: hasStructuralChanges ? 'major' : 'major',
        trigger: 'significant_change',
        codeBefore: previousContent,
        codeAfter: currentContent
      });
      
      // Reset counter and update last known content
      activity.changesSinceLastPoint = 0;
      activity.lastCheckpointTime = now;
      activity.lastKnownContent = currentContent;
    }
    // FEATURE 3: Time-based checkpoint
    else if (timeSinceLastCheckpoint >= this.CHECKPOINT_INTERVAL && changesSinceLastPoint > 0) {
      console.log(`⏰ TimelineManager: Hourly checkpoint for ${filePath}`);
      
      this.createTimelinePoint(filePath, {
        description: 'Hourly checkpoint',
        details: `Active development session`,
        linesAdded: changesSinceLastPoint,
        linesRemoved: 0,
        changeType: 'minor',
        trigger: 'hourly_checkpoint',
        codeBefore: previousContent,
        codeAfter: currentContent
      });
      
      // Reset counter and update last known content
      activity.changesSinceLastPoint = 0;
      activity.lastCheckpointTime = now;
      activity.lastKnownContent = currentContent;
    } else {
      // Even if we didn't create a point, update the last known content
      activity.lastKnownContent = currentContent;
    }
  }
  
  /**
   * Create a timeline point with code snapshots
   */
  private createTimelinePoint(filePath: string, options: {
    description: string;
    details: string;
    linesAdded: number;
    linesRemoved: number;
    changeType: 'major' | 'minor';
    trigger: TimelinePoint['trigger'];
    codeBefore: string;
    codeAfter: string;
  }) {
    // Get existing timeline for this file
    let timeline = this.timelineData.get(filePath);
    if (!timeline) {
      timeline = [];
      this.timelineData.set(filePath, timeline);
    }
    
    // NEW: Analyze what changed (Tier 2)
    const changeTypes = this.analyzeChangeTypes(options.codeBefore, options.codeAfter);
    
    // NEW: Categorize the change (Tier 2)
    const category = this.categorizeChange(filePath, options.codeBefore, options.codeAfter, changeTypes);
    
    // Create the point with snapshots, change types, and category
    const point: TimelinePoint = {
      id: `point-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      filePath,
      timestamp: new Date().toISOString(),
      description: options.description,
      details: options.details,
      linesAdded: options.linesAdded,
      linesRemoved: options.linesRemoved,
      changeType: options.changeType,
      trigger: options.trigger,
      codeBefore: options.codeBefore,
      codeAfter: options.codeAfter,
      changeTypes: changeTypes,  // Tier 2: Change types
      category: category          // NEW: Tier 2: Category
    };
    
    // Add to timeline (newest first)
    timeline.unshift(point);
    
    // Keep only last 50 points per file to avoid memory issues
    if (timeline.length > 50) {
      timeline.pop();
    }
    
    // Log what we detected
    console.log(`✨ TimelineManager: Created ${options.trigger} point for ${filePath}`);
    console.log(`   Category: ${category.toUpperCase()}`);
    if (changeTypes.length > 0) {
      console.log(`   Detected changes: ${changeTypes.join('; ')}`);
    }
  }
  
  /**
   * Get timeline for a specific file
   */
  public getTimeline(filePath: string): TimelinePoint[] {
    return this.timelineData.get(filePath) || [];
  }
  
  /**
   * Get a specific timeline point by ID (for viewing snapshots)
   */
  public getTimelinePoint(pointId: string): TimelinePoint | null {
    for (const [filePath, timeline] of this.timelineData.entries()) {
      const point = timeline.find(p => p.id === pointId);
      if (point) {
        return point;
      }
    }
    return null;
  }
  
  /**
   * Get all tracked files
   */
  public getTrackedFiles(): string[] {
    return Array.from(this.timelineData.keys());
  }
  
  /**
   * Helper: Get relative path from workspace
   */
  private getRelativePath(absolutePath: string): string {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
      return absolutePath;
    }
    return path.relative(workspaceFolder.uri.fsPath, absolutePath).replace(/\\/g, '/');
  }
  
  /**
   * Helper: Check if file is a code file we should track
   */
  private isCodeFile(filePath: string): boolean {
    const codeExtensions = [
      '.js', '.ts', '.jsx', '.tsx', '.py', '.java', '.cpp', '.c', '.cs',
      '.go', '.rb', '.php', '.swift', '.kt', '.rs', '.html', '.css', '.scss',
      '.json', '.xml', '.yaml', '.yml', '.sql', '.sh', '.md'
    ];
    
    const ext = path.extname(filePath).toLowerCase();
    return codeExtensions.includes(ext);
  }
  
  /**
   * Cleanup
   */
  public dispose() {
    this.disposables.forEach(d => d.dispose());
    this.timelineData.clear();
    this.fileActivity.clear();
    this.fileContentCache.clear();
    console.log('🛑 TimelineManager: Disposed');
  }
}
