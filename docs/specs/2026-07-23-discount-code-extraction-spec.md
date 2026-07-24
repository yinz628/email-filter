# 折扣码提取 — 设计规格

> 状态：设计中（待实现）
> 日期：2026-07-23
> 依赖：
> - `2026-07-23-extraction-worker-architecture-spec.md`（worker 中心架构，本功能在其上构建）
> - `2026-07-23-extraction-api-spec.md`（API 端点契约，折扣码查询端点定义于此）
> - `2026-07-24-discount-regex-generator-spec.md`（正则生成器，折扣码正则自动生成）
> 参考：`F:\tools\yahoo imap\src\extractor-enhanced.ts`（VALIDATORS.discountCode 行 304）、`F:\tools\yahoo imap\src\patterns.ts`（DISCOUNT_CODE_PATTERNS）、`F:\tools\yahoo imap\src\regex-generator.ts`（suggestPatterns）

## 1. 概述

在验证码提取功能基础上，增加**折扣码/优惠码提取**。折扣码与验证码在格式、时效、用途上差异显著，独立存储、独立面板，但共享 worker 中心架构（D1、路由、规则推送、正则生成器）。

## 2. 折扣码 vs 验证码的关键差异

| 维度 | 验证码 | 折扣码 |
|------|--------|--------|
| 时效 | 一次性，几分钟过期 | 可重复用，几天~几周有效 |
| 格式 | 纯数字 4-8 位为主 | 字母+数字混合（SAVE20、SUMMER2024），**纯数字罕见** |
| 来源邮件 | 验证/确认邮件 | 营销/促销邮件（sale、discount、promo） |
| 使用场景 | 即时使用一次 | 多次使用、按商户分类、可能分享 |
| 验证器 | 接受纯数字 | **拒绝纯数字**（通常是订单号/价格）|
| 提取逻辑 | 前缀锚定（verification code: XXX） | 前缀锚定（promo code: XXX）+ 字母数字混合格式验证 |

**核心差异**：折扣码验证器拒绝纯数字和纯字母（yahoo 项目 VALIDATORS.discountCode），而验证码接受纯数字。两者提取逻辑在"什么算有效码"上相反，必须独立实现。

## 3. 规则机制

### 3.1 复用 forward 规则加 flag

forward 规则加第二个 flag `extractDiscount`（与已有的 `extractVerification` 并列）：

```
forward 规则: sender=amazon.com
  extractDiscount: true              ← 折扣码提取开关
  code_pattern: '[A-Z0-9]{8,12}'     ← 折扣码专属正则（可选）
  link_anchor_pattern: 'Shop now|立即购买'  ← 优惠链接锚文本（可选）
```

### 3.2 规则字段（VPS filter_rules 表扩展）

在已有 `extract_verification` 列基础上，增加：
- `extract_discount INTEGER NOT NULL DEFAULT 0` — 折扣码提取开关
- `code_pattern TEXT` — 码专属正则（VPS 端配置源，推送时镜像到 worker extraction_rules 表同名列）
- `link_anchor_pattern TEXT` — 链接锚文本正则（同上镜像）

> **互斥约束**（架构 spec §1.2）：一条 forward 规则只能开 `extract_verification` 或 `extract_discount` 之一。rules.ts 校验拒绝同时开。因此 `code_pattern` 一行只服务一种提取类型，不存在"同一规则需要两套正则"的问题。

> **字段镜像**：VPS `filter_rules.code_pattern` 是配置源（用户在前端填写），推送规则时镜像到 worker `extraction_rules.code_pattern`。两者字段名相同、语义一致，但物理存在于不同数据库。详见架构 spec §9.1、§9.3。

## 4. D1 数据库设计

### 4.1 discount_codes 表（独立于 verification_codes）

