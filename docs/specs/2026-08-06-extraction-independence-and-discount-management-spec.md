# 提取独立化与折扣码中心化管理 — 设计规格

## 1. 文档信息

- 文档主题：提取能力从转发名单解耦 + 折扣码 vps 中心化管理
- 适用项目：`email-filter`
- 文档类型：设计规格（Spec）
- 文档日期：2026-08-06
- 当前状态：已实施并部署生产
- 关联文档：
  - `2026-07-23-extraction-worker-architecture-spec.md`（提取架构基线，本文修订其「提取仅 forward」语义）
  - `2026-07-23-extraction-api-spec.md`（读取 API 契约）
  - `2026-07-23-discount-code-extraction-spec.md`（discount_codes 表结构）
  - `2026-07-23-rule-forward-override-spec.md`（forwardTo 语义，本文修订「forward 必填」）

## 2. 变更背景

历史实现中，验证码/折扣码提取**强绑定**于 `forward` 类别规则：
- 后端校验拒绝非 forward 类别设置 `extractVerification` / `extractDiscount`；
- 决策层（`filter.service.ts`）只在 forward 分支填充提取标记；
- `forward` 规则的 `forwardTo` 后端必填。

这带来两个限制：
1. 无法表达「丢弃邮件但抽取验证码」（blacklist + 提取）这类常见诉求；
2. 提取必须依附于一条转发规则，配置繁琐。

同时折扣码长期累积后缺乏分类管理手段（worker 端表无 status/tags 字段），只能整批删除。

本规格将提取改造为与规则动作正交的独立能力，并为折扣码引入 vps 侧的状态管理层。

## 3. 设计结论

### 3.1 提取独立于类别与动作

提取标记（`extractVerification` / `extractDiscount`）从「forward 专属」变为「任意类别可叠加」：

- 任意类别规则（forward/whitelist/blacklist/dynamic）都可勾选提取，二者仍互斥。
- 提取与规则的**动作无关**：转发规则可提取，丢弃规则（blacklist/dynamic）也可提取。email-worker 在投递决策**之前**读取正文（`message.raw` 流单次消费），决策之后无论 forward 还是 drop 都用 `ctx.waitUntil` 异步调 extraction-worker。
- `forwardTo` 对所有类别变为可选。留空时：forward/whitelist 回退到 Worker 的 `DEFAULT_FORWARD_TO`；blacklist/dynamic 本就丢弃，地址不生效。

**典型用法**：「只要验证码、不要邮件」——blacklist 规则 + `extractVerification`，邮件丢弃但验证码仍入库。

### 3.2 折扣码双层管理架构

折扣码数据分两层，松耦合关联：

| 层 | 位置 | 内容 | 角色 |
|----|------|------|------|
| L1 提取库 | extraction-worker D1 `discount_codes` | 码内容（code/link/商户/主题/received_at 等） | 纯提取结果，只增不改 |
| L2 管理状态 | vps-api SQLite `discount_code_states` | status / tags / favorite / note | 用户管理的状态叠加层 |

关键约束：
- L2 **不复制码内容**，仅以 `discount_id` 关联 L1。worker 可独立演化，vps 状态不污染提取库。
- L2 状态行**按需创建**（upsert）：仅当用户操作某条折扣码时才产生状态行，避免与 L1 数据漂移、避免预填海量空行。
- 查询时 vps-api 代理 worker 取 L1 码内容 + 本地取 L2 状态，按 `discount_id` 在前端合并展示。

`discount_code_states` 表结构：

