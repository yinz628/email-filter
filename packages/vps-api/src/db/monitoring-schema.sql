-- ============================================
-- Email Realtime Monitoring Schema
-- ============================================

-- 监控规则表
CREATE TABLE IF NOT EXISTS monitoring_rules (
  id TEXT PRIMARY KEY,
  merchant TEXT NOT NULL,
  name TEXT NOT NULL,
  subject_pattern TEXT NOT NULL,
  expected_interval_minutes INTEGER NOT NULL,
  dead_after_minutes INTEGER NOT NULL,
  tags TEXT NOT NULL DEFAULT '[]',
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_monitoring_rules_merchant ON monitoring_rules(merchant);
CREATE INDEX IF NOT EXISTS idx_monitoring_rules_enabled ON monitoring_rules(enabled);

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

-- 命中记录表（48-72小时后清理）
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

CREATE INDEX IF NOT EXISTS idx_hit_logs_rule_id ON hit_logs(rule_id);
CREATE INDEX IF NOT EXISTS idx_hit_logs_created_at ON hit_logs(created_at);


-- 告警记录表（30-90天后清理）
CREATE TABLE IF NOT EXISTS alerts (
  id TEXT PRIMARY KEY,
  rule_id TEXT NOT NULL,
  alert_type TEXT NOT NULL,
  previous_state TEXT NOT NULL,
  current_state TEXT NOT NULL,
  gap_minutes INTEGER NOT NULL,
  count_1h INTEGER NOT NULL,
  count_12h INTEGER NOT NULL,
  count_24h INTEGER NOT NULL,
  message TEXT NOT NULL,
  sent_at TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (rule_id) REFERENCES monitoring_rules(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_alerts_rule_id ON alerts(rule_id);
CREATE INDEX IF NOT EXISTS idx_alerts_created_at ON alerts(created_at);
CREATE INDEX IF NOT EXISTS idx_alerts_alert_type ON alerts(alert_type);

-- 心跳检查日志表
CREATE TABLE IF NOT EXISTS heartbeat_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  checked_at TEXT NOT NULL,
  rules_checked INTEGER NOT NULL,
  state_changes INTEGER NOT NULL,
  alerts_triggered INTEGER NOT NULL,
  duration_ms INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_heartbeat_logs_checked_at ON heartbeat_logs(checked_at);

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

-- 比例监控规则表
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
);

CREATE INDEX IF NOT EXISTS idx_ratio_monitors_tag ON ratio_monitors(tag);
CREATE INDEX IF NOT EXISTS idx_ratio_monitors_enabled ON ratio_monitors(enabled);

-- 比例状态表
CREATE TABLE IF NOT EXISTS ratio_states (
  monitor_id TEXT PRIMARY KEY,
  state TEXT NOT NULL DEFAULT 'HEALTHY',
  first_count INTEGER NOT NULL DEFAULT 0,
  second_count INTEGER NOT NULL DEFAULT 0,
  current_ratio REAL NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (monitor_id) REFERENCES ratio_monitors(id) ON DELETE CASCADE
);
