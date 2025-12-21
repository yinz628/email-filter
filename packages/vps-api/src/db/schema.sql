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
  worker_name TEXT DEFAULT 'global',
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_logs_category ON system_logs(category);
CREATE INDEX IF NOT EXISTS idx_logs_created ON system_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_logs_level ON system_logs(level);
CREATE INDEX IF NOT EXISTS idx_logs_worker_name ON system_logs(worker_name);

-- 监控规则表
CREATE TABLE IF NOT EXISTS monitoring_rules (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  match_type TEXT NOT NULL CHECK(match_type IN ('sender', 'subject', 'domain')),
  match_mode TEXT NOT NULL CHECK(match_mode IN ('exact', 'contains', 'startsWith', 'endsWith', 'regex')),
  pattern TEXT NOT NULL,
  threshold INTEGER NOT NULL DEFAULT 1,
  time_window_minutes INTEGER NOT NULL DEFAULT 60,
  alert_type TEXT NOT NULL DEFAULT 'count' CHECK(alert_type IN ('count', 'rate')),
  worker_scope TEXT DEFAULT 'global',
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_monitoring_rules_enabled ON monitoring_rules(enabled);
CREATE INDEX IF NOT EXISTS idx_monitoring_rules_worker_scope ON monitoring_rules(worker_scope);

-- 监控命中日志表
CREATE TABLE IF NOT EXISTS hit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  rule_id TEXT NOT NULL,
  sender TEXT NOT NULL,
  subject TEXT NOT NULL,
  recipient TEXT NOT NULL,
  received_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (rule_id) REFERENCES monitoring_rules(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_hit_logs_rule ON hit_logs(rule_id);
CREATE INDEX IF NOT EXISTS idx_hit_logs_created ON hit_logs(created_at);

-- 监控告警表
CREATE TABLE IF NOT EXISTS alerts (
  id TEXT PRIMARY KEY,
  rule_id TEXT NOT NULL,
  triggered_at TEXT NOT NULL,
  hit_count INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'acknowledged', 'resolved')),
  resolved_at TEXT,
  FOREIGN KEY (rule_id) REFERENCES monitoring_rules(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_alerts_rule ON alerts(rule_id);
CREATE INDEX IF NOT EXISTS idx_alerts_status ON alerts(status);
CREATE INDEX IF NOT EXISTS idx_alerts_triggered ON alerts(triggered_at);

-- 心跳日志表
CREATE TABLE IF NOT EXISTS heartbeat_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  checked_at TEXT NOT NULL,
  rules_checked INTEGER NOT NULL DEFAULT 0,
  state_changes INTEGER NOT NULL DEFAULT 0,
  alerts_triggered INTEGER NOT NULL DEFAULT 0,
  duration_ms INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_heartbeat_logs_checked ON heartbeat_logs(checked_at);


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
  worker_name TEXT DEFAULT 'global',      -- Worker实例名称
  FOREIGN KEY (campaign_id) REFERENCES campaigns(id)
);

CREATE INDEX IF NOT EXISTS idx_campaign_emails_campaign ON campaign_emails(campaign_id);
CREATE INDEX IF NOT EXISTS idx_campaign_emails_recipient ON campaign_emails(recipient);
CREATE INDEX IF NOT EXISTS idx_campaign_emails_worker ON campaign_emails(worker_name);

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

-- 分析项目表
CREATE TABLE IF NOT EXISTS analysis_projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  merchant_id TEXT NOT NULL,
  worker_name TEXT NOT NULL,
  worker_names TEXT,                      -- 多Worker支持（JSON数组）
  status TEXT DEFAULT 'active',
  note TEXT,
  last_analysis_time TEXT,                -- 上次分析时间
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (merchant_id) REFERENCES merchants(id)
);

