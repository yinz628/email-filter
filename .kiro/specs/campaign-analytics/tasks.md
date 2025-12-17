# Implementation Plan

## Phase 1: Database Schema and Types

- [x] 1. Set up database schema for campaign analytics






  - [x] 1.1 Create migration script for campaign analytics tables

    - Add merchants, campaigns, campaign_emails, recipient_paths tables
    - Add all necessary indexes
    - _Requirements: 1.1, 1.2, 2.1, 4.1_


  - [x] 1.2 Add TypeScript types for campaign analytics


    - Create types in shared package: Merchant, Campaign, CampaignDetail, RecipientPath, etc.
    - Add DTOs: TrackEmailDTO, UpdateMerchantDTO, etc.
    - _Requirements: All_

## Phase 2: Core Service Implementation

- [x] 2. Implement CampaignAnalyticsService core methods





  - [x] 2.1 Implement domain extraction utility


    - Extract domain from email address
    - Handle edge cases (no @, multiple @, etc.)
    - _Requirements: 1.1_

  - [x] 2.2 Write property test for domain extraction

    - **Property 1: Domain Extraction Consistency**
    - **Validates: Requirements 1.1**

  - [x] 2.3 Implement merchant management methods

    - getMerchants, getMerchantByDomain, updateMerchant
    - Auto-create merchant on new domain
    - _Requirements: 1.2, 1.3, 1.4_

  - [x] 2.4 Write property test for merchant auto-creation

    - **Property 2: Merchant Auto-Creation**
    - **Validates: Requirements 1.2**

  - [x] 2.5 Implement campaign management methods

    - getCampaigns, getCampaignById, createOrUpdateCampaign
    - Subject hash calculation for fast lookup
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5_

  - [x] 2.6 Write property test for campaign grouping

    - **Property 3: Campaign Grouping Invariant**
    - **Validates: Requirements 2.2**

  - [x] 2.7 Write property test for email count consistency

    - **Property 4: Email Count Consistency**
    - **Validates: Requirements 2.3, 2.4**

- [x] 3. Checkpoint - Ensure all tests pass





  - Ensure all tests pass, ask the user if questions arise.

## Phase 3: Value Marking and Path Tracking

- [x] 4. Implement valuable campaign marking





  - [x] 4.1 Implement markCampaignValuable method


    - Mark/unmark campaign as valuable
    - Store valuable note
    - _Requirements: 3.1, 3.2, 3.5_

  - [x] 4.2 Write property test for valuable mark round-trip

    - **Property 5: Valuable Mark Round-Trip**
    - **Validates: Requirements 3.1, 3.2**
  - [x] 4.3 Implement campaign filtering by valuable status


    - Add filter parameter to getCampaigns
    - _Requirements: 3.3, 3.4_

  - [x] 4.4 Write property test for filter by valuable status

    - **Property 6: Filter by Valuable Status**
    - **Validates: Requirements 3.4**

- [x] 5. Implement recipient path tracking






  - [x] 5.1 Implement trackEmail method

    - Create/update merchant, campaign, path records
    - Handle duplicate emails in path
    - _Requirements: 4.1, 4.2, 4.3_
  - [x] 5.2 Write property test for path chronological order

    - **Property 7: Path Chronological Order**
    - **Validates: Requirements 4.2**
  - [x] 5.3 Write property test for path idempotence

    - **Property 8: Path Idempotence**
    - **Validates: Requirements 4.3**

  - [x] 5.4 Implement getRecipientPath method

    - Return complete path for a recipient in a merchant
    - _Requirements: 4.4_

- [x] 6. Checkpoint - Ensure all tests pass





  - Ensure all tests pass, ask the user if questions arise.

## Phase 4: Level and Flow Analysis

- [x] 7. Implement campaign level analysis





  - [x] 7.1 Implement getCampaignLevels method


    - Calculate level for each campaign based on paths
    - Handle campaigns appearing at multiple levels
    - _Requirements: 5.1, 5.2, 5.3, 5.4_

  - [x] 7.2 Write property test for level calculation

    - **Property 9: Level Calculation Consistency**
    - **Validates: Requirements 5.2**

- [x] 8. Implement campaign flow analysis





  - [x] 8.1 Implement getCampaignFlow method


    - Calculate baseline population
    - Generate flow nodes and edges
    - Calculate percentages
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5_

  - [x] 8.2 Write property test for baseline population

    - **Property 10: Baseline Population Accuracy**
    - **Validates: Requirements 6.1**

  - [x] 8.3 Write property test for distribution ratio

    - **Property 11: Distribution Ratio Sum**
    - **Validates: Requirements 6.3**

- [x] 9. Checkpoint - Ensure all tests pass





  - Ensure all tests pass, ask the user if questions arise.

## Phase 5: API Routes

- [x] 10. Implement campaign analytics API routes





  - [x] 10.1 Implement merchant API routes


    - GET /api/campaign/merchants
    - GET /api/campaign/merchants/:id
    - PUT /api/campaign/merchants/:id
    - _Requirements: 1.3, 1.4_

  - [x] 10.2 Implement campaign API routes
    - GET /api/campaign/campaigns
    - GET /api/campaign/campaigns/:id
    - POST /api/campaign/campaigns/:id/valuable

    - _Requirements: 2.3, 2.4, 2.5, 3.1, 3.2, 3.3, 3.4, 3.5_
  - [x] 10.3 Implement track API routes
    - POST /api/campaign/track
    - POST /api/campaign/track/batch
    - Add validation for required fields
    - _Requirements: 8.1, 8.2, 8.4_

  - [x] 10.4 Write property test for data validation

    - **Property 12: Data Validation**
    - **Validates: Requirements 8.2**
  - [x] 10.5 Implement analysis API routes

    - GET /api/campaign/merchants/:id/levels
    - GET /api/campaign/merchants/:id/flow
    - GET /api/campaign/recipients/:email/path
    - _Requirements: 5.1, 6.1, 4.4_

- [x] 11. Checkpoint - Ensure all tests pass





  - Ensure all tests pass, ask the user if questions arise.

## Phase 6: Worker Integration

- [x] 12. Update Worker to report email data






  - [x] 12.1 Add campaign tracking to email handler

    - Extract sender, subject, recipient
    - Call VPS API /api/campaign/track asynchronously
    - Handle errors without blocking email flow
    - _Requirements: 8.1, 8.3_

  - [x] 12.2 Write unit test for Worker tracking integration

    - Test error handling doesn't block email flow
    - _Requirements: 8.3_

## Phase 7: Frontend UI

- [x] 13. Implement campaign analytics frontend






  - [x] 13.1 Add campaign analytics tab to admin panel

    - Create new tab in frontend.ts
    - _Requirements: 7.1_

  - [x] 13.2 Implement merchant list view





    - Display merchants with statistics

    - _Requirements: 1.3, 7.1_
  - [x] 13.3 Implement campaign list view





    - Display campaigns with filters

    - Support valuable status filter
    - _Requirements: 2.5, 3.3, 3.4_
  - [x] 13.4 Implement campaign detail view

    - Show recipient statistics
    - Add valuable marking UI
    - _Requirements: 2.3, 2.4, 3.1, 3.2, 3.5_
  - [x] 13.5 Implement path visualization




    - Display campaign flow as tree/graph
    - Show percentages on nodes
    - Highlight valuable campaigns
    - _Requirements: 7.2, 7.3, 7.4_

- [x] 14. Final Checkpoint - Ensure all tests pass





  - Ensure all tests pass, ask the user if questions arise.
