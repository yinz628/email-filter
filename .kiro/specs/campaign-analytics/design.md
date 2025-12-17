# Design Document: Campaign Analytics

## Overview

本模块为邮件过滤系统添加营销活动统计与建模功能，用于追踪商户级营销邮件活动、分析收件人路径、支持人工标注有价值活动。

### 核心功能
- 商户自动识别（基于发件人域名）
- 营销活动自动归类（基于商户+主题）
- 收件人路径追踪
- 营销活动层级与路径分析
- 有价值活动人工标注
- 数据可视化展示

### 设计约束
- 仅使用发件人、主题、收件人三个字段
- 不解析邮件正文
- 价值判断由人工标注

## Architecture

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│  Email Worker   │────▶│    VPS API      │────▶│    SQLite DB    │
│  (Cloudflare)   │     │   (Fastify)     │     │                 │
└─────────────────┘     └─────────────────┘     └─────────────────┘
        │                       │
        │                       ▼
        │               ┌─────────────────┐
        │               │  Campaign       │
        │               │  Analytics      │
        │               │  Service        │
        │               └─────────────────┘
        │                       │
        ▼                       ▼
┌─────────────────┐     ┌─────────────────┐
│  Forward/Drop   │     │  Admin Panel    │
│  Decision       │     │  (Frontend)     │
└─────────────────┘     └─────────────────┘
```

### 数据流
1. Worker 接收邮件，提取元数据（发件人、主题、收件人、时间）
2. Worker 异步上报数据到 VPS API `/api/campaign/track`
3. VPS API 调用 CampaignAnalyticsService 处理数据
4. Service 自动识别商户、创建/更新营销活动、追踪收件人路径
5. 管理员通过 Admin Panel 查看统计、标注有价值活动

## Components and Interfaces

### 1. CampaignAnalyticsService

核心服务类，负责所有营销活动分析逻辑。

```typescript
interface CampaignAnalyticsService {
  // 商户管理
  getMerchants(): Merchant[];
  getMerchantByDomain(domain: string): Merchant | null;
  updateMerchant(id: string, data: UpdateMerchantDTO): Merchant;
  
  // 营销活动管理
  getCampaigns(merchantId?: string): Campaign[];
  getCampaignById(id: string): CampaignDetail | null;
  markCampaignValuable(id: string, valuable: boolean, note?: string): Campaign;
  
  // 数据追踪
  trackEmail(data: TrackEmailDTO): TrackResult;
  
  // 路径分析
  getRecipientPath(merchantId: string, recipient: string): RecipientPath;
  getCampaignLevels(merchantId: string): CampaignLevel[];
  getCampaignFlow(merchantId: string, startCampaignId?: string): CampaignFlow;
}
```

### 2. API Routes

```typescript
// 商户相关
GET    /api/campaign/merchants              // 获取商户列表
GET    /api/campaign/merchants/:id          // 获取商户详情
PUT    /api/campaign/merchants/:id          // 更新商户信息

// 营销活动相关
GET    /api/campaign/campaigns              // 获取营销活动列表
GET    /api/campaign/campaigns/:id          // 获取营销活动详情
POST   /api/campaign/campaigns/:id/valuable // 标记有价值活动

// 数据追踪
POST   /api/campaign/track                  // 上报邮件数据
POST   /api/campaign/track/batch            // 批量上报

