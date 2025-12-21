# Implementation Plan

- [x] 1. Create cleanup configuration infrastructure





  - [x] 1.1 Add cleanup_config table to schema.sql


    - Create table with key-value structure for storing cleanup settings
    - Add indexes for efficient lookup
    - _Requirements: 1.4_
  - [x] 1.2 Create CleanupConfigService


    - Implement getConfig() to load configuration with defaults
    - Implement updateConfig() to save configuration
    - Implement validateConfig() with range validation
    - _Requirements: 1.3, 2.1, 3.1, 3.2, 3.3, 4.1_
  - [x] 1.3 Write property test for configuration validation


    - **Property 1: Configuration Validation**
    - **Validates: Requirements 1.3, 2.1, 3.1, 3.2, 3.3, 4.1**
  - [x] 1.4 Write property test for configuration round-trip


    - **Property 2: Configuration Round-Trip**
    - **Validates: Requirements 1.4**

- [x] 2. Extend CleanupService for all tables










  - [x] 2.1 Add cleanupSystemLogs method to CleanupService



    - Delete system_logs records older than retention period
    - Return cleanup result with deleted count and cutoff date
    - _Requirements: 2.3_


  - [x] 2.2 Add cleanupHeartbeatLogs method to CleanupService
    - Delete heartbeat_logs records older than retention period
    - Return cleanup result with deleted count and cutoff date


    - _Requirements: 3.3_
  - [x] 2.3 Add cleanupSubjectTracker method to CleanupService
    - Delete email_subject_tracker records older than retention period


    - Return cleanup result with deleted count and cutoff date
    - _Requirements: 3.4_
  - [x] 2.4 Implement runFullCleanupWithConfig method
    - Execute cleanup for all tables using configuration
    - Return comprehensive result with all table counts
    - _Requirements: 4.3, 5.3_
  - [x] 2.5 Write property test for cleanup removes old records



    - **Property 3: Cleanup Removes Old Records**
    - **Validates: Requirements 2.3, 3.4**
  - [x] 2.6 Write property test for cleanup result completeness



    - **Property 4: Cleanup Result Contains All Tables**
    - **Validates: Requirements 4.3, 5.3**

- [x] 3. Create CleanupStatsService






  - [x] 3.1 Implement CleanupStatsService

    - Create getStats() to return record counts and dates for all tables
    - Create getTableStats() for individual table statistics
    - _Requirements: 6.1, 6.2_

  - [x] 3.2 Write property test for statistics completeness

    - **Property 5: Statistics Contains All Tables**
    - **Validates: Requirements 6.1, 6.2**

- [x] 4. Checkpoint - Make sure all tests are passing





  - Ensure all tests pass, ask the user if questions arise.

- [x] 5. Create API routes






  - [x] 5.1 Create cleanup-settings routes file

    - GET /api/admin/cleanup/config - Get cleanup configuration
    - PUT /api/admin/cleanup/config - Update cleanup configuration
    - GET /api/admin/cleanup/stats - Get storage statistics
    - POST /api/admin/cleanup/run - Execute manual cleanup
    - _Requirements: 1.1, 1.2, 1.4, 5.1, 6.1_

  - [x] 5.2 Register routes in main application

    - Add cleanup settings routes to fastify instance
    - Apply admin authentication middleware
    - _Requirements: 1.1_

- [x] 6. Update SchedulerService to use configuration






  - [x] 6.1 Modify SchedulerService to read cleanup config

    - Load cleanup configuration on startup
    - Use configured cleanup hour for scheduling
    - Use configured retention periods for cleanup
    - _Requirements: 4.2_

  - [x] 6.2 Add configuration reload capability





    - Allow scheduler to reload config without restart
    - _Requirements: 4.2_

- [x] 7. Implement frontend UI





  - [x] 7.1 Add cleanup settings card to settings page


    - Create form inputs for all retention period settings
    - Add cleanup hour selector
    - Add auto-cleanup toggle
    - _Requirements: 1.1, 1.2_
  - [x] 7.2 Implement storage statistics display

    - Show record counts for each table
    - Show oldest record dates
    - _Requirements: 6.1, 6.2_
  - [x] 7.3 Implement manual cleanup functionality

    - Add cleanup button with confirmation
    - Show progress indicator during cleanup
    - Display cleanup results summary
    - _Requirements: 5.1, 5.2, 5.3_
  - [x] 7.4 Implement settings save functionality

    - Validate inputs before saving
    - Show success/error notifications
    - Refresh statistics after save
    - _Requirements: 1.3, 1.4, 1.5, 6.3_

- [x] 8. Final Checkpoint - Make sure all tests are passing





  - Ensure all tests pass, ask the user if questions arise.

