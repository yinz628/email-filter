/**
 * Analysis Queue Service
 * Manages analysis requests to ensure only one analysis runs at a time
 * 
 * Requirements: 8.4
 */

import type { AnalysisProgress, AnalysisResult } from './project-path-analysis.service.js';

/**
 * Analysis request in the queue
 */
interface AnalysisRequest {
  projectId: string;
  resolve: (result: AnalysisResult) => void;
  reject: (error: Error) => void;
  onProgress?: (progress: AnalysisProgress) => void;
}

/**
 * Analysis Queue Service
 * Ensures only one analysis runs at a time per system
 */
export class AnalysisQueueService {
  private static instance: AnalysisQueueService;
  
  private queue: AnalysisRequest[] = [];
  private isProcessing = false;
  private currentProjectId: string | null = null;
  private analyzeFunction: ((projectId: string, onProgress?: (progress: AnalysisProgress) => void) => Promise<AnalysisResult>) | null = null;

  private constructor() {}

  /**
   * Get singleton instance
   */
  static getInstance(): AnalysisQueueService {
    if (!AnalysisQueueService.instance) {
      AnalysisQueueService.instance = new AnalysisQueueService();
    }
    return AnalysisQueueService.instance;
  }

  /**
   * Set the analyze function to use
   */
  setAnalyzeFunction(fn: (projectId: string, onProgress?: (progress: AnalysisProgress) => void) => Promise<AnalysisResult>): void {
    this.analyzeFunction = fn;
  }

  /**
   * Check if an analysis is currently running
   */
  isAnalysisRunning(): boolean {
    return this.isProcessing;
  }

  /**
   * Get the currently running project ID
   */
  getCurrentProjectId(): string | null {
    return this.currentProjectId;
  }

  /**
   * Get queue length
   */
  getQueueLength(): number {
    return this.queue.length;
  }

  /**
   * Check if a project is in the queue or currently being analyzed
   */
  isProjectInQueue(projectId: string): boolean {
    if (this.currentProjectId === projectId) return true;
    return this.queue.some(req => req.projectId === projectId);
  }

  /**
   * Enqueue an analysis request
   * Returns a promise that resolves when the analysis completes
   * 
   * Requirements: 8.4
   */
  enqueue(
    projectId: string,
    onProgress?: (progress: AnalysisProgress) => void
  ): Promise<AnalysisResult> {
    return new Promise((resolve, reject) => {
      // Check if project is already in queue
      if (this.isProjectInQueue(projectId)) {
        reject(new Error(`Analysis for project ${projectId} is already in progress or queued`));
        return;
      }

      this.queue.push({
        projectId,
        resolve,
        reject,
        onProgress,
      });

      // Start processing if not already
      this.processNext();
    });
  }

  /**
   * Process the next request in the queue
   */
  private async processNext(): Promise<void> {
    if (this.isProcessing || this.queue.length === 0) {
      return;
    }

    if (!this.analyzeFunction) {
      const request = this.queue.shift();
      request?.reject(new Error('Analyze function not set'));
      return;
    }

    this.isProcessing = true;
    const request = this.queue.shift()!;
    this.currentProjectId = request.projectId;

    try {
      const result = await this.analyzeFunction(request.projectId, request.onProgress);
      request.resolve(result);
    } catch (error) {
      request.reject(error instanceof Error ? error : new Error(String(error)));
    } finally {
      this.isProcessing = false;
      this.currentProjectId = null;
      
      // Process next in queue
      this.processNext();
    }
  }

  /**
   * Clear the queue (for testing or shutdown)
   */
  clearQueue(): void {
    for (const request of this.queue) {
      request.reject(new Error('Queue cleared'));
    }
    this.queue = [];
  }

  /**
   * Get queue status
   */
  getStatus(): {
    isProcessing: boolean;
    currentProjectId: string | null;
    queueLength: number;
    queuedProjectIds: string[];
  } {
    return {
      isProcessing: this.isProcessing,
      currentProjectId: this.currentProjectId,
      queueLength: this.queue.length,
      queuedProjectIds: this.queue.map(req => req.projectId),
    };
  }
}

// Export singleton instance
export const analysisQueue = AnalysisQueueService.getInstance();
