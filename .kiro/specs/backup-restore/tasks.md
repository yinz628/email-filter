# Implementation Plan

- [x] 1. Create BackupService core implementation





  - [x] 1.1 Create backup service file with BackupService class


    - Create `packages/vps-api/src/services/backup.service.ts`
    - Implement constructor with dbPath and backupDir parameters
    - Implement `ensureBackupDir()` method to create backup directory if not exists
    - Implement `generateBackupFilename(prefix)` method for timestamp-based naming
    - _Requirements: 1.2, 1.3, 1.5_

  - [x] 1.2 Implement createBackup method

    - Read database file and compress with gzip
    - Write compressed file to backup directory
    - Return metadata (filename, size, createdAt)
    - _Requirements: 1.1, 1.4_
  - [x] 1.3 Write property test for backup creation


    - **Property 1: Backup Round-Trip Consistency**
    - **Validates: Requirements 1.1, 3.1, 6.3**
  - [x] 1.4 Implement validateBackup method

    - Decompress gzip data
    - Verify decompressed data is valid SQLite database (check magic bytes)
    - Return validation result with error message if invalid
    - _Requirements: 3.1, 6.3_

  - [x] 1.5 Write property test for invalid backup rejection

    - **Property 2: Invalid Backup Rejection**
    - **Validates: Requirements 3.1, 3.5**
  - [x] 1.6 Implement restoreBackup method

    - Validate uploaded backup file
    - Create pre-restore backup of current database
    - Close database connection (via callback)
    - Replace database file with restored data
    - Reinitialize database connection (via callback)
    - Handle rollback on failure
    - _Requirements: 3.2, 3.3, 3.4, 3.5, 3.6_


  - [x] 1.7 Implement listBackups method


    - Read backup directory contents
    - Get file stats (size, mtime) for each file
    - Sort by creation date descending
    - Calculate total count and size
    - _Requirements: 4.1, 4.2, 4.3_
  - [x] 1.8 Write property test for list sorting and aggregation


    - **Property 3: Backup List Sorting**
    - **Property 4: Backup List Aggregation**
    - **Validates: Requirements 4.2, 4.3**
  - [x] 1.9 Implement deleteBackup and getBackupPath methods

    - Delete specified backup file
    - Return full path for download
    - Handle file not found errors
    - _Requirements: 5.1, 5.3, 2.3_

- [x] 2. Checkpoint - Ensure all tests pass





  - Ensure all tests pass, ask the user if questions arise.

- [x] 3. Create backup routes





  - [x] 3.1 Create backup routes file


    - Create `packages/vps-api/src/routes/backup.ts`
    - Register authMiddleware for all routes
    - Initialize BackupService with config paths
    - _Requirements: 6.1_

  - [x] 3.2 Implement POST /create endpoint
    - Call BackupService.createBackup()
    - Return success response with backup metadata
    - Handle errors with appropriate status codes
    - _Requirements: 1.1, 1.4_
  - [x] 3.3 Implement GET /list endpoint
    - Call BackupService.listBackups()
    - Return list with totalCount and totalSize
    - _Requirements: 4.1, 4.2, 4.3_
  - [x] 3.4 Implement GET /download/:filename endpoint
    - Validate filename parameter
    - Get backup file path from service
    - Stream file with correct headers (Content-Type, Content-Disposition)
    - Return 404 if file not found
    - _Requirements: 2.1, 2.2, 2.3_
  - [x] 3.5 Implement POST /restore endpoint
    - Register @fastify/multipart for file upload
    - Parse uploaded file
    - Call BackupService.restoreBackup() with database callbacks
    - Return success response with pre-restore backup filename
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5_
  - [x] 3.6 Implement DELETE /:filename endpoint
    - Validate filename parameter
    - Call BackupService.deleteBackup()
    - Return success or 404 response
    - _Requirements: 5.1, 5.2, 5.3_
  - [x] 3.7 Write unit tests for backup routes


    - Test authentication requirement for all endpoints
    - Test success responses
    - Test error responses (404, 400)
    - _Requirements: 6.1, 2.3, 3.5, 5.3_

- [x] 4. Integrate backup routes into application





  - [x] 4.1 Export backup routes from routes index


    - Add export to `packages/vps-api/src/routes/index.ts`
  - [x] 4.2 Register backup routes in main application


    - Add route registration in `packages/vps-api/src/index.ts`
    - Register at prefix `/api/admin/backup`
  - [x] 4.3 Install @fastify/multipart dependency


    - Add to package.json dependencies
    - Run pnpm install

- [x] 5. Final Checkpoint - Ensure all tests pass





  - Ensure all tests pass, ask the user if questions arise.
