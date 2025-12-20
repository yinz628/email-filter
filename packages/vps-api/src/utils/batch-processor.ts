/**
 * BatchProcessor - Utility for processing large datasets without blocking the event loop
 * 
 * This processor handles data in batches, yielding control between batches to ensure
 * the main event loop is not blocked for more than the configured maximum time.
 * 
 * Requirements: 8.1, 8.2, 8.3
 */

export interface BatchProcessorConfig {
  /** Number of items to process per batch (default: 100) */
  batchSize: number;
  /** Delay in milliseconds between batches (default: 10) */
  yieldDelayMs: number;
  /** Maximum time in milliseconds to block the main event loop (default: 50) */
  maxBlockTimeMs: number;
}

export interface BatchProgress {
  processed: number;
  total: number;
  percentage: number;
}

const DEFAULT_CONFIG: BatchProcessorConfig = {
  batchSize: 100,
  yieldDelayMs: 10,
  maxBlockTimeMs: 50,
};

/**
 * Yields control to the event loop using setImmediate (Node.js) or setTimeout
 */
function yieldControl(delayMs: number): Promise<void> {
  return new Promise((resolve) => {
    if (delayMs === 0 && typeof setImmediate !== 'undefined') {
      setImmediate(resolve);
    } else {
      setTimeout(resolve, delayMs);
    }
  });
}

export class BatchProcessor<T> {
  private config: BatchProcessorConfig;

  constructor(config?: Partial<BatchProcessorConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Process items in batches, yielding control between batches
   * 
   * @param items - Array of items to process
   * @param processor - Function to process each item
   * @param onProgress - Optional callback for progress updates
   * @returns Array of processed results
   */
  async processBatch<R>(
    items: T[],
    processor: (item: T) => R,
    onProgress?: (progress: BatchProgress) => void
  ): Promise<R[]> {
    const results: R[] = [];
    const total = items.length;
    
    if (total === 0) {
      onProgress?.({ processed: 0, total: 0, percentage: 100 });
      return results;
    }

    let processed = 0;
    let batchStartTime = Date.now();

    for (let i = 0; i < total; i++) {
      const result = processor(items[i]);
      results.push(result);
      processed++;

      const elapsed = Date.now() - batchStartTime;
      const isEndOfBatch = processed % this.config.batchSize === 0;
      const isLastItem = i === total - 1;
      const exceededBlockTime = elapsed >= this.config.maxBlockTimeMs;

      // Yield control if we've processed a full batch or exceeded max block time
      if (isEndOfBatch || exceededBlockTime) {
        // Report progress
        onProgress?.({
          processed,
          total,
          percentage: Math.round((processed / total) * 100),
        });

        // Yield control to event loop
        if (!isLastItem) {
          await yieldControl(this.config.yieldDelayMs);
          batchStartTime = Date.now();
        }
      }
    }

    // Final progress update
    onProgress?.({
      processed,
      total,
      percentage: 100,
    });

    return results;
  }

  /**
   * Process items in batches with async processor function
   * 
   * @param items - Array of items to process
   * @param processor - Async function to process each item
   * @param onProgress - Optional callback for progress updates
   * @returns Array of processed results
   */
  async processBatchAsync<R>(
    items: T[],
    processor: (item: T) => Promise<R>,
    onProgress?: (progress: BatchProgress) => void
  ): Promise<R[]> {
    const results: R[] = [];
    const total = items.length;
    
    if (total === 0) {
      onProgress?.({ processed: 0, total: 0, percentage: 100 });
      return results;
    }

    let processed = 0;
    let batchStartTime = Date.now();

    for (let i = 0; i < total; i++) {
      const result = await processor(items[i]);
      results.push(result);
      processed++;

      const elapsed = Date.now() - batchStartTime;
      const isEndOfBatch = processed % this.config.batchSize === 0;
      const isLastItem = i === total - 1;
      const exceededBlockTime = elapsed >= this.config.maxBlockTimeMs;

      // Yield control if we've processed a full batch or exceeded max block time
      if (isEndOfBatch || exceededBlockTime) {
        // Report progress
        onProgress?.({
          processed,
          total,
          percentage: Math.round((processed / total) * 100),
        });

        // Yield control to event loop
        if (!isLastItem) {
          await yieldControl(this.config.yieldDelayMs);
          batchStartTime = Date.now();
        }
      }
    }

    // Final progress update
    onProgress?.({
      processed,
      total,
      percentage: 100,
    });

    return results;
  }

  /**
   * Get the current configuration
   */
  getConfig(): BatchProcessorConfig {
    return { ...this.config };
  }
}
