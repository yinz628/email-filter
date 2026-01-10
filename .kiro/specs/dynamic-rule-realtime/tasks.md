# Implementation Plan

## Part 1: Dynamic Rule Realtime Detection

- [x] 1. Move dynamic rule tracking to Phase 1





  - [x] 1.1 Modify `processPhase1` in webhook.ts to include dynamic rule tracking


    - Add dynamic rule service initialization
    - Call `trackSubject` after filter matching for emails with no matched rule
    - If rule is created, re-evaluate the email with the new rule
    - _Requirements: 1.1, 1.3_

  - [x] 1.2 Update `Phase1Result` interface to include dynamic rule creation info
    - Add `dynamicRuleCreated` field
    - Add `detectionLatencyMs` field
    - Add `emailsForwardedBeforeBlock` field

    - _Requirements: 4.1, 4.2_
  - [x] 1.3 Remove 'dynamic' from async task types in async-task-processor.ts

    - Remove 'dynamic' from `ALL_TASK_TYPES` array
    - Keep other async tasks (stats, log, watch, campaign, monitoring)
    - _Requirements: 2.1, 2.2, 2.3, 2.4_

- [x] 2. Enhance dynamic rule service for synchronous operation






  - [x] 2.1 Update `trackSubject` to return detection metrics

    - Calculate detection latency (time from first email to rule creation)
    - Count emails forwarded before blocking
    - Return metrics along with created rule
    - _Requirements: 4.1, 4.2_

  - [x] 2.2 Add system log when dynamic rule is created

    - Log with category 'system'
    - Include pattern, detection latency, forwarded count

    - _Requirements: 6.1_
  - [x] 2.3 Write property test for synchronous rule creation

    - **Property 1: Synchronous rule creation affects current email**
    - **Validates: Requirements 1.1, 1.3**

- [x] 3. Update configuration validation for more aggressive detection






  - [x] 3.1 Lower minimum threshold count from 30 to 5

    - Update validation in dynamic-rule.service.ts
    - Update frontend validation
    - _Requirements: 3.1_

  - [x] 3.2 Lower minimum time span threshold from 1 to 0.5 minutes
    - Update validation in dynamic-rule.service.ts
    - Update frontend input constraints
    - _Requirements: 3.2_
  - [x] 3.3 Write property test for configuration validation


    - **Property 3: Threshold configuration accepts valid low values**
    - **Property 4: Time span configuration accepts valid low values**
    - **Validates: Requirements 3.1, 3.2**

- [x] 4. Checkpoint - Ensure dynamic rule realtime detection works





  - Ensure all tests pass, ask the user if questions arise.

## Part 2: Admin Action Logging

- [x] 5. Add admin action logging infrastructure






  - [x] 5.1 Add helper methods to LogRepository

    - Add `createAdminLog(action, details, workerName)` method
    - Add `createSystemLog(event, details, workerName)` method
    - _Requirements: 5.1, 6.1_

- [x] 6. Add logging to rule operations






  - [x] 6.1 Add admin_action log when creating a rule

    - Log in rules.ts POST handler
    - Include rule details in log
    - _Requirements: 5.1_

  - [x] 6.2 Add admin_action log when updating a rule

    - Log in rules.ts PUT handler
    - Include before/after changes
    - _Requirements: 5.2_

  - [x] 6.3 Add admin_action log when deleting a rule

    - Log in rules.ts DELETE handler
    - Include deleted rule info
    - _Requirements: 5.3_
  - [x] 6.4 Write property test for rule operation logging


    - **Property 5: Admin actions create logs**
    - **Validates: Requirements 5.1, 5.2, 5.3**

- [x] 7. Add logging to Worker operations






  - [x] 7.1 Add admin_action log when creating/updating a Worker

    - Log in workers.ts POST/PUT handlers
    - Include Worker details
    - _Requirements: 5.4_

  - [x] 7.2 Add admin_action log when deleting a Worker

    - Log in workers.ts DELETE handler
    - Include deleted Worker info
    - _Requirements: 5.5_

  - [x] 7.3 Write property test for Worker operation logging

    - **Property 6: Worker operations create logs**
    - **Validates: Requirements 5.4, 5.5**

- [x] 8. Add logging to dynamic config and cleanup operations





  - [x] 8.1 Add admin_action log when updating dynamic config


    - Log in dynamic.ts PUT handler
    - Include config changes
    - _Requirements: 5.6_
  - [x] 8.2 Add system log when expired rules are cleaned up


    - Log in cleanup service
    - Include count of deleted rules
    - _Requirements: 6.2_
  - [x] 8.3 Add system log when data cleanup runs


    - Log in cleanup service
    - Include cleanup statistics
    - _Requirements: 6.3_
  - [x] 8.4 Write property test for system logging


    - **Property 7: Dynamic rule creation creates system log**
    - **Validates: Requirements 4.1, 4.2, 6.1**

- [x] 9. Checkpoint - Ensure admin logging works





  - Ensure all tests pass, ask the user if questions arise.

## Part 3: UI Improvements

- [x] 10. Fix log filter UI redundancy











  - [x] 10.1 Review and fix Worker filter dropdown



    - Ensure "全部实例" is the default for all workers
    - Remove any duplicate "全局" option if present
    - _Requirements: 7.1, 7.2_

- [x] 11. Final Checkpoint - Ensure all tests pass





  - Ensure all tests pass, ask the user if questions arise.
