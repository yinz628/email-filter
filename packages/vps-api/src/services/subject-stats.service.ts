/**
 * Subject Stats Service
 * Handles email subject statistics tracking and management
 * 
 * Requirements: 1.1, 1.2, 1.3, 1.4, 2.1, 2.2, 2.4, 3.2, 3.3, 4.1, 4.2, 4.3, 4.4, 5.2, 6.1, 6.2, 6.4
 */

import { createHash, randomUUID } from 'crypto';
import type Database from 'better-sqlite3';
import type {
  SubjectStat,
  AggregatedSubjectStat,
  WorkerSubjectStat,
  SubjectStatsFilter,
  SubjectStatsList,
  TrackSubjectDTO,
  TrackSubjectResult,
  SubjectStorageStats,
  SubjectStatRow,
} from '@email-filter/shared';
import { toSubjectStat, extractDomainFromEmail } from '@email-filter/shared';

/**
 * Calculate SHA-256 hash for subject string
 * Used for fast lookup and deduplication
 * 
 * @param subject - Subject string to hash
 * @returns SHA-256 hash of the subject
 */
function calculateSubjectHash(subject: string): string {
  return createHash('sha256').update(subject).digest('hex');
}

/**
 * Subject Stats Service class
 * Provides subject tracking, querying, and management functionality
 */
export class SubjectStatsService {
  constructor(private db: Database.Database) {}

  /**
   * Track a subject from an email
   * Creates a new record or updates existing one (upsert)
   * 
   * @param data - Track subject data (subject, sender, workerName)
   * @returns TrackSubjectResult with id, isNew flag, and current email count
   * 
   * Requirements: 1.1, 1.2, 1.4
   */
  trackSubject(data: TrackSubjectDTO): TrackSubjectResult {
    const { subject, sender, workerName, receivedAt } = data;
    
    // Validate required fields
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
    const existingStmt = this.db.prepare(`
      SELECT id, email_count FROM subject_stats
      WHERE subject_hash = ? AND merchant_domain = ? AND worker_name = ?
    `);
    const existing = existingStmt.get(subjectHash, merchantDomain, workerName) as 
      { id: string; email_count: number } | undefined;

    if (existing) {
      // Update existing record - increment count and update timestamps
      const updateStmt = this.db.prepare(`
        UPDATE subject_stats
        SET email_count = email_count + 1,
            last_seen_at = ?,
            updated_at = ?
        WHERE id = ?
      `);
      updateStmt.run(now, now, existing.id);

      return {
        id: existing.id,
        isNew: false,
        emailCount: existing.email_count + 1,
      };
    }

    // Create new record
    const id = randomUUID();
    const insertStmt = this.db.prepare(`
      INSERT INTO subject_stats (
        id, subject, subject_hash, merchant_domain, worker_name,
        email_count, is_focused, first_seen_at, last_seen_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, 1, 0, ?, ?, ?, ?)
    `);
    insertStmt.run(id, subject, subjectHash, merchantDomain, workerName, now, now, now, now);

    return {
      id,
      isNew: true,
      emailCount: 1,
    };
  }

