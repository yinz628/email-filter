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
  } else {
    console.log('Creating ratio monitoring tables...');

    // Create ratio_monitors table
    db.exec(`
      CREATE TABLE IF NOT EXISTS ratio_monitors (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        tag TEXT NOT NULL,
        first_rule_id TEXT NOT NULL,
        second_rule_id TEXT NOT NULL,
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

    // Create ratio_states table
    db.exec(`
      CREATE TABLE IF NOT EXISTS ratio_states (
        monitor_id TEXT PRIMARY KEY,
        state TEXT NOT NULL DEFAULT 'HEALTHY',
        first_count INTEGER NOT NULL DEFAULT 0,
        second_count INTEGER NOT NULL DEFAULT 0,
        current_ratio REAL NOT NULL DEFAULT 0,
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

} catch (error) {
  console.error('Migration failed:', error);
  process.exit(1);
} finally {
  db.close();
}
