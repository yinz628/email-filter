import Database from 'better-sqlite3';
import path from 'path';

const dbPath = process.env.DATABASE_PATH || path.join(process.cwd(), 'data', 'filter.db');

console.log('Database path:', dbPath);

const db = new Database(dbPath);

try {
  // Check if ratio_monitors table already exists
  const tableExists = db.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='ratio_monitors'"
  ).get();

  if (tableExists) {
    console.log('Ratio monitoring tables already exist');
    
    // Check if steps column exists
    const ratioTableInfo = db.prepare("PRAGMA table_info(ratio_monitors)").all() as { name: string }[];
    const hasStepsColumn = ratioTableInfo.some(col => col.name === 'steps');
    
    if (!hasStepsColumn) {
      console.log('Adding steps column to ratio_monitors table...');
      db.exec("ALTER TABLE ratio_monitors ADD COLUMN steps TEXT NOT NULL DEFAULT '[]'");
      console.log('Steps column added successfully!');
    } else {
      console.log('Steps column already exists in ratio_monitors table');
    }
    
    // Check if steps_data column exists in ratio_states
    const stateTableInfo = db.prepare("PRAGMA table_info(ratio_states)").all() as { name: string }[];
    const hasStepsDataColumn = stateTableInfo.some(col => col.name === 'steps_data');
    
    if (!hasStepsDataColumn) {
      console.log('Adding steps_data column to ratio_states table...');
      db.exec("ALTER TABLE ratio_states ADD COLUMN steps_data TEXT NOT NULL DEFAULT '[]'");
      console.log('Steps_data column added successfully!');
    } else {
      console.log('Steps_data column already exists in ratio_states table');
    }
  } else {
    console.log('Creating ratio monitoring tables...');

    // Create ratio_monitors table with steps support
    db.exec(`
      CREATE TABLE IF NOT EXISTS ratio_monitors (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        tag TEXT NOT NULL,
        first_rule_id TEXT NOT NULL,
        second_rule_id TEXT NOT NULL,
        steps TEXT NOT NULL DEFAULT '[]',
        threshold_percent REAL NOT NULL,
        time_window TEXT NOT NULL DEFAULT '24h',
        enabled INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (first_rule_id) REFERENCES monitoring_rules(id) ON DELETE CASCADE,
        FOREIGN KEY (second_rule_id) REFERENCES monitoring_rules(id) ON DELETE CASCADE
      )
    `);

    db.exec(`CREATE INDEX IF NOT EXISTS idx_ratio_monitors_tag ON ratio_monitors(tag)`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_ratio_monitors_enabled ON ratio_monitors(enabled)`);

    // Create ratio_states table with steps_data support
    db.exec(`
      CREATE TABLE IF NOT EXISTS ratio_states (
        monitor_id TEXT PRIMARY KEY,
        state TEXT NOT NULL DEFAULT 'HEALTHY',
        first_count INTEGER NOT NULL DEFAULT 0,
        second_count INTEGER NOT NULL DEFAULT 0,
        current_ratio REAL NOT NULL DEFAULT 0,
        steps_data TEXT NOT NULL DEFAULT '[]',
        updated_at TEXT NOT NULL,
        FOREIGN KEY (monitor_id) REFERENCES ratio_monitors(id) ON DELETE CASCADE
      )
    `);

    console.log('Ratio monitoring tables created successfully!');
  }

  // Also add tags column to monitoring_rules if it doesn't exist
  const tableInfo = db.prepare("PRAGMA table_info(monitoring_rules)").all() as { name: string }[];
  const hasTagsColumn = tableInfo.some(col => col.name === 'tags');

  if (hasTagsColumn) {
    console.log('Tags column already exists in monitoring_rules table');
  } else {
    console.log('Adding tags column to monitoring_rules table...');
    db.exec("ALTER TABLE monitoring_rules ADD COLUMN tags TEXT NOT NULL DEFAULT '[]'");
    console.log('Tags column added successfully!');
  }

  // Create ratio_alerts table (separate from alerts table to avoid FK constraint issues)
  const ratioAlertsExists = db.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='ratio_alerts'"
  ).get();

  if (ratioAlertsExists) {
    console.log('ratio_alerts table already exists');
  } else {
    console.log('Creating ratio_alerts table...');
    db.exec(`
      CREATE TABLE IF NOT EXISTS ratio_alerts (
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
    db.exec(`CREATE INDEX IF NOT EXISTS idx_ratio_alerts_monitor_id ON ratio_alerts(monitor_id)`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_ratio_alerts_created_at ON ratio_alerts(created_at)`);
    console.log('ratio_alerts table created successfully!');
  }

} catch (error) {
  console.error('Migration failed:', error);
  process.exit(1);
} finally {
  db.close();
}