```sql
CREATE TABLE discount_codes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  worker_name TEXT,
  recipient TEXT NOT NULL,
  sender TEXT,
  sender_domain TEXT,              -- 发件域名（按商户筛选）
  subject TEXT,
  code TEXT,
  link TEXT,
  discount_value TEXT,             -- 折扣值（如 "20% OFF"、"$10"），从主题/正文提取
  message_id TEXT,
  received_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- message_id 去重
CREATE UNIQUE INDEX idx_discounts_msg_id ON discount_codes(message_id);
-- 按邮箱查码
CREATE INDEX idx_discounts_recipient ON discount_codes(recipient, received_at DESC);
-- 按商户（发件域名）筛选
CREATE INDEX idx_discounts_domain ON discount_codes(sender_domain);
```

### 4.2 extraction_rules 表（架构 spec 已定义）

规则的 `extract_type` 字段区分 `'verification'` / `'discount'`，决定用哪套提取逻辑和写哪张结果表。

### 4.3 多层存储策略（折扣码安全核心）

折扣码有长期价值（可重复使用、数周有效），数据丢失 = 真实损失。与验证码（一次性、丢了无所谓）不同，折扣码必须**多层冗余存储**。

#### 存储层与职责

| 层 | 位置 | 角色 | 可靠性 | 写入时机 |
|----|------|------|--------|---------|
| **L1 边缘** | extraction-worker D1 | 主存储（查询/面板/API 读取） | Cloudflare 边缘，高可用但单点 | 提取时立即写 |
| **L2 VPS** | VPS SQLite discount_codes 表 | 冗余备份 + VPS 面板展示 | 有 BackupService 整库 gzip 备份 | extraction-worker 写 D1 后异步同步 |
| **L3 第三方** | 导出文件（JSON/CSV） | 异地灾备 | 可下载到本地/云盘 | VPS 定期导出或手动导出 |

#### 写入流程（L1 → L2 同步）

```
extraction-worker /extract 提取折扣码成功后:
  ① INSERT OR IGNORE discount_codes (D1)          ← L1 边缘，立即
  ② POST VPS /api/webhook/discount-sync           ← L2 VPS，异步(best-effort)
     payload: {recipient, sender, code, link, discount_value, message_id, ...}
     VPS 端 INSERT OR IGNORE discount_codes（message_id 去重）
```

- L1 → L2 同步是 **best-effort**：失败不阻塞提取（折扣码已在 L1）。
- VPS 端用 message_id UNIQUE 去重，重复同步幂等。
- 验证码**不做** L2 同步（一次性，L1 足够）。

#### L3 导出（第三方备份）

VPS BackupService 已支持整库 gzip 备份（含 discount_codes 表）。额外提供折扣码专用导出：

```
GET /api/admin/discounts/export?format=json|csv
  → 导出全部折扣码（含 code/link/value/merchant/time）
  → 用户手动下载到本地/云盘
```

可选自动化：VPS 定时任务（scheduler）定期导出折扣码 JSON 到 backup 目录，配合现有备份机制。

#### 数据一致性

- L1 是权威源（truth source），L2/L3 是冗余。
- 若 L1 丢失（D1 故障），从 L2 恢复：VPS POST worker /api/rules/restore-discounts 批量回灌。
- 若 L2 丢失（VPS 故障），从 L1 恢复：worker GET /api/discounts 全量拉取重灌 VPS。
- message_id 作为跨层去重键，保证幂等恢复。

#### VPS discount_codes 表（L2）

```sql
CREATE TABLE discount_codes (
  id TEXT PRIMARY KEY,              -- 用 message_id 派生或 UUID
  worker_name TEXT,
  recipient TEXT NOT NULL,
  sender TEXT,
  sender_domain TEXT,
  subject TEXT,
  code TEXT,
  link TEXT,
  discount_value TEXT,
  message_id TEXT UNIQUE,           -- 跨层去重键
  received_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_vps_discounts_recipient ON discount_codes(recipient, received_at DESC);
CREATE INDEX idx_vps_discounts_domain ON discount_codes(sender_domain);
```

> 注：验证码**不做** L2 冗余（一次性数据，worker L1 足够）。VPS 的 `verification_codes` 表（初版已建）在 worker 中心架构部署后**删除**（见架构 spec §9.5）。折扣码独享 L2 冗余——因为折扣码有长期价值，丢失 = 真实损失。

