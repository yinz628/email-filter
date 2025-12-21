# Implementation Plan

- [x] 1. Fix Worker Filter Derivation in Project Campaigns API






  - [x] 1.1 Modify GET /api/campaign/projects/:id/campaigns endpoint

    - Add effectiveWorkerNames calculation before calling getProjectCampaignsWithTags
    - Use workerNames if available and non-empty, otherwise use [workerName]
    - _Requirements: 1.1, 1.2, 2.1, 2.2_

  - [x] 1.2 Add helper function for worker names derivation


    - Create getEffectiveWorkerNames utility function
    - Reuse in other project-related endpoints if needed
    - _Requirements: 2.1, 2.2_

- [x] 2. Update Related Project Endpoints






  - [x] 2.1 Review and fix GET /api/campaign/projects/:id/root-campaigns endpoint

    - Ensure consistent worker filter logic
    - _Requirements: 2.3_


  - [x] 2.2 Review and fix POST /api/campaign/projects/:id/root-campaigns endpoint





    - Ensure consistent worker filter logic
    - _Requirements: 2.3_

- [x] 3. Testing






  - [x] 3.1 Write property test for worker filter derivation

    - **Property 1: Worker Filter Derivation**
    - **Validates: Requirements 1.1, 1.2, 2.1, 2.2**

  - [x] 3.2 Write property test for campaign filtering by worker


    - **Property 2: Campaign Filtering by Worker**
    - **Validates: Requirements 1.3, 3.1, 3.2**

  - [x] 3.3 Write unit tests for edge cases


    - Test project with no worker association
    - Test project with only workerName
    - Test project with workerNames array
    - _Requirements: 1.4_

- [x] 4. Checkpoint






  - [x] 4.1 Ensure all tests pass, ask the user if questions arise.

