# Implementation Plan

- [x] 1. Fix autoRefreshTimers object completeness










  - [x] 1.1 Add missing keys to autoRefreshTimers object


    - Add `dataStats`, `logs`, `stats` keys with null initial values
    - Remove `campaign` key (duplicate of `merchants`)
    - _Requirements: 1.1, 2.2_

  - [x] 1.2 Remove duplicate `campaign` entry from autoRefreshFunctions

    - Keep only `merchants` function
    - _Requirements: 2.1, 2.3_

- [x] 2. Implement tab visibility controller





  - [x] 2.1 Add currentActiveTab variable and tabRefreshTypes mapping


    - Define which refresh types belong to which tab
    - _Requirements: 3.1, 3.2, 3.3_
  - [x] 2.2 Modify showTab function to pause/resume auto-refresh


    - Pause old tab's refresh timers
    - Resume new tab's refresh timers (if enabled)
    - _Requirements: 1.3, 3.1, 3.2_

  - [x] 2.3 Add pauseTabRefresh and resumeTabRefresh helper functions

    - Store paused state for each timer type
    - _Requirements: 3.1, 3.2_

- [x] 3. Improve timer management functions





  - [x] 3.1 Update startAutoRefresh to check hasOwnProperty


    - Ensure timer key exists before setting
    - _Requirements: 1.2_
  - [x] 3.2 Update stopAutoRefresh to check hasOwnProperty


    - Ensure timer key exists before clearing
    - _Requirements: 1.2_
  - [x] 3.3 Update restoreAutoRefreshSettings to validate timer keys


    - Skip restoration for types not in autoRefreshTimers
    - _Requirements: 5.2, 5.3_

- [x] 4. Checkpoint - Verify auto-refresh fixes





  - Ensure all tests pass, ask the user if questions arise.

- [x] 5. Clean up duplicate and unused code






  - [x] 5.1 Search and remove duplicate function definitions

    - Review all function definitions in frontend.ts
    - _Requirements: 4.1_

  - [x] 5.2 Consolidate redundant API call patterns

    - Identify and merge similar fetch calls
    - _Requirements: 4.2_

- [x] 6. Final testing and verification





  - [x] 6.1 Test auto-refresh with all tabs


    - Verify no duplicate requests in network tab
    - _Requirements: 1.1, 1.2, 1.3, 2.3_

  - [x] 6.2 Test tab switching behavior

    - Verify refresh pauses/resumes correctly
    - _Requirements: 3.1, 3.2, 3.3_

  - [x] 6.3 Test localStorage persistence

    - Verify settings are saved and restored correctly
    - _Requirements: 5.1, 5.2_

- [x] 7. Final Checkpoint - Make sure all tests pass





  - Ensure all tests pass, ask the user if questions arise.
