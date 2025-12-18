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
