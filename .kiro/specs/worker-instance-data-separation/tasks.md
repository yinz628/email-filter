# Implementation Plan

## Phase 1: Database Schema Migration

- [ ] 1. Add worker_name and worker_scope fields to database
  - [ ] 1.1 Create migration script for logs table
    - Add worker_name column with default 'global'
    - Add index on worker_name
    - _Requirements: 7.1_
  - [ ] 1.2 Create migration script for campaign_emails table
    - Add worker_name column with default 'global'
    - Add index on worker_name
    - _Requirements: 7.2_
  - [ ] 1.3 Create migration script for monitoring_rules table
    - Add worker_scope column with default 'global'
    - _Requirements: 7.3_
  - [ ] 1.4 Create migration script for ratio_monitors table
    - Add worker_scope column with default 'global'
    - _Requirements: 7.3_
  - [ ] 1.5 Write property test for schema field presence
    - **Property 7: Schema Field Presence**
    - **Validates: Requirements 7.1, 7.2, 7.3**

## Phase 2: Logs Module Enhancement

- [ ] 2. Update logs to support worker instance
  - [ ] 2.1 Update LogService to include worker_name
    - Modify createLog to accept workerName parameter
    - Update getLogs to support workerName filter
    - _Requirements: 1.1, 1.3_
  - [ ] 2.2 Update logs API routes
    - Add workerName query parameter to GET /api/logs
    - Include workerName in response
    - _Requirements: 1.2, 1.3_
  - [ ] 2.3 Update Worker to send workerName in log requests
    - Include workerName in email forward/drop logs
    - _Requirements: 1.1_
  - [ ] 2.4 Write property test for worker name persistence
    - **Property 1: Worker Name Persistence**
    - **Validates: Requirements 1.1, 1.2**
  - [ ] 2.5 Write property test for filter consistency
    - **Property 2: Filter Consistency**
    - **Validates: Requirements 1.3**

- [ ] 3. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Phase 3: Stats Module Enhancement

- [ ] 4. Update stats to support worker instance
  - [ ] 4.1 Update StatsService for worker filtering
    - Modify getStats to accept workerName parameter
    - Add getStatsByWorker method for breakdown
    - _Requirements: 2.1, 2.2_
  - [ ] 4.2 Update stats API routes
    - Add workerName query parameter to GET /api/stats
    - Add GET /api/stats/by-worker endpoint
    - _Requirements: 2.2, 2.3_
  - [ ] 4.3 Write property test for global stats aggregation
    - **Property 3: Global Stats Aggregation**
    - **Validates: Requirements 2.1**

- [ ] 5. Update trending rules for worker breakdown
  - [ ] 5.1 Update getTrendingRules to include worker breakdown
    - Add workerBreakdown array to response
    - Support workerName filter parameter
    - _Requirements: 3.1, 3.2, 3.3_
  - [ ] 5.2 Write property test for worker breakdown completeness
    - **Property 4: Worker Breakdown Completeness**
    - **Validates: Requirements 3.2**

- [ ] 6. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Phase 4: Campaign Analytics Enhancement

- [ ] 7. Update campaign analytics for worker instance
  - [ ] 7.1 Update CampaignAnalyticsService for worker filtering
    - Modify trackEmail to accept workerName
    - Update getMerchants to support workerName filter
    - Update getCampaigns to support workerName filter
    - _Requirements: 4.1, 4.2, 4.3_
  - [ ] 7.2 Update campaign API routes
    - Add workerName parameter to all campaign endpoints
    - _Requirements: 4.2, 4.3, 4.4_
  - [ ] 7.3 Update Worker to send workerName in campaign tracking
    - Include workerName in /api/campaign/track requests
    - _Requirements: 7.2_
  - [ ] 7.4 Write property test for campaign filter consistency
    - **Property 2: Filter Consistency (campaign part)**
    - **Validates: Requirements 4.2, 4.3**

- [ ] 8. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Phase 5: Monitoring Module Enhancement

- [ ] 9. Update signal monitoring for worker scope
  - [ ] 9.1 Update MonitoringService for worker scope
    - Modify createRule to accept workerScope
    - Update checkSignals to respect workerScope
    - _Requirements: 5.1, 5.2, 5.3_
  - [ ] 9.2 Update monitoring API routes
    - Add workerScope to rule creation/update
    - Add workerScope filter to status queries
    - _Requirements: 5.1, 5.4_
  - [ ] 9.3 Update alert creation to include scope info
    - Include workerScope in alert records
    - _Requirements: 5.5_
  - [ ] 9.4 Write property test for scope-based aggregation
    - **Property 5: Scope-Based Data Aggregation**
    - **Validates: Requirements 5.2, 5.3**
  - [ ] 9.5 Write property test for alert scope marking
    - **Property 6: Alert Scope Marking**
    - **Validates: Requirements 5.5**

- [ ] 10. Update ratio monitoring for worker scope
  - [ ] 10.1 Update RatioMonitorService for worker scope
    - Modify createMonitor to accept workerScope
    - Update checkRatios to respect workerScope
    - _Requirements: 6.1, 6.2, 6.3_
  - [ ] 10.2 Update ratio monitor API routes
    - Add workerScope to monitor creation/update
    - Add workerScope filter to queries
    - _Requirements: 6.1, 6.4_

- [ ] 11. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Phase 6: Frontend UI Enhancement

- [ ] 12. Add worker instance filter to logs tab
  - [ ] 12.1 Add worker filter dropdown to logs header
    - Load worker list from API
    - Filter logs by selected worker
    - _Requirements: 1.3_
  - [ ] 12.2 Display worker name in logs table
    - Add worker column to logs table
    - _Requirements: 1.2_

- [ ] 13. Add worker instance filter to stats tab
  - [ ] 13.1 Add worker filter dropdown to stats header
    - Filter stats by selected worker
    - _Requirements: 2.2_
  - [ ] 13.2 Update trending rules display
    - Show worker breakdown for each rule
    - Support worker filter
    - _Requirements: 3.2, 3.3_

- [ ] 14. Add worker instance filter to campaign tab
  - [ ] 14.1 Add worker filter dropdown to campaign header
    - Filter merchants and campaigns by worker
    - _Requirements: 4.2, 4.3_
  - [ ] 14.2 Update data management section
    - Support worker-specific data operations
    - _Requirements: 4.5_

- [ ] 15. Add worker scope to monitoring tab
  - [ ] 15.1 Add worker scope to rule creation modal
    - Add scope dropdown (global/specific worker)
    - _Requirements: 5.1_
  - [ ] 15.2 Display worker scope in rules list
    - Show scope badge for each rule
    - _Requirements: 5.4_
  - [ ] 15.3 Add worker scope to ratio monitor creation
    - Add scope dropdown to ratio monitor form
    - _Requirements: 6.1_
  - [ ] 15.4 Display worker scope in ratio monitors list
    - Show scope badge for each monitor
    - _Requirements: 6.4_

- [ ] 16. Final Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.
