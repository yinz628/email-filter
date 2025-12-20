-- Campaign Analytics Schema
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
