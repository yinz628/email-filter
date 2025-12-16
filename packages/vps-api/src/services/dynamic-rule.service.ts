/**
 * Dynamic Rule Service for VPS API
 * Handles automatic detection and management of dynamic filter rules
 * 
 * Requirements: 6.1, 6.2, 6.3, 6.4
 * - Tracks email subjects and detects when threshold is exceeded
 * - Automatically creates dynamic rules for spam detection
 * - Manages rule expiration and cleanup
 * - Updates lastHitAt timestamps when rules are matched
 */

import type { Database } from 'better-sqlite3';
import type {
  FilterRule,
  DynamicConfig,
  CreateRuleDTO,
} from '@email-filter/shared';
import { DEFAULT_DYNAMIC_CONFIG } from '@email-filter/shared';
import { RuleRepository } from '../db/rule-repository.js';

/**
 * Subject tracker entry from database
 */
interface SubjectTrackerRow {
  id: number;
  subject_hash: string;
  subject: string;
  received_at: string;
}

/**
 * Subject count result
 */
export interface SubjectCount {
  subjectHash: string;
  subject: string;
  count: number;
}

/**
 * Dynamic Rule Service class
 */
export class DynamicRuleService {
  constructor(
    private db: Database,
    private ruleRepository: RuleRepository
  ) {}

  /**
   * Get the current dynamic configuration
   */
  getConfig(): DynamicConfig {
    const stmt = this.db.prepare('SELECT key, value FROM dynamic_config');
    const rows = stmt.all() as { key: string; value: string }[];

    if (rows.length === 0) {
      return { ...DEFAULT_DYNAMIC_CONFIG };
    }

    const config: DynamicConfig = { ...DEFAULT_DYNAMIC_CONFIG };
    for (const row of rows) {
      switch (row.key) {
        case 'enabled':
          config.enabled = row.value === 'true';
          break;
        case 'timeWindowMinutes':
          config.timeWindowMinutes = parseInt(row.value, 10);
          break;
        case 'thresholdCount':
          config.thresholdCount = parseInt(row.value, 10);
          break;
        case 'expirationHours':
          config.expirationHours = parseInt(row.value, 10);
          break;
        case 'lastHitThresholdHours':
          config.lastHitThresholdHours = parseInt(row.value, 10);
          break;
      }
    }

    return config;
  }


  /**
   * Update the dynamic configuration
   */
  updateConfig(config: Partial<DynamicConfig>): DynamicConfig {
    const currentConfig = this.getConfig();
    const newConfig = { ...currentConfig, ...config };

    // Upsert each config value
    const entries = [
      ['enabled', String(newConfig.enabled)],
      ['timeWindowMinutes', String(newConfig.timeWindowMinutes)],
      ['thresholdCount', String(newConfig.thresholdCount)],
      ['expirationHours', String(newConfig.expirationHours)],
      ['lastHitThresholdHours', String(newConfig.lastHitThresholdHours)],
    ];

    const upsertStmt = this.db.prepare(
      `INSERT INTO dynamic_config (key, value) VALUES (?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`
    );

    for (const [key, value] of entries) {
      upsertStmt.run(key, value);
    }

    return newConfig;
  }