// 路径分析
GET    /api/campaign/merchants/:id/levels   // 获取活动层级
GET    /api/campaign/merchants/:id/flow     // 获取活动路径图
GET    /api/campaign/recipients/:email/path // 获取收件人路径
```

### 3. Frontend Components

- 商户列表页面
- 营销活动列表页面
- 活动详情与标注页面
- 路径分析可视化页面

## Data Models

### Database Schema

```sql
-- 商户表
CREATE TABLE merchants (
  id TEXT PRIMARY KEY,
  domain TEXT UNIQUE NOT NULL,           -- 发件人域名
  display_name TEXT,                      -- 显示名称
  note TEXT,                              -- 备注
  total_campaigns INTEGER DEFAULT 0,      -- 营销活动总数
  total_emails INTEGER DEFAULT 0,         -- 邮件总数
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- 营销活动表
CREATE TABLE campaigns (
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

-- 营销活动邮件记录表
CREATE TABLE campaign_emails (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  campaign_id TEXT NOT NULL,
  recipient TEXT NOT NULL,                -- 收件人邮箱
  received_at TEXT NOT NULL,              -- 接收时间
  FOREIGN KEY (campaign_id) REFERENCES campaigns(id)
);

-- 收件人路径表
CREATE TABLE recipient_paths (
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

-- 索引
CREATE INDEX idx_campaigns_merchant ON campaigns(merchant_id);
CREATE INDEX idx_campaigns_subject_hash ON campaigns(subject_hash);
CREATE INDEX idx_campaign_emails_campaign ON campaign_emails(campaign_id);
CREATE INDEX idx_campaign_emails_recipient ON campaign_emails(recipient);
CREATE INDEX idx_recipient_paths_merchant_recipient ON recipient_paths(merchant_id, recipient);
CREATE INDEX idx_recipient_paths_campaign ON recipient_paths(campaign_id);
```

### TypeScript Types

```typescript
interface Merchant {
  id: string;
  domain: string;
  displayName?: string;
  note?: string;
  totalCampaigns: number;
  totalEmails: number;
  createdAt: Date;
  updatedAt: Date;
}

interface Campaign {
  id: string;
  merchantId: string;
  subject: string;
  isValuable: boolean;
  valuableNote?: string;
  totalEmails: number;
  uniqueRecipients: number;
  firstSeenAt: Date;
  lastSeenAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

interface CampaignDetail extends Campaign {
  merchant: Merchant;
  recipientStats: RecipientStat[];
}

interface RecipientStat {
  recipient: string;
  emailCount: number;
  firstReceivedAt: Date;
  lastReceivedAt: Date;
}

interface RecipientPath {
  merchantId: string;
  recipient: string;
  campaigns: PathCampaign[];
}

interface PathCampaign {
  campaignId: string;
  subject: string;
  isValuable: boolean;
  sequenceOrder: number;
  firstReceivedAt: Date;
}

interface CampaignLevel {
  level: number;
  campaigns: LevelCampaign[];
}

interface LevelCampaign {
  campaignId: string;
  subject: string;
  isValuable: boolean;
  recipientCount: number;
  percentage: number;
}

interface CampaignFlow {
  merchantId: string;
  startCampaignId?: string;
  baselineRecipients: number;
  nodes: FlowNode[];
  edges: FlowEdge[];
}

interface FlowNode {
  campaignId: string;
  subject: string;
  isValuable: boolean;
  level: number;
  recipientCount: number;
  percentage: number;
}

interface FlowEdge {
  from: string;
  to: string;
  recipientCount: number;
  percentage: number;
}

interface TrackEmailDTO {
  sender: string;
  subject: string;
  recipient: string;
  receivedAt?: string;
}

interface TrackResult {
  merchantId: string;
  campaignId: string;
  isNewMerchant: boolean;
  isNewCampaign: boolean;
}
```

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system-essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Domain Extraction Consistency
*For any* valid email address, extracting the domain should always return the portion after the @ symbol in lowercase.
**Validates: Requirements 1.1**

### Property 2: Merchant Auto-Creation
*For any* email with a new sender domain, tracking that email should result in a new merchant record being created with that domain.
**Validates: Requirements 1.2**

### Property 3: Campaign Grouping Invariant
*For any* set of emails from the same merchant with identical subjects, all emails should be grouped into exactly one campaign.
**Validates: Requirements 2.2**

### Property 4: Email Count Consistency
*For any* campaign, the total email count should equal the sum of all individual recipient email counts for that campaign.
**Validates: Requirements 2.3, 2.4**

### Property 5: Valuable Mark Round-Trip
*For any* campaign, marking it as valuable and then unmarking it should return it to the non-valuable state.
**Validates: Requirements 3.1, 3.2**

### Property 6: Filter by Valuable Status
*For any* filter query by valuable status, all returned campaigns should have the matching valuable flag.
**Validates: Requirements 3.4**

### Property 7: Path Chronological Order
*For any* recipient path, the campaigns should be ordered by their first received time in ascending order.
**Validates: Requirements 4.2**

### Property 8: Path Idempotence
*For any* recipient receiving the same campaign email multiple times, the path should contain that campaign exactly once.
**Validates: Requirements 4.3**

### Property 9: Level Calculation Consistency
*For any* campaign appearing as the first campaign in at least one recipient path, it should be marked as level 1.
**Validates: Requirements 5.2**

### Property 10: Baseline Population Accuracy
*For any* campaign selected as a starting point, the baseline recipient count should equal the number of unique recipients who received that campaign.
**Validates: Requirements 6.1**

### Property 11: Distribution Ratio Sum
*For any* level in the campaign flow, the sum of percentages of all campaigns at that level should not exceed 100% of the baseline population.
**Validates: Requirements 6.3**

### Property 12: Data Validation
*For any* track request with missing required fields (sender, subject, recipient), the API should return a validation error.
**Validates: Requirements 8.2**

## Error Handling

### API Errors
- 400 Bad Request: 缺少必填字段或数据格式错误
- 404 Not Found: 商户或营销活动不存在
- 500 Internal Server Error: 数据库操作失败

### Worker Error Handling
- 上报失败时记录日志，不阻塞邮件处理流程
- 支持重试机制（可选）

## Testing Strategy

### Unit Testing
- 使用 Vitest 进行单元测试
- 测试 CampaignAnalyticsService 的核心方法
- 测试域名提取、哈希计算等工具函数

### Property-Based Testing
- 使用 fast-check 库进行属性测试
- 每个属性测试运行至少 100 次迭代
- 测试数据生成器覆盖各种边界情况

### Integration Testing
- 测试 API 端点的完整流程
- 测试 Worker 到 VPS 的数据上报流程

### Test Coverage Goals
- 核心服务方法: 90%+
- API 路由: 80%+
- 工具函数: 100%