  /**
   * Get subject statistics with filtering and pagination
   * Aggregates data across workers for display
   * 
   * @param filter - Optional filter options
   * @returns Paginated list of aggregated subject stats
   * 
   * Requirements: 2.1, 2.2, 2.4, 3.2, 3.3, 5.2
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
    const params: (string | number)[] = [];

    if (workerName) {
      conditions.push('worker_name = ?');
      params.push(workerName);
    }

    if (isFocused !== undefined) {
      conditions.push('is_focused = ?');
      params.push(isFocused ? 1 : 0);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // Get total count of unique subjects (for pagination)
    const countStmt = this.db.prepare(`
      SELECT COUNT(DISTINCT subject_hash || '|' || merchant_domain) as total
      FROM subject_stats
      ${whereClause}
    `);
    const countResult = countStmt.get(...params) as { total: number };
    const total = countResult.total;

    // Map sortBy to SQL column
    const sortColumn = sortBy === 'emailCount' ? 'total_email_count' 
      : sortBy === 'firstSeenAt' ? 'first_seen' 
      : 'last_seen';
    const order = sortOrder === 'asc' ? 'ASC' : 'DESC';

    // Get aggregated subject stats with pagination
    // Group by subject_hash and merchant_domain to aggregate across workers
    const queryStmt = this.db.prepare(`
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
      LIMIT ? OFFSET ?
    `);
    
    const rows = queryStmt.all(...params, limit, offset) as Array<{
      subject: string;
      subject_hash: string;
      merchant_domain: string;
      total_email_count: number;
      is_focused: number;
      first_seen: string;
      last_seen: string;
    }>;

    // For each aggregated subject, get worker breakdown
    const items: AggregatedSubjectStat[] = rows.map(row => {
      const workerStmt = this.db.prepare(`
        SELECT id, worker_name, email_count, last_seen_at
        FROM subject_stats
        WHERE subject_hash = ? AND merchant_domain = ?
        ${workerName ? 'AND worker_name = ?' : ''}
        ORDER BY email_count DESC
      `);
      
      const workerParams = workerName 
        ? [row.subject_hash, row.merchant_domain, workerName]
        : [row.subject_hash, row.merchant_domain];
      
      const workerRows = workerStmt.all(...workerParams) as Array<{
        id: string;
        worker_name: string;
        email_count: number;
        last_seen_at: string;
      }>;

      const workerStats: WorkerSubjectStat[] = workerRows.map(wr => ({
        id: wr.id,
        workerName: wr.worker_name,
        emailCount: wr.email_count,
        lastSeenAt: new Date(wr.last_seen_at),
      }));

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
   * 
   * @param id - Subject stat ID
   * @returns Subject stat with worker breakdown or null if not found
   * 
   * Requirements: 2.1
   */
  getSubjectById(id: string): AggregatedSubjectStat | null {
    // First get the specific record
    const stmt = this.db.prepare(`
      SELECT * FROM subject_stats WHERE id = ?
    `);
    const row = stmt.get(id) as SubjectStatRow | undefined;

    if (!row) {
      return null;
    }

    // Get all worker stats for this subject
    const workerStmt = this.db.prepare(`
      SELECT id, worker_name, email_count, last_seen_at
      FROM subject_stats
      WHERE subject_hash = ? AND merchant_domain = ?
      ORDER BY email_count DESC
    `);
    
    const workerRows = workerStmt.all(row.subject_hash, row.merchant_domain) as Array<{
      id: string;
      worker_name: string;
      email_count: number;
      last_seen_at: string;
    }>;

    const workerStats: WorkerSubjectStat[] = workerRows.map(wr => ({
      id: wr.id,
      workerName: wr.worker_name,
      emailCount: wr.email_count,
      lastSeenAt: new Date(wr.last_seen_at),
    }));

    // Calculate aggregated values
    const totalEmailCount = workerStats.reduce((sum, ws) => sum + ws.emailCount, 0);
    const firstSeenAt = new Date(Math.min(...workerRows.map(wr => new Date(wr.last_seen_at).getTime())));
    const lastSeenAt = new Date(Math.max(...workerRows.map(wr => new Date(wr.last_seen_at).getTime())));

    // Check if any worker record is focused
    const focusedStmt = this.db.prepare(`
      SELECT MAX(is_focused) as is_focused
      FROM subject_stats
      WHERE subject_hash = ? AND merchant_domain = ?
    `);
    const focusedResult = focusedStmt.get(row.subject_hash, row.merchant_domain) as { is_focused: number };

    return {
      subject: row.subject,
      subjectHash: row.subject_hash,
      merchantDomain: row.merchant_domain,
      totalEmailCount,
      isFocused: focusedResult.is_focused === 1,
      firstSeenAt,
      lastSeenAt,
      workerStats,
    };
  }

  /**
   * Delete a single subject stat by ID
   * 
   * @param id - Subject stat ID to delete
   * @returns true if record was deleted, false if not found
   * 
   * Requirements: 4.1
   */
  deleteSubject(id: string): boolean {
    const stmt = this.db.prepare(`
      DELETE FROM subject_stats WHERE id = ?
    `);
    const result = stmt.run(id);
    return result.changes > 0;
  }

