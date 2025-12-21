import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fc from 'fast-check';
import initSqlJs, { Database as SqlJsDatabase } from 'sql.js';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * **Feature: database-consolidation, Property 1: Schema completeness after initialization**
 * **Validates: Requirements 1.1, 1.3**
 *
 * For any fresh database initialization, all required tables SHALL exist
 * with all required columns after schema.sql execution completes.
 */
describe('Schema Completeness', () => {
  let SQL: any;
  let db: SqlJsDatabase;

  beforeEach(async () => {
    SQL = await initSqlJs();
    db = new SQL.Database();

    // Load and execute the consolidated schema
    const schemaPath = join(__dirname, 'schema.sql');
    const schema = readFileSync(schemaPath, 'utf-8');
    db.run(schema);
  });

  afterEach(() => {
    if (db) {
      db.close();
    }
  });

  // Helper to get all tables in the database
  function getAllTables(): string[] {
    const result = db.exec("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'");
    if (result.length === 0) return [];
    return result[0].values.map((row) => row[0] as string);
  }

  // Helper to get columns for a table
  function getTableColumns(tableName: string): { name: string; type: string; notnull: number }[] {
    const result = db.exec(`PRAGMA table_info(${tableName})`);
    if (result.length === 0) return [];
    return result[0].values.map((row) => ({
      name: row[1] as string,
      type: row[2] as string,
      notnull: row[3] as number,
    }));
  }

  // Expected tables and their required columns
  const expectedTables: Record<string, string[]> = {
    // Core Tables
    worker_instances: ['id', 'name', 'domain', 'default_forward_to', 'worker_url', 'enabled', 'created_at', 'updated_at'],
    filter_rules: ['id', 'worker_id', 'category', 'match_type', 'match_mode', 'pattern', 'tags', 'enabled', 'created_at', 'updated_at', 'last_hit_at'],
    rule_stats: ['rule_id', 'total_processed', 'deleted_count', 'error_count', 'last_updated'],
    dynamic_config: ['key', 'value'],
    forward_config: ['id', 'default_forward_to', 'updated_at'],
    email_subject_tracker: ['id', 'worker_id', 'subject_hash', 'subject', 'received_at'],
    global_stats: ['id', 'total_processed', 'total_forwarded', 'total_deleted', 'last_updated'],
    watch_rules: ['id', 'name', 'match_type', 'match_mode', 'pattern', 'enabled', 'created_at', 'updated_at'],
    watch_stats: ['rule_id', 'hit_count', 'last_hit_at'],
    system_logs: ['id', 'category', 'level', 'message', 'details', 'worker_name', 'created_at'],

    // Monitoring Tables (from monitoring-schema.sql)
    monitoring_rules: ['id', 'merchant', 'name', 'subject_pattern', 'match_mode', 'expected_interval_minutes', 'dead_after_minutes', 'tags', 'worker_scope', 'enabled', 'created_at', 'updated_at'],
    hit_logs: ['id', 'rule_id', 'sender', 'subject', 'recipient', 'received_at', 'created_at'],
    alerts: ['id', 'rule_id', 'alert_type', 'previous_state', 'current_state', 'gap_minutes', 'count_1h', 'count_12h', 'count_24h', 'message', 'worker_scope', 'sent_at', 'created_at'],
    heartbeat_logs: ['id', 'checked_at', 'rules_checked', 'state_changes', 'alerts_triggered', 'duration_ms'],
    signal_states: ['rule_id', 'state', 'last_seen_at', 'count_1h', 'count_12h', 'count_24h', 'updated_at'],
    alert_channels: ['id', 'channel_type', 'config', 'enabled', 'created_at', 'updated_at'],

    // Ratio Monitoring Tables
    ratio_monitors: ['id', 'name', 'tag', 'first_rule_id', 'second_rule_id', 'steps', 'threshold_percent', 'time_window', 'worker_scope', 'enabled', 'created_at', 'updated_at'],
    ratio_states: ['monitor_id', 'state', 'first_count', 'second_count', 'current_ratio', 'steps_data', 'updated_at'],
    ratio_alerts: ['id', 'monitor_id', 'alert_type', 'previous_state', 'current_state', 'first_count', 'second_count', 'current_ratio', 'message', 'sent_at', 'created_at'],

    // Campaign Analytics Tables
    merchants: ['id', 'domain', 'display_name', 'note', 'analysis_status', 'total_campaigns', 'valuable_campaigns', 'total_emails', 'created_at', 'updated_at'],
    campaigns: ['id', 'merchant_id', 'subject', 'subject_hash', 'is_valuable', 'valuable_note', 'total_emails', 'unique_recipients', 'first_seen_at', 'last_seen_at', 'created_at', 'updated_at'],
    campaign_emails: ['id', 'campaign_id', 'recipient', 'received_at', 'worker_name'],
    recipient_paths: ['id', 'merchant_id', 'recipient', 'campaign_id', 'sequence_order', 'first_received_at'],
    analysis_projects: ['id', 'name', 'merchant_id', 'worker_name', 'worker_names', 'status', 'note', 'last_analysis_time', 'created_at', 'updated_at'],
    project_root_campaigns: ['id', 'project_id', 'campaign_id', 'is_confirmed', 'created_at'],
    project_new_users: ['id', 'project_id', 'recipient', 'first_root_campaign_id', 'created_at'],
    project_user_events: ['id', 'project_id', 'recipient', 'campaign_id', 'seq', 'received_at'],
    project_path_edges: ['id', 'project_id', 'from_campaign_id', 'to_campaign_id', 'user_count', 'updated_at'],
    project_campaign_tags: ['id', 'project_id', 'campaign_id', 'tag', 'tag_note', 'created_at', 'updated_at'],
    merchant_worker_status: ['id', 'merchant_id', 'worker_name', 'display_name', 'analysis_status', 'created_at', 'updated_at'],

    // User Authentication Tables
    users: ['id', 'username', 'password_hash', 'role', 'created_at', 'updated_at'],
    user_settings: ['id', 'user_id', 'key', 'value', 'updated_at'],
    token_blacklist: ['id', 'token_hash', 'expires_at', 'created_at'],
  };

  it('should create all required tables after schema initialization', () => {
    const actualTables = getAllTables();

    for (const tableName of Object.keys(expectedTables)) {
      expect(actualTables, `Table ${tableName} should exist`).toContain(tableName);
    }
  });

  it('should have all required columns in each table', () => {
    for (const [tableName, expectedColumns] of Object.entries(expectedTables)) {
      const actualColumns = getTableColumns(tableName).map((c) => c.name);

      for (const column of expectedColumns) {
        expect(actualColumns, `Table ${tableName} should have column ${column}`).toContain(column);
      }
    }
  });

  /**
   * Property test: For any table in the expected schema, all columns should exist
   */
  it('property: all expected tables have all expected columns', () => {
    const tableNames = Object.keys(expectedTables);
    const tableArb = fc.constantFrom(...tableNames);

    fc.assert(
      fc.property(tableArb, (tableName) => {
        const expectedColumns = expectedTables[tableName];
        const actualColumns = getTableColumns(tableName).map((c) => c.name);

        // Every expected column should exist
        for (const column of expectedColumns) {
          if (!actualColumns.includes(column)) {
            return false;
          }
        }
        return true;
      }),
      { numRuns: tableNames.length * 3 }
    );
  });

  /**
   * Property test: monitoring_rules table has correct structure for realtime monitoring
   */
  it('property: monitoring_rules has all columns required by monitoring service', () => {
    const requiredColumns = [
      'id',
      'merchant',
      'name',
      'subject_pattern',
      'match_mode',
      'expected_interval_minutes',
      'dead_after_minutes',
      'tags',
      'worker_scope',
      'enabled',
      'created_at',
      'updated_at',
    ];

    const actualColumns = getTableColumns('monitoring_rules').map((c) => c.name);

    for (const column of requiredColumns) {
      expect(actualColumns, `monitoring_rules should have column ${column}`).toContain(column);
    }
  });

  /**
   * Property test: alerts table has correct structure for state transition alerts
   */
  it('property: alerts has all columns required by alert service', () => {
    const requiredColumns = [
      'id',
      'rule_id',
      'alert_type',
      'previous_state',
      'current_state',
      'gap_minutes',
      'count_1h',
      'count_12h',
      'count_24h',
      'message',
      'worker_scope',
      'sent_at',
      'created_at',
    ];

    const actualColumns = getTableColumns('alerts').map((c) => c.name);

    for (const column of requiredColumns) {
      expect(actualColumns, `alerts should have column ${column}`).toContain(column);
    }
  });

  /**
   * Property test: campaign_emails table has worker_name column
   */
  it('property: campaign_emails has worker_name column', () => {
    const actualColumns = getTableColumns('campaign_emails').map((c) => c.name);
    expect(actualColumns).toContain('worker_name');
  });
});