CREATE INDEX IF NOT EXISTS idx_analysis_projects_merchant ON analysis_projects(merchant_id);
CREATE INDEX IF NOT EXISTS idx_analysis_projects_worker ON analysis_projects(worker_name);
CREATE INDEX IF NOT EXISTS idx_analysis_projects_status ON analysis_projects(status);

-- 项目级Root活动表
CREATE TABLE IF NOT EXISTS project_root_campaigns (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id TEXT NOT NULL,
  campaign_id TEXT NOT NULL,
  is_confirmed INTEGER DEFAULT 0,
  created_at TEXT NOT NULL,
  FOREIGN KEY (project_id) REFERENCES analysis_projects(id) ON DELETE CASCADE,
  FOREIGN KEY (campaign_id) REFERENCES campaigns(id),
  UNIQUE(project_id, campaign_id)
);

CREATE INDEX IF NOT EXISTS idx_project_root_campaigns_project ON project_root_campaigns(project_id);

-- 项目级新用户表
CREATE TABLE IF NOT EXISTS project_new_users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id TEXT NOT NULL,
  recipient TEXT NOT NULL,
  first_root_campaign_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (project_id) REFERENCES analysis_projects(id) ON DELETE CASCADE,
  FOREIGN KEY (first_root_campaign_id) REFERENCES campaigns(id),
  UNIQUE(project_id, recipient)
);

CREATE INDEX IF NOT EXISTS idx_project_new_users_project ON project_new_users(project_id);
CREATE INDEX IF NOT EXISTS idx_project_new_users_recipient ON project_new_users(recipient);

-- 项目级用户事件流表
CREATE TABLE IF NOT EXISTS project_user_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id TEXT NOT NULL,
  recipient TEXT NOT NULL,
  campaign_id TEXT NOT NULL,
  seq INTEGER NOT NULL,                   -- 序列号，从1开始递增
  received_at TEXT NOT NULL,
  FOREIGN KEY (project_id) REFERENCES analysis_projects(id) ON DELETE CASCADE,
  FOREIGN KEY (campaign_id) REFERENCES campaigns(id),
  UNIQUE(project_id, recipient, campaign_id)
);

CREATE INDEX IF NOT EXISTS idx_project_user_events_project ON project_user_events(project_id);
CREATE INDEX IF NOT EXISTS idx_project_user_events_recipient ON project_user_events(project_id, recipient);
CREATE INDEX IF NOT EXISTS idx_project_user_events_seq ON project_user_events(project_id, recipient, seq);

-- 项目级路径边表
CREATE TABLE IF NOT EXISTS project_path_edges (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id TEXT NOT NULL,
  from_campaign_id TEXT NOT NULL,
  to_campaign_id TEXT NOT NULL,
  user_count INTEGER DEFAULT 0,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (project_id) REFERENCES analysis_projects(id) ON DELETE CASCADE,
  FOREIGN KEY (from_campaign_id) REFERENCES campaigns(id),
  FOREIGN KEY (to_campaign_id) REFERENCES campaigns(id),
  UNIQUE(project_id, from_campaign_id, to_campaign_id)
);

CREATE INDEX IF NOT EXISTS idx_project_path_edges_project ON project_path_edges(project_id);
CREATE INDEX IF NOT EXISTS idx_project_path_edges_from ON project_path_edges(project_id, from_campaign_id);

-- 项目级活动标记表 (用于项目隔离的价值标记)
CREATE TABLE IF NOT EXISTS project_campaign_tags (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id TEXT NOT NULL,
  campaign_id TEXT NOT NULL,
  tag INTEGER DEFAULT 0,                  -- 0=未标记, 1=高价值, 2=重要营销, 3=一般营销, 4=可忽略
  tag_note TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (project_id) REFERENCES analysis_projects(id) ON DELETE CASCADE,
  FOREIGN KEY (campaign_id) REFERENCES campaigns(id),
  UNIQUE(project_id, campaign_id)
);

