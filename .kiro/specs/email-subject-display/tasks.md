# Implementation Plan

- [x] 1. Set up database schema and types










  - [x] 1.1 Add subject_stats table to database schema



    - Add CREATE TABLE statement for subject_stats in schema.sql
    - Include all indexes for performance optimization
    - _Requirements: 1.1, 1.3_


  - [x] 1.2 Create TypeScript types for subject stats

    - Add SubjectStat, AggregatedSubjectStat, WorkerSubjectStat interfaces
    - Add SubjectStatsFilter, SubjectStatsList, TrackSubjectDTO types
    - Add SubjectStorageStats type
    - Export types from shared package
    - _Requirements: 2.1, 2.2_


  - [x] 1.3 Write property test for domain extraction

    - **Property 4: Domain Extraction Consistency**
    - **Validates: Requirements 1.4**

- [x] 2. Implement SubjectStatsService core functionality






  - [x] 2.1 Create SubjectStatsService class with trackSubject method

    - Implement subject hash calculation
    - Implement upsert logic for subject stats
    - Handle email count accumulation
    - _Requirements: 1.1, 1.2, 1.4_
  - [x] 2.2 Write property test for subject tracking


    - **Property 1: Subject Tracking Records All Fields**
    - **Validates: Requirements 1.1**
  - [x] 2.3 Write property test for email count accumulation

    - **Property 2: Email Count Accumulation**
    - **Validates: Requirements 1.2**
  - [x] 2.4 Write property test for multi-worker isolation

    - **Property 3: Multi-Worker Instance Isolation**
    - **Validates: Requirements 1.3, 2.2**

- [x] 3. Implement SubjectStatsService query methods






  - [x] 3.1 Implement getSubjectStats method with filtering and pagination

    - Support workerName filter
    - Support isFocused filter
    - Support sortBy and sortOrder
    - Support limit and offset pagination
    - Aggregate data across workers for display
    - _Requirements: 2.1, 2.2, 2.4, 3.2, 3.3, 5.2_

  - [x] 3.2 Implement getSubjectById method

    - Return single subject stat with worker breakdown
    - _Requirements: 2.1_

  - [x] 3.3 Write property test for list response fields

    - **Property 5: List Response Contains Required Fields**
    - **Validates: Requirements 2.1**
  - [x] 3.4 Write property test for pagination


    - **Property 6: Pagination Correctness**
    - **Validates: Requirements 2.4**
  - [x] 3.5 Write property test for worker filter


    - **Property 7: Worker Filter Consistency**
    - **Validates: Requirements 3.2**
  - [x] 3.6 Write property test for sort order


    - **Property 8: Sort Order Correctness**
    - **Validates: Requirements 3.3**

- [x] 4. Checkpoint - Make sure all tests are passing





  - Ensure all tests pass, ask the user if questions arise.

- [x] 5. Implement SubjectStatsService operation methods





  - [x] 5.1 Implement deleteSubject and deleteSubjects methods


    - Delete single subject stat by ID
    - Delete multiple subject stats by IDs (batch delete)
    - _Requirements: 4.1, 4.4_

  - [x] 5.2 Implement setFocused method
    - Toggle focus status for a subject stat
    - _Requirements: 4.2, 4.3_
  - [x] 5.3 Write property test for delete functionality


    - **Property 9: Delete Removes Record**
    - **Validates: Requirements 4.1**
  - [x] 5.4 Write property test for focus round-trip

    - **Property 10: Focus Mark Round-Trip**
    - **Validates: Requirements 4.2, 4.3**
  - [x] 5.5 Write property test for batch delete

    - **Property 11: Batch Delete Removes All Selected**
    - **Validates: Requirements 4.4**
  - [x] 5.6 Write property test for focus filter

    - **Property 12: Focus Filter Consistency**
    - **Validates: Requirements 5.2**

