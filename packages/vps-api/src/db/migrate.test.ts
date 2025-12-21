import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fc from 'fast-check';
import initSqlJs, { Database as SqlJsDatabase } from 'sql.js';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * **Feature: database-consolidation, Property 2: Migration idempotency**
 * **Validates: Requirements 3.1, 3.2**
 *
 * For any database state, running the migration script multiple times
 * SHALL produce the same final state as running it once, without errors.
 */
describe('Migration Idempotency', () => {
  let SQL: any;
  let db: SqlJsDatabase;

  beforeEach(async () => {
    SQL = await initSqlJs();
    db = new SQL.Database();
  });

  afterEach(() => {
    if (db) {
      db.close();
    }
  });

  // Helper functions that mirror the migrate.ts helpers but work with sql.js
  function tableExists(tableName: string): boolean {
    const result = db.exec(
      `SELECT name FROM sqlite_master WHERE type='table' AND name='${tableName}'`
    );
    return result.length > 0 && result[0].values.length > 0;
  }

  function columnExists(tableName: string, columnName: string): boolean {
    if (!tableExists(tableName)) return false;
    const result = db.exec(`PRAGMA table_info(${tableName})`);
    if (result.length === 0) return [];
    const columns = result[0].values.map((row) => row[1] as string);
    return columns.includes(columnName);
  }

  function indexExists(indexName: string): boolean {
    const result = db.exec(
      `SELECT name FROM sqlite_master WHERE type='index' AND name='${indexName}'`
    );
    return result.length > 0 && result[0].values.length > 0;
  }

  function getTableColumns(tableName: string): string[] {
    const result = db.exec(`PRAGMA table_info(${tableName})`);
    if (result.length === 0) return [];
    return result[0].values.map((row) => row[1] as string);
  }

  function getAllTables(): string[] {
    const result = db.exec(
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
    );
    if (result.length === 0) return [];
    return result[0].values.map((row) => row[0] as string);
  }

  // Migration functions adapted for sql.js
  function runMigration_WorkerUrl(): void {
    if (!tableExists('worker_instances')) return;
    if (columnExists('worker_instances', 'worker_url')) return;
    db.run('ALTER TABLE worker_instances ADD COLUMN worker_url TEXT');
  }

  function runMigration_FilterRulesTags(): void {
    if (!tableExists('filter_rules')) return;
    if (columnExists('filter_rules', 'tags')) return;
    db.run('ALTER TABLE filter_rules ADD COLUMN tags TEXT');
  }

  function runMigration_CampaignEmailsWorkerName(): void {
    if (!tableExists('campaign_emails')) return;
    if (columnExists('campaign_emails', 'worker_name')) return;
    db.run("ALTER TABLE campaign_emails ADD COLUMN worker_name TEXT DEFAULT 'global'");
    if (!indexExists('idx_campaign_emails_worker')) {
      db.run('CREATE INDEX idx_campaign_emails_worker ON campaign_emails(worker_name)');
    }
  }

  function runMigration_SystemLogsWorkerName(): void {
    if (!tableExists('system_logs')) return;
    if (columnExists('system_logs', 'worker_name')) return;
    db.run("ALTER TABLE system_logs ADD COLUMN worker_name TEXT DEFAULT 'global'");
    if (!indexExists('idx_logs_worker_name')) {
      db.run('CREATE INDEX idx_logs_worker_name ON system_logs(worker_name)');
    }
  }

  function runMigration_MonitoringRulesTags(): void {
    if (!tableExists('monitoring_rules')) return;
    if (columnExists('monitoring_rules', 'tags')) return;
    db.run("ALTER TABLE monitoring_rules ADD COLUMN tags TEXT NOT NULL DEFAULT '[]'");
  }

  function runMigration_MonitoringRulesWorkerScope(): void {
    if (!tableExists('monitoring_rules')) return;
    if (columnExists('monitoring_rules', 'worker_scope')) return;
    db.run("ALTER TABLE monitoring_rules ADD COLUMN worker_scope TEXT NOT NULL DEFAULT 'global'");
    if (!indexExists('idx_monitoring_rules_worker_scope')) {
      db.run('CREATE INDEX idx_monitoring_rules_worker_scope ON monitoring_rules(worker_scope)');
    }
  }

  function runMigration_MonitoringRulesMatchMode(): void {
    if (!tableExists('monitoring_rules')) return;
    if (columnExists('monitoring_rules', 'match_mode')) return;
    db.run("ALTER TABLE monitoring_rules ADD COLUMN match_mode TEXT NOT NULL DEFAULT 'contains'");
  }

  function runMigration_AlertsWorkerScope(): void {
    if (!tableExists('alerts')) return;
    if (columnExists('alerts', 'worker_scope')) return;
    db.run("ALTER TABLE alerts ADD COLUMN worker_scope TEXT NOT NULL DEFAULT 'global'");
    if (!indexExists('idx_alerts_worker_scope')) {
      db.run('CREATE INDEX idx_alerts_worker_scope ON alerts(worker_scope)');
    }
  }

  function runMigration_RatioMonitorsWorkerScope(): void {
    if (!tableExists('ratio_monitors')) return;
    if (columnExists('ratio_monitors', 'worker_scope')) return;
    db.run("ALTER TABLE ratio_monitors ADD COLUMN worker_scope TEXT NOT NULL DEFAULT 'global'");
    if (!indexExists('idx_ratio_monitors_worker_scope')) {
      db.run('CREATE INDEX idx_ratio_monitors_worker_scope ON ratio_monitors(worker_scope)');
    }
  }

  function runMigration_RatioMonitorsSteps(): void {
    if (!tableExists('ratio_monitors')) return;
    if (columnExists('ratio_monitors', 'steps')) return;
    db.run("ALTER TABLE ratio_monitors ADD COLUMN steps TEXT NOT NULL DEFAULT '[]'");
  }

  function runMigration_RatioStatesStepsData(): void {
    if (!tableExists('ratio_states')) return;
    if (columnExists('ratio_states', 'steps_data')) return;
    db.run("ALTER TABLE ratio_states ADD COLUMN steps_data TEXT NOT NULL DEFAULT '[]'");
  }

  function runMigration_CreateRatioAlerts(): void {
    if (tableExists('ratio_alerts')) return;
    db.run(`
      CREATE TABLE ratio_alerts (
        id TEXT PRIMARY KEY,
        monitor_id TEXT NOT NULL,
        alert_type TEXT NOT NULL,
        previous_state TEXT NOT NULL,
        current_state TEXT NOT NULL,
        first_count INTEGER NOT NULL,
        second_count INTEGER NOT NULL,
        current_ratio REAL NOT NULL,
        message TEXT NOT NULL,
        sent_at TEXT,
        created_at TEXT NOT NULL,
        FOREIGN KEY (monitor_id) REFERENCES ratio_monitors(id) ON DELETE CASCADE
      )
    `);
    db.run('CREATE INDEX idx_ratio_alerts_monitor_id ON ratio_alerts(monitor_id)');
    db.run('CREATE INDEX idx_ratio_alerts_created_at ON ratio_alerts(created_at)');
  }

  // All migrations in order
  const allMigrations = [
    runMigration_WorkerUrl,
    runMigration_FilterRulesTags,
    runMigration_CampaignEmailsWorkerName,
    runMigration_SystemLogsWorkerName,
    runMigration_MonitoringRulesTags,
    runMigration_MonitoringRulesWorkerScope,
    runMigration_MonitoringRulesMatchMode,
    runMigration_AlertsWorkerScope,
    runMigration_RatioMonitorsWorkerScope,
    runMigration_RatioMonitorsSteps,
    runMigration_RatioStatesStepsData,
    runMigration_CreateRatioAlerts,
  ];

  function runAllMigrations(): void {
    for (const migration of allMigrations) {
      migration();
    }
  }

  function getDatabaseState(): { tables: string[]; columns: Record<string, string[]> } {
    const tables = getAllTables().sort();
    const columns: Record<string, string[]> = {};
    for (const table of tables) {
      columns[table] = getTableColumns(table).sort();
    }
    return { tables, columns };
  }

  /**
   * Property test: Running migrations multiple times produces the same result
   */
  it('property: migrations are idempotent - running N times equals running once', () => {
    // First, load the schema to have base tables
    const schemaPath = join(__dirname, 'schema.sql');
    const schema = readFileSync(schemaPath, 'utf-8');
    db.run(schema);

    // Run migrations once and capture state
    runAllMigrations();
    const stateAfterOnce = getDatabaseState();

    // Run migrations multiple times (2-5 times)
    fc.assert(
      fc.property(fc.integer({ min: 2, max: 5 }), (runCount) => {
        // Run migrations N more times
        for (let i = 0; i < runCount; i++) {
          runAllMigrations();
        }

        // State should be identical
        const stateAfterMultiple = getDatabaseState();

        // Same tables
        expect(stateAfterMultiple.tables).toEqual(stateAfterOnce.tables);

        // Same columns in each table
        for (const table of stateAfterOnce.tables) {
          expect(stateAfterMultiple.columns[table]).toEqual(stateAfterOnce.columns[table]);
        }

        return true;
      }),
      { numRuns: 10 }
    );
  });

  /**
   * Property test: Each individual migration is idempotent
   */
  it('property: each individual migration can be run multiple times without error', () => {
    // Load schema first
    const schemaPath = join(__dirname, 'schema.sql');
    const schema = readFileSync(schemaPath, 'utf-8');
    db.run(schema);

    // Test each migration individually
    const migrationArb = fc.constantFrom(...allMigrations);
    const runCountArb = fc.integer({ min: 1, max: 5 });

    fc.assert(
      fc.property(migrationArb, runCountArb, (migration, runCount) => {
        // Running the same migration multiple times should not throw
        for (let i = 0; i < runCount; i++) {
          expect(() => migration()).not.toThrow();
        }
        return true;
      }),
      { numRuns: allMigrations.length * 3 }
    );
  });

  /**
   * Property test: Migrations don't fail on fresh database with schema
   */
  it('property: migrations succeed on fresh database with schema', () => {
    const schemaPath = join(__dirname, 'schema.sql');
    const schema = readFileSync(schemaPath, 'utf-8');
    db.run(schema);

    // All migrations should complete without error
    expect(() => runAllMigrations()).not.toThrow();
  });

  /**
   * Property test: Column existence check is accurate
   */
  it('property: columnExists correctly identifies existing and non-existing columns', () => {
    const schemaPath = join(__dirname, 'schema.sql');
    const schema = readFileSync(schemaPath, 'utf-8');
    db.run(schema);

    // Known existing columns
    expect(columnExists('worker_instances', 'id')).toBe(true);
    expect(columnExists('worker_instances', 'name')).toBe(true);
    expect(columnExists('monitoring_rules', 'merchant')).toBe(true);

    // Non-existing columns
    expect(columnExists('worker_instances', 'nonexistent_column')).toBe(false);
    expect(columnExists('monitoring_rules', 'fake_column')).toBe(false);

    // Non-existing table
    expect(columnExists('nonexistent_table', 'any_column')).toBe(false);
  });

  /**
   * Property test: Table existence check is accurate
   */
  it('property: tableExists correctly identifies existing and non-existing tables', () => {
    const schemaPath = join(__dirname, 'schema.sql');
    const schema = readFileSync(schemaPath, 'utf-8');
    db.run(schema);

    // Known existing tables
    expect(tableExists('worker_instances')).toBe(true);
    expect(tableExists('monitoring_rules')).toBe(true);
    expect(tableExists('alerts')).toBe(true);

    // Non-existing tables
    expect(tableExists('nonexistent_table')).toBe(false);
    expect(tableExists('fake_table')).toBe(false);
  });

  /**
   * Test: Migrations preserve existing data
   */
  it('migrations preserve existing data in tables', () => {
    const schemaPath = join(__dirname, 'schema.sql');
    const schema = readFileSync(schemaPath, 'utf-8');
    db.run(schema);

    // Insert test data
    db.run(`
      INSERT INTO worker_instances (id, name, default_forward_to, enabled, created_at, updated_at)
      VALUES ('test-1', 'test-worker', 'test@example.com', 1, '2024-01-01', '2024-01-01')
    `);

    // Run migrations
    runAllMigrations();

    // Verify data is preserved
    const result = db.exec("SELECT id, name FROM worker_instances WHERE id = 'test-1'");
    expect(result.length).toBe(1);
    expect(result[0].values[0][0]).toBe('test-1');
    expect(result[0].values[0][1]).toBe('test-worker');
  });
});