  /**
   * Delete multiple subject stats by IDs (batch delete)
   * 
   * @param ids - Array of subject stat IDs to delete
   * @returns Number of records deleted
   * 
   * Requirements: 4.4
   */
  deleteSubjects(ids: string[]): number {
    if (!ids || ids.length === 0) {
      return 0;
    }

    const placeholders = ids.map(() => '?').join(', ');
    const stmt = this.db.prepare(`
      DELETE FROM subject_stats WHERE id IN (${placeholders})
    `);
    const result = stmt.run(...ids);
    return result.changes;
  }

  /**
   * Set or unset focus status for a subject stat
   * 
   * @param id - Subject stat ID
   * @param focused - Whether to mark as focused
   * @returns Updated subject stat or null if not found
   * 
   * Requirements: 4.2, 4.3
   */
  setFocused(id: string, focused: boolean): SubjectStat | null {
    const now = new Date().toISOString();
    
    const updateStmt = this.db.prepare(`
      UPDATE subject_stats
      SET is_focused = ?, updated_at = ?
      WHERE id = ?
    `);
    const result = updateStmt.run(focused ? 1 : 0, now, id);
    
    if (result.changes === 0) {
      return null;
    }

    // Return the updated record
    const selectStmt = this.db.prepare(`
      SELECT * FROM subject_stats WHERE id = ?
    `);
    const row = selectStmt.get(id) as SubjectStatRow | undefined;
    
    if (!row) {
      return null;
    }

    return toSubjectStat(row);
  }

  /**
   * Get storage statistics for subject stats
   * 
   * @returns SubjectStorageStats with total records, subjects, email count, etc.
   * 
   * Requirements: 6.1, 6.2
   */
  getStorageStats(): SubjectStorageStats {
    // Get total records count
    const totalRecordsStmt = this.db.prepare('SELECT COUNT(*) as count FROM subject_stats');
    const totalRecordsResult = totalRecordsStmt.get() as { count: number };
    const totalRecords = totalRecordsResult.count;

    // Get unique subjects count (by subject_hash + merchant_domain)
    const totalSubjectsStmt = this.db.prepare(`
      SELECT COUNT(DISTINCT subject_hash || '|' || merchant_domain) as count FROM subject_stats
    `);
    const totalSubjectsResult = totalSubjectsStmt.get() as { count: number };
    const totalSubjects = totalSubjectsResult.count;

    // Get total email count
    const totalEmailCountStmt = this.db.prepare('SELECT COALESCE(SUM(email_count), 0) as count FROM subject_stats');
    const totalEmailCountResult = totalEmailCountStmt.get() as { count: number };
    const totalEmailCount = totalEmailCountResult.count;

    // Get focused count
    const focusedCountStmt = this.db.prepare('SELECT COUNT(*) as count FROM subject_stats WHERE is_focused = 1');
    const focusedCountResult = focusedCountStmt.get() as { count: number };
    const focusedCount = focusedCountResult.count;

    // Get date range
    const dateRangeStmt = this.db.prepare(`
      SELECT MIN(first_seen_at) as oldest, MAX(last_seen_at) as newest FROM subject_stats
    `);
    const dateRangeResult = dateRangeStmt.get() as { oldest: string | null; newest: string | null };
    const oldestRecordDate = dateRangeResult.oldest ? new Date(dateRangeResult.oldest) : null;
    const newestRecordDate = dateRangeResult.newest ? new Date(dateRangeResult.newest) : null;

    // Get worker distribution
    const workerDistributionStmt = this.db.prepare(`
      SELECT worker_name, COUNT(*) as count FROM subject_stats GROUP BY worker_name ORDER BY count DESC
    `);
    const workerDistributionRows = workerDistributionStmt.all() as Array<{ worker_name: string; count: number }>;
    const workerDistribution = workerDistributionRows.map(row => ({
      workerName: row.worker_name,
      count: row.count,
    }));

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
   * 
   * @param retentionDays - Number of days to retain records
   * @returns Number of records deleted
   * 
   * Requirements: 6.4
   */
  cleanupOldStats(retentionDays: number): number {
    if (retentionDays < 0) {
      throw new Error('Retention days must be non-negative');
    }

    const cutoffDate = new Date();
    cutoffDate.setTime(cutoffDate.getTime() - retentionDays * 24 * 60 * 60 * 1000);

    const stmt = this.db.prepare('DELETE FROM subject_stats WHERE last_seen_at < ?');
    const result = stmt.run(cutoffDate.toISOString());

    return result.changes;
  }
}