- [x] 6. Implement storage stats and cleanup integration





  - [x] 6.1 Implement getStorageStats method


    - Return total records, subjects, email count
    - Return focused count and date range
    - Return worker distribution
    - _Requirements: 6.1, 6.2_

  - [x] 6.2 Implement cleanupOldStats method
    - Delete records older than retention period
    - _Requirements: 6.4_
  - [x] 6.3 Update CleanupConfigService to include subject stats retention


    - Add subjectStatsRetentionDays config (1-365 days)
    - Update validation and defaults
    - _Requirements: 6.3_
  - [x] 6.4 Update CleanupStatsService to include subject_stats table


    - Add subject_stats to CLEANABLE_TABLES
    - _Requirements: 6.1, 6.2_
  - [x] 6.5 Update CleanupService to clean subject stats


    - Add cleanupSubjectStats method
    - Integrate into runFullCleanupWithConfig
    - _Requirements: 6.4_
  - [x] 6.6 Write property test for storage stats accuracy


    - **Property 13: Storage Stats Accuracy**
    - **Validates: Requirements 6.1, 6.2**
  - [x] 6.7 Write property test for retention config validation

    - **Property 14: Retention Config Validation**
    - **Validates: Requirements 6.3**
  - [x] 6.8 Write property test for cleanup functionality

    - **Property 15: Cleanup Removes Old Records**
    - **Validates: Requirements 6.4**

- [x] 7. Checkpoint - Make sure all tests are passing





  - Ensure all tests pass, ask the user if questions arise.

- [x] 8. Create API routes





  - [x] 8.1 Create subject routes file with GET /api/subjects endpoint


    - Support query parameters for filtering and pagination
    - Return aggregated subject stats list
    - _Requirements: 2.1, 2.4, 3.2, 3.3, 5.2_

  - [x] 8.2 Add GET /api/subjects/:id endpoint
    - Return single subject stat with worker breakdown

    - _Requirements: 2.1_
  - [x] 8.3 Add DELETE /api/subjects/:id endpoint

    - Delete single subject stat
    - _Requirements: 4.1_

  - [x] 8.4 Add POST /api/subjects/batch-delete endpoint
    - Accept array of IDs to delete
    - _Requirements: 4.4_
  - [x] 8.5 Add POST /api/subjects/:id/focus endpoint
    - Toggle focus status
    - _Requirements: 4.2, 4.3_
  - [x] 8.6 Register subject routes in main application


    - Add routes after campaign routes
    - _Requirements: 7.1_

- [x] 9. Integrate subject tracking into webhook flow






  - [x] 9.1 Update webhook handler to track subject stats

    - Call SubjectStatsService.trackSubject after processing email
    - Pass subject, sender, workerName from webhook payload
    - _Requirements: 1.1, 1.2, 1.3, 1.4_

- [x] 10. Update cleanup settings routes



  - [x] 10.1 Update cleanup config routes to include subject stats retention


    - Add subjectStatsRetentionDays to config response
    - Accept subjectStatsRetentionDays in update request
    - _Requirements: 6.3_
  - [x] 10.2 Update cleanup stats routes to include subject_stats


    - Include subject_stats in storage statistics response
    - _Requirements: 6.1, 6.2_

- [x] 11. Checkpoint - Make sure all tests are passing





  - Ensure all tests pass, ask the user if questions arise.

- [x] 12. Create frontend components






  - [x] 12.1 Create SubjectDisplayPage component

    - Main page layout matching campaign analytics style
    - Include header, filters, and table sections
    - _Requirements: 7.1, 7.3_

  - [x] 12.2 Create SubjectFilters component





    - Worker instance selector (全部实例 + specific instances)
    - Sort by selector (数量升序/降序)
    - Focus filter toggle
    - Auto-refresh toggle

    - _Requirements: 3.1, 3.2, 3.3, 3.4, 5.2_
  - [x] 12.3 Create SubjectTable component





    - Display subject, merchant, worker instances (multi-line), count, actions
    - Support row selection for batch operations

    - Highlight focused subjects
    - _Requirements: 2.1, 2.2, 4.4, 5.1_
  - [x] 12.4 Create SubjectActions component





    - Delete button

    - Focus/Unfocus button
    - Batch delete button
    - _Requirements: 4.1, 4.2, 4.3, 4.4_
  - [x] 12.5 Add subject display page to navigation





    - Add menu item after campaign analytics
    - Configure routing
    - _Requirements: 7.1, 7.2_

- [x] 13. Update cleanup settings UI






  - [x] 13.1 Add subject stats storage display to cleanup settings

    - Show record count and date range
    - _Requirements: 6.1, 6.2_

  - [x] 13.2 Add subject stats retention config to cleanup settings





    - Add input for retention days (1-365)
    - _Requirements: 6.3_

- [x] 14. Final Checkpoint - Make sure all tests are passing





  - Ensure all tests pass, ask the user if questions arise.

