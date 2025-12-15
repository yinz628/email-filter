/**
 * Watch Service
 * Handles watch item management, email matching, and statistics
 * 
 * Requirements: 9.1, 9.2, 9.3, 9.4
 * - Add/delete watch items (9.1)
 * - Match emails and record hits (9.2)
 * - Query statistics with time-based counts (9.3)
 * - Show recipient lists (9.4)
 */

import type { WatchItem, WatchStats, CreateWatchDTO, IncomingEmail, MatchMode } from '@email-filter/shared';
import { matchPattern } from '@email-filter/shared';
import { WatchRepository } from '../db/watch-repository.js';

/**
 * Watch Service class for managing watch items and statistics
 */
export class WatchService {
  constructor(private watchRepository: WatchRepository) {}

  /**
   * Add a new watch item
   * Requirement 9.1: Add watch items
   */
  async addWatchItem(dto: CreateWatchDTO): Promise<WatchItem> {
    return this.watchRepository.create(dto.subjectPattern, dto.matchMode);
  }

  /**
   * Delete a watch item
   * Requirement 9.1: Delete watch items
   */
  async deleteWatchItem(id: string): Promise<boolean> {
    return this.watchRepository.delete(id);
  }

  /**
   * Get all watch items
   */
  async getAllWatchItems(): Promise<WatchItem[]> {
    return this.watchRepository.findAll();
  }

  /**
   * Get a watch item by ID
   */
  async getWatchItem(id: string): Promise<WatchItem | null> {
    return this.watchRepository.findById(id);
  }


  /**
   * Check if an email matches any watch items and record hits
   * Requirement 9.2: Match emails and update statistics
   * 
   * @param email - The incoming email to check
   * @returns Array of matched watch items
   */
  async checkAndRecordMatches(email: IncomingEmail): Promise<WatchItem[]> {
    const watchItems = await this.watchRepository.findAll();
    const matchedItems: WatchItem[] = [];

    for (const item of watchItems) {
      if (matchPattern(email.subject, item.subjectPattern, item.matchMode)) {
        // Record the hit
        await this.watchRepository.recordHit(item.id, email.recipient);
        matchedItems.push(item);
      }
    }

    return matchedItems;
  }

  /**
   * Check if an email matches any watch items (without recording)
   * Useful for preview/testing
   */
  async checkMatches(email: IncomingEmail): Promise<WatchItem[]> {
    const watchItems = await this.watchRepository.findAll();
    const matchedItems: WatchItem[] = [];

    for (const item of watchItems) {
      if (matchPattern(email.subject, item.subjectPattern, item.matchMode)) {
        matchedItems.push(item);
      }
    }

    return matchedItems;
  }

  /**
   * Get statistics for a specific watch item
   * Requirements 9.3, 9.4: Show counts and recipient list
   */
  async getWatchStats(watchId: string): Promise<WatchStats | null> {
    return this.watchRepository.getStatsForWatch(watchId);
  }

  /**
   * Get statistics for all watch items
   * Requirements 9.3, 9.4: Show counts and recipient list for all items
   */
  async getAllWatchStats(): Promise<WatchStats[]> {
    return this.watchRepository.getAllStats();
  }

  /**
   * Record a hit for a specific watch item
   * Requirement 9.2: Update statistics when email matches
   */
  async recordHit(watchId: string, recipient: string): Promise<void> {
    await this.watchRepository.recordHit(watchId, recipient);
  }

  /**
   * Get all hits for a watch item
   */
  async getHitsForWatch(watchId: string): Promise<{ recipient: string; hitAt: Date }[]> {
    return this.watchRepository.getHitsForWatch(watchId);
  }

  /**
   * Check if a watch item exists by pattern
   */
  async findByPattern(subjectPattern: string): Promise<WatchItem | null> {
    return this.watchRepository.findByPattern(subjectPattern);
  }
}
