import type { Database } from 'better-sqlite3';

/**
 * Statistics for a single table
 */
export interface TableStats {
  tableName: string;
  recordCount: number;
  oldestRecordDate: Date | null;
  newestRecordDate: Date | null;
}

/**
 * Combined cleanup statistics for all tables
 */
export interface CleanupStats {
  tables: TableStats[];
  totalRecords: number;
  lastCleanupAt: Date | null;
  lastCleanupResult: string | null;
}

/**
 * Table configuration for statistics queries
 */
interface TableConfig {
  name: string;
  dateColumn: string;
}

/**
 * All cleanable tables with their date columns
 */
const CLEANABLE_TABLES: TableConfig[] = [
  { name: 'system_logs', dateColumn: 'created_at' },
  { name: 'hit_logs', dateColumn: 'created_at' },
  { name: 'alerts', dateColumn: 'created_at' },
  { name: 'heartbeat_logs', dateColumn: 'checked_at' },
  { name: 'email_subject_tracker', dateColumn: 'received_at' },
  { name: 'subject_stats', dateColumn: 'last_seen_at' },
];

/**
 * Service for retrieving cleanup statistics
 * 
 * Provides record counts and date ranges for all cleanable tables,
 * as well as information about the last cleanup operation.
 */
export class CleanupStatsService {
  constructor(private db: Database) {}

  /**
   * Get statistics for a single table
   * 
   * @param tableName - Name of the table to get statistics for
   * @returns TableStats with record count and date range
   */
  getTableStats(tableName: string): TableStats {
    const tableConfig = CLEANABLE_TABLES.find(t => t.name === tableName);
    
    if (!tableConfig) {
      return {
        tableName,
        recordCount: 0,
        oldestRecordDate: null,
        newestRecordDate: null,
      };
    }

    const { dateColumn } = tableConfig;

    // Get record count
    const countStmt = this.db.prepare(`SELECT COUNT(*) as count FROM ${tableName}`);
    const countResult = countStmt.get() as { count: number };
    const recordCount = countResult?.count ?? 0;

    // Get oldest and newest record dates
    const dateStmt = this.db.prepare(`
      SELECT 
        MIN(${dateColumn}) as oldest,
        MAX(${dateColumn}) as newest
      FROM ${tableName}
    `);
    const dateResult = dateStmt.get() as { oldest: string | null; newest: string | null };

    return {
      tableName,
      recordCount,
      oldestRecordDate: dateResult?.oldest ? new Date(dateResult.oldest) : null,
      newestRecordDate: dateResult?.newest ? new Date(dateResult.newest) : null,
    };
  }

  /**
   * Get statistics for all cleanable tables
   * 
   * @returns CleanupStats with all table statistics and cleanup info
   */
  getStats(): CleanupStats {
    const tables: TableStats[] = CLEANABLE_TABLES.map(tableConfig => 
      this.getTableStats(tableConfig.name)
    );

    const totalRecords = tables.reduce((sum, table) => sum + table.recordCount, 0);

    // Get last cleanup info from cleanup_config
    let lastCleanupAt: Date | null = null;
    let lastCleanupResult: string | null = null;

    try {
      const lastCleanupStmt = this.db.prepare(
        "SELECT value FROM cleanup_config WHERE key = 'last_cleanup_at'"
      );
      const lastCleanupRow = lastCleanupStmt.get() as { value: string } | undefined;
      if (lastCleanupRow?.value) {
        lastCleanupAt = new Date(lastCleanupRow.value);
      }

      const lastResultStmt = this.db.prepare(
        "SELECT value FROM cleanup_config WHERE key = 'last_cleanup_result'"
      );
      const lastResultRow = lastResultStmt.get() as { value: string } | undefined;
      if (lastResultRow?.value) {
        lastCleanupResult = lastResultRow.value;
      }
    } catch {
      // cleanup_config table might not exist or have these keys
    }

    return {
      tables,
      totalRecords,
      lastCleanupAt,
      lastCleanupResult,
    };
  }

  /**
   * Get the list of all cleanable table names
   * 
   * @returns Array of table names that can be cleaned
   */
  static getCleanableTableNames(): string[] {
    return CLEANABLE_TABLES.map(t => t.name);
  }
}
