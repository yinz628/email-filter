# Implementation Plan

- [x] 1. Create backup proxy routes in vps-admin

  - [x] 1.1 Create backup-proxy.ts route file
    - Create `packages/vps-admin/src/routes/backup-proxy.ts`
    - Implement proxy routes for list, create, download, delete, restore
    - Use environment variables for VPS API URL and token
    - _Requirements: 2.1, 3.1, 4.2, 5.2_

  - [x] 1.2 Register backup proxy routes
    - Add export to `packages/vps-admin/src/routes/index.ts`
    - Register routes in main application
    - _Requirements: 2.1_

  - [x] 1.3 Write unit tests for proxy routes
    - Test authentication forwarding
    - Test error handling
    - _Requirements: 2.3, 4.4, 5.4_

- [x] 2. Add backup management UI to frontend

  - [x] 2.1 Add backup section HTML to frontend template
    - Add backup card section with stats display
    - Add backup list table structure
    - Add action buttons (create, restore)
    - _Requirements: 1.1, 1.2, 6.1, 6.2_

  - [x] 2.2 Add backup section CSS styles
    - Style backup stats display
    - Style action buttons
    - Style backup table
    - _Requirements: 1.1_

  - [x] 2.3 Implement loadBackups JavaScript function
    - Fetch backup list from proxy API
    - Render backup table
    - Update stats display
    - Handle empty list case
    - _Requirements: 1.2, 1.3, 6.1, 6.2_

  - [x] 2.4 Implement createBackup JavaScript function
    - Call create backup API
    - Show loading state
    - Refresh list on success
    - Show error on failure
    - _Requirements: 2.1, 2.2, 2.3_

  - [x] 2.5 Implement downloadBackup JavaScript function
    - Trigger file download via browser
    - Use original filename
    - _Requirements: 3.1, 3.2_

  - [x] 2.6 Implement deleteBackup JavaScript function
    - Show confirmation dialog
    - Call delete API
    - Refresh list on success
    - Show error on failure
    - _Requirements: 5.1, 5.2, 5.3, 5.4_

  - [x] 2.7 Implement restore backup UI
    - Add restore modal with file input
    - Show confirmation warning
    - Upload file to restore API
    - Show success/error message
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5_

  - [x] 2.8 Implement formatSize utility function
    - Convert bytes to human-readable format
    - Support B, KB, MB, GB units
    - _Requirements: 6.2_

  - [x] 2.9 Write property test for formatSize function
    - **Property 3: Size Formatting Correctness**
    - **Validates: Requirements 6.2**

- [x] 3. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 4. Integration and testing

  - [x] 4.1 Add environment variables to vps-admin config
    - Add VPS_API_URL configuration
    - Add API_TOKEN configuration
    - _Requirements: 2.1_

  - [x] 4.2 Update docker-compose for vps-admin
    - Add VPS_API_URL environment variable
    - Add API_TOKEN environment variable
    - _Requirements: 2.1_

- [x] 5. Final Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.
