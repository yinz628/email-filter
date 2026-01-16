/**
 * Async Task Processor for Webhook Response Optimization
 * 
 * Handles Phase 2 async processing of non-critical operations:
 * - Statistics updates
 * - Log recording
 * - Watch rule tracking
 * - Campaign analytics
 * - Signal monitoring
 * 
 * Note: Dynamic rule tracking was moved to Phase 1 (synchronous) for real-time detection
 * 
 * Requirements: 2.1, 2.2, 3.1, 3.2, 5.2
 */

import type { EmailWebhookPayload } from '@email-filter/shared';
import type { FilterResult } from './filter.service.js';

/**
 * Types of async tasks that can be processed
 */
export type AsyncTaskType = 
  | 'stats' 
  | 'log' 
  | 'watch' 
  | 'campaign' 
  | 'monitoring'
  | 'subject';

/**
 * Data required for async task processing
 */
export interface AsyncTaskData {
  payload: EmailWebhookPayload;
  filterResult: FilterResult;
  workerId?: string;
  defaultForwardTo: string;
}

/**
 * A pending task in the queue
 */
export interface PendingTask {
  type: AsyncTaskType;
  data: AsyncTaskData;
  timestamp: number;
  retryCount: number;
}

/**
 * Configuration for the async task processor
 */
export interface AsyncTaskProcessorConfig {
  /** Number of tasks to process in a batch (default: 10) */
  batchSize: number;
  /** Interval in ms between automatic flushes (default: 1000) */
  flushIntervalMs: number;
  /** Maximum queue size before dropping oldest tasks (default: 1000) */
  maxQueueSize: number;
  /** Maximum retry attempts for failed tasks (default: 3) */
  maxRetries: number;
  /** Base delay in ms for exponential backoff (default: 100) */
  baseRetryDelayMs: number;
  /** Maximum delay in ms for exponential backoff (default: 5000) */
  maxRetryDelayMs: number;
}

/**
 * Status information for the processor
 */
export interface ProcessorStatus {
  queueSize: number;
  processing: boolean;
  totalProcessed: number;
  totalFailed: number;
}

/**
 * Task processor function type
 */
export type TaskProcessor = (tasks: PendingTask[]) => Promise<void>;

/**
 * Default configuration values
 */
const DEFAULT_CONFIG: AsyncTaskProcessorConfig = {
  batchSize: 10,
  flushIntervalMs: 1000,
  maxQueueSize: 1000,
  maxRetries: 3,
  baseRetryDelayMs: 100,
  maxRetryDelayMs: 5000,
};

/**
 * All task types that should be enqueued for Phase 2 processing
 * Note: 'dynamic' was removed - dynamic rule tracking is now in Phase 1 (synchronous)
 */
const ALL_TASK_TYPES: AsyncTaskType[] = [
  'stats',
  'log',
  'watch',
  'campaign',
  'monitoring',
  'subject',
];

/**
 * Async Task Processor
 * 
 * Manages a queue of async tasks and processes them in batches.
 * Implements queue overflow protection by dropping oldest tasks.
 * 
 * Requirements:
 * - 2.1: Enqueue non-critical operations as async tasks
 * - 2.2: Do not block HTTP response when enqueueing
 * - 3.1: Trigger batch flush when threshold reached
 * - 3.2: Flush pending tasks on interval
 * - 5.2: Drop oldest tasks when queue exceeds max size
 */
export class AsyncTaskProcessor {
  private queue: PendingTask[] = [];
  private processing = false;
  private flushTimer: ReturnType<typeof setInterval> | null = null;
  private config: AsyncTaskProcessorConfig;
  private processors: Map<AsyncTaskType, TaskProcessor> = new Map();
  
  // Statistics
  private totalProcessed = 0;
  private totalFailed = 0;

