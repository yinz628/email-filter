# Requirements Document

## Introduction

This feature provides database backup and restore functionality for the Email Filter system. Users can create backups of their SQLite database (filter.db), download backup files, and restore from previously created backups through the admin panel settings page. This enables data migration between VPS instances and disaster recovery.

The backup functionality integrates with the existing admin panel at `/admin` and follows the same authentication patterns used by other admin routes (JWT authentication via `authMiddleware`).

## Glossary

- **Backup**: A compressed (.gz) archive containing the SQLite database file (filter.db)
- **Restore**: The process of replacing the current database with data from a backup file
- **VPS API**: The main Email Filter API service running on port 3000, built with Fastify
- **SQLite Database**: The better-sqlite3 database file (filter.db) storing all filter rules, worker instances, monitoring rules, campaigns, users, and settings
- **Backup Directory**: A dedicated directory (`./data/backups/`) for storing backup files
- **Pre-restore Backup**: An automatic backup created before any restore operation to enable rollback

## Requirements

### Requirement 1

**User Story:** As a system administrator, I want to create a backup of my database, so that I can preserve my data before making changes or migrating to another server.

#### Acceptance Criteria

1. WHEN a user requests a backup via POST /api/admin/backup/create THEN the VPS API SHALL create a gzip-compressed copy of the SQLite database file
2. WHEN a backup is created THEN the VPS API SHALL name the file with format `backup-YYYYMMDD-HHmmss.db.gz`
3. WHEN a backup is created THEN the VPS API SHALL store the file in the backup directory (`./data/backups/`)
4. WHEN a backup is created successfully THEN the VPS API SHALL return the backup metadata including filename, size, and creation timestamp
5. IF the backup directory does not exist THEN the VPS API SHALL create it automatically

### Requirement 2

**User Story:** As a system administrator, I want to download a backup file, so that I can store it externally or transfer it to another server.

#### Acceptance Criteria

1. WHEN a user requests to download a backup via GET /api/admin/backup/download/:filename THEN the VPS API SHALL return the backup file as a binary stream
2. WHEN downloading a backup THEN the VPS API SHALL set appropriate Content-Type and Content-Disposition headers
3. IF the requested backup file does not exist THEN the VPS API SHALL return a 404 error

### Requirement 3

**User Story:** As a system administrator, I want to restore my database from a backup file, so that I can recover data or migrate to a new server.

#### Acceptance Criteria

1. WHEN a user uploads a backup file via POST /api/admin/backup/restore THEN the VPS API SHALL validate the file is a valid gzip-compressed SQLite database
2. WHEN a restore is initiated THEN the VPS API SHALL create a pre-restore backup named `pre-restore-YYYYMMDD-HHmmss.db.gz`
3. WHEN a restore completes successfully THEN the VPS API SHALL close the current database connection, replace the database file, and reinitialize the connection
4. WHEN a restore completes successfully THEN the VPS API SHALL return a success message with the pre-restore backup filename
5. IF the uploaded file is not a valid backup THEN the VPS API SHALL reject the restore and return a 400 error with description
6. IF a restore operation fails after replacing the database THEN the VPS API SHALL attempt to restore from the pre-restore backup

### Requirement 4

**User Story:** As a system administrator, I want to view a list of available backups, so that I can manage my backup history.

#### Acceptance Criteria

1. WHEN a user requests the backup list via GET /api/admin/backup/list THEN the VPS API SHALL return all backup files with filename, size in bytes, and creation timestamp
2. WHEN displaying backup information THEN the VPS API SHALL sort backups by creation date in descending order (newest first)
3. WHEN returning backup list THEN the VPS API SHALL include the total count and total size of all backups

### Requirement 5

**User Story:** As a system administrator, I want to delete old backups, so that I can manage storage space on my server.

#### Acceptance Criteria

1. WHEN a user requests to delete a backup via DELETE /api/admin/backup/:filename THEN the VPS API SHALL remove the specified backup file from the backup directory
2. WHEN a backup deletion succeeds THEN the VPS API SHALL return a success confirmation with the deleted filename
3. IF the specified backup file does not exist THEN the VPS API SHALL return a 404 error

### Requirement 6

**User Story:** As a system administrator, I want backup operations to be secure, so that unauthorized users cannot access or modify my data.

#### Acceptance Criteria

1. WHEN any backup endpoint is accessed THEN the VPS API SHALL require valid JWT authentication via authMiddleware
2. WHEN a backup file is stored THEN the VPS API SHALL place it in a directory not served by static file routes
3. WHEN validating a backup file for restore THEN the VPS API SHALL verify the file can be decompressed and opened as a valid SQLite database
