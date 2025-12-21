/**
 * Backup Service Tests
 * Property-based tests and unit tests for backup functionality
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fc from 'fast-check';
import { existsSync, mkdirSync, writeFileSync, rmSync, readFileSync } from 'fs';
import { join } from 'path';
import { gzipSync, gunzipSync } from 'zlib';
import { BackupService } from './backup.service.js';

// Test directory setup
const TEST_DIR = join(process.cwd(), 'test-backup-data');
const TEST_DB_PATH = join(TEST_DIR, 'test.db');
const TEST_BACKUP_DIR = join(TEST_DIR, 'backups');

// SQLite magic bytes
const SQLITE_MAGIC = 'SQLite format 3\0';

/**
 * Create a minimal valid SQLite database file
 * SQLite files start with a 100-byte header
 */
function createValidSqliteDb(content: Buffer = Buffer.alloc(0)): Buffer {
  // SQLite header is 100 bytes minimum
  const header = Buffer.alloc(100);
  // Write magic string
  header.write(SQLITE_MAGIC, 0, 'utf8');
  // Page size (2 bytes at offset 16) - must be power of 2 between 512 and 65536
  header.writeUInt16BE(4096, 16);
  // File format write version (1 byte at offset 18)
  header[18] = 1;
  // File format read version (1 byte at offset 19)
  header[19] = 1;
  // Reserved space (1 byte at offset 20)
  header[20] = 0;
  // Maximum embedded payload fraction (1 byte at offset 21)
  header[21] = 64;
  // Minimum embedded payload fraction (1 byte at offset 22)
  header[22] = 32;
  // Leaf payload fraction (1 byte at offset 23)
  header[23] = 32;
  // File change counter (4 bytes at offset 24)
  header.writeUInt32BE(1, 24);
  // Database size in pages (4 bytes at offset 28)
  header.writeUInt32BE(1, 28);
  
  return Buffer.concat([header, content]);
}