/**
 * **Feature: database-consolidation, Property 4: Test suite passes**
 * **Validates: Requirements 8.1**
 *
 * For any code change in this consolidation, the full test suite SHALL pass without failures.
 * This test validates that the test infrastructure is working correctly and that
 * the consolidated schema is consistent with what tests expect.
 */
describe('Test Suite Consistency', () => {
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

  /**
   * Property test: Schema can be loaded without errors
   */
  it('property: consolidated schema loads without errors', () => {
    const schemaPath = join(__dirname, 'schema.sql');
    const schema = readFileSync(schemaPath, 'utf-8');
    
    // Loading schema should not throw
    expect(() => db.run(schema)).not.toThrow();
  });

  /**
   * Property test: Schema can be loaded multiple times (idempotent table creation)
   */
  it('property: schema uses IF NOT EXISTS for idempotent loading', () => {
    const schemaPath = join(__dirname, 'schema.sql');
    const schema = readFileSync(schemaPath, 'utf-8');
    
    // First load
    db.run(schema);
    
    // Second load should not throw (IF NOT EXISTS)
    expect(() => db.run(schema)).not.toThrow();
  });

  /**
   * Property test: All foreign key references are valid
   */
  it('property: all foreign key references point to existing tables', () => {
    const schemaPath = join(__dirname, 'schema.sql');
    const schema = readFileSync(schemaPath, 'utf-8');
    db.run(schema);

    // Get all tables
    const tablesResult = db.exec("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'");
    const tables = tablesResult.length > 0 ? tablesResult[0].values.map(row => row[0] as string) : [];

    // For each table, check foreign keys
    for (const table of tables) {
      const fkResult = db.exec(`PRAGMA foreign_key_list(${table})`);
      if (fkResult.length > 0) {
        for (const fk of fkResult[0].values) {
          const referencedTable = fk[2] as string;
          expect(tables, `Foreign key in ${table} references non-existent table ${referencedTable}`).toContain(referencedTable);
        }
      }
    }
  });

  /**
   * Property test: Test fixtures can be created for all tables
   */
  it('property: test data can be inserted into all core tables', () => {
    const schemaPath = join(__dirname, 'schema.sql');
    const schema = readFileSync(schemaPath, 'utf-8');
    db.run(schema);

    const now = new Date().toISOString();

    // Test inserting into core tables (in dependency order)
    expect(() => {
      // Worker instances (no dependencies)
      db.run(`INSERT INTO worker_instances (id, name, default_forward_to, enabled, created_at, updated_at) 
              VALUES ('test-worker-1', 'test-worker', 'test@example.com', 1, '${now}', '${now}')`);

      // Filter rules (depends on worker_instances)
      db.run(`INSERT INTO filter_rules (id, worker_id, category, match_type, match_mode, pattern, enabled, created_at, updated_at) 
              VALUES ('test-rule-1', 'test-worker-1', 'whitelist', 'sender', 'exact', 'test@example.com', 1, '${now}', '${now}')`);

      // Monitoring rules (no dependencies)
      db.run(`INSERT INTO monitoring_rules (id, merchant, name, subject_pattern, expected_interval_minutes, dead_after_minutes, created_at, updated_at) 
              VALUES ('test-monitor-1', 'test-merchant', 'Test Rule', 'test%', 60, 120, '${now}', '${now}')`);

      // Alerts (depends on monitoring_rules)
      db.run(`INSERT INTO alerts (id, rule_id, alert_type, previous_state, current_state, gap_minutes, count_1h, count_12h, count_24h, message, created_at) 
              VALUES ('test-alert-1', 'test-monitor-1', 'state_change', 'HEALTHY', 'DEAD', 120, 0, 0, 0, 'Test alert', '${now}')`);

      // Users (no dependencies)
      db.run(`INSERT INTO users (id, username, password_hash, role, created_at, updated_at) 
              VALUES ('test-user-1', 'testuser', 'hash123', 'user', '${now}', '${now}')`);

      // User settings (depends on users)
      db.run(`INSERT INTO user_settings (user_id, key, value, updated_at) 
              VALUES ('test-user-1', 'theme', '"dark"', '${now}')`);

      // Merchants (no dependencies)
      db.run(`INSERT INTO merchants (id, domain, created_at, updated_at) 
              VALUES ('test-merchant-1', 'example.com', '${now}', '${now}')`);

      // Campaigns (depends on merchants)
      db.run(`INSERT INTO campaigns (id, merchant_id, subject, subject_hash, first_seen_at, last_seen_at, created_at, updated_at) 
              VALUES ('test-campaign-1', 'test-merchant-1', 'Test Subject', 'hash123', '${now}', '${now}', '${now}', '${now}')`);

      // Campaign emails (depends on campaigns)
      db.run(`INSERT INTO campaign_emails (campaign_id, recipient, received_at, worker_name) 
              VALUES ('test-campaign-1', 'recipient@example.com', '${now}', 'test-worker')`);
    }).not.toThrow();

    // Verify data was inserted
    const workerResult = db.exec("SELECT COUNT(*) FROM worker_instances");
    expect(workerResult[0].values[0][0]).toBeGreaterThan(0);

    const userResult = db.exec("SELECT COUNT(*) FROM users");
    expect(userResult[0].values[0][0]).toBeGreaterThan(0);
  });
});
