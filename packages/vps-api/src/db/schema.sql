-- Worker 实例表（支持多 Worker）
CREATE TABLE IF NOT EXISTS worker_instances (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  domain TEXT,
  default_forward_to TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_worker_instances_name ON worker_instances(name);
CREATE INDEX IF NOT EXISTS idx_worker_instances_domain ON worker_instances(domain);

-- 过滤规则表（关联 Worker 实例）
CREATE TABLE IF NOT EXISTS filter_rules (
  id TEXT PRIMARY KEY,
  worker_id TEXT,
  category TEXT NOT NULL CHECK(category IN ('whitelist', 'blacklist', 'dynamic')),
  match_type TEXT NOT NULL CHECK(match_type IN ('sender', 'subject', 'domain')),
  match_mode TEXT NOT NULL CHECK(match_mode IN ('exact', 'contains', 'startsWith', 'endsWith', 'regex')),
  pattern TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  last_hit_at TEXT,
  FOREIGN KEY (worker_id) REFERENCES worker_instances(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_filter_rules_worker ON filter_rules(worker_id);

-- 规则统计表
CREATE TABLE IF NOT EXISTS rule_stats (
  rule_id TEXT PRIMARY KEY,
  total_processed INTEGER NOT NULL DEFAULT 0,
  deleted_count INTEGER NOT NULL DEFAULT 0,
  error_count INTEGER NOT NULL DEFAULT 0,
  last_updated TEXT NOT NULL,
  FOREIGN KEY (rule_id) REFERENCES filter_rules(id) ON DELETE CASCADE
);



-- 动态规则配置表
CREATE TABLE IF NOT EXISTS dynamic_config (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- 全局转发配置表（作为默认值）
CREATE TABLE IF NOT EXISTS forward_config (
  id INTEGER PRIMARY KEY CHECK(id = 1),
  default_forward_to TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- 邮件主题追踪表（用于动态规则）
CREATE TABLE IF NOT EXISTS email_subject_tracker (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  worker_id TEXT,
  subject_hash TEXT NOT NULL,
  subject TEXT NOT NULL,
  received_at TEXT NOT NULL,
  FOREIGN KEY (worker_id) REFERENCES worker_instances(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_subject_tracker_worker ON email_subject_tracker(worker_id);
CREATE INDEX IF NOT EXISTS idx_subject_tracker_hash ON email_subject_tracker(subject_hash);
CREATE INDEX IF NOT EXISTS idx_subject_tracker_received ON email_subject_tracker(received_at);

-- 全局统计表
CREATE TABLE IF NOT EXISTS global_stats (
  id INTEGER PRIMARY KEY CHECK(id = 1),
  total_processed INTEGER NOT NULL DEFAULT 0,
  total_forwarded INTEGER NOT NULL DEFAULT 0,
  total_deleted INTEGER NOT NULL DEFAULT 0,
  last_updated TEXT NOT NULL
);

-- 初始化全局统计
INSERT OR IGNORE INTO global_stats (id, total_processed, total_forwarded, total_deleted, last_updated)
VALUES (1, 0, 0, 0, datetime('now'));

-- 监控规则表
CREATE TABLE IF NOT EXISTS watch_rules (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  match_type TEXT NOT NULL,
  match_mode TEXT NOT NULL,
  pattern TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- 监控统计表
CREATE TABLE IF NOT EXISTS watch_stats (
  rule_id TEXT PRIMARY KEY,
  hit_count INTEGER NOT NULL DEFAULT 0,
  last_hit_at TEXT,
  FOREIGN KEY (rule_id) REFERENCES watch_rules(id) ON DELETE CASCADE
);
