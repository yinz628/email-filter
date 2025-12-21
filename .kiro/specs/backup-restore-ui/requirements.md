# Requirements Document

## Introduction

This feature adds a backup management user interface to the Email Filter admin panel. Users can create, view, download, restore, and delete database backups through a visual interface integrated into the existing admin panel at `/admin`. The UI communicates with the existing backup API endpoints in the VPS API service.

## Glossary

- **Admin Panel**: The web-based management interface served by vps-admin on port 3001
- **Backup**: A compressed (.gz) archive containing the SQLite database file
- **VPS API**: The main Email Filter API service running on port 3000 that provides backup endpoints
- **Pre-restore Backup**: An automatic backup created before any restore operation

## Requirements

### Requirement 1

**User Story:** As a system administrator, I want to see a backup management section in the admin panel, so that I can manage database backups visually.

#### Acceptance Criteria

1. WHEN a user navigates to the admin panel THEN the Admin Panel SHALL display a "数据库备份" (Database Backup) section
2. WHEN the backup section is displayed THEN the Admin Panel SHALL show a list of existing backups with filename, size, and creation date
3. WHEN the backup list is empty THEN the Admin Panel SHALL display a message indicating no backups exist

### Requirement 2

**User Story:** As a system administrator, I want to create a new backup from the UI, so that I can easily preserve my data.

#### Acceptance Criteria

1. WHEN a user clicks the "创建备份" (Create Backup) button THEN the Admin Panel SHALL call the VPS API backup create endpoint
2. WHEN a backup is created successfully THEN the Admin Panel SHALL refresh the backup list and show a success message
3. IF the backup creation fails THEN the Admin Panel SHALL display an error message with the failure reason

### Requirement 3

**User Story:** As a system administrator, I want to download a backup file from the UI, so that I can store it externally.

#### Acceptance Criteria

1. WHEN a user clicks the download button for a backup THEN the Admin Panel SHALL initiate a file download from the VPS API
2. WHEN downloading a backup THEN the Admin Panel SHALL use the original filename for the downloaded file

### Requirement 4

**User Story:** As a system administrator, I want to restore from a backup file through the UI, so that I can recover data easily.

#### Acceptance Criteria

1. WHEN a user clicks the "恢复备份" (Restore Backup) button THEN the Admin Panel SHALL display a file upload dialog
2. WHEN a user selects a backup file THEN the Admin Panel SHALL upload it to the VPS API restore endpoint
3. WHEN a restore completes successfully THEN the Admin Panel SHALL show a success message with the pre-restore backup filename
4. IF the restore fails THEN the Admin Panel SHALL display an error message with the failure reason
5. WHEN initiating a restore THEN the Admin Panel SHALL show a confirmation dialog warning about data replacement

### Requirement 5

**User Story:** As a system administrator, I want to delete old backups from the UI, so that I can manage storage space.

#### Acceptance Criteria

1. WHEN a user clicks the delete button for a backup THEN the Admin Panel SHALL show a confirmation dialog
2. WHEN the user confirms deletion THEN the Admin Panel SHALL call the VPS API delete endpoint
3. WHEN deletion succeeds THEN the Admin Panel SHALL refresh the backup list and show a success message
4. IF deletion fails THEN the Admin Panel SHALL display an error message

### Requirement 6

**User Story:** As a system administrator, I want the backup UI to show storage statistics, so that I can monitor backup usage.

#### Acceptance Criteria

1. WHEN the backup section is displayed THEN the Admin Panel SHALL show the total number of backups
2. WHEN the backup section is displayed THEN the Admin Panel SHALL show the total size of all backups in human-readable format