## 5. 折扣码提取逻辑

### 5.1 提取流水线（extraction-worker）

```
/extract 收到 {rawMime, ruleId}
  ↓
① 读 D1 规则（extract_type, code_pattern, link_anchor_pattern）
② postal-mime 解析 → subject, textBody, htmlBody
③ buildSearchableText（text + 去标签html，不含 href URL）
④ 若 extract_type == 'discount':
     码提取:
       有 code_pattern → extractCodeWithPattern（用户正则）
       无 code_pattern → 折扣码通用兜底（DISCOUNT_PREFIX_PATTERNS + 字母数字验证器）
     链接提取:
       有 link_anchor_pattern → findLinkByAnchorPattern
       无 → 折扣链接通用兜底（DISCOUNT_LINK_RE + 排除噪音）
⑤ 验证提取结果（discountCode 验证器：拒绝纯数字/纯字母，要求字母数字混合）
⑥ 若有结果: INSERT OR IGNORE discount_codes
```

### 5.2 折扣码前缀模板（DISCOUNT_PREFIX_PATTERNS）

参考 yahoo 项目 regex-generator 的前缀检测，折扣码专用前缀：

```
英文: (?:use|promo|coupon|discount|voucher|redemption|gift|offer|refer[a-z]*|save)\s+(?:code)?[:\s]+(?<code>...)
      code[:\s]+(?<code>...)
中文: (?:优惠码|折扣码|代码|兑换码|激活码|礼品码|优惠代码|折扣代码)[：:\s是]*\s*(?<code>...)
```

### 5.3 折扣码验证器（discountCode validator）

移植 yahoo 项目 VALIDATORS.discountCode，对提取的码做格式校验：
- 长度 4-20 字符
- 必须字母数字 `[A-Z0-9]+`
- **拒绝纯数字**（订单号/价格/日期）
- **拒绝纯字母**（普通单词）
- 至少含一个字母

> 与验证码的关键区别：验证码接受纯数字，折扣码拒绝纯数字。这是独立的验证器，不复用验证码的 isNoise。

### 5.4 折扣值提取（discount_value）

从主题或正文提取折扣力度，存入 discount_value 字段：
- 百分比：`50% OFF`、`25% off`
- 金额：`$10 OFF`、`Save $20`
- 关键词：`FREE SHIPPING`、`BOGO`

**提取正则**（统一命名组 `value`，与 discount_value 字段对应）：
- 百分比：`(?<value>\d{1,3}(?:\.\d{1,2})?%\s*(?:off|OFF|discount|折扣)?)`
- 金额：`(?<value>[\$¥€£]\d+(?:\.\d{2})?\s*(?:off|OFF|save|省)?)`
- 关键词：`(?<value>FREE\s+SHIPPING|BOGO|BUY\s+\d+\s+GET\s+\d+)`

提取后取第一个命中的 `value` 组写入 discount_value 字段。

> **正则生成器 gap 说明**：discount_value 的正则是**硬编码**的（上述三类固定正则），不走正则生成器流程。正则生成器（`2026-07-24-discount-regex-generator-spec.md`）只生成**折扣码本身**的正则，不生成 discount_value 的正则。折扣值格式相对固定（百分比/金额/关键词），硬编码足够。

### 5.5 折扣链接提取

折扣链接的锚文本与验证链接不同：
- 动作词：shop、buy、order、claim、redeem、get、apply、购物、购买、领取、立即购买、去使用
- 排除：unsubscribe、privacy、social、view in browser、退订

## 6. ReDoS 防护

与验证码提取相同的安全措施：
- 内容截断 50KB（MAX_SCAN_CHARS）
- 正则源码长度 ≤ 200 字符
- try/catch 包裹，编译失败/匹配异常降级到通用逻辑
- 依赖 Worker CPU 时限兜底

## 7. 前端

### 7.1 extraction-worker /admin（折扣码视图）