CREATE INDEX IF NOT EXISTS idx_project_campaign_tags_project ON project_campaign_tags(project_id);
CREATE INDEX IF NOT EXISTS idx_project_campaign_tags_campaign ON project_campaign_tags(campaign_id);

-- ============================================
-- User Authentication Schema
-- ============================================

-- 用户表
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'user',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username ON users(username);

-- 用户设置表
CREATE TABLE IF NOT EXISTS user_settings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  key TEXT NOT NULL,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE(user_id, key)
);

CREATE INDEX IF NOT EXISTS idx_user_settings_user ON user_settings(user_id);

-- Token黑名单表
CREATE TABLE IF NOT EXISTS token_blacklist (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_token_blacklist_hash ON token_blacklist(token_hash);
CREATE INDEX IF NOT EXISTS idx_token_blacklist_expires ON token_blacklist(expires_at);

-- ============================================
-- Email Realtime Monitoring Schema
-- ============================================

-- 信号状态表
CREATE TABLE IF NOT EXISTS signal_states (
  rule_id TEXT PRIMARY KEY,
  state TEXT NOT NULL DEFAULT 'DEAD',
  last_seen_at TEXT,
  count_1h INTEGER NOT NULL DEFAULT 0,
  count_12h INTEGER NOT NULL DEFAULT 0,
  count_24h INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (rule_id) REFERENCES monitoring_rules(id) ON DELETE CASCADE
);

-- 告警渠道配置表
CREATE TABLE IF NOT EXISTS alert_channels (
  id TEXT PRIMARY KEY,
  channel_type TEXT NOT NULL,
  config TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- ============================================
-- Ratio Monitoring Tables
-- ============================================

-- 比例监控规则表（漏斗监控）
CREATE TABLE IF NOT EXISTS ratio_monitors (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  tag TEXT NOT NULL,
  first_rule_id TEXT NOT NULL,
  second_rule_id TEXT NOT NULL,
  steps TEXT NOT NULL DEFAULT '[]',
  threshold_percent REAL NOT NULL,
  time_window TEXT NOT NULL DEFAULT '24h',
  worker_scope TEXT NOT NULL DEFAULT 'global',
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (first_rule_id) REFERENCES monitoring_rules(id) ON DELETE CASCADE,
  FOREIGN KEY (second_rule_id) REFERENCES monitoring_rules(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_ratio_monitors_tag ON ratio_monitors(tag);
CREATE INDEX IF NOT EXISTS idx_ratio_monitors_enabled ON ratio_monitors(enabled);
CREATE INDEX IF NOT EXISTS idx_ratio_monitors_worker_scope ON ratio_monitors(worker_scope);

-- 比例状态表
CREATE TABLE IF NOT EXISTS ratio_states (
  monitor_id TEXT PRIMARY KEY,
  state TEXT NOT NULL DEFAULT 'HEALTHY',
  first_count INTEGER NOT NULL DEFAULT 0,
  second_count INTEGER NOT NULL DEFAULT 0,
  current_ratio REAL NOT NULL DEFAULT 0,
  steps_data TEXT NOT NULL DEFAULT '[]',
  updated_at TEXT NOT NULL,
  FOREIGN KEY (monitor_id) REFERENCES ratio_monitors(id) ON DELETE CASCADE
);

-- 商户Worker状态表
CREATE TABLE IF NOT EXISTS merchant_worker_status (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  merchant_id TEXT NOT NULL,
  worker_name TEXT NOT NULL,
  display_name TEXT,
  analysis_status TEXT NOT NULL DEFAULT 'pending',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (merchant_id) REFERENCES merchants(id) ON DELETE CASCADE,
  UNIQUE(merchant_id, worker_name)
);

CREATE INDEX IF NOT EXISTS idx_merchant_worker_status_merchant ON merchant_worker_status(merchant_id);
CREATE INDEX IF NOT EXISTS idx_merchant_worker_status_worker ON merchant_worker_status(worker_name);
