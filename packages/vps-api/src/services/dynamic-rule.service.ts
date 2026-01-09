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
import { getRuleCache } from './rule-cache.instance.js';
import type { FilterResult } from './filter.service.js';

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
   * 
   * Requirements 4.1, 6.1: Supports timeSpanThresholdMinutes configuration
   * If not present in database, uses default value of 3 minutes
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
        case 'timeSpanThresholdMinutes':
          config.timeSpanThresholdMinutes = parseInt(row.value, 10);
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
   * Check if an email should be tracked for dynamic rule detection
   * 
   * Requirements 3.1, 3.2, 3.3, 3.4:
   * - Only track emails that are forwarded by default (no rule matched)
   * - Do NOT track emails that match whitelist, blacklist, or existing dynamic rules
   * 
   * @param filterResult - The result from the filter engine
   * @returns true if the email should be tracked, false otherwise
   */
  shouldTrack(filterResult: FilterResult): boolean {
    // Only track emails that are forwarded by default (no rule matched)
    // matchedCategory is undefined when no rule matched
    return filterResult.matchedCategory === undefined;
  }

  /**
   * Update the dynamic configuration
   * 
   * Requirements 4.1: Supports saving timeSpanThresholdMinutes configuration
   */
  updateConfig(config: Partial<DynamicConfig>): DynamicConfig {
    const currentConfig = this.getConfig();
    const newConfig = { ...currentConfig, ...config };

    // Upsert each config value
    const entries = [
      ['enabled', String(newConfig.enabled)],
      ['timeWindowMinutes', String(newConfig.timeWindowMinutes)],
      ['thresholdCount', String(newConfig.thresholdCount)],
      ['timeSpanThresholdMinutes', String(newConfig.timeSpanThresholdMinutes)],
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
   * Common email subject prefixes to strip for better grouping
   */
  private static readonly SUBJECT_PREFIXES = [
    // Urgency prefixes
    /^don'?t miss( out)?[!:]?\s*/i,
    /^trending[!:]?\s*/i,
    /^hot[!:]?\s*/i,
    /^new[!:]?\s*/i,
    /^breaking[!:]?\s*/i,
    /^urgent[!:]?\s*/i,
    /^important[!:]?\s*/i,
    /^reminder[!:]?\s*/i,
    /^last chance[!:]?\s*/i,
    /^final[!:]?\s*/i,
    /^limited time[!:]?\s*/i,
    /^act now[!:]?\s*/i,
    /^hurry[!:]?\s*/i,
    // Reply/Forward prefixes
    /^re:\s*/i,
    /^fw:\s*/i,
    /^fwd:\s*/i,
    // Marketing prefixes
    /^sale[!:]?\s*/i,
    /^flash sale[!:]?\s*/i,
    /^exclusive[!:]?\s*/i,
    /^special[!:]?\s*/i,
    /^\[.*?\]\s*/,  // [Newsletter], [Update], etc.
    /^【.*?】\s*/,   // Chinese brackets
  ];

  /**
   * Normalize subject by removing common prefixes
   * This helps group similar subjects together
   */
  private normalizeSubject(subject: string): string {
    let normalized = subject.trim();
    
    // Apply prefix removal multiple times (for chained prefixes like "RE: Don't miss!")
    for (let i = 0; i < 3; i++) {
      const before = normalized;
      for (const prefix of DynamicRuleService.SUBJECT_PREFIXES) {
        normalized = normalized.replace(prefix, '');
      }
      if (normalized === before) break;
    }
    
    return normalized.trim();
  }

  /**
   * Generate a hash for a subject string
   * Used for efficient grouping and lookup
   */
  private hashSubject(subject: string): string {
    // Normalize subject before hashing to group similar subjects
    const normalized = this.normalizeSubject(subject).toLowerCase();
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
   * Implements "count first, then time span" detection logic:
   * 1. First count emails with the same subject within the time window
   * 2. When count reaches threshold, calculate time span between first and Nth email
   * 3. If time span <= threshold, create rule
   * 4. If time span > threshold, don't create rule but continue tracking
   * 
   * Requirements 1.1, 1.2, 1.3, 1.4, 2.1, 2.2:
   * - Count emails first, then check time span
   * - Only consider emails within the configured time window
   * - Create rule only when time span is within threshold
   * 
   * @param subject - The email subject to track
   * @param receivedAt - When the email was received
   * @returns The created dynamic rule if threshold was exceeded and time span is within limit, null otherwise
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

    // Requirements 2.1: Only consider emails within the configured time window
    const windowStart = new Date(receivedAt.getTime() - config.timeWindowMinutes * 60 * 1000);
    const windowStartStr = windowStart.toISOString();

    // Requirements 1.1: First count the number of emails with the same subject
    const countStmt = this.db.prepare(
      `SELECT COUNT(*) as count FROM email_subject_tracker
       WHERE subject_hash = ? AND received_at >= ?`
    );
    const countResult = countStmt.get(subjectHash, windowStartStr) as { count: number };
    const count = countResult?.count || 0;

    // Requirements 1.2: When count reaches threshold, calculate time span
    if (count >= config.thresholdCount) {
      // Get the first and Nth (threshold) email timestamps within the window
      const timestampsStmt = this.db.prepare(
        `SELECT received_at FROM email_subject_tracker
         WHERE subject_hash = ? AND received_at >= ?
         ORDER BY received_at ASC
         LIMIT ?`
      );
      const timestamps = timestampsStmt.all(subjectHash, windowStartStr, config.thresholdCount) as { received_at: string }[];
      
      if (timestamps.length >= config.thresholdCount) {
        const firstEmailTime = new Date(timestamps[0].received_at);
        const nthEmailTime = new Date(timestamps[config.thresholdCount - 1].received_at);
        
        // Requirements 2.2: Calculate time span between first and Nth email
        const timeSpanMinutes = (nthEmailTime.getTime() - firstEmailTime.getTime()) / (60 * 1000);
        
        // Requirements 1.3: Create rule only if time span <= threshold
        // Requirements 1.4: Don't create rule if time span > threshold
        if (timeSpanMinutes <= config.timeSpanThresholdMinutes) {
          // Use normalized subject for rule pattern (removes common prefixes)
          const normalizedSubject = this.normalizeSubject(subject);
          
          // Check if a dynamic rule for this subject already exists
          const existingRule = this.findDynamicRuleBySubject(normalizedSubject);
          if (existingRule) {
            // Update lastHitAt for existing rule
            this.ruleRepository.updateLastHit(existingRule.id);
            return existingRule;
          }

          // Create new dynamic rule with normalized subject
          const ruleDto: CreateRuleDTO = {
            category: 'dynamic',
            matchType: 'subject',
            matchMode: 'contains',
            pattern: normalizedSubject,
            enabled: true,
          };

          const newRule = this.ruleRepository.create(ruleDto);
          
          // Invalidate rule cache so the new rule takes effect immediately
          // This is critical for dynamic rules to work in real-time
          const ruleCache = getRuleCache();
          ruleCache.invalidateAll();
          
          // Clean up old tracking records for this subject
          this.cleanupSubjectTracker(subjectHash, windowStart);

          return newRule;
        }
        // Time span exceeds threshold - continue tracking but don't create rule
      }
    }

    return null;
  }


  /**
   * Find an existing dynamic rule that matches a subject
   * Checks both:
   * 1. Exact match (pattern === subject)
   * 2. Contains match (subject contains pattern OR pattern contains subject)
   */
  private findDynamicRuleBySubject(subject: string): FilterRule | null {
    // First try exact match for better performance
    const exactStmt = this.db.prepare(
      `SELECT * FROM filter_rules 
       WHERE category = 'dynamic' AND match_type = 'subject' AND pattern = ?
       LIMIT 1`
    );
    const exactResult = exactStmt.get(subject) as {
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

    if (exactResult) {
      return this.mapRuleRow(exactResult);
    }

    // Check if any existing rule's pattern is contained in this subject
    // or if this subject is contained in any existing rule's pattern
    const allDynamicStmt = this.db.prepare(
      `SELECT * FROM filter_rules 
       WHERE category = 'dynamic' AND match_type = 'subject' AND match_mode = 'contains'`
    );
    const allRules = allDynamicStmt.all() as {
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

    const subjectLower = subject.toLowerCase();
    for (const rule of allRules) {
      const patternLower = rule.pattern.toLowerCase();
      // If existing pattern matches this subject, return that rule
      if (subjectLower.includes(patternLower)) {
        return this.mapRuleRow(rule);
      }
      // If this subject would be a more specific version, also return existing rule
      // (e.g., "Don't miss! Sale" contains "Sale", so "Sale" rule already covers it)
      if (patternLower.includes(subjectLower)) {
        return this.mapRuleRow(rule);
      }
    }

    return null;
  }

  /**
   * Map database row to FilterRule object
   */
  private mapRuleRow(row: {
    id: string;
    category: string;
    match_type: string;
    match_mode: string;
    pattern: string;
    enabled: number;
    created_at: string;
    updated_at: string;
    last_hit_at: string | null;
  }): FilterRule {
    return {
      id: row.id,
      category: row.category as 'dynamic',
      matchType: row.match_type as FilterRule['matchType'],
      matchMode: row.match_mode as FilterRule['matchMode'],
      pattern: row.pattern,
      enabled: row.enabled === 1,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
      lastHitAt: row.last_hit_at ? new Date(row.last_hit_at) : undefined,
    };
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

    return rows.map(row => this.mapRuleRow(row));
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