HTML 面板增加折扣码视图（与验证码视图并列切换）：
- 折扣码列表（按邮箱/商户筛选，分页）
- 显示：码、折扣值、发件人、商户域名、主题、时间
- 一键复制折扣码
- 删除单条

### 7.2 VPS 规则表单

extractDiscount 开关（与 extractVerification 并列），下方加：
- 验证码/折扣码正则输入框（code_pattern）
- 链接锚文本输入框（link_anchor_pattern）
- 「从样例生成」按钮（调 worker /api/generate-pattern?type=discount）
- 「测试」按钮（调 worker /api/test-pattern）

### 7.3 VPS 折扣码 tab

代理展示 extraction-worker /api/discounts 数据。

## 8. 数据流

```
配置(仅规则变更):
  VPS 面板配 forward 规则 + extractDiscount + 正则
    → POST extraction-worker/api/rules {id, extract_type:'discount', code_pattern, link_anchor_pattern}
    → D1 extraction_rules (upsert)

运行时(每封折扣码邮件):
  email-worker → VPS 决策(discountRequired=true) → 读正文 → forward
    → ctx.waitUntil: extraction-worker/extract {rawMime, ruleId}  (JSON body, 见架构 spec §8.1)
    → ctx.waitUntil: POST VPS /api/webhook/discount-sync  (L2 同步, best-effort)
    extraction-worker: 读规则(extract_type 由 ruleId 查表得) → 折扣码提取 → 验证 → 存 discount_codes

查询:
  外部程序 → GET extraction-worker/api/discounts?recipient=xxx (Bearer token, 见 API spec §4)
  VPS 面板折扣码 tab → 同上(代理展示)
```

## 9. 涉及文件

| 文件 | 操作 |
|------|------|
| `shared/src/types/filter-rule.ts` | FilterRule 加 extractDiscount |
| `shared/src/types/email.ts` | FilterDecision 加 discountRequired（与 verificationRequired 对称命名） |
| `extraction-worker/schema.sql` | 加 discount_codes 表 |
| `extraction-worker/src/db.ts` | 加折扣码 CRUD（insertDiscount, queryDiscounts） |
| `extraction-worker/src/extract.ts` | 加折扣码提取逻辑（前缀模板 + 验证器 + 折扣值） |
| `extraction-worker/src/index.ts` | /extract 按 extract_type 路由 + /api/discounts 路由 |
| `extraction-worker/src/admin.html` | 加折扣码视图 |
| `email-worker/src/index.ts` | 按 decision 的 discountRequired 调 /extract（传 ruleId，不传 extract_type——worker 查表决定） |
| `vps-api/src/db/{schema,run-migrations,rule-repository}.ts` | 加 extract_discount 列 |
| `vps-api/src/services/filter.service.ts` | 传递链加 discountRequired |
| `vps-api/src/routes/rules.ts` | 校验 extractDiscount + 互斥校验（与 extractVerification 不能同时开） |
| `vps-api/src/routes/frontend.ts` | 规则表单加 extractDiscount + 折扣码 tab |

## 10. 与验证码提取的共享与隔离

| 组件 | 共享 | 隔离 |
|------|------|------|
| D1 数据库 | 同一个 D1 实例 | verification_codes vs discount_codes 独立表 |
| extraction_rules 表 | 同一张表 | extract_type 字段区分 |
| worker 路由 | 同一 worker | /api/codes vs /api/discounts 独立端点 |
| /extract 端点 | 同一端点 | 按 extract_type 路由到不同提取逻辑 |
| 正则生成器 | 同一 regex-generator | generate-pattern 加 type 参数 |
| 提取逻辑 | buildSearchableText、htmlToPlainText 等工具函数 | 前缀模板、验证器、链接动作词各自独立 |
| 前端面板 | 同一 /admin | 验证码/折扣码两个视图切换 |

## 11. 不做的事

- 不合并折扣码和验证码到一张表（格式/时效/用途不同，分开清晰）
- 不做 yahoo 项目的 IMAP 拉取（本项目邮件由 Cloudflare Email Routing 推送）
- 不自动判断邮件是折扣码还是验证码（由 forward 规则的 flag 显式指定）
