-- Worker 实例表（支持多 Worker）
CREATE TABLE IF NOT EXISTS worker_instances (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  domain TEXT,
  default_forward_to TEXT NOT NULL,
  worker_url TEXT,
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
  tags TEXT,
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  last_hit_at TEXT,
  FOREIGN KEY (worker_id) REFERENCES worker_instances(id) ON DELETE CASCADE,
  UNIQUE(worker_id, category, match_type, match_mode, pattern)
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

-- 系统日志表
CREATE TABLE IF NOT EXISTS system_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  category TEXT NOT NULL CHECK(category IN ('email_forward', 'email_drop', 'admin_action', 'system')),
  level TEXT NOT NULL DEFAULT 'info' CHECK(level IN ('info', 'warn', 'error')),
  message TEXT NOT NULL,
  details TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_logs_category ON system_logs(category);
CREATE INDEX IF NOT EXISTS idx_logs_created ON system_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_logs_level ON system_logs(level);


-- ============================================
-- Campaign Analytics Schema
-- ============================================

-- 商户表
CREATE TABLE IF NOT EXISTS merchants (
  id TEXT PRIMARY KEY,
  domain TEXT UNIQUE NOT NULL,           -- 发件人域名
  display_name TEXT,                      -- 显示名称
  note TEXT,                              -- 备注
  total_campaigns INTEGER DEFAULT 0,      -- 营销活动总数
  total_emails INTEGER DEFAULT 0,         -- 邮件总数
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_merchants_domain ON merchants(domain);

-- 营销活动表
CREATE TABLE IF NOT EXISTS campaigns (
  id TEXT PRIMARY KEY,
  merchant_id TEXT NOT NULL,              -- 关联商户
  subject TEXT NOT NULL,                  -- 邮件主题（原始）
  subject_hash TEXT NOT NULL,             -- 主题哈希（用于快速查找）
  is_valuable INTEGER DEFAULT 0,          -- 是否有价值
  valuable_note TEXT,                     -- 价值标注备注
  total_emails INTEGER DEFAULT 0,         -- 邮件总数
  unique_recipients INTEGER DEFAULT 0,    -- 唯一收件人数
  first_seen_at TEXT NOT NULL,            -- 首次出现时间
  last_seen_at TEXT NOT NULL,             -- 最后出现时间
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (merchant_id) REFERENCES merchants(id),
  UNIQUE(merchant_id, subject_hash)
);

CREATE INDEX IF NOT EXISTS idx_campaigns_merchant ON campaigns(merchant_id);
CREATE INDEX IF NOT EXISTS idx_campaigns_subject_hash ON campaigns(subject_hash);

-- 营销活动邮件记录表
CREATE TABLE IF NOT EXISTS campaign_emails (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  campaign_id TEXT NOT NULL,
  recipient TEXT NOT NULL,                -- 收件人邮箱
  received_at TEXT NOT NULL,              -- 接收时间
  FOREIGN KEY (campaign_id) REFERENCES campaigns(id)
);

CREATE INDEX IF NOT EXISTS idx_campaign_emails_campaign ON campaign_emails(campaign_id);
CREATE INDEX IF NOT EXISTS idx_campaign_emails_recipient ON campaign_emails(recipient);

-- 收件人路径表
CREATE TABLE IF NOT EXISTS recipient_paths (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  merchant_id TEXT NOT NULL,
  recipient TEXT NOT NULL,                -- 收件人邮箱
  campaign_id TEXT NOT NULL,              -- 营销活动ID
  sequence_order INTEGER NOT NULL,        -- 在路径中的顺序
  first_received_at TEXT NOT NULL,        -- 首次接收时间
  FOREIGN KEY (merchant_id) REFERENCES merchants(id),
  FOREIGN KEY (campaign_id) REFERENCES campaigns(id),
  UNIQUE(merchant_id, recipient, campaign_id)
);

CREATE INDEX IF NOT EXISTS idx_recipient_paths_merchant_recipient ON recipient_paths(merchant_id, recipient);
CREATE INDEX IF NOT EXISTS idx_recipient_paths_campaign ON recipient_paths(campaign_id);
