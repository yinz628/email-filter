import Database from 'better-sqlite3';
import path from 'path';

const dbPath = process.env.DATABASE_PATH || path.join(process.cwd(), 'data', 'filter.db');

console.log('Database path:', dbPath);

const db = new Database(dbPath);

try {
  // Check if tags column already exists
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
