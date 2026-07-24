# 验证码提取功能 — 设计规格

## 1. 概述

自动从邮件中提取验证码/验证链接，按收件邮箱归档，供管理面板查询与一键复制。

### 1.1 背景

用户收到含验证码的邮件时，需要快速拿到验证码值。此前邮件被转发到目标邮箱，用户需手动打开邮件找码。本功能自动提取，在管理面板按邮箱查看、一键复制。

### 1.2 架构选择（方案 D：专用 extraction-worker）

```
邮件到达 → email-worker
  ├─ 1. 解析 from/to/subject + 调 VPS 取过滤决策
  ├─ 2. 若 decision.verificationRequired && EXTRACTION_WORKER 绑定存在：
  │     ├─ 读取完整正文（message.raw，已验证不破坏 forward）
  │     ├─ EXTRACTION_WORKER.fetch(rawMime) → { code, link }  （service binding）
  │     └─ POST /api/webhook/verification 上报提取结果
  └─ 3. message.forward(forwardTo)  原样转发
```

**选型依据**：VPS 负载最低（正文不进 VPS）+ 提取逻辑集中 1 个 worker 易管理。多账号在同一 CF 账号下，只需 1 个 extraction-worker。

## 2. 关键设计决策

| 决策 | 选择 | 理由 |
|------|------|------|
| 提取位置 | 专用 extraction-worker（service binding） | VPS 零正文负载，逻辑集中 |
| 规则形态 | forward 规则加 `extractVerification` flag | 正交组合，避免枚举扩散；改动面 6→3 处 |
| MIME 解析 | postal-mime 库 | 健壮处理 multipart/charset/编码；27KB gzip |
| 正文读取 | 读完整正文后 forward | Phase 0 实测验证：不破坏 forward 投递 |
| 上报方式 | 独立端点 POST /api/webhook/verification | 不走 AsyncTaskProcessor，提取已有结果直接存 |

## 3. 数据模型

### 3.1 filter_rules 扩展

新增列 `extract_verification INTEGER NOT NULL DEFAULT 0`。仅 forward 规则使用；其他类别设该值为 true 时被 rules.ts 校验拒绝。

### 3.2 verification_codes 表

```sql
CREATE TABLE verification_codes (
  id TEXT PRIMARY KEY,
  worker_name TEXT NOT NULL,
  recipient TEXT NOT NULL,
  sender TEXT,
  subject TEXT,
  code TEXT,
  link TEXT,
  message_id TEXT,
  received_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```
索引：recipient+received_at（按邮箱查）、message_id（去重）、created_at（面板排序）。

## 4. 提取策略（extraction-worker）

### 4.1 提取优先级
1. **验证链接**（正文）— 明确意图，置信度最高
2. **关键词附近的验证码**（code/验证码/OTP/动态码 ±80 字符窗口内）
3. **独立短码**（无关键词时的兜底，4-8 位数字）

### 4.2 码来源优先级
subject > text/plain body > text/html body（HTML 先 strip 标签）

### 4.3 防误报
- HTML 属性数字（width/height）不提取（无关键词上下文）
- 价格（$48.99）不提取
- 数字码限 4-8 位（避免订单号/追踪号）
- 字母数字码要求至少含 1 位数字（避免全大写单词）

## 5. flag 传递链

`规则.extractVerification=true` → `FilterResult.verificationRequired=true` → `FilterDecision.verificationRequired=true` → email-worker。

涉及 4 处（缺一不可，否则 worker 收不到）：
1. `filter.service.ts` FilterResult 接口加 `verificationRequired?`
2. `filterEmail()` forward 分支设 `verificationRequired: forwardMatch.extractVerification === true`
3. `toFilterDecision()` 透传该字段
4. `email.ts` FilterDecision 接口加 `verificationRequired?`

## 6. 实现的关键约束

### 6.1 raw 读取与 forward 兼容性（Phase 0 已验证）
读完 message.raw 完整正文后，message.forward() 仍能投递完整邮件。Cloudflare 的 forward 内部独立投递，不依赖 JS 侧 raw 流游标。详见 `2026-07-23-phase0-raw-forward-compat-result.md`。

### 6.2 提取必须在 forward 前（流单消费）
`extractAndReportVerification` 必须 await（读流是同步于流生命周期的），不能 fire-and-forget。流只能读一次，forward 之后再读为空。

### 6.3 上报用 ctx.waitUntil（如需异步）
若上报放 forward 之后，必须 ctx.waitUntil 保活。当前实现是 forward 前 await 完整提取（含上报），故不依赖 waitUntil。

## 7. 部署

### 7.1 部署顺序（严格执行）
1. 部署 extraction-worker（service binding 的被调用方必须先存在）
2. 部署 email-worker 全部实例（11 个生产 wrangler 文件）
   - 用 `packages/email-worker/scripts/deploy-all.sh`

### 7.2 wrangler 配置
extraction-worker：极简（name + main + compat_date）。
每个 email-worker wrangler 加：
```toml
[[services]]
binding = "EXTRACTION_WORKER"
service = "extraction-worker"
```

## 8. 风险

| 风险 | 缓解 |
|------|------|
| 验证码格式多样，正则遗漏 | 关键词上下文 + 多模式兜底；后续可扩 KV 可配置正则 |
| 大邮件爆 CPU | MAX_EXTRACTION_BYTES=256KB 截断；extraction-worker 512KB 输入上限 |
| extraction-worker 不可用 | 可选绑定；不可用时静默跳过，不阻塞转发 |
| 提取结果误报 | 防误报规则；面板可删除错误记录 |

## 9. 涉及文件

| 文件 | 改动 |
|------|------|
| `packages/extraction-worker/*` | 新建整个包（postal-mime + 提取逻辑 + 22 单测） |
| `packages/shared/src/types/extraction.ts` | 新建契约类型 |
| `packages/shared/src/types/filter-rule.ts` | FilterRule/CreateRuleDTO/UpdateRuleDTO 加 extractVerification |
| `packages/shared/src/types/email.ts` | FilterDecision 加 verificationRequired |
| `packages/vps-api/src/db/schema.sql` | filter_rules 加列 + verification_codes 表 |
| `packages/vps-api/src/db/run-migrations.ts` | 3 个新迁移（列 + 表 + phase0_logs） |
| `packages/vps-api/src/db/rule-repository.ts` | 读写 extract_verification |
| `packages/vps-api/src/services/filter.service.ts` | flag 传递链 |
| `packages/vps-api/src/services/verification.service.ts` | 新建 CRUD |
| `packages/vps-api/src/routes/verification.ts` | 新建查询端点 |
| `packages/vps-api/src/routes/webhook.ts` | 加 /verification 上报端点 |
| `packages/vps-api/src/routes/rules.ts` | 校验 extractVerification |
| `packages/vps-api/src/routes/frontend.ts` | 验证码面板 + 规则表单 flag |
| `packages/email-worker/src/index.ts` | Env + readFullRaw + extractAndReportVerification + email() 集成 |
| `packages/email-worker/wrangler.*.toml`（11 个）| 加 [[services]] |
| `packages/email-worker/scripts/deploy-all.sh` | 新建批量部署 |
