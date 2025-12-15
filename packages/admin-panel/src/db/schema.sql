-- 管理面板数据库 Schema
-- Admin Panel Database Schema

-- Worker实例表 (Worker Instances)
CREATE TABLE IF NOT EXISTS worker_instances (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  api_url TEXT NOT NULL,
  api_key TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'error')),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 管理员配置表 (Admin Configuration)
CREATE TABLE IF NOT EXISTS admin_config (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- 索引 (Indexes)
CREATE INDEX IF NOT EXISTS idx_worker_instances_status ON worker_instances(status);
CREATE INDEX IF NOT EXISTS idx_worker_instances_name ON worker_instances(name);
