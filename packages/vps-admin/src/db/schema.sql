-- VPS Admin Panel Database Schema

-- Worker 实例表
CREATE TABLE IF NOT EXISTS worker_instances (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  api_url TEXT NOT NULL,
  api_key TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'error')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 管理员配置表
CREATE TABLE IF NOT EXISTS admin_config (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- 会话表
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at TEXT NOT NULL
);

-- 索引
CREATE INDEX IF NOT EXISTS idx_worker_instances_status ON worker_instances(status);
CREATE INDEX IF NOT EXISTS idx_worker_instances_name ON worker_instances(name);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);
