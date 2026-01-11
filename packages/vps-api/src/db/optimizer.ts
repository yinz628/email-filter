import Database from 'better-sqlite3';

/**
 * Database optimization configuration
 * Based on Requirements 1.1, 1.2, 1.3, 6.3
 */
export interface DatabaseConfig {
  journalMode: 'WAL';
  synchronous: 'NORMAL';
  cacheSize: number;      // 10000 pages (~40MB)
  tempStore: 'MEMORY';
  mmapSize: number;       // 256MB
  busyTimeout: number;    // 5000ms
}

/**
 * Default optimization configuration
 */
export const DEFAULT_CONFIG: DatabaseConfig = {
  journalMode: 'WAL',
  synchronous: 'NORMAL',
  cacheSize: 10000,
  tempStore: 'MEMORY',
  mmapSize: 268435456,  // 256MB
  busyTimeout: 5000,
};

/**
 * Required indexes for optimal query performance
 * Based on Requirements 6.1, 6.2, 6.3
 */
export const REQUIRED_INDEXES = [
  {
    name: 'idx_subject_tracker_hash_time',
    table: 'email_subject_tracker',
    columns: ['subject_hash', 'received_at'],
  },
  {
    name: 'idx_filter_rules_category',
    table: 'filter_rules',
    columns: ['category', 'enabled'],
  },
  {
    name: 'idx_filter_rules_worker_enabled',
    table: 'filter_rules',
    columns: ['worker_id', 'enabled'],
  },
];

/**
 * Apply performance optimizations to the database
 * Configures WAL mode and pragmas for optimal performance
 * 
 * @param db - The database instance to optimize
 * @param config - Optional configuration override
 * 
 * Requirements: 1.1, 1.2, 1.3
 */
export function applyOptimizations(
  db: Database.Database,
  config: DatabaseConfig = DEFAULT_CONFIG
): void {
  // Enable WAL mode for concurrent read/write (Requirement 1.1)
  db.pragma(`journal_mode = ${config.journalMode}`);
  
  // Set synchronous mode (Requirement 1.2)
  db.pragma(`synchronous = ${config.synchronous}`);
  
  // Set cache size (Requirement 1.2)
  db.pragma(`cache_size = ${config.cacheSize}`);
  
  // Set temp store to memory (Requirement 1.2)
  db.pragma(`temp_store = ${config.tempStore}`);
  
  // Set mmap size (Requirement 1.2)
  db.pragma(`mmap_size = ${config.mmapSize}`);
  
  // Set busy timeout for lock contention (Requirement 1.3)
  db.pragma(`busy_timeout = ${config.busyTimeout}`);
}

/**
 * Check if an index exists in the database
 * 
 * @param db - The database instance
 * @param indexName - Name of the index to check
 * @returns true if the index exists
 */
export function indexExists(db: Database.Database, indexName: string): boolean {
  const result = db.prepare(
    `SELECT name FROM sqlite_master WHERE type='index' AND name=?`
  ).get(indexName);
  return result !== undefined;
}

/**
 * Verify and create missing indexes for optimal query performance
 * 
 * @param db - The database instance
 * @returns Array of created index names
 * 
 * Requirements: 6.1, 6.2, 6.3
 */
export function verifyIndexes(db: Database.Database): string[] {
  const createdIndexes: string[] = [];
  
  for (const index of REQUIRED_INDEXES) {
    if (!indexExists(db, index.name)) {
      const columnsStr = index.columns.join(', ');
      const sql = `CREATE INDEX IF NOT EXISTS ${index.name} ON ${index.table}(${columnsStr})`;
      db.exec(sql);
      createdIndexes.push(index.name);
    }
  }
  
  return createdIndexes;
}

/**
 * Get the current pragma value
 * 
 * @param db - The database instance
 * @param pragma - Name of the pragma
 * @returns The pragma value
 */
export function getPragmaValue(db: Database.Database, pragma: string): unknown {
  const result = db.pragma(pragma);
  if (Array.isArray(result) && result.length > 0) {
    const firstResult = result[0];
    // Return the first value from the result object
    return Object.values(firstResult)[0];
  }
  return result;
}

/**
 * Verify that all optimizations are correctly applied
 * 
 * @param db - The database instance
 * @returns Object with verification results
 */
export function verifyOptimizations(db: Database.Database): {
  walEnabled: boolean;
  synchronous: string;
  cacheSize: number;
  tempStore: string;
  mmapSize: number;
  busyTimeout: number;
} {
  return {
    walEnabled: getPragmaValue(db, 'journal_mode') === 'wal',
    synchronous: String(getPragmaValue(db, 'synchronous')),
    cacheSize: Number(getPragmaValue(db, 'cache_size')),
    tempStore: String(getPragmaValue(db, 'temp_store')),
    mmapSize: Number(getPragmaValue(db, 'mmap_size')),
    busyTimeout: Number(getPragmaValue(db, 'busy_timeout')),
  };
}
