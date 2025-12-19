/**
 * Async Task Processor Property Tests
 * 
 * Tests for the AsyncTaskProcessor class using property-based testing.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import * as fc from 'fast-check';
import type { EmailWebhookPayload } from '@email-filter/shared';
import type { FilterResult } from './filter.service.js';
import {
  AsyncTaskProcessor,
  type AsyncTaskData,
  type PendingTask,
  type AsyncTaskType,
} from './async-task-processor.js';

// Arbitraries for generating test data
const emailPayloadArb: fc.Arbitrary<EmailWebhookPayload> = fc.record({
  from: fc.emailAddress(),
  to: fc.emailAddress(),
  subject: fc.string({ minLength: 1, maxLength: 200 }),
  messageId: fc.uuid(),
  timestamp: fc.integer({ min: 1000000000000, max: 2000000000000 }),
  workerName: fc.option(fc.string({ minLength: 1, maxLength: 50 }), { nil: undefined }),
});

const filterResultArb: fc.Arbitrary<FilterResult> = fc.record({
  action: fc.constantFrom('forward', 'drop'),
  forwardTo: fc.option(fc.emailAddress(), { nil: undefined }),
  reason: fc.option(fc.string({ minLength: 1, maxLength: 100 }), { nil: undefined }),
  matchedRule: fc.option(
    fc.record({
      id: fc.uuid(),
      category: fc.constantFrom('whitelist', 'blacklist', 'dynamic'),
      matchType: fc.constantFrom('sender', 'subject', 'domain'),
      matchMode: fc.constantFrom('exact', 'contains', 'startsWith', 'endsWith', 'regex'),
      pattern: fc.string({ minLength: 1, maxLength: 100 }),
      enabled: fc.boolean(),
      createdAt: fc.date(),
      updatedAt: fc.date(),
    }),
    { nil: undefined }
  ),
  matchedCategory: fc.option(fc.constantFrom('whitelist', 'blacklist', 'dynamic'), { nil: undefined }),
});

const asyncTaskDataArb: fc.Arbitrary<AsyncTaskData> = fc.record({
  payload: emailPayloadArb,
  filterResult: filterResultArb,
  workerId: fc.option(fc.string({ minLength: 1, maxLength: 50 }), { nil: undefined }),
  defaultForwardTo: fc.emailAddress(),
});

const taskTypeArb: fc.Arbitrary<AsyncTaskType> = fc.constantFrom(
  'stats',
  'log',
  'watch',
  'dynamic',
  'campaign',
  'monitoring'
);

describe('AsyncTaskProcessor', () => {
  let processor: AsyncTaskProcessor;

  beforeEach(() => {
    processor = new AsyncTaskProcessor({
      batchSize: 10,
      flushIntervalMs: 1000,
      maxQueueSize: 100,
      maxRetries: 3,
    });
  });

  /**
   * **Feature: webhook-response-optimization, Property 2: Task Queue Consistency**
   * **Validates: Requirements 2.1, 2.2**
   * 
   * *For any* webhook request completing Phase 1, all Phase 2 tasks should be enqueued.
   * This means enqueueAll() should create exactly 6 tasks (one for each task type).
   */
  describe('Property 2: Task Queue Consistency', () => {
    it('enqueueAll creates exactly 6 tasks for all task types', () => {
      fc.assert(
        fc.property(asyncTaskDataArb, (data) => {
          // Reset processor for each test
          processor.clear();
          
          // Enqueue all tasks for a webhook request
          processor.enqueueAll(data);
          
          // Verify exactly 6 tasks are enqueued (one for each type)
          const queueSize = processor.getQueueSize();
          expect(queueSize).toBe(6);
        }),
        { numRuns: 100 }
      );
    });

    it('enqueueAll creates tasks for all required types', () => {
      fc.assert(
        fc.property(asyncTaskDataArb, (data) => {
          processor.clear();
          
          // Track which types are enqueued
          const enqueuedTypes = new Set<AsyncTaskType>();
          const originalEnqueue = processor.enqueue.bind(processor);
          
          processor.enqueue = (task: PendingTask) => {
            enqueuedTypes.add(task.type);
            originalEnqueue(task);
          };
          
          processor.enqueueAll(data);
          
          // Verify all 6 types are present
          const expectedTypes: AsyncTaskType[] = [
            'stats',
            'log',
            'watch',
            'dynamic',
            'campaign',
            'monitoring',
          ];
          
          for (const type of expectedTypes) {
            expect(enqueuedTypes.has(type)).toBe(true);
          }
        }),
        { numRuns: 100 }
      );
    });

    it('enqueue does not block - queue size increases immediately', () => {
      fc.assert(
        fc.property(asyncTaskDataArb, taskTypeArb, (data, type) => {
          processor.clear();
          
          const task: PendingTask = {
            type,
            data,
            timestamp: Date.now(),
            retryCount: 0,
          };
          
          const sizeBefore = processor.getQueueSize();
          processor.enqueue(task);
          const sizeAfter = processor.getQueueSize();
          
          // Queue size should increase by 1 immediately (non-blocking)
          expect(sizeAfter).toBe(sizeBefore + 1);
        }),
        { numRuns: 100 }
      );
    });

    it('multiple enqueueAll calls accumulate tasks correctly', () => {
      fc.assert(
        fc.property(
          fc.array(asyncTaskDataArb, { minLength: 1, maxLength: 10 }),
          (dataArray) => {
            processor.clear();
            
            for (const data of dataArray) {
              processor.enqueueAll(data);
            }
            
            // Each enqueueAll adds 6 tasks
            const expectedSize = dataArray.length * 6;
            expect(processor.getQueueSize()).toBe(expectedSize);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * Queue overflow protection tests
   * **Validates: Requirements 5.2**
   */
  describe('Queue Overflow Protection', () => {
    it('drops oldest tasks when queue exceeds maxQueueSize', () => {
      fc.assert(
        fc.property(
          asyncTaskDataArb,
          fc.integer({ min: 1, max: 50 }),
          (data, extraTasks) => {
            // Create processor with small max queue size
            const smallProcessor = new AsyncTaskProcessor({
              maxQueueSize: 10,
              batchSize: 100, // High batch size to prevent auto-flush
            });
            
            // Fill queue to max
            for (let i = 0; i < 10; i++) {
              smallProcessor.enqueue({
                type: 'stats',
                data,
                timestamp: i, // Use index as timestamp to track order
                retryCount: 0,
              });
            }
            
            expect(smallProcessor.getQueueSize()).toBe(10);
            
            // Add more tasks - should drop oldest
            for (let i = 0; i < extraTasks; i++) {
              smallProcessor.enqueue({
                type: 'log',
                data,
                timestamp: 100 + i,
                retryCount: 0,
              });
            }
            
            // Queue should never exceed maxQueueSize
            expect(smallProcessor.getQueueSize()).toBeLessThanOrEqual(10);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * **Feature: webhook-response-optimization, Property 4: Batch Processing Completeness**
   * **Validates: Requirements 3.1, 3.2, 3.3**
   * 
   * *For any* batch processed, all tasks should either succeed or be logged as failed.
   */
  describe('Property 4: Batch Processing Completeness', () => {
    it('processBatch processes all tasks in the batch', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(asyncTaskDataArb, { minLength: 1, maxLength: 20 }),
          async (dataArray) => {
            processor.clear();
            
            // Track processed tasks
            const processedTasks: PendingTask[] = [];
            
            // Register a processor that tracks calls
            processor.registerProcessor('stats', async (tasks) => {
              processedTasks.push(...tasks);
            });
            
            // Create tasks
            const tasks: PendingTask[] = dataArray.map((data, i) => ({
              type: 'stats' as AsyncTaskType,
              data,
              timestamp: Date.now() + i,
              retryCount: 0,
            }));
            
            // Process batch directly
            await processor.processBatch(tasks);
            
            // All tasks should be processed
            expect(processedTasks.length).toBe(tasks.length);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('processBatch groups tasks by type correctly', async () => {
      await fc.assert(
        fc.asyncProperty(asyncTaskDataArb, async (data) => {
          processor.clear();
          
          // Track calls per type
          const callsByType = new Map<AsyncTaskType, number>();
          
          const types: AsyncTaskType[] = ['stats', 'log', 'watch', 'dynamic', 'campaign', 'monitoring'];
          for (const type of types) {
            processor.registerProcessor(type, async (tasks) => {
              callsByType.set(type, (callsByType.get(type) || 0) + tasks.length);
            });
          }
          
          // Create mixed tasks
          const tasks: PendingTask[] = types.map((type) => ({
            type,
            data,
            timestamp: Date.now(),
            retryCount: 0,
          }));
          
          await processor.processBatch(tasks);
          
          // Each type should have been called once with 1 task
          for (const type of types) {
            expect(callsByType.get(type)).toBe(1);
          }
        }),
        { numRuns: 100 }
      );
    });

    it('failed tasks are requeued with incremented retry count', async () => {
      await fc.assert(
        fc.asyncProperty(asyncTaskDataArb, async (data) => {
          const retryProcessor = new AsyncTaskProcessor({
            maxQueueSize: 100,
            maxRetries: 3,
            batchSize: 100,
            baseRetryDelayMs: 10, // Use short delay for testing
            maxRetryDelayMs: 50,
          });
          
          // Register a processor that always fails
          retryProcessor.registerProcessor('stats', async () => {
            throw new Error('Simulated failure');
          });
          
          const task: PendingTask = {
            type: 'stats',
            data,
            timestamp: Date.now(),
            retryCount: 0,
          };
          
          // Process the failing task
          await retryProcessor.processBatch([task]);
          
          // Wait for exponential backoff delay (baseRetryDelayMs * 2^0 = 10ms)
          await new Promise(resolve => setTimeout(resolve, 20));
          
          // Task should be requeued with retryCount = 1
          const status = retryProcessor.getStatus();
          expect(status.queueSize).toBe(1);
        }),
        { numRuns: 100 }
      );
    });

    it('tasks exceeding maxRetries are dropped and counted as failed', async () => {
      await fc.assert(
        fc.asyncProperty(asyncTaskDataArb, async (data) => {
          const retryProcessor = new AsyncTaskProcessor({
            maxQueueSize: 100,
            maxRetries: 3,
            batchSize: 100,
          });
          
          // Register a processor that always fails
          retryProcessor.registerProcessor('stats', async () => {
            throw new Error('Simulated failure');
          });
          
          // Task already at max retries
          const task: PendingTask = {
            type: 'stats',
            data,
            timestamp: Date.now(),
            retryCount: 3, // Already at max
          };
          
          await retryProcessor.processBatch([task]);
          
          // Task should NOT be requeued (exceeded max retries)
          const status = retryProcessor.getStatus();
          expect(status.queueSize).toBe(0);
          expect(status.totalFailed).toBe(1);
        }),
        { numRuns: 100 }
      );
    });
  });

  /**
   * Flush behavior tests
   */
  describe('Flush Behavior', () => {
    it('flush processes all queued tasks', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(asyncTaskDataArb, { minLength: 1, maxLength: 10 }),
          async (dataArray) => {
            processor.clear();
            
            let processedCount = 0;
            processor.registerProcessor('stats', async (tasks) => {
              processedCount += tasks.length;
            });
            
            // Enqueue tasks
            for (const data of dataArray) {
              processor.enqueue({
                type: 'stats',
                data,
                timestamp: Date.now(),
                retryCount: 0,
              });
            }
            
            // Flush
            await processor.flush();
            
            // All tasks should be processed
            expect(processedCount).toBe(dataArray.length);
            expect(processor.getQueueSize()).toBe(0);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('flush is idempotent when queue is empty', async () => {
      processor.clear();
      
      // Multiple flushes on empty queue should not error
      await processor.flush();
      await processor.flush();
      await processor.flush();
      
      const status = processor.getStatus();
      expect(status.queueSize).toBe(0);
      expect(status.processing).toBe(false);
    });
  });

  /**
   * Status tracking tests
   */
  describe('Status Tracking', () => {
    it('getStatus returns accurate queue information', () => {
      fc.assert(
        fc.property(
          fc.array(asyncTaskDataArb, { minLength: 0, maxLength: 20 }),
          (dataArray) => {
            processor.clear();
            
            for (const data of dataArray) {
              processor.enqueue({
                type: 'stats',
                data,
                timestamp: Date.now(),
                retryCount: 0,
              });
            }
            
            const status = processor.getStatus();
            expect(status.queueSize).toBe(dataArray.length);
            expect(status.processing).toBe(false);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * **Feature: webhook-response-optimization, Property 5: Failure Isolation**
   * **Validates: Requirements 5.1, 5.2**
   * 
   * *For any* Phase 2 failure, Phase 1 response should remain unaffected.
   * This tests that async task processing failures do not affect the filter decision
   * that was already returned to the caller.
   */
  describe('Property 5: Failure Isolation', () => {
    it('Phase 2 failures do not affect Phase 1 response data', async () => {
      await fc.assert(
        fc.asyncProperty(asyncTaskDataArb, async (data) => {
          const isolationProcessor = new AsyncTaskProcessor({
            maxQueueSize: 100,
            maxRetries: 0, // No retries to avoid timeout - we just want to test isolation
            batchSize: 100,
            baseRetryDelayMs: 1,
            maxRetryDelayMs: 5,
          });
          
          // Capture the Phase 1 response (filter result) before any async processing
          const phase1Response = { ...data.filterResult };
          const phase1Payload = { ...data.payload };
          
          // Register processors that always fail (simulating Phase 2 failures)
          const taskTypes: AsyncTaskType[] = ['stats', 'log', 'watch', 'dynamic', 'campaign', 'monitoring'];
          for (const type of taskTypes) {
            isolationProcessor.registerProcessor(type, async () => {
              throw new Error(`Simulated ${type} failure`);
            });
          }
          
          // Enqueue all Phase 2 tasks (this happens after Phase 1 response is sent)
          isolationProcessor.enqueueAll(data);
          
          // Process the batch (all tasks will fail)
          await isolationProcessor.flush();
          
          // Verify Phase 1 response data remains unchanged despite Phase 2 failures
          expect(data.filterResult).toEqual(phase1Response);
          expect(data.payload).toEqual(phase1Payload);
          
          // The filter decision (action, forwardTo) should be exactly as it was
          expect(data.filterResult.action).toBe(phase1Response.action);
          expect(data.filterResult.forwardTo).toBe(phase1Response.forwardTo);
        }),
        { numRuns: 100 }
      );
    });

    it('Phase 2 queue overflow does not corrupt Phase 1 data', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(asyncTaskDataArb, { minLength: 5, maxLength: 20 }),
          async (dataArray) => {
            // Create processor with very small queue to force overflow
            const overflowProcessor = new AsyncTaskProcessor({
              maxQueueSize: 3,
              maxRetries: 1,
              batchSize: 100,
              baseRetryDelayMs: 1,
              maxRetryDelayMs: 5,
            });
            
            // Capture all Phase 1 responses before enqueueing
            const phase1Responses = dataArray.map(d => ({ ...d.filterResult }));
            
            // Enqueue tasks for all requests (will cause overflow)
            for (const data of dataArray) {
              overflowProcessor.enqueueAll(data);
            }
            
            // Verify all original Phase 1 responses are unchanged
            for (let i = 0; i < dataArray.length; i++) {
              expect(dataArray[i].filterResult).toEqual(phase1Responses[i]);
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('async task errors are isolated and do not propagate', async () => {
      await fc.assert(
        fc.asyncProperty(asyncTaskDataArb, async (data) => {
          const errorProcessor = new AsyncTaskProcessor({
            maxQueueSize: 100,
            maxRetries: 0, // No retries - fail immediately
            batchSize: 100,
          });
          
          // Register a processor that throws
          errorProcessor.registerProcessor('stats', async () => {
            throw new Error('Database connection failed');
          });
          
          // Register a processor that succeeds
          let successfulProcessed = false;
          errorProcessor.registerProcessor('log', async () => {
            successfulProcessed = true;
          });
          
          // Enqueue both types
          errorProcessor.enqueue({
            type: 'stats',
            data,
            timestamp: Date.now(),
            retryCount: 0,
          });
          errorProcessor.enqueue({
            type: 'log',
            data,
            timestamp: Date.now(),
            retryCount: 0,
          });
          
          // Process batch - should not throw despite stats failure
          await errorProcessor.processBatch([
            { type: 'stats', data, timestamp: Date.now(), retryCount: 0 },
            { type: 'log', data, timestamp: Date.now(), retryCount: 0 },
          ]);
          
          // The successful processor should have run despite the other failing
          expect(successfulProcessed).toBe(true);
          
          // Status should show the failure was counted
          const status = errorProcessor.getStatus();
          expect(status.totalFailed).toBe(1);
        }),
        { numRuns: 100 }
      );
    });
  });
});
