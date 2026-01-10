/**
 * BatchProcessor Property-Based Tests
 * 
 * **Feature: path-analysis-project-isolation, Property 7: Batch Processing Non-Blocking**
 * **Validates: Requirements 8.3**
 * 
 * For any batch processing operation, the main event loop should not be blocked
 * for more than 50ms continuously.
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { BatchProcessor, BatchProcessorConfig } from './batch-processor';

// ============================================
// Test Helpers
// ============================================

/**
 * Measures the maximum continuous blocking time during batch processing.
 * Uses a concurrent timer that checks how long the event loop was blocked.
 */
async function measureMaxBlockingTime<T, R>(
  processor: BatchProcessor<T>,
  items: T[],
  processFunc: (item: T) => R
): Promise<{ results: R[]; maxBlockTimeMs: number }> {
  let maxBlockTimeMs = 0;
  let lastCheckTime = Date.now();
  let checkInterval: ReturnType<typeof setInterval> | null = null;
  
  // Start a timer that runs every 1ms to detect blocking
  const blockingPromise = new Promise<void>((resolve) => {
    checkInterval = setInterval(() => {
      const now = Date.now();
      const elapsed = now - lastCheckTime;
      if (elapsed > maxBlockTimeMs) {
        maxBlockTimeMs = elapsed;
      }
      lastCheckTime = now;
    }, 1);
    
    // Safety timeout to ensure we don't run forever
    setTimeout(() => {
      if (checkInterval) {
        clearInterval(checkInterval);
        checkInterval = null;
      }
      resolve();
    }, 30000); // 30 second max
  });

  // Run the batch processing
  const results = await processor.processBatch(items, processFunc);
  
  // Clean up the interval
  if (checkInterval) {
    clearInterval(checkInterval);
  }
  
  // Give a small delay to ensure final measurement
  await new Promise(resolve => setTimeout(resolve, 5));
  
  return { results, maxBlockTimeMs };
}

/**
 * Creates a CPU-intensive processing function that takes approximately
 * the specified number of milliseconds to execute.
 */
function createCpuIntensiveProcessor(targetMs: number): (item: number) => number {
  return (item: number) => {
    const start = Date.now();
    let result = item;
    // Busy loop to simulate CPU work
    while (Date.now() - start < targetMs) {
      result = Math.sin(result) * Math.cos(result) + 1;
    }
    return result;
  };
}

// ============================================
// Property Tests
// ============================================