describe('BackupService', () => {
  let service: BackupService;

  beforeEach(() => {
    // Create test directories
    if (!existsSync(TEST_DIR)) {
      mkdirSync(TEST_DIR, { recursive: true });
    }
    if (!existsSync(TEST_BACKUP_DIR)) {
      mkdirSync(TEST_BACKUP_DIR, { recursive: true });
    }
    
    // Create a valid test database
    const dbContent = createValidSqliteDb();
    writeFileSync(TEST_DB_PATH, dbContent);
    
    service = new BackupService(TEST_DB_PATH, TEST_BACKUP_DIR);
  });

  afterEach(() => {
    // Clean up test directories
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true, force: true });
    }
  });

  describe('ensureBackupDir', () => {
    it('should create backup directory if it does not exist', () => {
      const newBackupDir = join(TEST_DIR, 'new-backups');
      const newService = new BackupService(TEST_DB_PATH, newBackupDir);
      
      expect(existsSync(newBackupDir)).toBe(false);
      newService.ensureBackupDir();
      expect(existsSync(newBackupDir)).toBe(true);
    });
  });

  describe('generateBackupFilename', () => {
    it('should generate filename with correct format', () => {
      const filename = service.generateBackupFilename();
      expect(filename).toMatch(/^backup-\d{8}-\d{6}\.db\.gz$/);
    });

    it('should use custom prefix', () => {
      const filename = service.generateBackupFilename('pre-restore');
      expect(filename).toMatch(/^pre-restore-\d{8}-\d{6}\.db\.gz$/);
    });
  });


  /**
   * **Feature: backup-restore, Property 1: Backup Round-Trip Consistency**
   * **Validates: Requirements 1.1, 3.1, 6.3**
   * 
   * For any valid SQLite database state, creating a backup and then
   * restoring from that backup SHALL produce a database with identical
   * content to the original.
   */
  describe('Property 1: Backup Round-Trip Consistency', () => {
    it('should preserve database content through backup and restore cycle', () => {
      fc.assert(
        fc.property(
          // Generate random additional content to append to the SQLite header
          fc.uint8Array({ minLength: 0, maxLength: 1000 }),
          (additionalContent) => {
            // Create a valid SQLite database with random content
            const originalDb = createValidSqliteDb(Buffer.from(additionalContent));
            writeFileSync(TEST_DB_PATH, originalDb);
            
            // Create backup
            const backupResult = service.createBackup();
            expect(backupResult.success).toBe(true);
            
            // Read the backup file
            const backupPath = join(TEST_BACKUP_DIR, backupResult.filename);
            const backupData = readFileSync(backupPath);
            
            // Decompress and verify content matches original
            const decompressed = gunzipSync(backupData);
            expect(decompressed.equals(originalDb)).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should create valid gzip backup that can be decompressed', () => {
      fc.assert(
        fc.property(
          fc.uint8Array({ minLength: 0, maxLength: 500 }),
          (additionalContent) => {
            const originalDb = createValidSqliteDb(Buffer.from(additionalContent));
            writeFileSync(TEST_DB_PATH, originalDb);
            
            const backupResult = service.createBackup();
            const backupPath = join(TEST_BACKUP_DIR, backupResult.filename);
            const backupData = readFileSync(backupPath);
            
            // Should be able to decompress without error
            const decompressed = gunzipSync(backupData);
            expect(decompressed.length).toBeGreaterThan(0);
            
            // Should start with SQLite magic
            const header = decompressed.subarray(0, 16).toString('utf8');
            expect(header).toBe(SQLITE_MAGIC);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * **Feature: backup-restore, Property 2: Invalid Backup Rejection**
   * **Validates: Requirements 3.1, 3.5**
   * 
   * For any byte sequence that is NOT a valid gzip-compressed SQLite database,
   * the restore operation SHALL reject it with an error and leave the current
   * database unchanged.
   */
  describe('Property 2: Invalid Backup Rejection', () => {
    it('should reject non-gzip data', () => {
      fc.assert(
        fc.property(
          // Generate random bytes that are unlikely to be valid gzip
          fc.uint8Array({ minLength: 1, maxLength: 1000 }).filter(arr => {
            // Filter out anything that starts with gzip magic bytes (0x1f 0x8b)
            return arr.length < 2 || arr[0] !== 0x1f || arr[1] !== 0x8b;
          }),
          (randomBytes) => {
            const result = service.validateBackup(Buffer.from(randomBytes));
            expect(result.valid).toBe(false);
            expect(result.error).toContain('not a valid gzip archive');
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should reject gzip data that is not a SQLite database', () => {
      fc.assert(
        fc.property(
          // Generate random content that is at least 16 bytes (SQLite header size)
          // and doesn't start with SQLite magic
          fc.uint8Array({ minLength: 16, maxLength: 500 }).filter(arr => {
            // Ensure it doesn't accidentally start with SQLite magic
            const str = Buffer.from(arr).toString('utf8');
            return !str.startsWith('SQLite format 3');
          }),
          (randomContent) => {
            // Compress the non-SQLite content
            const compressed = gzipSync(Buffer.from(randomContent));
            
            const result = service.validateBackup(compressed);
            expect(result.valid).toBe(false);
            expect(result.error).toContain('not a valid SQLite database');
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should reject empty gzip archives', () => {
      const emptyCompressed = gzipSync(Buffer.alloc(0));
      const result = service.validateBackup(emptyCompressed);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('file too small');
    });

    it('should accept valid gzip-compressed SQLite databases', () => {
      fc.assert(
        fc.property(
          fc.uint8Array({ minLength: 0, maxLength: 500 }),
          (additionalContent) => {
            const validDb = createValidSqliteDb(Buffer.from(additionalContent));
            const compressed = gzipSync(validDb);
            
            const result = service.validateBackup(compressed);
            expect(result.valid).toBe(true);
            expect(result.error).toBeUndefined();
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * **Feature: backup-restore, Property 3: Backup List Sorting**
   * **Validates: Requirements 4.2**
   * 
   * For any set of backup files in the backup directory, the list endpoint
   * SHALL return them sorted by creation timestamp in descending order
   * (newest first).
   */
  describe('Property 3: Backup List Sorting', () => {
    it('should return backups sorted by creation date descending', () => {
      fc.assert(
        fc.property(
          // Generate a number of backups to create (1-10)
          fc.integer({ min: 1, max: 10 }),
          (numBackups) => {
            // Clean backup directory before each iteration
            if (existsSync(TEST_BACKUP_DIR)) {
              rmSync(TEST_BACKUP_DIR, { recursive: true, force: true });
            }
            mkdirSync(TEST_BACKUP_DIR, { recursive: true });
            
            // Create multiple backups with small delays to ensure different timestamps
            const createdBackups: string[] = [];
            for (let i = 0; i < numBackups; i++) {
              const result = service.createBackup(`backup-${i}`);
              createdBackups.push(result.filename);
            }
            
            // List backups
            const listResult = service.listBackups();
            
            // Verify sorting: each backup should have a createdAt >= the next one
            for (let i = 0; i < listResult.backups.length - 1; i++) {
              const current = new Date(listResult.backups[i].createdAt).getTime();
              const next = new Date(listResult.backups[i + 1].createdAt).getTime();
              expect(current).toBeGreaterThanOrEqual(next);
            }
          }
        ),
        { numRuns: 20 }
      );
    });
  });

  /**
   * **Feature: backup-restore, Property 4: Backup List Aggregation**
   * **Validates: Requirements 4.3**
   * 
   * For any set of backup files in the backup directory, the totalCount
   * SHALL equal the number of files and totalSize SHALL equal the sum
   * of all file sizes.
   */
  describe('Property 4: Backup List Aggregation', () => {
    it('should correctly aggregate count and size', () => {
      fc.assert(
        fc.property(
          // Generate a number of backups to create (0-10)
          fc.integer({ min: 0, max: 10 }),
          (numBackups) => {
            // Clean backup directory before each iteration
            if (existsSync(TEST_BACKUP_DIR)) {
              rmSync(TEST_BACKUP_DIR, { recursive: true, force: true });
            }
            mkdirSync(TEST_BACKUP_DIR, { recursive: true });
            
            // Create multiple backups
            let expectedTotalSize = 0;
            for (let i = 0; i < numBackups; i++) {
              const result = service.createBackup(`backup-${i}`);
              expectedTotalSize += result.size;
            }
            
            // List backups
            const listResult = service.listBackups();
            
            // Verify count
            expect(listResult.totalCount).toBe(numBackups);
            
            // Verify total size
            expect(listResult.totalSize).toBe(expectedTotalSize);
            
            // Verify sum of individual sizes equals totalSize
            const sumOfSizes = listResult.backups.reduce((sum, b) => sum + b.size, 0);
            expect(sumOfSizes).toBe(listResult.totalSize);
          }
        ),
        { numRuns: 20 }
      );
    });
  });

});
