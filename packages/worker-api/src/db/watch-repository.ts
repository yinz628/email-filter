/**
 * Watch Repository
 * Handles CRUD operations for watch items and watch hits in D1 database
 * 
 * Requirements: 9.1, 9.2, 9.3, 9.4
 * - Add/delete watch items (9.1)
 * - Record watch hits when emails match (9.2)
 * - Query statistics with time-based counts (9.3, 9.4)
 */

import type { WatchItem, WatchStats, MatchMode } from '@email-filter/shared';
import { generateId } from './index.js';

/**
 * Database row type for watch_items table
 */
interface WatchItemRow {
  id: string;
  subject_pattern: string;
  match_mode: string;
  created_at: string;
}

/**
 * Database row type for watch_hits table
 */
interface WatchHitRow {
  id: string;
  watch_id: string;
  recipient: string;
  hit_at: string;
}

/**
 * Convert database row to WatchItem object
 */
function rowToWatchItem(row: WatchItemRow): WatchItem {
  return {
    id: row.id,
    subjectPattern: row.subject_pattern,
    matchMode: row.match_mode as MatchMode,
    createdAt: new Date(row.created_at),
  };
}

/**
 * Watch Repository class for managing watch items and hits
 */
export class WatchRepository {
  constructor(private db: D1Database) {}

  /**
   * Create a new watch item
   * Requirement 9.1: Add watch items
   */
  async create(subjectPattern: string, matchMode: MatchMode): Promise<WatchItem> {
    const id = generateId();
    const now = new Date().toISOString();

    await this.db
      .prepare(
        `INSERT INTO watch_items (id, subject_pattern, match_mode, created_at)
         VALUES (?, ?, ?, ?)`
      )
      .bind(id, subjectPattern, matchMode, now)
      .run();

    return {
      id,
      subjectPattern,
      matchMode,
      createdAt: new Date(now),
    };
  }


  /**
   * Find a watch item by ID
   */
  async findById(id: string): Promise<WatchItem | null> {
    const result = await this.db
      .prepare('SELECT * FROM watch_items WHERE id = ?')
      .bind(id)
      .first<WatchItemRow>();

    return result ? rowToWatchItem(result) : null;
  }

  /**
   * Get all watch items
   */
  async findAll(): Promise<WatchItem[]> {
    const result = await this.db
      .prepare('SELECT * FROM watch_items ORDER BY created_at DESC')
      .all<WatchItemRow>();

    return (result.results || []).map(rowToWatchItem);
  }

  /**
   * Delete a watch item
   * Requirement 9.1: Delete watch items
   * Note: Watch hits are cascade deleted via foreign key
   */
  async delete(id: string): Promise<boolean> {
    const existing = await this.findById(id);
    if (!existing) {
      return false;
    }

    // Delete associated hits first (in case FK cascade isn't working)
    await this.db
      .prepare('DELETE FROM watch_hits WHERE watch_id = ?')
      .bind(id)
      .run();

    // Delete the watch item
    await this.db
      .prepare('DELETE FROM watch_items WHERE id = ?')
      .bind(id)
      .run();

    return true;
  }

  /**
   * Record a watch hit
   * Requirement 9.2: Record when emails match watch items
   */
  async recordHit(watchId: string, recipient: string): Promise<void> {
    const id = generateId();
    const now = new Date().toISOString();

    await this.db
      .prepare(
        `INSERT INTO watch_hits (id, watch_id, recipient, hit_at)
         VALUES (?, ?, ?, ?)`
      )
      .bind(id, watchId, recipient, now)
      .run();
  }

  /**
   * Get statistics for a specific watch item
   * Requirements 9.3, 9.4: Show counts and recipient list
   */
  async getStatsForWatch(watchId: string): Promise<WatchStats | null> {
    const watchItem = await this.findById(watchId);
    if (!watchItem) {
      return null;
    }

    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000).toISOString();
    const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();

    // Get total count
    const totalResult = await this.db
      .prepare('SELECT COUNT(*) as count FROM watch_hits WHERE watch_id = ?')
      .bind(watchId)
      .first<{ count: number }>();

    // Get 24h count
    const last24hResult = await this.db
      .prepare('SELECT COUNT(*) as count FROM watch_hits WHERE watch_id = ? AND hit_at >= ?')
      .bind(watchId, twentyFourHoursAgo)
      .first<{ count: number }>();

    // Get 1h count
    const last1hResult = await this.db
      .prepare('SELECT COUNT(*) as count FROM watch_hits WHERE watch_id = ? AND hit_at >= ?')
      .bind(watchId, oneHourAgo)
      .first<{ count: number }>();

    // Get unique recipients
    const recipientsResult = await this.db
      .prepare('SELECT DISTINCT recipient FROM watch_hits WHERE watch_id = ?')
      .bind(watchId)
      .all<{ recipient: string }>();

    return {
      watchId,
      subjectPattern: watchItem.subjectPattern,
      totalCount: totalResult?.count ?? 0,
      last24hCount: last24hResult?.count ?? 0,
      last1hCount: last1hResult?.count ?? 0,
      recipients: (recipientsResult.results || []).map(r => r.recipient),
    };
  }


  /**
   * Get statistics for all watch items
   * Requirements 9.3, 9.4: Show counts and recipient list for all items
   */
  async getAllStats(): Promise<WatchStats[]> {
    const watchItems = await this.findAll();
    const stats: WatchStats[] = [];

    // Use batch queries for better performance
    for (const item of watchItems) {
      const itemStats = await this.getStatsForWatch(item.id);
      if (itemStats) {
        stats.push(itemStats);
      }
    }

    return stats;
  }

  /**
   * Check if a watch item exists by pattern
   * Useful for preventing duplicates
   */
  async findByPattern(subjectPattern: string): Promise<WatchItem | null> {
    const result = await this.db
      .prepare('SELECT * FROM watch_items WHERE subject_pattern = ?')
      .bind(subjectPattern)
      .first<WatchItemRow>();

    return result ? rowToWatchItem(result) : null;
  }

  /**
   * Get all hits for a watch item
   */
  async getHitsForWatch(watchId: string): Promise<{ recipient: string; hitAt: Date }[]> {
    const result = await this.db
      .prepare('SELECT recipient, hit_at FROM watch_hits WHERE watch_id = ? ORDER BY hit_at DESC')
      .bind(watchId)
      .all<{ recipient: string; hit_at: string }>();

    return (result.results || []).map(row => ({
      recipient: row.recipient,
      hitAt: new Date(row.hit_at),
    }));
  }

  /**
   * Delete all hits for a watch item
   * Used for testing or manual cleanup
   */
  async deleteHitsForWatch(watchId: string): Promise<void> {
    await this.db
      .prepare('DELETE FROM watch_hits WHERE watch_id = ?')
      .bind(watchId)
      .run();
  }
}
