/**
 * SubjectStatsService Tests
 *
 * Property-based tests for email subject statistics tracking
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fc from 'fast-check';
import initSqlJs, { Database as SqlJsDatabase } from 'sql.js';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createHash, randomUUID } from 'crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

import type {
  TrackSubjectDTO,
  TrackSubjectResult,
  SubjectStatRow,
  SubjectStatsFilter,
  SubjectStatsList,
  AggregatedSubjectStat,
  WorkerSubjectStat,
} from '@email-filter/shared';

/**
 * Extract domain from email address (local implementation for testing)
 * Returns the domain portion after @ in lowercase
 */
function extractDomainFromEmail(email: string): string {
  if (!email || typeof email !== 'string') {
    return '';
  }
  
  const atIndex = email.lastIndexOf('@');
  if (atIndex === -1 || atIndex === email.length - 1) {
    return '';
  }
  
  return email.substring(atIndex + 1).toLowerCase().trim();
}

/**
 * Calculate SHA-256 hash for subject string (same as service)
 */
function calculateSubjectHash(subject: string): string {
  return createHash('sha256').update(subject).digest('hex');
}

/**
 * Test-specific SubjectStatsService that works with sql.js
 */
class TestSubjectStatsService {
  constructor(private db: SqlJsDatabase) {}

  trackSubject(data: TrackSubjectDTO): TrackSubjectResult {
    const { subject, sender, workerName, receivedAt } = data;

    if (!subject || typeof subject !== 'string') {
      throw new Error('Subject is required and must be a string');
    }
    if (!sender || typeof sender !== 'string') {
      throw new Error('Sender is required and must be a string');
    }
    if (!workerName || typeof workerName !== 'string') {
      throw new Error('Worker name is required and must be a string');
    }

    const subjectHash = calculateSubjectHash(subject);
    const merchantDomain = extractDomainFromEmail(sender);
    const now = receivedAt || new Date().toISOString();

    // Try to find existing record
    const result = this.db.exec(
      `SELECT id, email_count FROM subject_stats
       WHERE subject_hash = '${subjectHash}' AND merchant_domain = '${merchantDomain}' AND worker_name = '${workerName}'`
    );

    if (result.length > 0 && result[0].values.length > 0) {
      const existingId = result[0].values[0][0] as string;
      const existingCount = result[0].values[0][1] as number;

      // Update existing record
      this.db.run(
        `UPDATE subject_stats
         SET email_count = email_count + 1,
             last_seen_at = '${now}',
             updated_at = '${now}'
         WHERE id = '${existingId}'`
      );

      return {
        id: existingId,
        isNew: false,
        emailCount: existingCount + 1,
      };
    }

    // Create new record
    const id = randomUUID();
    this.db.run(
      `INSERT INTO subject_stats (
        id, subject, subject_hash, merchant_domain, worker_name,
        email_count, is_focused, first_seen_at, last_seen_at, created_at, updated_at
      ) VALUES ('${id}', '${subject.replace(/'/g, "''")}', '${subjectHash}', '${merchantDomain}', '${workerName}', 1, 0, '${now}', '${now}', '${now}', '${now}')`
    );

    return {
      id,
      isNew: true,
      emailCount: 1,
    };
  }

  getSubjectById(id: string): SubjectStatRow | null {
    const result = this.db.exec(`SELECT * FROM subject_stats WHERE id = '${id}'`);
    if (result.length === 0 || result[0].values.length === 0) {
      return null;
    }
    const row = result[0].values[0];
    const columns = result[0].columns;
    const obj: Record<string, unknown> = {};
    columns.forEach((col, i) => {
      obj[col] = row[i];
    });
    return obj as unknown as SubjectStatRow;
  }

  getSubjectByHash(subjectHash: string, merchantDomain: string, workerName: string): SubjectStatRow | null {
    const result = this.db.exec(
      `SELECT * FROM subject_stats 
       WHERE subject_hash = '${subjectHash}' AND merchant_domain = '${merchantDomain}' AND worker_name = '${workerName}'`
    );
    if (result.length === 0 || result[0].values.length === 0) {
      return null;
    }
    const row = result[0].values[0];
    const columns = result[0].columns;
    const obj: Record<string, unknown> = {};
    columns.forEach((col, i) => {
      obj[col] = row[i];
    });
    return obj as unknown as SubjectStatRow;
  }

  getAllSubjects(): SubjectStatRow[] {
    const result = this.db.exec('SELECT * FROM subject_stats');
    if (result.length === 0) return [];
    
    return result[0].values.map(row => {
      const columns = result[0].columns;
      const obj: Record<string, unknown> = {};
      columns.forEach((col, i) => {
        obj[col] = row[i];
      });
      return obj as unknown as SubjectStatRow;
    });
  }

