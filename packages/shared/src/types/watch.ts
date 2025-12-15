import type { MatchMode } from './filter-rule.js';

/**
 * Watch item for tracking important emails
 */
export interface WatchItem {
  id: string;
  subjectPattern: string;
  matchMode: MatchMode;
  createdAt: Date;
}

/**
 * Statistics for a watch item
 */
export interface WatchStats {
  watchId: string;
  subjectPattern: string;
  totalCount: number;
  last24hCount: number;
  last1hCount: number;
  recipients: string[]; // List of recipient emails that matched
}

/**
 * DTO for creating a watch item
 */
export interface CreateWatchDTO {
  subjectPattern: string;
  matchMode: MatchMode;
}
