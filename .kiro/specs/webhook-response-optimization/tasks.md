# Implementation Plan

- [x] 1. Create AsyncTaskProcessor core infrastructure






  - [x] 1.1 Create AsyncTaskProcessor class with queue management

    - Create `packages/vps-api/src/services/async-task-processor.ts`
    - Implement `enqueue()`, `enqueueAll()`, `flush()` methods
    - Implement queue overflow protection (drop oldest when exceeding maxQueueSize)
    - _Requirements: 2.1, 2.2, 5.2_


  - [x] 1.2 Write property test for task queue consistency

    - **Property 2: Task Queue Consistency**
    - *For any* webhook request completing Phase 1, all Phase 2 tasks should be enqueued
    - **Validates: Requirements 2.1, 2.2**

  - [x] 1.3 Implement batch processing logic


    - Add `processBatch()` method with type-based grouping
    - Implement `startFlushTimer()` and `stopFlushTimer()` for periodic flushing
    - _Requirements: 3.1, 3.2_


  - [x] 1.4 Write property test for batch processing

    - **Property 4: Batch Processing Completeness**
    - *For any* batch processed, all tasks should either succeed or be logged as failed
    - **Validates: Requirements 3.1, 3.2, 3.3**

- [x] 2. Implement type-specific task processors






  - [x] 2.1 Implement stats task processor

    - Create `processStatsTasks()` method
    - Aggregate global forwarded/deleted counts
    - Batch update rule-specific statistics
    - _Requirements: 3.3_


  - [x] 2.2 Implement log task processor





    - Create `processLogTasks()` method
    - Add `LogRepository.createBatch()` for bulk insert
    - _Requirements: 3.3_


  - [x] 2.3 Implement watch task processor





    - Create `processWatchTasks()` method
    - Add `WatchRepository.incrementHitBatch()` for bulk update

    - _Requirements: 3.3_

  - [x] 2.4 Implement dynamic rule task processor





    - Create `processDynamicTasks()` method

    - Reuse existing `DynamicRuleService.trackSubject()`
    - _Requirements: 2.1_

  - [x] 2.5 Implement campaign analytics task processor

    - Create `processCampaignTasks()` method
    - Reuse existing `CampaignAnalyticsService.trackEmailSelective()`
    - _Requirements: 2.1_

  - [x] 2.6 Implement signal monitoring task processor





    - Create `processMonitoringTasks()` method
    - Reuse existing `HitProcessor.processEmail()`
    - _Requirements: 2.1_

- [x] 3. Implement error handling and retry logic








  - [x] 3.1 Add retry mechanism for failed tasks

    - Implement `requeueFailedTasks()` with retry count tracking
    - Add exponential backoff for database failures
    - _Requirements: 2.4, 3.4, 5.4_


  - [x] 3.2 Write property test for failure isolation



    - **Property 5: Failure Isolation**
    - *For any* Phase 2 failure, Phase 1 response should remain unaffected
    - **Validates: Requirements 5.1, 5.2**

- [x] 4. Checkpoint - Verify AsyncTaskProcessor
  - Ensure all tests pass, ask the user if questions arise.

- [x] 5. Create RuleCache (optional enhancement)






  - [x] 5.1 Create RuleCache class

    - Create `packages/vps-api/src/services/rule-cache.ts`
    - Implement `get()`, `set()`, `invalidate()` methods
    - Add TTL-based expiration (default 60 seconds)
    - Add LRU eviction when exceeding maxEntries
    - _Requirements: 4.1, 4.2, 4.3_


  - [x] 5.2 Write property test for cache round trip

    - **Property 3: Cache Round Trip**
    - *For any* cached rules, retrieval should return same rules until TTL expires
    - **Validates: Requirements 4.1, 4.2, 4.3**

  - [x] 5.3 Add cache invalidation hooks


    - Invalidate cache when rules are created/updated/deleted via admin API
    - Add invalidation to rule routes (`/api/rules`)
    - _Requirements: 4.4_

- [x] 6. Refactor webhook handler for two-phase processing





  - [x] 6.1 Extract Phase 1 processing logic


    - Move worker config lookup, rule retrieval, filter matching to dedicated function
    - Remove stats update, log recording from synchronous path
    - _Requirements: 1.1, 1.2_


  - [x] 6.2 Integrate AsyncTaskProcessor into webhook handler

    - Initialize AsyncTaskProcessor as singleton
    - Use `setImmediate()` to enqueue Phase 2 tasks after response
    - _Requirements: 1.3, 2.1, 2.2_

  - [x] 6.3 Write property test for response time


    - **Property 1: Response Time Guarantee**
    - *For any* valid webhook request, Phase 1 processing time should be less than 50ms
    - **Validates: Requirements 1.1, 1.2, 1.3**

  - [x] 6.4 Integrate RuleCache into webhook handler (optional)


    - Check cache before database query
    - Populate cache on cache miss
    - _Requirements: 4.1, 4.2_

- [x] 7. Add batch database operations





  - [x] 7.1 Add batch methods to StatsRepository

    - Add `incrementGlobalForwardedBatch(count: number)`
    - Add `incrementGlobalDeletedBatch(count: number)`
    - Add `incrementProcessedBatch(ruleId: string, count: number)`
    - Add `incrementDeletedBatch(ruleId: string, count: number)`
    - _Requirements: 3.3_


  - [x] 7.2 Add batch methods to LogRepository
    - Add `createBatch(logs: LogEntry[])` for bulk insert
    - _Requirements: 3.3_

  - [x] 7.3 Add batch methods to WatchRepository
    - Add `incrementHitBatch(ruleId: string, count: number)`
    - _Requirements: 3.3_

- [x] 8. Checkpoint - Verify webhook optimization





  - Ensure all tests pass, ask the user if questions arise.

- [x] 9. Add monitoring and observability





  - [x] 9.1 Add queue status endpoint


    - Create `/api/admin/async-queue/status` endpoint
    - Return queue size, processing status, total processed/failed counts
    - _Requirements: 2.3_


  - [x] 9.2 Add cache statistics endpoint (if cache enabled)
    - Create `/api/admin/rule-cache/stats` endpoint
    - Return cache size, hit rate, hits/misses counts
    - _Requirements: 4.1_


  - [x] 9.3 Add performance logging

    - Log Phase 1 processing time for each request
    - Log batch processing time and size
    - _Requirements: 1.1_

- [x] 10. Final testing and verification





  - [x] 10.1 Test Phase 1 response time


    - Verify response time < 50ms under normal load
    - _Requirements: 1.1, 1.2, 1.3_


  - [x] 10.2 Test async task processing

    - Verify all task types are processed correctly
    - Verify batch processing reduces database operations
    - _Requirements: 2.1, 2.3, 3.1, 3.2, 3.3_

  - [x] 10.3 Test error handling


    - Verify Phase 2 failures don't affect Phase 1 response
    - Verify retry mechanism works correctly
    - _Requirements: 2.4, 5.1, 5.4_

  - [x] 10.4 Test cache behavior (if enabled)


    - Verify cache hit/miss behavior
    - Verify cache invalidation on rule updates
    - _Requirements: 4.1, 4.2, 4.3, 4.4_

- [x] 11. Final Checkpoint - Make sure all tests pass



  - Ensure all tests pass, ask the user if questions arise.
