/**
 * Async Task Processor Singleton Instance
 * 
 * Provides a global singleton instance of AsyncTaskProcessor for use across the application.
 * Initializes the processor with all task processors registered.
 * 
 * Requirements: 2.1, 2.2, 3.1, 3.2
 */

import { AsyncTaskProcessor, type AsyncTaskType } from './async-task-processor.js';
import { createTaskProcessors } from './task-processors.js';
import { getDatabase } from '../db/index.js';
import { StatsRepository } from '../db/stats-repository.js';
import { LogRepository } from '../db/log-repository.js';
import { WatchRepository } from '../db/watch-repository.js';
import { RuleRepository } from '../db/rule-repository.js';

/**
 * Global singleton instance of AsyncTaskProcessor
 */
let asyncTaskProcessor: AsyncTaskProcessor | null = null;

/**
 * Flag to track if processors have been registered
 */
let processorsRegistered = false;

/**
 * Initialize the async task processor with all task processors
 * 
 * This function is idempotent - calling it multiple times will not
 * re-register processors or create new instances.
 */
function initializeProcessor(): AsyncTaskProcessor {
  if (!asyncTaskProcessor) {
    asyncTaskProcessor = new AsyncTaskProcessor({
      batchSize: 10,
      flushIntervalMs: 1000,
      maxQueueSize: 1000,
      maxRetries: 3,
      baseRetryDelayMs: 100,
      maxRetryDelayMs: 5000,
    });
  }

  if (!processorsRegistered) {
    const db = getDatabase();
    const statsRepository = new StatsRepository(db);
    const logRepository = new LogRepository(db);
    const watchRepository = new WatchRepository(db);
    const ruleRepository = new RuleRepository(db);

    const processors = createTaskProcessors(
      db,
      statsRepository,
      logRepository,
      watchRepository,
      ruleRepository
    );

    // Register all task processors
    // Note: 'dynamic' was removed - dynamic rule tracking is now in Phase 1 (synchronous)
    const taskTypes: AsyncTaskType[] = ['stats', 'log', 'watch', 'campaign', 'monitoring'];
    for (const type of taskTypes) {
      asyncTaskProcessor.registerProcessor(type, processors[type]);
    }

    // Start the automatic flush timer
    asyncTaskProcessor.startFlushTimer();

    processorsRegistered = true;
  }

  return asyncTaskProcessor;
}

/**
 * Get the global async task processor instance
 * 
 * Lazily initializes the processor on first access.
 */
export function getAsyncTaskProcessor(): AsyncTaskProcessor {
  return initializeProcessor();
}

/**
 * Reset the async task processor (for testing purposes)
 * 
 * This will stop the flush timer and clear the singleton instance.
 */
export function resetAsyncTaskProcessor(): void {
  if (asyncTaskProcessor) {
    asyncTaskProcessor.stopFlushTimer();
    asyncTaskProcessor.clear();
    asyncTaskProcessor = null;
    processorsRegistered = false;
  }
}
