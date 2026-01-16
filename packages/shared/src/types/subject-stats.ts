/**
 * Email Subject Display Types
 * Types for tracking and displaying email subject statistics
 */

// ============================================
// Core Entity Types
// ============================================

/**
 * Subject statistics record - represents a unique subject from a worker instance
 */
export interface SubjectStat {
  id: string;
  subject: string;
  subjectHash: string;
  merchantDomain: string;
  workerName: string;
  emailCount: number;
  isFocused: boolean;
  firstSeenAt: Date;
  lastSeenAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Aggregated subject statistics for list display
 * Groups data from multiple worker instances
 */
export interface AggregatedSubjectStat {
  subject: string;
  subjectHash: string;
  merchantDomain: string;
  totalEmailCount: number;
  isFocused: boolean;
  firstSeenAt: Date;
  lastSeenAt: Date;
  workerStats: WorkerSubjectStat[];
}

/**
 * Subject statistics for a single worker instance
 */
export interface WorkerSubjectStat {
  id: string;
  workerName: string;
  emailCount: number;
  lastSeenAt: Date;
}

// ============================================
// Filter and Query Types
// ============================================

/**
 * Filter options for querying subject statistics
 */
export interface SubjectStatsFilter {
  workerName?: string;
  isFocused?: boolean;
  sortBy?: 'emailCount' | 'lastSeenAt' | 'firstSeenAt';
  sortOrder?: 'asc' | 'desc';
  limit?: number;
  offset?: number;
}

/**
 * Paginated list response for subject statistics
 */
export interface SubjectStatsList {
  items: AggregatedSubjectStat[];
  total: number;
  limit: number;
  offset: number;
}

// ============================================
// DTO Types (Data Transfer Objects)
// ============================================

/**
 * DTO for tracking a subject
 */
export interface TrackSubjectDTO {
  subject: string;
  sender: string;
  workerName: string;
  receivedAt?: string;
}

/**
 * Result of tracking a subject
 */
export interface TrackSubjectResult {
  id: string;
  isNew: boolean;
  emailCount: number;
}

// ============================================
// Storage Statistics Types
// ============================================

/**
 * Storage statistics for subject stats
 */
export interface SubjectStorageStats {
  totalRecords: number;
  totalSubjects: number;
  totalEmailCount: number;
  focusedCount: number;
  oldestRecordDate: Date | null;
  newestRecordDate: Date | null;
  workerDistribution: WorkerDistribution[];
}

/**
 * Worker distribution statistics
 */
export interface WorkerDistribution {
  workerName: string;
  count: number;
}

// ============================================
// Database Row Types (for internal use)
// ============================================

/**
 * Raw subject stats row from database
 */
export interface SubjectStatRow {
  id: string;
  subject: string;
  subject_hash: string;
  merchant_domain: string;
  worker_name: string;
  email_count: number;
  is_focused: number;
  first_seen_at: string;
  last_seen_at: string;
  created_at: string;
  updated_at: string;
}

// ============================================
// Utility Functions for Type Conversion
// ============================================

/**
 * Convert SubjectStatRow to SubjectStat
 */
export function toSubjectStat(row: SubjectStatRow): SubjectStat {
  return {
    id: row.id,
    subject: row.subject,
    subjectHash: row.subject_hash,
    merchantDomain: row.merchant_domain,
    workerName: row.worker_name,
    emailCount: row.email_count,
    isFocused: row.is_focused === 1,
    firstSeenAt: new Date(row.first_seen_at),
    lastSeenAt: new Date(row.last_seen_at),
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

/**
 * Extract domain from email address
 * Returns the domain portion after @ in lowercase
 */
export function extractDomainFromEmail(email: string): string {
  if (!email || typeof email !== 'string') {
    return '';
  }
  
  const atIndex = email.lastIndexOf('@');
  if (atIndex === -1 || atIndex === email.length - 1) {
    return '';
  }
  
  return email.substring(atIndex + 1).toLowerCase().trim();
}
