/**
 * Backup Service for VPS API
 * Handles database backup creation, restoration, listing, and deletion
 * 
 * Requirements: 1.1-1.5, 2.1-2.3, 3.1-3.6, 4.1-4.3, 5.1-5.3, 6.1-6.3
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync, statSync, unlinkSync } from 'fs';
import { join, basename } from 'path';
import { gzipSync, gunzipSync } from 'zlib';

/**
 * Metadata for a backup file
 */
export interface BackupMetadata {
  filename: string;
  size: number;
  createdAt: string;
  isPreRestore: boolean;
}

/**
 * Result of listing backups
 */
export interface BackupListResult {
  backups: BackupMetadata[];
  totalCount: number;
  totalSize: number;
}

/**
 * Result of creating a backup
 */
export interface CreateBackupResult {
  success: boolean;
  filename: string;
  size: number;
  createdAt: string;
}

/**
 * Result of restoring a backup
 */
export interface RestoreBackupResult {
  success: boolean;
  preRestoreBackup: string;
  restoredFrom: string;
}

/**
 * Result of validating a backup
 */
export interface ValidateBackupResult {
  valid: boolean;
  error?: string;
}

// SQLite database magic bytes (first 16 bytes of a valid SQLite file)
const SQLITE_MAGIC = 'SQLite format 3\0';

/**
 * BackupService class for managing database backups
 */
export class BackupService {
  constructor(
    private readonly dbPath: string,
    private readonly backupDir: string
  ) {}

  /**
   * Ensure the backup directory exists
   * Creates it if it doesn't exist
   * Requirements: 1.5
   */
  ensureBackupDir(): void {
    if (!existsSync(this.backupDir)) {
      mkdirSync(this.backupDir, { recursive: true });
    }
  }

  /**
   * Generate a backup filename with timestamp
   * Format: {prefix}-YYYYMMDD-HHmmss.db.gz
   * Requirements: 1.2
   */
  generateBackupFilename(prefix: string = 'backup'): string {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');
    
    return `${prefix}-${year}${month}${day}-${hours}${minutes}${seconds}.db.gz`;
  }


  /**
   * Create a gzip-compressed backup of the database
   * Requirements: 1.1, 1.4
   */
  createBackup(prefix: string = 'backup'): CreateBackupResult {
    this.ensureBackupDir();
    
    // Read the database file
    const dbData = readFileSync(this.dbPath);
    
    // Compress with gzip
    const compressed = gzipSync(dbData);
    
    // Generate filename and write to backup directory
    const filename = this.generateBackupFilename(prefix);
    const backupPath = join(this.backupDir, filename);
    writeFileSync(backupPath, compressed);
    
    // Get file stats for metadata
    const stats = statSync(backupPath);
    
    return {
      success: true,
      filename,
      size: stats.size,
      createdAt: stats.mtime.toISOString(),
    };
  }

  /**
   * Validate a backup file
   * Checks if it's a valid gzip-compressed SQLite database
   * Requirements: 3.1, 6.3
   */
  validateBackup(backupData: Buffer): ValidateBackupResult {
    try {
      // Try to decompress
      let decompressed: Buffer;
      try {
        decompressed = gunzipSync(backupData);
      } catch {
        return {
          valid: false,
          error: 'Invalid backup file: not a valid gzip archive',
        };
      }
      
      // Check SQLite magic bytes
      if (decompressed.length < 16) {
        return {
          valid: false,
          error: 'Invalid backup file: file too small to be a SQLite database',
        };
      }
      
      const header = decompressed.subarray(0, 16).toString('utf8');
      if (header !== SQLITE_MAGIC) {
        return {
          valid: false,
          error: 'Invalid backup file: not a valid SQLite database',
        };
      }
      
      return { valid: true };
    } catch (error) {
      return {
        valid: false,
        error: `Invalid backup file: ${error instanceof Error ? error.message : 'unknown error'}`,
      };
    }
  }

  /**
   * Restore database from a backup file
   * Requirements: 3.2, 3.3, 3.4, 3.5, 3.6
   */
  restoreBackup(
    backupData: Buffer,
    closeDb: () => void,
    initDb: () => void
  ): RestoreBackupResult {
    // Validate the backup first
    const validation = this.validateBackup(backupData);
    if (!validation.valid) {
      throw new Error(validation.error);
    }
    
    // Create pre-restore backup
    const preRestoreResult = this.createBackup('pre-restore');
    
    // Decompress the backup data
    const decompressed = gunzipSync(backupData);
    
    // Store original database content for rollback
    const originalData = readFileSync(this.dbPath);
    
    try {
      // Close the database connection
      closeDb();
      
      // Replace the database file
      writeFileSync(this.dbPath, decompressed);
      
      // Reinitialize the database connection
      initDb();
      
      return {
        success: true,
        preRestoreBackup: preRestoreResult.filename,
        restoredFrom: 'uploaded backup',
      };
    } catch (error) {
      // Rollback: restore original database
      try {
        writeFileSync(this.dbPath, originalData);
        initDb();
      } catch {
        // If rollback fails, we're in a bad state
      }
      throw error;
    }
  }


  /**
   * List all backup files with metadata
   * Requirements: 4.1, 4.2, 4.3
   */
  listBackups(): BackupListResult {
    this.ensureBackupDir();
    
    const files = readdirSync(this.backupDir);
    const backups: BackupMetadata[] = [];
    let totalSize = 0;
    
    for (const file of files) {
      // Only include .db.gz files
      if (!file.endsWith('.db.gz')) {
        continue;
      }
      
      const filePath = join(this.backupDir, file);
      const stats = statSync(filePath);
      
      backups.push({
        filename: file,
        size: stats.size,
        createdAt: stats.mtime.toISOString(),
        isPreRestore: file.startsWith('pre-restore-'),
      });
      
      totalSize += stats.size;
    }
    
    // Sort by creation date descending (newest first)
    backups.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    
    return {
      backups,
      totalCount: backups.length,
      totalSize,
    };
  }

  /**
   * Delete a specific backup file
   * Requirements: 5.1, 5.3
   */
  deleteBackup(filename: string): boolean {
    const filePath = join(this.backupDir, filename);
    
    // Check if file exists
    if (!existsSync(filePath)) {
      return false;
    }
    
    // Ensure the file is within the backup directory (security check)
    const resolvedPath = join(this.backupDir, basename(filename));
    if (resolvedPath !== filePath) {
      return false;
    }
    
    unlinkSync(filePath);
    return true;
  }

  /**
   * Get full path to a backup file
   * Returns null if file doesn't exist
   * Requirements: 2.3
   */
  getBackupPath(filename: string): string | null {
    const filePath = join(this.backupDir, basename(filename));
    
    if (!existsSync(filePath)) {
      return null;
    }
    
    return filePath;
  }
}