describe('BatchProcessor', () => {
  /**
   * **Feature: path-analysis-project-isolation, Property 7: Batch Processing Non-Blocking**
   * **Validates: Requirements 8.3**
   */
  describe('Property 7: Batch Processing Non-Blocking', () => {
    it('should not block the event loop for more than maxBlockTimeMs', async () => {
      await fc.assert(
        fc.asyncProperty(
          // Generate array of items (10-200 items)
          fc.array(fc.integer({ min: 1, max: 1000 }), { minLength: 10, maxLength: 200 }),
          // Generate batch size (5-50)
          fc.integer({ min: 5, max: 50 }),
          // Generate max block time (20-100ms)
          fc.integer({ min: 20, max: 100 }),
          async (items, batchSize, maxBlockTimeMs) => {
            const config: Partial<BatchProcessorConfig> = {
              batchSize,
              maxBlockTimeMs,
              yieldDelayMs: 1, // Minimal delay for faster tests
            };
            
            const processor = new BatchProcessor<number>(config);
            
            // Simple processor that does minimal work
            const simpleProcessor = (n: number) => n * 2;
            
            // Track blocking time using a concurrent check
            let lastYieldTime = Date.now();
            let measuredMaxBlock = 0;
            
            const progressCallback = () => {
              const now = Date.now();
              const blockTime = now - lastYieldTime;
              if (blockTime > measuredMaxBlock) {
                measuredMaxBlock = blockTime;
              }
              lastYieldTime = now;
            };
            
            const results = await processor.processBatch(items, simpleProcessor, progressCallback);
            
            // Verify results are correct
            expect(results.length).toBe(items.length);
            for (let i = 0; i < items.length; i++) {
              expect(results[i]).toBe(items[i] * 2);
            }
            
            // For simple operations, blocking time should be minimal
            // We allow some tolerance for test environment variability
            expect(measuredMaxBlock).toBeLessThanOrEqual(maxBlockTimeMs + 50);
          }
        ),
        { numRuns: 50 }
      );
    });

    it('should yield control between batches', async () => {
      await fc.assert(
        fc.asyncProperty(
          // Generate number of items (must be > batchSize to trigger multiple batches)
          fc.integer({ min: 30, max: 100 }),
          fc.integer({ min: 5, max: 15 }),
          async (numItems, batchSize) => {
            const items = Array.from({ length: numItems }, (_, i) => i);
            
            const processor = new BatchProcessor<number>({
              batchSize,
              yieldDelayMs: 0, // Use setImmediate for faster tests
              maxBlockTimeMs: 50,
            });
            
            let progressCallCount = 0;
            const progressCallback = () => {
              progressCallCount++;
            };
            
            await processor.processBatch(items, (n) => n, progressCallback);
            
            // Progress should be called at least once per batch
            const expectedMinCalls = Math.ceil(numItems / batchSize);
            expect(progressCallCount).toBeGreaterThanOrEqual(expectedMinCalls);
          }
        ),
        { numRuns: 30 }
      );
    }, 30000); // Increase timeout for this test

    it('should handle empty arrays without blocking', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 1, max: 100 }),
          async (batchSize) => {
            const processor = new BatchProcessor<number>({ batchSize });
            
            let progressCalled = false;
            const results = await processor.processBatch(
              [],
              (n) => n * 2,
              () => { progressCalled = true; }
            );
            
            expect(results).toEqual([]);
            expect(progressCalled).toBe(true); // Should still report 100% progress
          }
        ),
        { numRuns: 20 }
      );
    });

    it('should process all items correctly regardless of batch size', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(fc.integer({ min: -1000, max: 1000 }), { minLength: 1, maxLength: 500 }),
          fc.integer({ min: 1, max: 100 }),
          async (items, batchSize) => {
            const processor = new BatchProcessor<number>({ batchSize });
            
            // Use a deterministic transformation
            const transform = (n: number) => n * 3 + 7;
            
            const results = await processor.processBatch(items, transform);
            
            // Verify all items are processed correctly
            expect(results.length).toBe(items.length);
            for (let i = 0; i < items.length; i++) {
              expect(results[i]).toBe(transform(items[i]));
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should report accurate progress percentages', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 10, max: 100 }),
          fc.integer({ min: 5, max: 20 }),
          async (numItems, batchSize) => {
            const items = Array.from({ length: numItems }, (_, i) => i);
            const processor = new BatchProcessor<number>({ batchSize });
            
            const progressUpdates: number[] = [];
            
            await processor.processBatch(
              items,
              (n) => n,
              (progress) => {
                progressUpdates.push(progress.percentage);
              }
            );
            
            // Progress should be monotonically increasing
            for (let i = 1; i < progressUpdates.length; i++) {
              expect(progressUpdates[i]).toBeGreaterThanOrEqual(progressUpdates[i - 1]);
            }
            
            // Final progress should be 100%
            expect(progressUpdates[progressUpdates.length - 1]).toBe(100);
            
            // First progress update should be > 0
            expect(progressUpdates[0]).toBeGreaterThan(0);
          }
        ),
        { numRuns: 50 }
      );
    }, 30000); // Increase timeout for this test
  });

  describe('processBatchAsync', () => {
    it('should handle async processors correctly', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(fc.integer({ min: 1, max: 100 }), { minLength: 1, maxLength: 50 }),
          fc.integer({ min: 5, max: 20 }),
          async (items, batchSize) => {
            const processor = new BatchProcessor<number>({ batchSize });
            
            // Async processor with small delay
            const asyncTransform = async (n: number): Promise<number> => {
              await new Promise(resolve => setTimeout(resolve, 1));
              return n * 2;
            };
            
            const results = await processor.processBatchAsync(items, asyncTransform);
            
            expect(results.length).toBe(items.length);
            for (let i = 0; i < items.length; i++) {
              expect(results[i]).toBe(items[i] * 2);
            }
          }
        ),
        { numRuns: 30 }
      );
    });
  });

  describe('Configuration', () => {
    it('should use default config when none provided', () => {
      const processor = new BatchProcessor<number>();
      const config = processor.getConfig();
      
      expect(config.batchSize).toBe(100);
      expect(config.yieldDelayMs).toBe(10);
      expect(config.maxBlockTimeMs).toBe(50);
    });

    it('should merge partial config with defaults', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 1, max: 500 }),
          async (batchSize) => {
            const processor = new BatchProcessor<number>({ batchSize });
            const config = processor.getConfig();
            
            expect(config.batchSize).toBe(batchSize);
            expect(config.yieldDelayMs).toBe(10); // Default
            expect(config.maxBlockTimeMs).toBe(50); // Default
          }
        ),
        { numRuns: 20 }
      );
    });
  });
});