  /**
   * Generate a hash for a subject string
   * Used for efficient grouping and lookup
   */
  private hashSubject(subject: string): string {
    // Simple hash using the subject normalized (lowercase, trimmed)
    const normalized = subject.toLowerCase().trim();
    // Use a simple string hash
    let hash = 0;
    for (let i = 0; i < normalized.length; i++) {
      const char = normalized.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return hash.toString(16);
  }

  /**
   * Track an email subject for dynamic rule detection
   * 
   * @param subject - The email subject to track
   * @param receivedAt - When the email was received
   * @returns The created dynamic rule if threshold was exceeded, null otherwise
   */
  trackSubject(subject: string, receivedAt: Date = new Date()): FilterRule | null {
    const config = this.getConfig();
    
    // Requirements 6.4: If dynamic rule feature is disabled, do not create new rules
    if (!config.enabled) {
      return null;
    }

    const subjectHash = this.hashSubject(subject);
    const receivedAtStr = receivedAt.toISOString();

    // Insert the subject tracking record
    const insertStmt = this.db.prepare(
      `INSERT INTO email_subject_tracker (subject_hash, subject, received_at)
       VALUES (?, ?, ?)`
    );
    insertStmt.run(subjectHash, subject, receivedAtStr);

    // Check if threshold is exceeded within time window
    const windowStart = new Date(receivedAt.getTime() - config.timeWindowMinutes * 60 * 1000);
    const windowStartStr = windowStart.toISOString();

    const countStmt = this.db.prepare(
      `SELECT COUNT(*) as count FROM email_subject_tracker
       WHERE subject_hash = ? AND received_at >= ?`
    );
    const countResult = countStmt.get(subjectHash, windowStartStr) as { count: number };
    const count = countResult?.count || 0;

    // Requirements 6.1: If threshold exceeded, create dynamic rule
    if (count >= config.thresholdCount) {
      // Check if a dynamic rule for this subject already exists
      const existingRule = this.findDynamicRuleBySubject(subject);
      if (existingRule) {
        // Update lastHitAt for existing rule
        this.ruleRepository.updateLastHit(existingRule.id);
        return existingRule;
      }

      // Create new dynamic rule
      const ruleDto: CreateRuleDTO = {
        category: 'dynamic',
        matchType: 'subject',
        matchMode: 'contains',
        pattern: subject,
        enabled: true,
      };

      const newRule = this.ruleRepository.create(ruleDto);
      
      // Clean up old tracking records for this subject
      this.cleanupSubjectTracker(subjectHash, windowStart);

      return newRule;
    }

    return null;
  }


  /**
   * Find an existing dynamic rule that matches a subject
   * Optimized: Direct database query instead of loading all rules
   */
  private findDynamicRuleBySubject(subject: string): FilterRule | null {
    // First try exact match for better performance
    const stmt = this.db.prepare(
      `SELECT * FROM filter_rules 
       WHERE category = 'dynamic' AND match_type = 'subject' AND pattern = ?
       LIMIT 1`
    );
    const result = stmt.get(subject) as {
      id: string;
      category: string;
      match_type: string;
      match_mode: string;
      pattern: string;
      enabled: number;
      created_at: string;
      updated_at: string;
      last_hit_at: string | null;
    } | undefined;

    if (result) {
      return {
        id: result.id,
        category: result.category as 'dynamic',
        matchType: result.match_type as FilterRule['matchType'],
        matchMode: result.match_mode as FilterRule['matchMode'],
        pattern: result.pattern,
        enabled: result.enabled === 1,
        createdAt: new Date(result.created_at),
        updatedAt: new Date(result.updated_at),
        lastHitAt: result.last_hit_at ? new Date(result.last_hit_at) : undefined,
      };
    }

    return null;
  }

  /**
   * Clean up old subject tracking records for a specific subject
   */
  private cleanupSubjectTracker(subjectHash: string, olderThan: Date): void {
    const stmt = this.db.prepare(
      `DELETE FROM email_subject_tracker
       WHERE subject_hash = ? AND received_at < ?`
    );
    stmt.run(subjectHash, olderThan.toISOString());
  }

  /**
   * Find expired dynamic rules
   * Returns rules that haven't been hit within the expiration period
   * A rule is expired if:
   * - last_hit_at is NULL and created_at is older than expirationHours
   * - OR last_hit_at is older than lastHitThresholdHours
   */
  findExpiredDynamicRules(expirationHours: number, lastHitThresholdHours?: number): FilterRule[] {
    const createdCutoff = new Date(Date.now() - expirationHours * 60 * 60 * 1000);
    const createdCutoffStr = createdCutoff.toISOString();
    
    // Use lastHitThresholdHours if provided, otherwise use expirationHours
    const lastHitCutoff = new Date(Date.now() - (lastHitThresholdHours || expirationHours) * 60 * 60 * 1000);
    const lastHitCutoffStr = lastHitCutoff.toISOString();

    const stmt = this.db.prepare(
      `SELECT * FROM filter_rules 
       WHERE category = 'dynamic' 
       AND (
         (last_hit_at IS NULL AND created_at < ?) 
         OR (last_hit_at IS NOT NULL AND last_hit_at < ?)
       )`
    );
    const rows = stmt.all(createdCutoffStr, lastHitCutoffStr) as {
      id: string;
      category: string;
      match_type: string;
      match_mode: string;
      pattern: string;
      enabled: number;
      created_at: string;
      updated_at: string;
      last_hit_at: string | null;
    }[];

    return rows.map(row => ({
      id: row.id,
      category: row.category as 'dynamic',
      matchType: row.match_type as FilterRule['matchType'],
      matchMode: row.match_mode as FilterRule['matchMode'],
      pattern: row.pattern,
      enabled: row.enabled === 1,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
      lastHitAt: row.last_hit_at ? new Date(row.last_hit_at) : undefined,
    }));
  }

  /**
   * Clean up expired dynamic rules
   * Removes rules that haven't been hit within the expiration period
   * 
   * Requirements 6.2: Dynamic rules that haven't been hit within expiration period should be deleted
   * 
   * @returns Array of deleted rule IDs
   */
  cleanupExpiredRules(): string[] {
    const config = this.getConfig();
    
    if (!config.enabled) {
      return [];
    }

    const expiredRules = this.findExpiredDynamicRules(config.expirationHours, config.lastHitThresholdHours);
    const deletedIds: string[] = [];

    for (const rule of expiredRules) {
      const deleted = this.ruleRepository.delete(rule.id);
      if (deleted) {
        deletedIds.push(rule.id);
      }
    }

    return deletedIds;
  }


  /**
   * Update lastHitAt timestamp for a dynamic rule
   * Called when a dynamic rule matches an email
   * 
   * Requirements 6.3: When a dynamic rule is matched, update the lastHitAt timestamp
   * 
   * @param ruleId - The ID of the rule to update
   */
  updateRuleHitTimestamp(ruleId: string): void {
    this.ruleRepository.updateLastHit(ruleId);
  }

  /**
   * Clean up old subject tracking records across all subjects
   * Should be called periodically to prevent table bloat
   */
  cleanupOldTrackingRecords(): number {
    const config = this.getConfig();
    
    // Keep records for at least the time window duration
    const cutoffTime = new Date(Date.now() - config.timeWindowMinutes * 60 * 1000 * 2);
    
    const stmt = this.db.prepare(
      `DELETE FROM email_subject_tracker WHERE received_at < ?`
    );
    const result = stmt.run(cutoffTime.toISOString());

    return result.changes;
  }

  /**
   * Clean up subject tracking records older than specified days
   * More aggressive cleanup for disk space management
   * 
   * @param days - Number of days to keep (default: 1)
   * @returns Number of deleted records
   */
  cleanupSubjectTrackerByDays(days: number = 1): number {
    const cutoffTime = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    
    const stmt = this.db.prepare(
      `DELETE FROM email_subject_tracker WHERE received_at < ?`
    );
    const result = stmt.run(cutoffTime.toISOString());

    return result.changes;
  }

  /**
   * Clean up subject tracking records older than specified hours
   * 
   * @param hours - Number of hours to keep (default: 1)
   * @returns Number of deleted records
   */
  cleanupSubjectTrackerByHours(hours: number = 1): number {
    const cutoffTime = new Date(Date.now() - hours * 60 * 60 * 1000);
    
    const stmt = this.db.prepare(
      `DELETE FROM email_subject_tracker WHERE received_at < ?`
    );
    const result = stmt.run(cutoffTime.toISOString());

    return result.changes;
  }

  /**
   * Get subject tracker table statistics
   */
  getSubjectTrackerStats(): { totalRecords: number; oldestRecord: string | null; newestRecord: string | null } {
    const countStmt = this.db.prepare('SELECT COUNT(*) as count FROM email_subject_tracker');
    const countResult = countStmt.get() as { count: number };

    const rangeStmt = this.db.prepare(
      `SELECT MIN(received_at) as oldest, MAX(received_at) as newest FROM email_subject_tracker`
    );
    const rangeResult = rangeStmt.get() as { oldest: string | null; newest: string | null };

    return {
      totalRecords: countResult.count,
      oldestRecord: rangeResult.oldest,
      newestRecord: rangeResult.newest,
    };
  }

  /**
   * Get subject counts within the current time window
   * Useful for monitoring and debugging
   */
  getSubjectCounts(): SubjectCount[] {
    const config = this.getConfig();
    const windowStart = new Date(Date.now() - config.timeWindowMinutes * 60 * 1000);

    const stmt = this.db.prepare(
      `SELECT subject_hash, subject, COUNT(*) as count
       FROM email_subject_tracker
       WHERE received_at >= ?
       GROUP BY subject_hash
       ORDER BY count DESC
       LIMIT 100`
    );
    const rows = stmt.all(windowStart.toISOString()) as { subject_hash: string; subject: string; count: number }[];

    return rows.map(row => ({
      subjectHash: row.subject_hash,
      subject: row.subject,
      count: row.count,
    }));
  }

  /**
   * Check if dynamic rules feature is enabled
   */
  isEnabled(): boolean {
    return this.getConfig().enabled;
  }

  /**
   * Get a dynamic rule by ID
   */
  getDynamicRule(ruleId: string): FilterRule | null {
    const rule = this.ruleRepository.findById(ruleId);
    if (rule && rule.category === 'dynamic') {
      return rule;
    }
    return null;
  }

  /**
   * Get all dynamic rules
   */
  getAllDynamicRules(): FilterRule[] {
    return this.ruleRepository.findAll({ category: 'dynamic' });
  }
}
