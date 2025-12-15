-- Worker实例API数据库 Schema
-- Email Filter Worker API Database Schema

-- 过滤规则表 (Filter Rules)
CREATE TABLE IF NOT EXISTS filter_rules (
  id TEXT PRIMARY KEY,
  category TEXT NOT NULL CHECK (category IN ('whitelist', 'blacklist', 'dynamic')),
  match_type TEXT NOT NULL CHECK (match_type IN ('sender_name', 'subject', 'sender_email')),
  match_mode TEXT NOT NULL CHECK (match_mode IN ('regex', 'contains')),
  pattern TEXT NOT NULL,
  enabled INTEGER DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  last_hit_at DATETIME
);

-- 邮件处理日志表 (Process Logs)
CREATE TABLE IF NOT EXISTS process_logs (
  id TEXT PRIMARY KEY,
  recipient TEXT NOT NULL,
  sender TEXT NOT NULL,
  sender_email TEXT NOT NULL,
  subject TEXT NOT NULL,
  processed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  action TEXT NOT NULL CHECK (action IN ('passed', 'deleted', 'error')),
  matched_rule_id TEXT,
  matched_rule_category TEXT,
  error_message TEXT
);

-- 规则统计表 (Rule Statistics)
CREATE TABLE IF NOT EXISTS rule_stats (
  rule_id TEXT PRIMARY KEY,
  total_processed INTEGER DEFAULT 0,
  deleted_count INTEGER DEFAULT 0,
  error_count INTEGER DEFAULT 0,
  last_updated DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (rule_id) REFERENCES filter_rules(id) ON DELETE CASCADE
);

-- 重点关注项表 (Watch Items)
CREATE TABLE IF NOT EXISTS watch_items (
  id TEXT PRIMARY KEY,
  subject_pattern TEXT NOT NULL,
  match_mode TEXT NOT NULL CHECK (match_mode IN ('regex', 'contains')),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);


-- 重点关注命中记录表 (Watch Hits)
CREATE TABLE IF NOT EXISTS watch_hits (
  id TEXT PRIMARY KEY,
  watch_id TEXT NOT NULL,
  recipient TEXT NOT NULL,
  hit_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (watch_id) REFERENCES watch_items(id) ON DELETE CASCADE
);

-- 动态规则配置表 (Dynamic Configuration)
CREATE TABLE IF NOT EXISTS dynamic_config (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- 转发规则表 (Forward Rules)
CREATE TABLE IF NOT EXISTS forward_rules (
  id TEXT PRIMARY KEY,
  recipient_pattern TEXT NOT NULL,
  match_mode TEXT NOT NULL CHECK (match_mode IN ('exact', 'contains', 'regex')),
  forward_to TEXT NOT NULL,
  enabled INTEGER DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 邮件主题追踪表 (用于动态规则检测)
CREATE TABLE IF NOT EXISTS email_subject_tracker (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  subject_hash TEXT NOT NULL,
  subject TEXT NOT NULL,
  received_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 索引 (Indexes)
CREATE INDEX IF NOT EXISTS idx_filter_rules_category ON filter_rules(category);
CREATE INDEX IF NOT EXISTS idx_filter_rules_enabled ON filter_rules(enabled);
CREATE INDEX IF NOT EXISTS idx_process_logs_processed_at ON process_logs(processed_at);
CREATE INDEX IF NOT EXISTS idx_process_logs_action ON process_logs(action);
CREATE INDEX IF NOT EXISTS idx_process_logs_matched_rule_id ON process_logs(matched_rule_id);
CREATE INDEX IF NOT EXISTS idx_watch_hits_watch_id ON watch_hits(watch_id);
CREATE INDEX IF NOT EXISTS idx_watch_hits_hit_at ON watch_hits(hit_at);
CREATE INDEX IF NOT EXISTS idx_subject_tracker_hash ON email_subject_tracker(subject_hash);
CREATE INDEX IF NOT EXISTS idx_subject_tracker_time ON email_subject_tracker(received_at);
CREATE INDEX IF NOT EXISTS idx_forward_rules_enabled ON forward_rules(enabled);