  /**
   * Get subject statistics with filtering and pagination
   * Aggregates data across workers for display
   */
  getSubjectStats(filter?: SubjectStatsFilter): SubjectStatsList {
    const {
      workerName,
      isFocused,
      sortBy = 'lastSeenAt',
      sortOrder = 'desc',
      limit = 20,
      offset = 0,
    } = filter || {};

    // Build WHERE clause for filtering
    const conditions: string[] = [];

    if (workerName) {
      conditions.push(`worker_name = '${workerName}'`);
    }

    if (isFocused !== undefined) {
      conditions.push(`is_focused = ${isFocused ? 1 : 0}`);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // Get total count of unique subjects
    const countResult = this.db.exec(`
      SELECT COUNT(DISTINCT subject_hash || '|' || merchant_domain) as total
      FROM subject_stats
      ${whereClause}
    `);
    const total = countResult.length > 0 && countResult[0].values.length > 0 
      ? countResult[0].values[0][0] as number 
      : 0;

    // Map sortBy to SQL column
    const sortColumn = sortBy === 'emailCount' ? 'total_email_count' 
      : sortBy === 'firstSeenAt' ? 'first_seen' 
      : 'last_seen';
    const order = sortOrder === 'asc' ? 'ASC' : 'DESC';

    // Get aggregated subject stats with pagination
    const queryResult = this.db.exec(`
      SELECT 
        subject,
        subject_hash,
        merchant_domain,
        SUM(email_count) as total_email_count,
        MAX(is_focused) as is_focused,
        MIN(first_seen_at) as first_seen,
        MAX(last_seen_at) as last_seen
      FROM subject_stats
      ${whereClause}
      GROUP BY subject_hash, merchant_domain
      ORDER BY ${sortColumn} ${order}
      LIMIT ${limit} OFFSET ${offset}
    `);

    if (queryResult.length === 0) {
      return { items: [], total, limit, offset };
    }

    const columns = queryResult[0].columns;
    const rows = queryResult[0].values.map(row => {
      const obj: Record<string, unknown> = {};
      columns.forEach((col, i) => {
        obj[col] = row[i];
      });
      return obj as {
        subject: string;
        subject_hash: string;
        merchant_domain: string;
        total_email_count: number;
        is_focused: number;
        first_seen: string;
        last_seen: string;
      };
    });

    // For each aggregated subject, get worker breakdown
    const items: AggregatedSubjectStat[] = rows.map(row => {
      const workerQuery = workerName 
        ? `SELECT id, worker_name, email_count, last_seen_at
           FROM subject_stats
           WHERE subject_hash = '${row.subject_hash}' AND merchant_domain = '${row.merchant_domain}' AND worker_name = '${workerName}'
           ORDER BY email_count DESC`
        : `SELECT id, worker_name, email_count, last_seen_at
           FROM subject_stats
           WHERE subject_hash = '${row.subject_hash}' AND merchant_domain = '${row.merchant_domain}'
           ORDER BY email_count DESC`;
      
      const workerResult = this.db.exec(workerQuery);
      
      const workerStats: WorkerSubjectStat[] = workerResult.length > 0 
        ? workerResult[0].values.map(wr => ({
            id: wr[0] as string,
            workerName: wr[1] as string,
            emailCount: wr[2] as number,
            lastSeenAt: new Date(wr[3] as string),
          }))
        : [];

      return {
        subject: row.subject,
        subjectHash: row.subject_hash,
        merchantDomain: row.merchant_domain,
        totalEmailCount: row.total_email_count,
        isFocused: row.is_focused === 1,
        firstSeenAt: new Date(row.first_seen),
        lastSeenAt: new Date(row.last_seen),
        workerStats,
      };
    });

    return {
      items,
      total,
      limit,
      offset,
    };
  }

  /**
   * Get a single subject stat by ID with worker breakdown
   */
  getSubjectByIdAggregated(id: string): AggregatedSubjectStat | null {
    const result = this.db.exec(`SELECT * FROM subject_stats WHERE id = '${id}'`);
    if (result.length === 0 || result[0].values.length === 0) {
      return null;
    }
    
    const row = result[0].values[0];
    const columns = result[0].columns;
    const obj: Record<string, unknown> = {};
    columns.forEach((col, i) => {
      obj[col] = row[i];
    });
    const statRow = obj as unknown as SubjectStatRow;

    // Get all worker stats for this subject
    const workerResult = this.db.exec(`
      SELECT id, worker_name, email_count, last_seen_at
      FROM subject_stats
      WHERE subject_hash = '${statRow.subject_hash}' AND merchant_domain = '${statRow.merchant_domain}'
      ORDER BY email_count DESC
    `);

    const workerStats: WorkerSubjectStat[] = workerResult.length > 0 
      ? workerResult[0].values.map(wr => ({
          id: wr[0] as string,
          workerName: wr[1] as string,
          emailCount: wr[2] as number,
          lastSeenAt: new Date(wr[3] as string),
        }))
      : [];

    // Calculate aggregated values
    const totalEmailCount = workerStats.reduce((sum, ws) => sum + ws.emailCount, 0);

    // Get first_seen_at values for proper calculation
    const firstSeenResult = this.db.exec(`
      SELECT MIN(first_seen_at) as first_seen, MAX(last_seen_at) as last_seen
      FROM subject_stats
      WHERE subject_hash = '${statRow.subject_hash}' AND merchant_domain = '${statRow.merchant_domain}'
    `);
    
    const firstSeen = firstSeenResult[0].values[0][0] as string;
    const lastSeen = firstSeenResult[0].values[0][1] as string;

    // Check if any worker record is focused
    const focusedResult = this.db.exec(`
      SELECT MAX(is_focused) as is_focused
      FROM subject_stats
      WHERE subject_hash = '${statRow.subject_hash}' AND merchant_domain = '${statRow.merchant_domain}'
    `);
    const isFocused = focusedResult[0].values[0][0] as number;

    return {
      subject: statRow.subject,
      subjectHash: statRow.subject_hash,
      merchantDomain: statRow.merchant_domain,
      totalEmailCount,
      isFocused: isFocused === 1,
      firstSeenAt: new Date(firstSeen),
      lastSeenAt: new Date(lastSeen),
      workerStats,
    };
  }

  /**
   * Delete a single subject stat by ID
   * Requirements: 4.1
   */
  deleteSubject(id: string): boolean {
    const checkResult = this.db.exec(`SELECT id FROM subject_stats WHERE id = '${id}'`);
    if (checkResult.length === 0 || checkResult[0].values.length === 0) {
      return false;
    }
    this.db.run(`DELETE FROM subject_stats WHERE id = '${id}'`);
    return true;
  }

  /**
   * Delete multiple subject stats by IDs (batch delete)
   * Requirements: 4.4
   */
  deleteSubjects(ids: string[]): number {
    if (!ids || ids.length === 0) {
      return 0;
    }
    const placeholders = ids.map(id => `'${id}'`).join(', ');
    const beforeResult = this.db.exec(`SELECT COUNT(*) as count FROM subject_stats WHERE id IN (${placeholders})`);
    const beforeCount = beforeResult.length > 0 ? beforeResult[0].values[0][0] as number : 0;
    this.db.run(`DELETE FROM subject_stats WHERE id IN (${placeholders})`);
    return beforeCount;
  }

  /**
   * Set or unset focus status for a subject stat
   * Requirements: 4.2, 4.3
   */
  setFocused(id: string, focused: boolean): SubjectStatRow | null {
    const checkResult = this.db.exec(`SELECT id FROM subject_stats WHERE id = '${id}'`);
    if (checkResult.length === 0 || checkResult[0].values.length === 0) {
      return null;
    }
    
    const now = new Date().toISOString();
    this.db.run(`UPDATE subject_stats SET is_focused = ${focused ? 1 : 0}, updated_at = '${now}' WHERE id = '${id}'`);
    
    return this.getSubjectById(id);
  }

  /**
   * Get storage statistics for subject stats
   * Requirements: 6.1, 6.2
   */
  getStorageStats(): {
    totalRecords: number;
    totalSubjects: number;
    totalEmailCount: number;
    focusedCount: number;
    oldestRecordDate: Date | null;
    newestRecordDate: Date | null;
    workerDistribution: Array<{ workerName: string; count: number }>;
  } {
    // Get total records count
    const totalRecordsResult = this.db.exec('SELECT COUNT(*) as count FROM subject_stats');
    const totalRecords = totalRecordsResult.length > 0 ? totalRecordsResult[0].values[0][0] as number : 0;

    // Get unique subjects count (by subject_hash + merchant_domain)
    const totalSubjectsResult = this.db.exec(`
      SELECT COUNT(DISTINCT subject_hash || '|' || merchant_domain) as count FROM subject_stats
    `);
    const totalSubjects = totalSubjectsResult.length > 0 ? totalSubjectsResult[0].values[0][0] as number : 0;

    // Get total email count
    const totalEmailCountResult = this.db.exec('SELECT COALESCE(SUM(email_count), 0) as count FROM subject_stats');
    const totalEmailCount = totalEmailCountResult.length > 0 ? totalEmailCountResult[0].values[0][0] as number : 0;

    // Get focused count
    const focusedCountResult = this.db.exec('SELECT COUNT(*) as count FROM subject_stats WHERE is_focused = 1');
    const focusedCount = focusedCountResult.length > 0 ? focusedCountResult[0].values[0][0] as number : 0;

    // Get date range
    const dateRangeResult = this.db.exec(`
      SELECT MIN(first_seen_at) as oldest, MAX(last_seen_at) as newest FROM subject_stats
    `);
    let oldestRecordDate: Date | null = null;
    let newestRecordDate: Date | null = null;
    if (dateRangeResult.length > 0 && dateRangeResult[0].values.length > 0) {
      const oldest = dateRangeResult[0].values[0][0] as string | null;
      const newest = dateRangeResult[0].values[0][1] as string | null;
      oldestRecordDate = oldest ? new Date(oldest) : null;
      newestRecordDate = newest ? new Date(newest) : null;
    }

    // Get worker distribution
    const workerDistributionResult = this.db.exec(`
      SELECT worker_name, COUNT(*) as count FROM subject_stats GROUP BY worker_name ORDER BY count DESC
    `);
    const workerDistribution: Array<{ workerName: string; count: number }> = [];
    if (workerDistributionResult.length > 0) {
      for (const row of workerDistributionResult[0].values) {
        workerDistribution.push({
          workerName: row[0] as string,
          count: row[1] as number,
        });
      }
    }

    return {
      totalRecords,
      totalSubjects,
      totalEmailCount,
      focusedCount,
      oldestRecordDate,
      newestRecordDate,
      workerDistribution,
    };
  }

  /**
   * Clean up old subject stats records
   * Requirements: 6.4
   */
  cleanupOldStats(retentionDays: number): number {
    if (retentionDays < 0) {
      throw new Error('Retention days must be non-negative');
    }

    const cutoffDate = new Date();
    cutoffDate.setTime(cutoffDate.getTime() - retentionDays * 24 * 60 * 60 * 1000);

    // Count records to be deleted
    const countResult = this.db.exec(`SELECT COUNT(*) as count FROM subject_stats WHERE last_seen_at < '${cutoffDate.toISOString()}'`);
    const deletedCount = countResult.length > 0 ? countResult[0].values[0][0] as number : 0;

    // Delete old records
    this.db.run(`DELETE FROM subject_stats WHERE last_seen_at < '${cutoffDate.toISOString()}'`);

    return deletedCount;
  }
}

// Generators for valid test data
const validSubjectArb = fc.string({ minLength: 1, maxLength: 200 })
  .filter(s => s.trim().length > 0 && !s.includes("'"));

const validEmailArb = fc.tuple(
  fc.string({ minLength: 1, maxLength: 20 }).filter(s => /^[a-zA-Z0-9._-]+$/.test(s)),
  fc.string({ minLength: 1, maxLength: 20 }).filter(s => /^[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(s))
).map(([local, domain]) => `${local}@${domain}`);

const validWorkerNameArb = fc.string({ minLength: 1, maxLength: 50 })
  .filter(s => /^[a-zA-Z0-9_-]+$/.test(s));

describe('SubjectStatsService', () => {
  let SQL: any;
  let db: SqlJsDatabase;
  let service: TestSubjectStatsService;

  beforeEach(async () => {
    SQL = await initSqlJs();
    db = new SQL.Database();

    // Load schema
    const schemaPath = join(__dirname, '../db/schema.sql');
    const schema = readFileSync(schemaPath, 'utf-8');
    db.run(schema);

    service = new TestSubjectStatsService(db);
  });

  afterEach(() => {
    if (db) {
      db.close();
    }
  });

  /**
   * **Feature: email-subject-display, Property 1: Subject Tracking Records All Fields**
   * *For any* valid email with subject, sender, and worker name, tracking that email 
   * should result in a record containing all these fields correctly stored.
   * **Validates: Requirements 1.1**
   */
  describe('Property 1: Subject Tracking Records All Fields', () => {
    it('should store all fields correctly when tracking a new subject', () => {
      fc.assert(
        fc.property(
          validSubjectArb,
          validEmailArb,
          validWorkerNameArb,
          (subject, sender, workerName) => {
            // Clean up at start of each iteration
            db.run('DELETE FROM subject_stats');
            
            const result = service.trackSubject({ subject, sender, workerName });
            
            expect(result.isNew).toBe(true);
            expect(result.emailCount).toBe(1);
            expect(result.id).toBeDefined();

            // Verify stored record
            const stored = service.getSubjectById(result.id);
            expect(stored).not.toBeNull();
            expect(stored!.subject).toBe(subject);
            expect(stored!.subject_hash).toBe(calculateSubjectHash(subject));
            expect(stored!.merchant_domain).toBe(extractDomainFromEmail(sender));
            expect(stored!.worker_name).toBe(workerName);
            expect(stored!.email_count).toBe(1);
            expect(stored!.is_focused).toBe(0);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should correctly calculate subject hash', () => {
      fc.assert(
        fc.property(
          validSubjectArb,
          validEmailArb,
          validWorkerNameArb,
          (subject, sender, workerName) => {
            // Clean up at start of each iteration
            db.run('DELETE FROM subject_stats');
            
            const result = service.trackSubject({ subject, sender, workerName });
            const stored = service.getSubjectById(result.id);
            
            const expectedHash = calculateSubjectHash(subject);
            expect(stored!.subject_hash).toBe(expectedHash);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should correctly extract merchant domain from sender', () => {
      fc.assert(
        fc.property(
          validSubjectArb,
          validEmailArb,
          validWorkerNameArb,
          (subject, sender, workerName) => {
            // Clean up at start of each iteration
            db.run('DELETE FROM subject_stats');
            
            const result = service.trackSubject({ subject, sender, workerName });
            const stored = service.getSubjectById(result.id);
            
            const expectedDomain = extractDomainFromEmail(sender);
            expect(stored!.merchant_domain).toBe(expectedDomain);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * **Feature: email-subject-display, Property 2: Email Count Accumulation**
   * *For any* subject tracked multiple times with the same subject hash, merchant domain, 
   * and worker name, the email count should equal the number of times it was tracked.
   * **Validates: Requirements 1.2**
   */
  describe('Property 2: Email Count Accumulation', () => {
    it('should accumulate email count for repeated tracking', () => {
      fc.assert(
        fc.property(
          validSubjectArb,
          validEmailArb,
          validWorkerNameArb,
          fc.integer({ min: 1, max: 10 }),
          (subject, sender, workerName, trackCount) => {
            // Clean up at start of each iteration
            db.run('DELETE FROM subject_stats');
            
            let lastResult: TrackSubjectResult | null = null;
            
            // Track the same subject multiple times
            for (let i = 0; i < trackCount; i++) {
              lastResult = service.trackSubject({ subject, sender, workerName });
            }

            // Verify final count
            expect(lastResult!.emailCount).toBe(trackCount);
            
            // Verify stored record
            const stored = service.getSubjectById(lastResult!.id);
            expect(stored!.email_count).toBe(trackCount);

            // First tracking should be new, subsequent should not
            if (trackCount > 1) {
              expect(lastResult!.isNew).toBe(false);
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should return isNew=true only for first tracking', () => {
      fc.assert(
        fc.property(
          validSubjectArb,
          validEmailArb,
          validWorkerNameArb,
          (subject, sender, workerName) => {
            // Clean up at start of each iteration
            db.run('DELETE FROM subject_stats');
            
            const first = service.trackSubject({ subject, sender, workerName });
            expect(first.isNew).toBe(true);
            expect(first.emailCount).toBe(1);

            const second = service.trackSubject({ subject, sender, workerName });
            expect(second.isNew).toBe(false);
            expect(second.emailCount).toBe(2);
            expect(second.id).toBe(first.id);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * **Feature: email-subject-display, Property 3: Multi-Worker Instance Isolation**
   * *For any* subject tracked from multiple worker instances, each worker instance 
   * should have its own independent count, and the total count should equal the sum 
   * of all worker counts.
   * **Validates: Requirements 1.3, 2.2**
   */
  describe('Property 3: Multi-Worker Instance Isolation', () => {
    it('should maintain separate counts for different workers', () => {
      fc.assert(
        fc.property(
          validSubjectArb,
          validEmailArb,
          fc.array(validWorkerNameArb, { minLength: 2, maxLength: 5 }),
          fc.array(fc.integer({ min: 1, max: 5 }), { minLength: 2, maxLength: 5 }),
          (subject, sender, workerNames, trackCounts) => {
            // Clean up at start of each iteration
            db.run('DELETE FROM subject_stats');
            
            // Ensure unique worker names
            const uniqueWorkers = [...new Set(workerNames)];
            if (uniqueWorkers.length < 2) return; // Skip if not enough unique workers

            // Ensure we have enough counts for all workers
            const counts = uniqueWorkers.map((_, i) => trackCounts[i] ?? 1);
            const expectedTotal = counts.reduce((sum, c) => sum + c, 0);
            const workerResults: Map<string, TrackSubjectResult> = new Map();

            // Track subject from each worker
            for (let i = 0; i < uniqueWorkers.length; i++) {
              const workerName = uniqueWorkers[i];
              const count = counts[i];
              
              let result: TrackSubjectResult | null = null;
              for (let j = 0; j < count; j++) {
                result = service.trackSubject({ subject, sender, workerName });
              }
              workerResults.set(workerName, result!);
            }

            // Verify each worker has independent count
            let actualTotal = 0;
            for (let i = 0; i < uniqueWorkers.length; i++) {
              const workerName = uniqueWorkers[i];
              const expectedCount = counts[i];
              const result = workerResults.get(workerName)!;
              
              const stored = service.getSubjectById(result.id);
              expect(stored!.email_count).toBe(expectedCount);
              expect(stored!.worker_name).toBe(workerName);
              actualTotal += stored!.email_count;
            }

            // Verify total equals sum of all worker counts
            expect(actualTotal).toBe(expectedTotal);

            // Verify different workers have different record IDs
            const ids = [...workerResults.values()].map(r => r.id);
            const uniqueIds = new Set(ids);
            expect(uniqueIds.size).toBe(uniqueWorkers.length);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should create separate records for same subject from different workers', () => {
      fc.assert(
        fc.property(
          validSubjectArb,
          validEmailArb,
          validWorkerNameArb,
          validWorkerNameArb,
          (subject, sender, worker1, worker2) => {
            // Clean up at start of each iteration
            db.run('DELETE FROM subject_stats');
            
            // Ensure different workers
            if (worker1 === worker2) return;

            const result1 = service.trackSubject({ subject, sender, workerName: worker1 });
            const result2 = service.trackSubject({ subject, sender, workerName: worker2 });

            // Should be different records
            expect(result1.id).not.toBe(result2.id);
            
            // Both should be new
            expect(result1.isNew).toBe(true);
            expect(result2.isNew).toBe(true);

            // Each should have count of 1
            expect(result1.emailCount).toBe(1);
            expect(result2.emailCount).toBe(1);

            // Verify stored records
            const stored1 = service.getSubjectById(result1.id);
            const stored2 = service.getSubjectById(result2.id);
            
            expect(stored1!.worker_name).toBe(worker1);
            expect(stored2!.worker_name).toBe(worker2);
            expect(stored1!.subject).toBe(stored2!.subject);
            expect(stored1!.subject_hash).toBe(stored2!.subject_hash);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('Edge Cases', () => {
    it('should throw error for empty subject', () => {
      expect(() => {
        service.trackSubject({ subject: '', sender: 'test@example.com', workerName: 'worker1' });
      }).toThrow('Subject is required');
    });

    it('should throw error for empty sender', () => {
      expect(() => {
        service.trackSubject({ subject: 'Test Subject', sender: '', workerName: 'worker1' });
      }).toThrow('Sender is required');
    });

    it('should throw error for empty worker name', () => {
      expect(() => {
        service.trackSubject({ subject: 'Test Subject', sender: 'test@example.com', workerName: '' });
      }).toThrow('Worker name is required');
    });
  });

  /**
   * **Feature: email-subject-display, Property 5: List Response Contains Required Fields**
   * *For any* query to the subject stats API, all returned items should contain subject, 
   * merchant domain, worker stats with counts, and focus status.
   * **Validates: Requirements 2.1**
   */
  describe('Property 5: List Response Contains Required Fields', () => {
    it('should return all required fields in list response', () => {
      fc.assert(
        fc.property(
          fc.array(
            fc.tuple(validSubjectArb, validEmailArb, validWorkerNameArb),
            { minLength: 1, maxLength: 10 }
          ),
          (trackingData) => {
            // Clean up at start of each iteration
            db.run('DELETE FROM subject_stats');
            
            // Track subjects
            for (const [subject, sender, workerName] of trackingData) {
              service.trackSubject({ subject, sender, workerName });
            }

            // Get list
            const result = service.getSubjectStats();

            // Verify response structure
            expect(result).toHaveProperty('items');
            expect(result).toHaveProperty('total');
            expect(result).toHaveProperty('limit');
            expect(result).toHaveProperty('offset');
            expect(Array.isArray(result.items)).toBe(true);

            // Verify each item has required fields
            for (const item of result.items) {
              expect(item).toHaveProperty('subject');
              expect(typeof item.subject).toBe('string');
              expect(item.subject.length).toBeGreaterThan(0);

              expect(item).toHaveProperty('subjectHash');
              expect(typeof item.subjectHash).toBe('string');

              expect(item).toHaveProperty('merchantDomain');
              expect(typeof item.merchantDomain).toBe('string');

              expect(item).toHaveProperty('totalEmailCount');
              expect(typeof item.totalEmailCount).toBe('number');
              expect(item.totalEmailCount).toBeGreaterThan(0);

              expect(item).toHaveProperty('isFocused');
              expect(typeof item.isFocused).toBe('boolean');

              expect(item).toHaveProperty('firstSeenAt');
              expect(item.firstSeenAt).toBeInstanceOf(Date);

              expect(item).toHaveProperty('lastSeenAt');
              expect(item.lastSeenAt).toBeInstanceOf(Date);

              expect(item).toHaveProperty('workerStats');
              expect(Array.isArray(item.workerStats)).toBe(true);
              expect(item.workerStats.length).toBeGreaterThan(0);

              // Verify worker stats have required fields
              for (const ws of item.workerStats) {
                expect(ws).toHaveProperty('id');
                expect(ws).toHaveProperty('workerName');
                expect(ws).toHaveProperty('emailCount');
                expect(ws).toHaveProperty('lastSeenAt');
                expect(ws.emailCount).toBeGreaterThan(0);
              }
            }
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * **Feature: email-subject-display, Property 6: Pagination Correctness**
   * *For any* paginated query with limit and offset, the returned items count should not 
   * exceed the limit, and subsequent pages should not overlap with previous pages.
   * **Validates: Requirements 2.4**
   */
  describe('Property 6: Pagination Correctness', () => {
    it('should respect limit and offset parameters', () => {
      fc.assert(
        fc.property(
          fc.array(
            fc.tuple(validSubjectArb, validEmailArb, validWorkerNameArb),
            { minLength: 5, maxLength: 20 }
          ),
          fc.integer({ min: 1, max: 10 }),
          fc.integer({ min: 0, max: 10 }),
          (trackingData, limit, offset) => {
            // Clean up at start of each iteration
            db.run('DELETE FROM subject_stats');
            
            // Track subjects with unique combinations
            const uniqueData = new Map<string, [string, string, string]>();
            for (const [subject, sender, workerName] of trackingData) {
              const key = `${calculateSubjectHash(subject)}|${extractDomainFromEmail(sender)}`;
              if (!uniqueData.has(key)) {
                uniqueData.set(key, [subject, sender, workerName]);
              }
            }
            
            for (const [subject, sender, workerName] of uniqueData.values()) {
              service.trackSubject({ subject, sender, workerName });
            }

            const totalUniqueSubjects = uniqueData.size;

            // Get paginated results
            const result = service.getSubjectStats({ limit, offset });

            // Items count should not exceed limit
            expect(result.items.length).toBeLessThanOrEqual(limit);

            // Items count should be correct based on total and offset
            const expectedCount = Math.max(0, Math.min(limit, totalUniqueSubjects - offset));
            expect(result.items.length).toBe(expectedCount);

            // Total should reflect actual count
            expect(result.total).toBe(totalUniqueSubjects);

            // Limit and offset should be returned correctly
            expect(result.limit).toBe(limit);
            expect(result.offset).toBe(offset);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should not have overlapping items between pages', () => {
      fc.assert(
        fc.property(
          fc.array(
            fc.tuple(validSubjectArb, validEmailArb, validWorkerNameArb),
            { minLength: 10, maxLength: 20 }
          ),
          (trackingData) => {
            // Clean up at start of each iteration
            db.run('DELETE FROM subject_stats');
            
            // Track subjects with unique combinations
            const uniqueData = new Map<string, [string, string, string]>();
            for (const [subject, sender, workerName] of trackingData) {
              const key = `${calculateSubjectHash(subject)}|${extractDomainFromEmail(sender)}`;
              if (!uniqueData.has(key)) {
                uniqueData.set(key, [subject, sender, workerName]);
              }
            }
            
            for (const [subject, sender, workerName] of uniqueData.values()) {
              service.trackSubject({ subject, sender, workerName });
            }

            const pageSize = 3;
            // Use composite key (subjectHash + merchantDomain) for uniqueness
            const allSubjectKeys = new Set<string>();
            let currentOffset = 0;
            let hasMore = true;

            while (hasMore) {
              const result = service.getSubjectStats({ limit: pageSize, offset: currentOffset });
              
              for (const item of result.items) {
                // Each subject (hash + domain) should be unique across all pages
                const compositeKey = `${item.subjectHash}|${item.merchantDomain}`;
                expect(allSubjectKeys.has(compositeKey)).toBe(false);
                allSubjectKeys.add(compositeKey);
              }

              currentOffset += pageSize;
              hasMore = result.items.length === pageSize && currentOffset < result.total;
            }
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * **Feature: email-subject-display, Property 7: Worker Filter Consistency**
   * *For any* query with a specific worker name filter, all returned subject stats 
   * should only include data from that worker instance.
   * **Validates: Requirements 3.2**
   */
  describe('Property 7: Worker Filter Consistency', () => {
    it('should only return stats from filtered worker', () => {
      fc.assert(
        fc.property(
          validSubjectArb,
          validEmailArb,
          fc.array(validWorkerNameArb, { minLength: 2, maxLength: 5 }),
          (subject, sender, workerNames) => {
            // Clean up at start of each iteration
            db.run('DELETE FROM subject_stats');
            
            // Ensure unique worker names
            const uniqueWorkers = [...new Set(workerNames)];
            if (uniqueWorkers.length < 2) return;

            // Track same subject from multiple workers
            for (const workerName of uniqueWorkers) {
              service.trackSubject({ subject, sender, workerName });
            }

            // Filter by first worker
            const targetWorker = uniqueWorkers[0];
            const result = service.getSubjectStats({ workerName: targetWorker });

            // All returned items should only have the filtered worker in workerStats
            for (const item of result.items) {
              expect(item.workerStats.length).toBe(1);
              expect(item.workerStats[0].workerName).toBe(targetWorker);
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should return empty when filtering by non-existent worker', () => {
      fc.assert(
        fc.property(
          validSubjectArb,
          validEmailArb,
          validWorkerNameArb,
          validWorkerNameArb,
          (subject, sender, existingWorker, nonExistentWorker) => {
            // Clean up at start of each iteration
            db.run('DELETE FROM subject_stats');
            
            // Ensure workers are different
            if (existingWorker === nonExistentWorker) return;

            // Track subject with existing worker
            service.trackSubject({ subject, sender, workerName: existingWorker });

            // Filter by non-existent worker
            const result = service.getSubjectStats({ workerName: nonExistentWorker });

            expect(result.items.length).toBe(0);
            expect(result.total).toBe(0);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * **Feature: email-subject-display, Property 8: Sort Order Correctness**
   * *For any* query with sort by email count, the returned items should be ordered 
   * correctly (ascending or descending) by their total email count.
   * **Validates: Requirements 3.3**
   */
  describe('Property 8: Sort Order Correctness', () => {
    it('should sort by email count descending correctly', () => {
      fc.assert(
        fc.property(
          fc.array(
            fc.tuple(
              validSubjectArb,
              validEmailArb,
              validWorkerNameArb,
              fc.integer({ min: 1, max: 10 })
            ),
            { minLength: 3, maxLength: 10 }
          ),
          (trackingData) => {
            // Clean up at start of each iteration
            db.run('DELETE FROM subject_stats');
            
            // Track subjects with different counts
            const uniqueData = new Map<string, { subject: string; sender: string; workerName: string; count: number }>();
            for (const [subject, sender, workerName, count] of trackingData) {
              const key = `${calculateSubjectHash(subject)}|${extractDomainFromEmail(sender)}`;
              if (!uniqueData.has(key)) {
                uniqueData.set(key, { subject, sender, workerName, count });
              }
            }
            
            for (const { subject, sender, workerName, count } of uniqueData.values()) {
              for (let i = 0; i < count; i++) {
                service.trackSubject({ subject, sender, workerName });
              }
            }

            // Get sorted results (descending)
            const result = service.getSubjectStats({ sortBy: 'emailCount', sortOrder: 'desc' });

            // Verify descending order
            for (let i = 1; i < result.items.length; i++) {
              expect(result.items[i - 1].totalEmailCount).toBeGreaterThanOrEqual(result.items[i].totalEmailCount);
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should sort by email count ascending correctly', () => {
      fc.assert(
        fc.property(
          fc.array(
            fc.tuple(
              validSubjectArb,
              validEmailArb,
              validWorkerNameArb,
              fc.integer({ min: 1, max: 10 })
            ),
            { minLength: 3, maxLength: 10 }
          ),
          (trackingData) => {
            // Clean up at start of each iteration
            db.run('DELETE FROM subject_stats');
            
            // Track subjects with different counts
            const uniqueData = new Map<string, { subject: string; sender: string; workerName: string; count: number }>();
            for (const [subject, sender, workerName, count] of trackingData) {
              const key = `${calculateSubjectHash(subject)}|${extractDomainFromEmail(sender)}`;
              if (!uniqueData.has(key)) {
                uniqueData.set(key, { subject, sender, workerName, count });
              }
            }
            
            for (const { subject, sender, workerName, count } of uniqueData.values()) {
              for (let i = 0; i < count; i++) {
                service.trackSubject({ subject, sender, workerName });
              }
            }

            // Get sorted results (ascending)
            const result = service.getSubjectStats({ sortBy: 'emailCount', sortOrder: 'asc' });

            // Verify ascending order
            for (let i = 1; i < result.items.length; i++) {
              expect(result.items[i - 1].totalEmailCount).toBeLessThanOrEqual(result.items[i].totalEmailCount);
            }
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * **Feature: email-subject-display, Property 9: Delete Removes Record**
   * *For any* existing subject stat, deleting it should result in the record 
   * no longer being retrievable.
   * **Validates: Requirements 4.1**
   */
  describe('Property 9: Delete Removes Record', () => {
    it('should remove record after deletion', () => {
      fc.assert(
        fc.property(
          validSubjectArb,
          validEmailArb,
          validWorkerNameArb,
          (subject, sender, workerName) => {
            // Clean up at start of each iteration
            db.run('DELETE FROM subject_stats');
            
            // Create a record
            const result = service.trackSubject({ subject, sender, workerName });
            expect(result.isNew).toBe(true);
            
            // Verify record exists
            const beforeDelete = service.getSubjectById(result.id);
            expect(beforeDelete).not.toBeNull();
            
            // Delete the record
            const deleted = service.deleteSubject(result.id);
            expect(deleted).toBe(true);
            
            // Verify record no longer exists
            const afterDelete = service.getSubjectById(result.id);
            expect(afterDelete).toBeNull();
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should return false when deleting non-existent record', () => {
      fc.assert(
        fc.property(
          fc.uuid(),
          (nonExistentId) => {
            // Clean up at start of each iteration
            db.run('DELETE FROM subject_stats');
            
            // Try to delete non-existent record
            const deleted = service.deleteSubject(nonExistentId);
            expect(deleted).toBe(false);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * **Feature: email-subject-display, Property 10: Focus Mark Round-Trip**
   * *For any* subject stat, marking it as focused and then unfocusing should 
   * return it to the non-focused state.
   * **Validates: Requirements 4.2, 4.3**
   */
  describe('Property 10: Focus Mark Round-Trip', () => {
    it('should toggle focus status correctly', () => {
      fc.assert(
        fc.property(
          validSubjectArb,
          validEmailArb,
          validWorkerNameArb,
          (subject, sender, workerName) => {
            // Clean up at start of each iteration
            db.run('DELETE FROM subject_stats');
            
            // Create a record (starts unfocused)
            const result = service.trackSubject({ subject, sender, workerName });
            
            // Verify initial state is unfocused
            const initial = service.getSubjectById(result.id);
            expect(initial!.is_focused).toBe(0);
            
            // Mark as focused
            const focused = service.setFocused(result.id, true);
            expect(focused).not.toBeNull();
            expect(focused!.is_focused).toBe(1);
            
            // Verify persisted state
            const afterFocus = service.getSubjectById(result.id);
            expect(afterFocus!.is_focused).toBe(1);
            
            // Unfocus (round-trip)
            const unfocused = service.setFocused(result.id, false);
            expect(unfocused).not.toBeNull();
            expect(unfocused!.is_focused).toBe(0);
            
            // Verify final state matches initial
            const afterUnfocus = service.getSubjectById(result.id);
            expect(afterUnfocus!.is_focused).toBe(0);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should return null when setting focus on non-existent record', () => {
      fc.assert(
        fc.property(
          fc.uuid(),
          fc.boolean(),
          (nonExistentId, focused) => {
            // Clean up at start of each iteration
            db.run('DELETE FROM subject_stats');
            
            // Try to set focus on non-existent record
            const result = service.setFocused(nonExistentId, focused);
            expect(result).toBeNull();
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * **Feature: email-subject-display, Property 11: Batch Delete Removes All Selected**
   * *For any* set of subject stat IDs, batch deleting them should result in 
   * none of the records being retrievable.
   * **Validates: Requirements 4.4**
   */
  describe('Property 11: Batch Delete Removes All Selected', () => {
    it('should remove all selected records in batch delete', () => {
      fc.assert(
        fc.property(
          fc.array(
            fc.tuple(validSubjectArb, validEmailArb, validWorkerNameArb),
            { minLength: 2, maxLength: 10 }
          ),
          (trackingData) => {
            // Clean up at start of each iteration
            db.run('DELETE FROM subject_stats');
            
            // Create unique records
            const uniqueData = new Map<string, [string, string, string]>();
            for (const [subject, sender, workerName] of trackingData) {
              const key = `${calculateSubjectHash(subject)}|${extractDomainFromEmail(sender)}|${workerName}`;
              if (!uniqueData.has(key)) {
                uniqueData.set(key, [subject, sender, workerName]);
              }
            }
            
            const ids: string[] = [];
            for (const [subject, sender, workerName] of uniqueData.values()) {
              const result = service.trackSubject({ subject, sender, workerName });
              ids.push(result.id);
            }
            
            // Verify all records exist
            for (const id of ids) {
              const record = service.getSubjectById(id);
              expect(record).not.toBeNull();
            }
            
            // Batch delete all records
            const deletedCount = service.deleteSubjects(ids);
            expect(deletedCount).toBe(ids.length);
            
            // Verify none of the records exist
            for (const id of ids) {
              const record = service.getSubjectById(id);
              expect(record).toBeNull();
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should return 0 when batch deleting empty array', () => {
      db.run('DELETE FROM subject_stats');
      const deletedCount = service.deleteSubjects([]);
      expect(deletedCount).toBe(0);
    });

    it('should handle partial batch delete (some IDs exist, some do not)', () => {
      fc.assert(
        fc.property(
          fc.array(
            fc.tuple(validSubjectArb, validEmailArb, validWorkerNameArb),
            { minLength: 1, maxLength: 5 }
          ),
          fc.array(fc.uuid(), { minLength: 1, maxLength: 3 }),
          (trackingData, nonExistentIds) => {
            // Clean up at start of each iteration
            db.run('DELETE FROM subject_stats');
            
            // Create unique records
            const uniqueData = new Map<string, [string, string, string]>();
            for (const [subject, sender, workerName] of trackingData) {
              const key = `${calculateSubjectHash(subject)}|${extractDomainFromEmail(sender)}|${workerName}`;
              if (!uniqueData.has(key)) {
                uniqueData.set(key, [subject, sender, workerName]);
              }
            }
            
            const existingIds: string[] = [];
            for (const [subject, sender, workerName] of uniqueData.values()) {
              const result = service.trackSubject({ subject, sender, workerName });
              existingIds.push(result.id);
            }
            
            // Mix existing and non-existent IDs
            const mixedIds = [...existingIds, ...nonExistentIds];
            
            // Batch delete
            const deletedCount = service.deleteSubjects(mixedIds);
            
            // Should only delete existing records
            expect(deletedCount).toBe(existingIds.length);
            
            // Verify existing records are deleted
            for (const id of existingIds) {
              const record = service.getSubjectById(id);
              expect(record).toBeNull();
            }
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * **Feature: email-subject-display, Property 12: Focus Filter Consistency**
   * *For any* query with focus filter enabled, all returned subject stats 
   * should have the matching focus status.
   * **Validates: Requirements 5.2**
   */
  describe('Property 12: Focus Filter Consistency', () => {
    it('should only return focused subjects when filtering by isFocused=true', () => {
      fc.assert(
        fc.property(
          fc.array(
            fc.tuple(validSubjectArb, validEmailArb, validWorkerNameArb, fc.boolean()),
            { minLength: 3, maxLength: 10 }
          ),
          (trackingData) => {
            // Clean up at start of each iteration
            db.run('DELETE FROM subject_stats');
            
            // Create unique records with varying focus status
            const uniqueData = new Map<string, { subject: string; sender: string; workerName: string; focused: boolean }>();
            for (const [subject, sender, workerName, focused] of trackingData) {
              const key = `${calculateSubjectHash(subject)}|${extractDomainFromEmail(sender)}|${workerName}`;
              if (!uniqueData.has(key)) {
                uniqueData.set(key, { subject, sender, workerName, focused });
              }
            }
            
            // Track subjects and set focus status
            for (const { subject, sender, workerName, focused } of uniqueData.values()) {
              const result = service.trackSubject({ subject, sender, workerName });
              if (focused) {
                service.setFocused(result.id, true);
              }
            }
            
            // Query with focus filter = true
            const focusedResult = service.getSubjectStats({ isFocused: true });
            
            // All returned items should be focused
            for (const item of focusedResult.items) {
              expect(item.isFocused).toBe(true);
            }
            
            // Count should match expected focused count
            const expectedFocusedCount = [...uniqueData.values()].filter(d => d.focused).length;
            expect(focusedResult.total).toBe(expectedFocusedCount);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should only return unfocused subjects when filtering by isFocused=false', () => {
      fc.assert(
        fc.property(
          fc.array(
            fc.tuple(validSubjectArb, validEmailArb, validWorkerNameArb, fc.boolean()),
            { minLength: 3, maxLength: 10 }
          ),
          (trackingData) => {
            // Clean up at start of each iteration
            db.run('DELETE FROM subject_stats');
            
            // Create unique records with varying focus status
            const uniqueData = new Map<string, { subject: string; sender: string; workerName: string; focused: boolean }>();
            for (const [subject, sender, workerName, focused] of trackingData) {
              const key = `${calculateSubjectHash(subject)}|${extractDomainFromEmail(sender)}|${workerName}`;
              if (!uniqueData.has(key)) {
                uniqueData.set(key, { subject, sender, workerName, focused });
              }
            }
            
            // Track subjects and set focus status
            for (const { subject, sender, workerName, focused } of uniqueData.values()) {
              const result = service.trackSubject({ subject, sender, workerName });
              if (focused) {
                service.setFocused(result.id, true);
              }
            }
            
            // Query with focus filter = false
            const unfocusedResult = service.getSubjectStats({ isFocused: false });
            
            // All returned items should be unfocused
            for (const item of unfocusedResult.items) {
              expect(item.isFocused).toBe(false);
            }
            
            // Count should match expected unfocused count
            const expectedUnfocusedCount = [...uniqueData.values()].filter(d => !d.focused).length;
            expect(unfocusedResult.total).toBe(expectedUnfocusedCount);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * **Feature: email-subject-display, Property 13: Storage Stats Accuracy**
   * *For any* set of subject stats in the database, the storage stats should accurately 
   * reflect the total record count and date range.
   * **Validates: Requirements 6.1, 6.2**
   */
  describe('Property 13: Storage Stats Accuracy', () => {
    it('should accurately report total records and subjects', () => {
      fc.assert(
        fc.property(
          fc.array(
            fc.tuple(validSubjectArb, validEmailArb, validWorkerNameArb),
            { minLength: 1, maxLength: 15 }
          ),
          (trackingData) => {
            // Clean up at start of each iteration
            db.run('DELETE FROM subject_stats');
            
            // Create unique records
            const uniqueRecords = new Map<string, [string, string, string]>();
            const uniqueSubjects = new Set<string>();
            
            for (const [subject, sender, workerName] of trackingData) {
              const recordKey = `${calculateSubjectHash(subject)}|${extractDomainFromEmail(sender)}|${workerName}`;
              const subjectKey = `${calculateSubjectHash(subject)}|${extractDomainFromEmail(sender)}`;
              
              if (!uniqueRecords.has(recordKey)) {
                uniqueRecords.set(recordKey, [subject, sender, workerName]);
                uniqueSubjects.add(subjectKey);
              }
            }
            
            // Track subjects
            for (const [subject, sender, workerName] of uniqueRecords.values()) {
              service.trackSubject({ subject, sender, workerName });
            }

            // Get storage stats
            const stats = service.getStorageStats();

            // Verify total records
            expect(stats.totalRecords).toBe(uniqueRecords.size);
            
            // Verify total unique subjects
            expect(stats.totalSubjects).toBe(uniqueSubjects.size);
            
            // Verify total email count (each record has count of 1)
            expect(stats.totalEmailCount).toBe(uniqueRecords.size);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should accurately report focused count', () => {
      fc.assert(
        fc.property(
          fc.array(
            fc.tuple(validSubjectArb, validEmailArb, validWorkerNameArb, fc.boolean()),
            { minLength: 1, maxLength: 10 }
          ),
          (trackingData) => {
            // Clean up at start of each iteration
            db.run('DELETE FROM subject_stats');
            
            // Create unique records with focus status
            const uniqueData = new Map<string, { subject: string; sender: string; workerName: string; focused: boolean }>();
            for (const [subject, sender, workerName, focused] of trackingData) {
              const key = `${calculateSubjectHash(subject)}|${extractDomainFromEmail(sender)}|${workerName}`;
              if (!uniqueData.has(key)) {
                uniqueData.set(key, { subject, sender, workerName, focused });
              }
            }
            
            // Track subjects and set focus status
            let expectedFocusedCount = 0;
            for (const { subject, sender, workerName, focused } of uniqueData.values()) {
              const result = service.trackSubject({ subject, sender, workerName });
              if (focused) {
                service.setFocused(result.id, true);
                expectedFocusedCount++;
              }
            }

            // Get storage stats
            const stats = service.getStorageStats();

            // Verify focused count
            expect(stats.focusedCount).toBe(expectedFocusedCount);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should accurately report worker distribution', () => {
      fc.assert(
        fc.property(
          fc.array(
            fc.tuple(validSubjectArb, validEmailArb, validWorkerNameArb),
            { minLength: 1, maxLength: 15 }
          ),
          (trackingData) => {
            // Clean up at start of each iteration
            db.run('DELETE FROM subject_stats');
            
            // Create unique records and count per worker
            const uniqueRecords = new Map<string, [string, string, string]>();
            const workerCounts = new Map<string, number>();
            
            for (const [subject, sender, workerName] of trackingData) {
              const recordKey = `${calculateSubjectHash(subject)}|${extractDomainFromEmail(sender)}|${workerName}`;
              
              if (!uniqueRecords.has(recordKey)) {
                uniqueRecords.set(recordKey, [subject, sender, workerName]);
                workerCounts.set(workerName, (workerCounts.get(workerName) || 0) + 1);
              }
            }
            
            // Track subjects
            for (const [subject, sender, workerName] of uniqueRecords.values()) {
              service.trackSubject({ subject, sender, workerName });
            }

            // Get storage stats
            const stats = service.getStorageStats();

            // Verify worker distribution
            expect(stats.workerDistribution.length).toBe(workerCounts.size);
            
            for (const { workerName, count } of stats.workerDistribution) {
              expect(workerCounts.get(workerName)).toBe(count);
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should return null dates when no records exist', () => {
      db.run('DELETE FROM subject_stats');
      
      const stats = service.getStorageStats();
      
      expect(stats.totalRecords).toBe(0);
      expect(stats.totalSubjects).toBe(0);
      expect(stats.totalEmailCount).toBe(0);
      expect(stats.focusedCount).toBe(0);
      expect(stats.oldestRecordDate).toBeNull();
      expect(stats.newestRecordDate).toBeNull();
      expect(stats.workerDistribution).toHaveLength(0);
    });
  });

  /**
   * **Feature: email-subject-display, Property 15: Cleanup Removes Old Records**
   * *For any* set of subject stats with various timestamps and a configured retention period, 
   * after cleanup execution, no records older than the cutoff date should remain.
   * **Validates: Requirements 6.4**
   */
  describe('Property 15: Cleanup Removes Old Records', () => {
    it('should remove records older than retention period', () => {
      fc.assert(
        fc.property(
          fc.array(
            // Use daysAgo starting from 1 to avoid boundary timing issues
            fc.tuple(validSubjectArb, validEmailArb, validWorkerNameArb, fc.integer({ min: 1, max: 60 })),
            { minLength: 3, maxLength: 10 }
          ),
          fc.integer({ min: 2, max: 30 }),
          (trackingData, retentionDays) => {
            // Clean up at start of each iteration
            db.run('DELETE FROM subject_stats');
            
            const now = new Date();
            const uniqueRecords = new Map<string, { subject: string; sender: string; workerName: string; daysAgo: number }>();
            
            for (const [subject, sender, workerName, daysAgo] of trackingData) {
              const key = `${calculateSubjectHash(subject)}|${extractDomainFromEmail(sender)}|${workerName}`;
              if (!uniqueRecords.has(key)) {
                uniqueRecords.set(key, { subject, sender, workerName, daysAgo });
              }
            }
            
            // Track subjects with different timestamps
            // Add 1 hour buffer to avoid boundary timing issues
            for (const { subject, sender, workerName, daysAgo } of uniqueRecords.values()) {
              const pastDate = new Date(now.getTime() - daysAgo * 24 * 60 * 60 * 1000 - 60 * 60 * 1000);
              service.trackSubject({ subject, sender, workerName, receivedAt: pastDate.toISOString() });
            }

            // Count records that should remain after cleanup
            // Records with daysAgo < retentionDays should remain (strictly less than)
            // because cleanup deletes records where last_seen_at < cutoffDate
            const expectedRemainingCount = [...uniqueRecords.values()].filter(
              r => r.daysAgo < retentionDays
            ).length;

            // Run cleanup
            const deletedCount = service.cleanupOldStats(retentionDays);

            // Verify deletion count
            const expectedDeletedCount = uniqueRecords.size - expectedRemainingCount;
            expect(deletedCount).toBe(expectedDeletedCount);

            // Verify remaining records
            const stats = service.getStorageStats();
            expect(stats.totalRecords).toBe(expectedRemainingCount);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should not remove any records when all are within retention period', () => {
      fc.assert(
        fc.property(
          fc.array(
            fc.tuple(validSubjectArb, validEmailArb, validWorkerNameArb),
            { minLength: 1, maxLength: 10 }
          ),
          (trackingData) => {
            // Clean up at start of each iteration
            db.run('DELETE FROM subject_stats');
            
            // Create unique records
            const uniqueRecords = new Map<string, [string, string, string]>();
            for (const [subject, sender, workerName] of trackingData) {
              const key = `${calculateSubjectHash(subject)}|${extractDomainFromEmail(sender)}|${workerName}`;
              if (!uniqueRecords.has(key)) {
                uniqueRecords.set(key, [subject, sender, workerName]);
              }
            }
            
            // Track subjects (all with current timestamp)
            for (const [subject, sender, workerName] of uniqueRecords.values()) {
              service.trackSubject({ subject, sender, workerName });
            }

            const initialCount = uniqueRecords.size;

            // Run cleanup with 30 day retention (all records are fresh)
            const deletedCount = service.cleanupOldStats(30);

            // No records should be deleted
            expect(deletedCount).toBe(0);

            // All records should remain
            const stats = service.getStorageStats();
            expect(stats.totalRecords).toBe(initialCount);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should throw error for negative retention days', () => {
      expect(() => {
        service.cleanupOldStats(-1);
      }).toThrow('Retention days must be non-negative');
    });
  });
});
