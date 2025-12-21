# Design Document: Backup and Restore

## Overview

This feature adds database backup and restore functionality to the Email Filter VPS API. It allows administrators to create compressed backups of the SQLite database, download them for external storage, restore from backup files, and manage backup history through the admin panel.

The implementation follows the existing patterns in the codebase:
- Route module in `packages/vps-api/src/routes/backup.ts`
- Service module in `packages/vps-api/src/services/backup.service.ts`
- Integration with existing `authMiddleware` for JWT authentication
- Uses Node.js built-in `zlib` for gzip compression/decompression

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Admin Panel UI                            │
│                    (Settings > Backup/Restore)                   │
└─────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                     Fastify Routes Layer                         │
│                  /api/admin/backup/*                             │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌────────┐ │
│  │  create  │ │ download │ │ restore  │ │   list   │ │ delete │ │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘ └────────┘ │
└─────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                      BackupService                               │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │ - createBackup(): Create gzip backup of database           │ │
│  │ - restoreBackup(): Restore database from backup file       │ │
│  │ - listBackups(): List all backup files with metadata       │ │
│  │ - deleteBackup(): Remove a backup file                     │ │
│  │ - validateBackup(): Verify backup file integrity           │ │
│  │ - getBackupPath(): Get full path to backup file            │ │
│  └────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                     File System Layer                            │
│  ┌────────────────────┐    ┌────────────────────────────────┐   │
│  │   ./data/filter.db │    │   ./data/backups/              │   │
│  │   (Active Database)│    │   - backup-20251221-120000.db.gz│  │
│  └────────────────────┘    │   - pre-restore-*.db.gz        │   │
│                            └────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

## Components and Interfaces

### BackupService

```typescript
interface BackupMetadata {
  filename: string;
  size: number;
  createdAt: string;
  isPreRestore: boolean;
}

interface BackupListResult {
  backups: BackupMetadata[];
  totalCount: number;
  totalSize: number;
}

interface CreateBackupResult {
  success: boolean;
  filename: string;
  size: number;
  createdAt: string;
}

interface RestoreBackupResult {
  success: boolean;
  preRestoreBackup: string;
  restoredFrom: string;
}

class BackupService {
  constructor(dbPath: string, backupDir: string);
  
  // Create a gzip-compressed backup of the database
  createBackup(prefix?: string): Promise<CreateBackupResult>;
  
  // Restore database from a backup file (Buffer from upload)
  restoreBackup(backupData: Buffer, closeDb: () => void, initDb: () => void): Promise<RestoreBackupResult>;
  
  // List all backup files with metadata
  listBackups(): BackupListResult;
  
  // Delete a specific backup file
  deleteBackup(filename: string): boolean;
  
  // Validate a backup file (check if valid gzip + SQLite)
  validateBackup(backupData: Buffer): Promise<{ valid: boolean; error?: string }>;
  
  // Get full path to a backup file
  getBackupPath(filename: string): string | null;
  
  // Ensure backup directory exists
  ensureBackupDir(): void;
}
```

### Route Handlers

```typescript
// POST /api/admin/backup/create
// Creates a new backup and returns metadata
interface CreateBackupResponse {
  success: boolean;
  backup: BackupMetadata;
  message: string;
}

// GET /api/admin/backup/list
// Returns list of all backups
interface ListBackupsResponse {
  success: boolean;
  backups: BackupMetadata[];
  totalCount: number;
  totalSize: number;
}

// GET /api/admin/backup/download/:filename
// Returns binary stream of backup file

// POST /api/admin/backup/restore
// Multipart form upload with backup file
interface RestoreBackupResponse {
  success: boolean;
  preRestoreBackup: string;
  restoredFrom: string;
  message: string;
}

// DELETE /api/admin/backup/:filename
// Deletes a backup file
interface DeleteBackupResponse {
  success: boolean;
  deleted: string;
  message: string;
}
```

## Data Models

### Backup File Naming Convention

```
backup-YYYYMMDD-HHmmss.db.gz      # Regular backup
pre-restore-YYYYMMDD-HHmmss.db.gz # Auto-backup before restore
```

### Backup Directory Structure

```
./data/
├── filter.db                      # Active database
└── backups/
    ├── backup-20251221-120000.db.gz
    ├── backup-20251220-150000.db.gz
    └── pre-restore-20251221-130000.db.gz
```



## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system-essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Backup Round-Trip Consistency

*For any* valid SQLite database state, creating a backup and then restoring from that backup SHALL produce a database with identical content to the original.

This is the most critical property - it ensures data integrity through the backup/restore cycle.

**Validates: Requirements 1.1, 3.1, 6.3**

### Property 2: Invalid Backup Rejection

*For any* byte sequence that is NOT a valid gzip-compressed SQLite database, the restore operation SHALL reject it with an error and leave the current database unchanged.

This ensures the system properly validates backup files before attempting restore.

**Validates: Requirements 3.1, 3.5**

### Property 3: Backup List Sorting

*For any* set of backup files in the backup directory, the list endpoint SHALL return them sorted by creation timestamp in descending order (newest first).

**Validates: Requirements 4.2**

### Property 4: Backup List Aggregation

*For any* set of backup files in the backup directory, the totalCount SHALL equal the number of files and totalSize SHALL equal the sum of all file sizes.

**Validates: Requirements 4.3**

## Error Handling

| Error Condition | HTTP Status | Error Message |
|----------------|-------------|---------------|
| Unauthenticated request | 401 | "Authentication required" |
| Backup file not found | 404 | "Backup file not found" |
| Invalid backup file format | 400 | "Invalid backup file: not a valid gzip archive" |
| Invalid SQLite database | 400 | "Invalid backup file: not a valid SQLite database" |
| File system error | 500 | "Failed to create/restore backup: {error}" |
| Database locked | 500 | "Database is currently locked" |

## Testing Strategy

### Dual Testing Approach

This feature uses both unit tests and property-based tests:

- **Unit tests**: Verify specific examples, edge cases, and API response structures
- **Property-based tests**: Verify universal properties that should hold across all inputs

### Property-Based Testing

**Library**: fast-check (already used in the project)

**Configuration**: Each property test runs minimum 100 iterations.

**Properties to Test**:

1. **Round-trip property**: For any database content, backup then restore produces identical data
2. **Invalid input rejection**: For any non-valid backup data, restore rejects with error
3. **List sorting**: For any set of backups, list returns them in descending date order
4. **List aggregation**: For any set of backups, counts and sizes are accurate

### Unit Tests

1. **Create backup**
   - Creates file with correct naming format
   - File is valid gzip
   - Returns correct metadata

2. **Download backup**
   - Returns correct Content-Type header
   - Returns correct Content-Disposition header
   - Returns 404 for non-existent file

3. **Restore backup**
   - Creates pre-restore backup
   - Database is accessible after restore
   - Returns 400 for invalid file

4. **List backups**
   - Returns all backup files
   - Includes correct metadata for each file

5. **Delete backup**
   - Removes file from disk
   - Returns 404 for non-existent file

6. **Authentication**
   - All endpoints reject unauthenticated requests

### Test File Location

- `packages/vps-api/src/services/backup.service.test.ts` - Service unit tests and property tests
- `packages/vps-api/src/routes/backup.test.ts` - Route integration tests