  constructor(config: Partial<AsyncTaskProcessorConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Register a processor for a specific task type
   * 
   * @param type - The task type to handle
   * @param processor - Function to process tasks of this type
   */
  registerProcessor(type: AsyncTaskType, processor: TaskProcessor): void {
    this.processors.set(type, processor);
  }

  /**
   * Enqueue all Phase 2 tasks for a processed email
   * 
   * Creates tasks for: stats, log, watch, dynamic, campaign, monitoring
   * 
   * Requirements: 2.1, 2.2
   * 
   * @param data - The task data containing payload and filter result
   */
  enqueueAll(data: AsyncTaskData): void {
    const timestamp = Date.now();
    
    for (const type of ALL_TASK_TYPES) {
      this.enqueue({
        type,
        data,
        timestamp,
        retryCount: 0,
      });
    }
  }

  /**
   * Enqueue a single task
   * 
   * Implements queue overflow protection (Requirement 5.2):
   * When queue exceeds maxQueueSize, drops oldest tasks.
   * 
   * @param task - The task to enqueue
   */
  enqueue(task: PendingTask): void {
    // Queue overflow protection - drop oldest tasks (Requirement 5.2)
    while (this.queue.length >= this.config.maxQueueSize) {
      const dropped = this.queue.shift();
      if (dropped) {
        console.warn(`[AsyncTaskProcessor] Queue overflow - dropped oldest task: ${dropped.type}`);
      }
    }

    this.queue.push(task);

    // Trigger batch flush if threshold reached (Requirement 3.1)
    if (this.queue.length >= this.config.batchSize && !this.processing) {
      // Use setImmediate to not block the current execution
      setImmediate(() => this.flush());
    }
  }

  /**
   * Flush and process all pending tasks
   * 
   * Groups tasks by type and processes each group with its registered processor.
   * 
   * Requirements: 3.1, 3.2, 3.3
   */
  async flush(): Promise<void> {
    if (this.processing || this.queue.length === 0) {
      return;
    }

    this.processing = true;

    try {
      // Take all current tasks from queue
      const tasks = this.queue.splice(0, this.queue.length);
      
      // Process batch
      await this.processBatch(tasks);
    } finally {
      this.processing = false;
    }
  }

  /**
   * Process a batch of tasks
   * 
   * Groups tasks by type and processes each group.
   * Failed tasks are requeued with incremented retry count.
   * 
   * Requirements: 3.1, 3.2, 3.3
   * 
   * @param tasks - Array of tasks to process
   */
  async processBatch(tasks: PendingTask[]): Promise<void> {
    const batchStartTime = Date.now();
    const batchSize = tasks.length;
    
    // Group tasks by type
    const tasksByType = new Map<AsyncTaskType, PendingTask[]>();
    
    for (const task of tasks) {
      const existing = tasksByType.get(task.type) || [];
      existing.push(task);
      tasksByType.set(task.type, existing);
    }

    // Process each type group
    for (const [type, typeTasks] of tasksByType) {
      const processor = this.processors.get(type);
      
      if (!processor) {
        // No processor registered - log and count as processed
        console.warn(`[AsyncTaskProcessor] No processor registered for type: ${type}`);
        this.totalProcessed += typeTasks.length;
        continue;
      }

      try {
        await processor(typeTasks);
        this.totalProcessed += typeTasks.length;
      } catch (error) {
        console.error(`[AsyncTaskProcessor] Error processing ${type} tasks:`, error);
        
        // Requeue failed tasks with retry count
        this.requeueFailedTasks(typeTasks);
      }
    }
    
    // Log batch processing time and size (Requirement 1.1)
    const batchDuration = Date.now() - batchStartTime;
    console.log(
      `[AsyncTaskProcessor] Batch processed: size=${batchSize}, duration=${batchDuration}ms, types=${Array.from(tasksByType.keys()).join(',')}`
    );
  }

  /**
   * Calculate exponential backoff delay for a given retry count
   * 
   * Uses formula: min(baseDelay * 2^retryCount, maxDelay)
   * 
   * Requirements: 5.4
   * 
   * @param retryCount - Current retry attempt number
   * @returns Delay in milliseconds
   */
  calculateBackoffDelay(retryCount: number): number {
    const delay = this.config.baseRetryDelayMs * Math.pow(2, retryCount);
    return Math.min(delay, this.config.maxRetryDelayMs);
  }

  /**
   * Requeue failed tasks with incremented retry count and exponential backoff
   * 
   * Tasks that exceed maxRetries are logged and dropped.
   * Uses exponential backoff to delay retries for database failures.
   * 
   * Requirements: 2.4, 3.4, 5.4
   * 
   * @param tasks - Failed tasks to potentially requeue
   */
  requeueFailedTasks(tasks: PendingTask[]): void {
    for (const task of tasks) {
      if (task.retryCount < this.config.maxRetries) {
        const newRetryCount = task.retryCount + 1;
        const backoffDelay = this.calculateBackoffDelay(task.retryCount);
        
        // Schedule requeue with exponential backoff delay
        setTimeout(() => {
          this.enqueue({
            ...task,
            retryCount: newRetryCount,
            timestamp: Date.now(), // Update timestamp for retry
          });
        }, backoffDelay);
        
        console.warn(
          `[AsyncTaskProcessor] Task ${task.type} failed, scheduling retry ${newRetryCount}/${this.config.maxRetries} in ${backoffDelay}ms`
        );
      } else {
        // Max retries exceeded - log and drop
        console.error(
          `[AsyncTaskProcessor] Task ${task.type} failed after ${this.config.maxRetries} retries - dropping task`
        );
        this.totalFailed++;
      }
    }
  }

  /**
   * Start the automatic flush timer
   * 
   * Requirement 3.2: Flush pending tasks on interval
   */
  startFlushTimer(): void {
    if (this.flushTimer) {
      return; // Already running
    }

    this.flushTimer = setInterval(() => {
      this.flush().catch((error) => {
        console.error('[AsyncTaskProcessor] Flush timer error:', error);
      });
    }, this.config.flushIntervalMs);
  }

  /**
   * Stop the automatic flush timer
   */
  stopFlushTimer(): void {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
  }

  /**
   * Get current processor status
   * 
   * @returns Status object with queue size and processing state
   */
  getStatus(): ProcessorStatus {
    return {
      queueSize: this.queue.length,
      processing: this.processing,
      totalProcessed: this.totalProcessed,
      totalFailed: this.totalFailed,
    };
  }

  /**
   * Get the current queue size
   */
  getQueueSize(): number {
    return this.queue.length;
  }

  /**
   * Check if processor is currently processing
   */
  isProcessing(): boolean {
    return this.processing;
  }

  /**
   * Clear all pending tasks (for testing/shutdown)
   */
  clear(): void {
    this.queue = [];
  }

  /**
   * Get configuration
   */
  getConfig(): AsyncTaskProcessorConfig {
    return { ...this.config };
  }
}
