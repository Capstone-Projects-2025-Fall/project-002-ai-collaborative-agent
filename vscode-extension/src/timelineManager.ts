/**
 * TimelineManager.ts - Handles real-time timeline point creation
 * 
 * Features:
 * - File creation detection
 * - Time-based activity tracking (1 point per hour if active)
 * - Lines changed threshold (20+ lines = significant change)
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
  }> = new Map();
  
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
    console.log('🎬 TimelineManager: Initializing...');
    
    // Watch for file creation
    const fileCreateWatcher = vscode.workspace.onDidCreateFiles((event) => {
      this.handleFileCreation(event);
    });
    this.disposables.push(fileCreateWatcher);
    
    // Watch for file changes (for time-based and threshold detection)
    const fileChangeWatcher = vscode.workspace.onDidChangeTextDocument((event) => {
      this.handleFileChange(event);
    });
    this.disposables.push(fileChangeWatcher);
    
    // Watch for file saves (good trigger point for creating timeline entries)
    const fileSaveWatcher = vscode.workspace.onDidSaveTextDocument((document) => {
      this.handleFileSave(document);
    });
    this.disposables.push(fileSaveWatcher);
    
    console.log('✅ TimelineManager: Initialized successfully');
  }
  
  /**
   * FEATURE 1: File Creation Detection
   */
  private handleFileCreation(event: vscode.FileCreateEvent) {
    event.files.forEach((fileUri) => {
      const filePath = this.getRelativePath(fileUri.fsPath);
      
      // Only track code files
      if (!this.isCodeFile(filePath)) {
        return;
      }
      
      console.log(`📁 TimelineManager: New file created - ${filePath}`);
      
      this.createTimelinePoint(filePath, {
        description: 'File created',
        details: `New file added to project`,
        linesAdded: 0,
        linesRemoved: 0,
        changeType: 'major',
        trigger: 'file_created'
      });
    });
  }
  
  /**
   * FEATURE 2: Track file changes for time-based and threshold detection
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
        changesSinceLastPoint: 0
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
  private handleFileSave(document: vscode.TextDocument) {
    const filePath = this.getRelativePath(document.uri.fsPath);
    
    // Only track code files
    if (!this.isCodeFile(filePath)) {
      return;
    }
    
    const activity = this.fileActivity.get(filePath);
    if (!activity) {
      return; // No activity tracked yet
    }
    
    const now = Date.now();
    const timeSinceLastCheckpoint = now - activity.lastCheckpointTime;
    const changesSinceLastPoint = activity.changesSinceLastPoint;
    
    // FEATURE 2B: Lines Changed Threshold (20+ lines = significant change)
    if (changesSinceLastPoint >= this.SIGNIFICANT_CHANGE_THRESHOLD) {
      console.log(`📊 TimelineManager: Significant change detected in ${filePath} (${changesSinceLastPoint} lines)`);
      
      this.createTimelinePoint(filePath, {
        description: 'Significant changes',
        details: `Major code modifications detected`,
        linesAdded: changesSinceLastPoint, // Approximation
        linesRemoved: 0,
        changeType: 'major',
        trigger: 'significant_change'
      });
      
      // Reset counter
      activity.changesSinceLastPoint = 0;
      activity.lastCheckpointTime = now;
    }
    // FEATURE 3: Time-based checkpoint (1 hour of activity)
    else if (timeSinceLastCheckpoint >= this.CHECKPOINT_INTERVAL && changesSinceLastPoint > 0) {
      console.log(`⏰ TimelineManager: Hourly checkpoint for ${filePath}`);
      
      this.createTimelinePoint(filePath, {
        description: 'Hourly checkpoint',
        details: `Active development session`,
        linesAdded: changesSinceLastPoint,
        linesRemoved: 0,
        changeType: 'minor',
        trigger: 'hourly_checkpoint'
      });
      
      // Reset counter
      activity.changesSinceLastPoint = 0;
      activity.lastCheckpointTime = now;
    }
  }
  
  /**
   * Create a timeline point
   */
  private createTimelinePoint(filePath: string, options: {
    description: string;
    details: string;
    linesAdded: number;
    linesRemoved: number;
    changeType: 'major' | 'minor';
    trigger: TimelinePoint['trigger'];
  }) {
    // Get existing timeline for this file
    let timeline = this.timelineData.get(filePath);
    if (!timeline) {
      timeline = [];
      this.timelineData.set(filePath, timeline);
    }
    
    // Create the point
    const point: TimelinePoint = {
      id: `point-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      filePath,
      timestamp: new Date().toISOString(),
      description: options.description,
      details: options.details,
      linesAdded: options.linesAdded,
      linesRemoved: options.linesRemoved,
      changeType: options.changeType,
      trigger: options.trigger
    };
    
    // Add to timeline (newest first)
    timeline.unshift(point);
    
    // Keep only last 50 points per file to avoid memory issues
    if (timeline.length > 50) {
      timeline.pop();
    }
    
    console.log(`✨ TimelineManager: Created ${options.trigger} point for ${filePath}`);
  }
  
  /**
   * Get timeline for a specific file
   */
  public getTimeline(filePath: string): TimelinePoint[] {
    return this.timelineData.get(filePath) || [];
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
    console.log('🛑 TimelineManager: Disposed');
  }
}
