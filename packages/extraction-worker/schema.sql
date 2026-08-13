-- Extraction Worker D1 Schema
-- Tables: extraction_rules (config pushed by VPS), verification_codes, discount_codes
-- Run: npx wrangler d1 execute extraction-db --remote --file=schema.sql

-- ============================================
-- extraction_rules: extraction config pushed from VPS
-- ============================================
CREATE TABLE IF NOT EXISTS extraction_rules (
  id TEXT PRIMARY KEY,                  -- corresponds to VPS filter_rules.id
  extract_type TEXT NOT NULL,           -- 'verification' | 'discount'
  code_pattern TEXT,                    -- regex for code extraction (optional, falls back to generic)
  link_anchor_pattern TEXT,             -- regex for link anchor text (optional)
  link_url_pattern TEXT,                -- regex for matching link URL itself (optional)
  updated_at TEXT NOT NULL
);

-- ============================================
-- verification_codes: one-time verification codes/links (L1 primary store)
-- ============================================
CREATE TABLE IF NOT EXISTS verification_codes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  worker_name TEXT,
  recipient TEXT NOT NULL,
  sender TEXT,
  subject TEXT,
  code TEXT,
  link TEXT,
  message_id TEXT,
  received_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Dedup: same email processed twice → one row (INSERT OR IGNORE)
CREATE UNIQUE INDEX IF NOT EXISTS idx_codes_msg_id ON verification_codes(message_id);
-- Primary query path: latest code by recipient
CREATE INDEX IF NOT EXISTS idx_codes_recipient ON verification_codes(recipient, received_at DESC);

-- ============================================
-- discount_codes: reusable discount codes (L1 primary store, L2 sync to VPS)
-- ============================================
CREATE TABLE IF NOT EXISTS discount_codes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  worker_name TEXT,
  recipient TEXT NOT NULL,
  sender TEXT,
  sender_domain TEXT,                   -- for merchant filtering
  subject TEXT,
  code TEXT,
  link TEXT,
  discount_value TEXT,                  -- e.g. "20% OFF", "$10"
  message_id TEXT,
  received_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_discounts_msg_id ON discount_codes(message_id);
CREATE INDEX IF NOT EXISTS idx_discounts_recipient ON discount_codes(recipient, received_at DESC);
CREATE INDEX IF NOT EXISTS idx_discounts_domain ON discount_codes(sender_domain);