```sql
CREATE TABLE discount_code_states (
  discount_id INTEGER PRIMARY KEY,        -- 对应 extraction-worker D1 的 discount_codes.id
  status TEXT NOT NULL DEFAULT 'active',  -- active | used | expired | archived
  tags TEXT,                               -- 逗号分隔自由标签
  favorite INTEGER NOT NULL DEFAULT 0,
  note TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

状态值受应用层校验约束（`active` / `used` / `expired` / `archived`）。

### 3.3 设计原则：worker 轻、vps 重

extraction-worker 跑在 Cloudflare 边缘，需保持轻量（CPU/包体积敏感）。因此：
- 复杂管理（状态机、标签、批量、导出、多维筛选）全部在 vps-api 实现；
- worker 端仅保留基础查询（收件人/商户/主题/时间/搜索）+ 单删 + 批量删 + CSV 导出；
- worker 独立面板 `/admin` 不承担状态管理职责。

## 4. 实现要点

### 4.1 后端校验放宽（vps-api `routes/rules.ts`）

- 删除「`extractVerification`/`extractDiscount` 仅 forward 类别允许」的拒绝逻辑；
- 删除「forward 类别 `forwardTo` 必填」的校验；
- 保留二者互斥校验，并补齐 `validateUpdateRule`（PUT）的互斥校验（消除既有 create/update 不一致债务）。

### 4.2 决策层推广（vps-api `services/filter.service.ts`）

抽出 `extractionFlagsFor(rule)` 集中处理提取标记语义，所有决策分支（forward/whitelist/blacklist/dynamic）统一调用：
- 命中规则且有提取标志 → 填 `verificationRequired`/`discountRequired` + `ruleId`；
- 无提取标志 → 不填（`ruleId` 仅在有提取标志时设，因其是 extraction-worker 查配置的关联键）。

email-worker 端无需改动——它只看 decision 的提取标记，与 action/类别无关（`index.ts:917`）。

### 4.3 折扣码状态 API（vps-api `routes/extraction-proxy.ts`）

新增本地 vps 表操作（不走 worker）：
- `GET /api/extraction/discount-states?ids=1,2,3` — 批量读状态 map；
- `PUT /api/extraction/discount-states/:discount_id` — upsert 单条（支持部分更新：仅写提供的字段）；
- `POST /api/extraction/discount-states/bulk` — 事务批量 upsert。

并新增代理（转发到 worker）：`POST /discounts/bulk-delete`、`GET /discounts/export`。

upsert 用 SQLite 的 `INSERT ... ON CONFLICT(discount_id) DO UPDATE SET col=excluded.col` —— 每个值只绑定一次，支持部分更新（未传字段保留原值）。

### 4.4 worker 端筛选增强（extraction-worker）

`buildDiscountWhere` 新增维度：`subject`（LIKE）、`dateFrom`/`dateTo`（received_at 范围，UTC 字典序比较）。list 与 export 端点共用解析。

### 4.5 vps 前端折扣码管理 tab（`routes/frontend.ts`）

仿验证码 tab 新增「🏷️ 折扣码」tab：
- 多维筛选：收件人 / 商户域名（下拉，自动归类）/ 主题（下拉，自动归类）/ 状态 / 收藏 / 时间范围 / 搜索；
- 状态管理：行内改状态、收藏切换、编辑标签/备注；
- 批量：全选当前页 + 批量删除 / 标记已用 / 归档；
- 导出 CSV（当前筛选全部，代理 worker）；
- 分页：每页 20/50/100 可选；
- 数据合并：先 `/discounts`（worker 代理）取码 + `/discount-states?ids=` 取状态，按 `discount_id` 前端合并。

下拉选项通过 `ensureDiscountFilterOptions()` 一次性拉 limit=200 归类填充，进入 tab 时触发，批量删除后强制刷新。

## 5. 迁移与兼容

- `discount_code_states` 表通过幂等迁移 `migrateCreateDiscountCodeStatesTable`（`run-migrations.ts`）创建，`CREATE TABLE IF NOT EXISTS` + `tableExists` 检查，可安全重复执行。
- 校验放宽是**向后兼容**的：旧规则数据不受影响（无提取标志的规则行为不变；有 forwardTo 的 forward 规则照常转发）。
- email-worker 不改动，旧版与新 vps-api 兼容。

## 6. 排障要点

- **面板 503**：`docker-compose.yml` 必须在 `environment` 段透传 `EXTRACTION_WORKER_URL`/`EXTRACTION_WORKER_TOKEN`（仅配 `.env` 不够）。改 compose 后须重建容器。详见 DEPLOYMENT.md 排障。
- **提取标记未生效**：确认规则勾选了提取且邮件命中该规则；提取标记由命中的规则产生，非 forward 分支也会填（见 4.2）。
- **折扣码状态丢失**：状态存 vps 本地表，与 worker 数据松耦合；若 worker 侧删了某条码，其 vps 状态行会变孤儿（不影响展示，定期可清理）。

## 7. 测试覆盖

- `routes/rules-validation.test.ts`：非 forward 类别允许提取、forwardTo 可选、互斥校验；
- `services/filter.service.test.ts`：whitelist/blacklist/dynamic 分支带提取标记、ruleId 仅在有提取时设；
- `db/migrate.test.ts`：discount_code_states 建表 + upsert 模式。
