# 邮件内容提取 — Worker 中心架构设计规格

> 状态：设计中（待实现）
> 日期：2026-07-23
> 关联：
> - `2026-07-23-verification-extraction-spec.md`（初版 VPS 中心架构，本方案为其演进）
> - `2026-07-23-discount-code-extraction-spec.md`（折扣码提取，基于本架构）

## 1. 背景与动机

初版验证码提取功能采用 **VPS 中心架构**：email-worker 提取后上报 VPS，VPS 存库 + 提供面板。
端到端测试验证了功能可用，但暴露两个问题：

1. **性能**：每封验证码邮件，email-worker 与 VPS 交流 2 次（决策 + 上报），提取（读正文 + 调 extraction-worker + 上报 VPS）同步阻塞 forward，实测延迟 ~288ms。
2. **架构耦合**：验证码数据存在 VPS，外部程序读取需经过 VPS；VPS 承担了与核心过滤无关的存储/查询职责。

**本方案将提取的主存储、面板、API 移到 extraction-worker（Cloudflare 边缘 D1）**，VPS 作为规则配置中心。该架构统一支撑**验证码提取**和**折扣码提取**两种内容提取类型——两者共享同一 worker 基础设施（D1、路由、面板框架），但提取逻辑、存储表、面板各自独立。核心收益：
- email-worker 每封提取邮件只与 VPS 交流 **1 次**（决策），提取结果由 extraction-worker 自存 D1。
- 外部程序直接读 worker API，不经过 VPS。

### 1.1 VPS 存什么 / 不存什么（明确分工）

| 数据 | worker D1 (L1 主存储) | VPS (L2 冗余) | 说明 |
|------|----------------------|--------------|------|
| 验证码结果 | ✅ verification_codes | ❌ 不存 | 一次性数据，L1 足够。VPS 验证码模块全部删除（§9.5） |
| 折扣码结果 | ✅ discount_codes | ✅ discount_codes | 折扣码有长期价值，L2 冗余防丢失（见折扣码 spec §4.3） |
| 提取规则 | ✅ extraction_rules | ✅ filter_rules 列 | VPS 是配置源，推送镜像到 worker |

### 1.2 支持的提取类型

| 类型 | 规则 flag | 提取目标 | 格式特征 | worker 存储表 | VPS 冗余 |
|------|----------|---------|---------|--------------|----------|
| 验证码 | `extractVerification` | 验证码 / 验证链接 | 纯数字 4-8 位为主；一次性、短时效 | verification_codes | ❌ |
| 折扣码 | `extractDiscount` | 折扣码 / 优惠链接 | 字母+数字混合；可重复用、长时效 | discount_codes | ✅ |

> **互斥**：一条 forward 规则只能开一个 flag（extractVerification 或 extractDiscount），rules.ts 校验拒绝同时开。

## 2. 架构总览

```
┌─────────────────────────────────────────────────────────┐
│ VPS（规则配置中心）                                       │
│  - 管理面板：创建 forward 规则 + 配置正则/锚文本           │
│  - 正则生成器（从样例生成）                                │
│  - 规则变更 → 推送到 extraction-worker D1                 │
│  - 验证码 tab：从 worker API 拉取展示（代理）              │
└──────────────────────┬──────────────────────────────────┘
                       │ ①规则推送(仅变更时)  ⑥拉取结果(展示)
┌──────────────────────▼──────────────────────────────────┐
│ extraction-worker（自包含提取服务）                        │
│  - D1: verification_codes 表 + extraction_rules 表        │
│  - /extract (service binding): 读规则→提取→存 D1          │
│  - /admin: 前端面板(查看验证码)                            │
│  - /api/*: JSON API(外部程序读取验证码，Bearer token)      │
│  - /api/rules: 接收 VPS 推送的规则                         │
│  - /api/generate-pattern, /api/test-pattern: 正则生成/测试 │
└──────────────────────┬──────────────────────────────────┘
                       │ ②service binding(仅提取)
┌──────────────────────▼──────────────────────────────────┐
│ email-worker                                              │
│  - 收邮件 → VPS 决策(1次) → forward                       │
│  - 若 verificationRequired: 读正文 → 调 extraction-worker  │
│    (不再上报 VPS，extraction-worker 自己存 D1)            │
└─────────────────────────────────────────────────────────┘
```

### 数据流

```
配置阶段(仅规则变更时):
  VPS 面板配规则+正则 → POST extraction-worker/api/rules → D1 extraction_rules (upsert)

运行时(每封验证码邮件):
  email-worker → VPS 决策(1次) → 读正文 → extraction-worker/extract (service binding)
    extraction-worker: 读 D1 规则 → 提取 → 存 D1  (不上报 VPS)

查询阶段:
  外部程序 → GET extraction-worker/api/codes?recipient=xxx (Bearer token)
  VPS 面板验证码 tab → 同上(代理展示)
```

## 3. D1 数据库设计

### 3.1 extraction_rules 表（VPS 推送的提取配置，验证码 + 折扣码共用）

```sql
CREATE TABLE extraction_rules (
  id TEXT PRIMARY KEY,              -- 对应 VPS filter_rules.id
  extract_type TEXT NOT NULL,       -- 'verification' | 'discount'
  code_pattern TEXT,                -- 验证码/折扣码专属正则（如 \d{6}、[A-Z]{2}[0-9]{4}）
  link_anchor_pattern TEXT,         -- 验证链接/优惠链接锚文本正则
  updated_at TEXT NOT NULL
);
```

- `extract_type`：区分提取类型，决定用哪套提取逻辑和写哪张结果表。
- `code_pattern`：提取码的正则。有命名组 `(?<code>...)` 优先取命名组，无则取第一个捕获组，再无取全文匹配。
- `link_anchor_pattern`：匹配锚文本的正则。命中则取该 `<a>` 标签的 href。
- `link_url_pattern`（2026-08-13 新增）：匹配 URL 本身的正则。优先级介于 `link_anchor_pattern` 与通用启发式之间。适用于纯文本邮件（无 `<a>` 标签）或锚文本不规范的场景。详见 `2026-08-13-unified-regex-editor-spec.md`。
- 两者都为空 → 走对应类型的通用兜底逻辑（验证码用 PREFIX_PATTERNS + ANCHOR_ACTION_RE；折扣码用 DISCOUNT 前缀 + 字母数字混合验证器）。

> **跟踪链接解码**（2026-08-13 新增）：AWS SES 等邮件服务商会把真实链接包装成 `awstrack.me` 跟踪 URL。`unwrapTrackingUrl()` 在正则候选生成前和提取结果落库前自动解码，确保用户和 D1 中始终是真实 URL。

### 3.2 verification_codes 表（验证码提取结果）

```sql
CREATE TABLE verification_codes (
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

-- message_id 去重（避免重复邮件重复写入）
CREATE UNIQUE INDEX idx_codes_msg_id ON verification_codes(message_id);

-- 按邮箱查码（主要查询路径）
CREATE INDEX idx_codes_recipient ON verification_codes(recipient, received_at DESC);
```

## 4. 高效 D1 读写设计（核心）

### 4.1 操作清单与优化

| 操作 | SQL | 频率 | 优化措施 |
|------|-----|------|---------|
| 读规则 | `SELECT code_pattern, link_anchor_pattern FROM extraction_rules WHERE id=?` | 每封验证码邮件 | 主键查询 O(1) |
| 写结果 | `INSERT OR IGNORE INTO verification_codes (...)` | 每封**有提取结果**的邮件 | ① message_id UNIQUE 去重 ② 空结果不写 |
| 查验证码 | `SELECT ... WHERE recipient=? ORDER BY received_at DESC LIMIT ? OFFSET ?` | 面板/API 查询 | recipient+received_at 复合索引 + 分页 |
| 推送规则 | `INSERT INTO extraction_rules ... ON CONFLICT(id) DO UPDATE SET ...` | 仅规则变更 | 极少，upsert 幂等 |

### 4.2 关键优化细节

**① message_id 去重（避免重复写）**
用 `INSERT OR IGNORE` + message_id UNIQUE 约束，让 D1 自动去重。冲突时自动跳过不报错，一次操作完成（无需先查再写）。这把"查重+写入"从 2 次操作降为 1 次。

**② 空结果不写**
提取不到 code 且 link 时，不执行 INSERT——避免存无价值空行，减少写入次数。

**③ 索引设计**
- `extraction_rules.id` PRIMARY KEY — 规则查询走主键
- `verification_codes(message_id)` UNIQUE — 去重约束兼索引
- `verification_codes(recipient, received_at DESC)` — 按邮箱查码的主查询路径

**④ D1 额度评估**
免费版：500 万行读/天 + 10 万行写/天。假设每天 1000 封验证码邮件：
- 读规则 1000 + 写结果 ≤1000 = ~2000 操作/天
- 用量 < 免费额度 0.1%，完全无压力

### 4.3 每封验证码邮件的精确 D1 操作

```
email-worker 调 extraction-worker /extract {rawMime, ruleId}
  ↓
extraction-worker:
  ① 1 读: SELECT 规则 WHERE id=ruleId              ← 读规则（主键 O(1)）
  ② 提取（用 code_pattern / link_anchor_pattern）
  ③ 若有结果: 1 写: INSERT OR IGNORE 结果           ← 写结果（UNIQUE 去重）
     若无结果: 0 写（空结果不存）
  ↓
返回 {code, link} 给 email-worker（可选，仅用于日志）
```

**最坏 1 读 + 1 写，最好 1 读 + 0 写（空结果）。不再有 VPS 上报往返。**

## 5. extraction-worker 路由

| 路由 | 方法 | D1 操作 | 认证 | 说明 |
|------|------|--------|------|------|
| `/extract` | POST | 1 读 + 1 写 | service binding（同账号内部，无需认证） | 读规则→提取→存结果（JSON `{rawMime, ruleId}`，按规则 extract_type 路由）。请求体格式见 §8.1 |
| `/api/codes` | GET | 1 读 | Bearer token | 查验证码（分页 `?recipient=&limit=&offset=`） |
| `/api/codes/:id` | GET | 1 读 | Bearer token | 单条验证码查询 |
| `/api/codes/:id` | DELETE | 1 写 | Bearer token | 删除单条验证码 |
| `/api/codes/latest/:recipient` | GET | 1 读 | Bearer token | 便捷端点：直接返回该邮箱最新验证码（见 API spec §3.3） |
| `/api/discounts` | GET | 1 读 | Bearer token | 查折扣码（分页 `?recipient=&sender_domain=&limit=&offset=`） |
| `/api/discounts/:id` | GET | 1 读 | Bearer token | 单条折扣码查询 |
| `/api/discounts/:id` | DELETE | 1 写 | Bearer token | 删除单条折扣码 |
| `/api/discounts/by-merchant/:domain` | GET | 1 读 | Bearer token | 按商户查折扣码（见 API spec §4.2） |
| `/api/rules` | POST | 1 写 | Bearer token | VPS 推送规则（upsert，含 extract_type） |
| `/api/generate-pattern` | POST | 0 | Bearer token | 正则生成（纯计算，支持 `?type=verification\|discount`） |
| `/api/test-pattern` | POST | 0 | Bearer token | 正则测试（纯计算） |
| `/admin` | GET | 1 读 | Bearer token | HTML 面板（验证码 + 折扣码两个视图） |
| `/health` | GET | 0 | 无 | 健康检查 |

> 完整 API 契约（请求/响应格式、错误码、使用示例）见 `2026-07-23-extraction-api-spec.md`。

## 6. 正则自动生成（移植 yahoo-mail-extractor regex-generator）

新建 `extraction-worker/src/regex-generator.ts`：

- `generateFromTarget(sample)`：从样例码/样例锚文本生成多个候选正则（精确长度 → 弹性长度 ±2 → 通用），按置信度排序。
- `validateRegex(pattern, flags)`：try-compile 校验。
- `testRegexMatch(pattern, flags, content)`：预览匹配结果。

生成策略（参考 yahoo 项目 suggestPatterns）：
- 前缀检测：识别 `verification code:` / `验证码：` 等前缀，生成 `${prefix}(?<code>[A-Z0-9]{N})` 形态。
- 形态识别：纯字母数字、字母+数字、连字符码等，各产出 3 个候选（精确/弹性/通用）。
- 通用兜底：`(?:code|验证码|...)[：:\s]+(?<code>[A-Z0-9]{6,20})`。

VPS 前端调 worker 的 `/api/generate-pattern` 和 `/api/test-pattern` 端点。

## 7. 提取逻辑（extraction-worker/src/extract.ts 改造）

`extractVerification` 签名加 `codePattern?`、`linkAnchorPattern?` 和 `linkUrlPattern?` 参数：

```
有 codePattern  → extractCodeWithPattern（编译用户正则，命名组优先）
无 codePattern  → 通用前缀锚定 + 过滤兜底（已实现）

链接提取优先级链（2026-08-13 扩展为三层）：
1. 有 linkAnchorPattern → findLinkByAnchorPattern（匹配锚文本取 href）
2. 有 linkUrlPattern    → findLinkByUrlPattern（匹配 URL 本身，不应用噪声过滤——用户正则权威）
3. 无以上两者           → 通用锚文本 + URL 动词（已实现）
```

提取结果的 link 会经过 `unwrapTrackingUrl()` 解码（解码 awstrack.me 等跟踪包装为真实 URL）。

### ReDoS 防护
- 内容截断 50KB（MAX_SCAN_CHARS）
- 正则源码长度 ≤ 200 字符（超长拒绝）
- try/catch 包裹，编译失败/匹配异常降级到通用逻辑
- 依赖 Worker CPU 时限作为最终兜底（JS 无原生 regex 超时）

## 8. email-worker 改造

### 8.1 FilterDecision 字段 + /extract 契约

**FilterDecision 新增字段**（email.ts，统一命名，去掉 Extract）：
```typescript
interface FilterDecision {
  // 已有
  action: 'forward' | 'drop';
  forwardTo?: string;
  reason?: string;
  verificationRequired?: boolean;   // 已有
  // 新增
  discountRequired?: boolean;       // 折扣码提取（与 verificationRequired 互斥）
  ruleId?: string;                  // 命中的 forward 规则 ID，传给 worker 查提取配置
}
```

> **互斥约束**：一条 forward 规则只能开 `extractVerification` 或 `extractDiscount` 之一（rules.ts 校验拒绝同时开）。因此 `verificationRequired` 和 `discountRequired` 不会同时为 true。email-worker 只需一个 if 分支。

> **extract_type 不在 FilterDecision 里**：email-worker 传 `ruleId` 给 worker，worker 查 D1 `extraction_rules` 表的 `extract_type` 字段决定用哪套提取逻辑。email-worker 不需要知道提取类型。

**/extract 请求体格式**（修正：从纯文本改为 JSON，解决 B3）：

当前代码用 `Content-Type: text/plain` + 裸 MIME body，无法传 ruleId。改为 JSON：

```
POST /extract  (service binding)
Content-Type: application/json

{
  "rawMime": "<完整 RFC822 MIME 字符串>",
  "ruleId": "e677731f-..."
}
```

> **rawMime 转义**：raw MIME 内含引号/反斜杠/换行，用 `JSON.stringify({rawMime, ruleId})` 自动转义。worker 端 `const {rawMime, ruleId} = await request.json()`。向后兼容：若 body 不是合法 JSON（纯文本），fallback 到 `await request.text()` 当裸 MIME 处理（无 ruleId，走通用兜底）。

### 8.2 性能解耦（提取不阻塞 forward）

验证码和折扣码提取**都**应用此解耦（修正 C2）：
```
email():
  ① 决策 getFilterDecision（已有，与 VPS 交流 1 次）
  ② 若 verificationRequired || discountRequired:
       rawMime = await readFullRaw(message)    ← 同步（流单消费，必须 forward 前）
       ← 读 raw 安全性见 phase0 测试文档 2026-07-23-phase0-raw-forward-compat-result.md
  ③ message.forward()                           ← 立即转发，不等提取
  ④ ctx.waitUntil( doExtract(rawMime, ruleId) ) ← 异步：调 worker /extract → 存 D1
       折扣码额外：ctx.waitUntil( syncToVps(result) ) ← L2 同步也异步，不阻塞
```

**效果**：提取邮件 forward 延迟从 ~288ms 降到只剩"读正文"（几 ms~几十 ms）。普通邮件完全不变。

> **当前代码现状**（email-worker/index.ts:975）：当前是 `await reportPromise`（全程阻塞）。本节描述的是**目标架构**，实现时需改为 ctx.waitUntil。

## 9. VPS 改造（简化为规则中心）

### 9.1 数据层
- `filter_rules` 加 `extract_discount INTEGER`、`code_pattern TEXT`、`link_anchor_pattern TEXT` 列（已有 `extract_verification`）。
- `extract_verification` 和 `extract_discount` 互斥（rules.ts 校验）。
- VPS `filter_rules.code_pattern` / `link_anchor_pattern` 是**配置源**，推送时镜像到 worker `extraction_rules.code_pattern` / `link_anchor_pattern`。两边字段语义一致（都是用户配的正则字符串）。

### 9.2 传递链
`filter.service.ts`：FilterResult + FilterDecision 加 `ruleId`, `discountRequired`，forward 分支设值（互斥：extractVerification 设 verificationRequired，extractDiscount 设 discountRequired），toFilterDecision 透传。

### 9.3 规则推送
`rules.ts` POST/PUT/DELETE 时，若规则带 extractVerification 或 extractDiscount，异步推送提取配置到 extraction-worker `/api/rules`：
```json
{
  "id": "<ruleId>",
  "extract_type": "verification",   // 或 "discount"
  "code_pattern": "\\d{6}",
  "link_anchor_pattern": "I'M IN!|Join now"
}
```
推送失败不阻塞规则保存（best-effort，下次推送或手动同步补偿）。

### 9.4 验证码/折扣码 tab 代理
`frontend.ts` 验证码 tab + 折扣码 tab 改为从 extraction-worker `/api/codes`、`/api/discounts` 拉取展示（VPS 做代理）。端点契约见 `2026-07-23-extraction-api-spec.md`。

### 9.5 清理（验证码 VPS 中心模块全部删除）

worker 中心架构下，验证码只存 worker D1。以下 VPS 端验证码模块全部删除：

**代码删除**：
- `vps-api/src/services/verification.service.ts` — 删除
- `vps-api/src/routes/verification.ts` — 删除
- `vps-api/src/routes/webhook.ts` 中的 `/verification` 端点 + `isValidVerificationReport` 函数 — 删除
- `vps-api/src/routes/index.ts` 中 `verificationRoutes` 导出 — 删除
- `vps-api/src/index.ts` 中 `verificationRoutes` 挂载 — 删除
- `vps-api/src/routes/frontend.ts` 中验证码面板的 HTML/JS — 删除或改为代理 worker API

**shared 类型清理**：
- `shared/src/types/extraction.ts` 中 `VerificationReportPayload`、`VerificationCodeRecord`、`VerificationListQuery`、`VerificationListResponse` — 删除（这些是 VPS 中心架构的契约，worker 中心架构不再需要）。保留 `ExtractionRequest`（加 ruleId）、`ExtractionResult`、`ExtractedCode`。

**数据库**：
- `schema.sql` 中 `verification_codes` 表定义 — 删除
- `run-migrations.ts` 中 `migrateCreateVerificationCodesTable` 迁移 — 保留（已部署的 VPS 需要它幂等跳过，不能删否则启动报错），但标记为 deprecated
- 新增 `DROP TABLE IF EXISTS verification_codes` 迁移（在 worker 中心架构部署后执行）

**保留**（不删）：
- `filter_rules.extract_verification` 列 — 保留（forward 规则的 flag，传递链仍需要）
- `filter.service.ts` 中 `verificationRequired` 传递链 — 保留（改为传 ruleId 给 worker）

## 10. 前端

### 10.1 extraction-worker /admin（自带面板）
HTML+JS 单页面：
- 验证码列表（按邮箱筛选，分页）
- 一键复制验证码
- 删除单条
- Bearer token 认证（URL 参数或 localStorage）

### 10.2 VPS 规则表单
- extractVerification 开关下方加两个输入框：验证码正则（code_pattern）、链接锚文本（link_anchor_pattern）。
- 各带「从样例生成」按钮 → 弹窗输入样例 → 调 worker `/api/generate-pattern` → 选候选 → 填入。
- 各带「测试」按钮 → 弹窗输入测试文本 → 调 worker `/api/test-pattern` → 显示匹配结果。

### 10.3 VPS 验证码 tab
iframe 或代理展示 worker 面板数据。

## 11. 认证与安全

- extraction-worker `/api/*` 和 `/admin`：Bearer token（wrangler.toml 配 `ADMIN_TOKEN`）。
- `/extract`（service binding）：同账号内部调用，无需认证。
- D1 免费版 500MB（验证码记录极小，够用百万条）。
- 用户正则 ReDoS：内容截断 + 正则源限制 + Worker CPU 时限。
- 无效正则：VPS 端 + worker 端双重 try-compile 校验。

## 12. D1 限制参考

| 项 | 免费版 | 付费版 |
|----|--------|--------|
| 数据库数 | 10 | 50,000 |
| 单库大小 | 500 MB | 10 GB |
| 行数 | 无限（受存储限） | 同 |
| 行读取/天 | 500 万 | 250 亿/月（含）+ $0.001/百万 |
| 行写入/天 | 10 万 | 5000 万/月（含）+ $1/百万 |
| 单行最大 | 2 MB | 2 MB |

验证码场景用量 < 免费额度 0.1%。

## 13. 实现顺序

1. **D1 创建 + 绑定 + 建表**：wrangler d1 create + schema.sql + wrangler d1 execute
2. **extraction-worker 改造**：db.ts（D1 封装）+ index.ts（全功能路由）+ extract.ts（pattern 参数）
3. **正则生成器**：regex-generator.ts（移植 yahoo）
4. **email-worker 改造**：传 ruleId + 去 VPS 上报 + 性能解耦（ctx.waitUntil）
5. **VPS 改造**：规则推送 + 验证码 tab 代理 + 删除旧 verification 模块
6. **前端**：worker /admin 面板 + VPS 规则表单（正则输入/生成/测试）
7. **测试 + 部署 + 文档**

## 14. 涉及文件

| 文件 | 操作 |
|------|------|
| `extraction-worker/wrangler.toml` | 加 D1 绑定 + ADMIN_TOKEN |
| `extraction-worker/schema.sql` | **新建** D1 建表脚本（verification_codes + extraction_rules） |
| `extraction-worker/src/index.ts` | 全功能路由（extract JSON body /admin/api/rules） |
| `extraction-worker/src/db.ts` | **新建** D1 查询封装 |
| `extraction-worker/src/extract.ts` | 加 codePattern/linkAnchorPattern 参数 |
| `extraction-worker/src/regex-generator.ts` | **新建** 正则生成器（详见 regex-generator spec） |
| `extraction-worker/src/admin.html` | **新建** 前端面板 |
| `email-worker/src/index.ts` | /extract 改 JSON body 传 ruleId + 去 VPS 上报 + 性能解耦（ctx.waitUntil） |
| `shared/src/types/email.ts` | FilterDecision 加 ruleId?, discountRequired?（verificationRequired 已有） |
| `shared/src/types/filter-rule.ts` | FilterRule 加 extractDiscount, codePattern, linkAnchorPattern |
| `shared/src/types/extraction.ts` | ExtractionRequest 加 ruleId；删除 VerificationReportPayload/VerificationCodeRecord 等 VPS 中心旧类型 |
| `vps-api/src/services/filter.service.ts` | 传递链加 ruleId, discountRequired |
| `vps-api/src/routes/rules.ts` | 规则校验（含互斥）+ 推送 worker /api/rules |
| `vps-api/src/routes/webhook.ts` | 删除 /verification 端点 + isValidVerificationReport |
| `vps-api/src/routes/frontend.ts` | 规则表单加正则输入 + 验证码 tab 改代理 worker API |
| `vps-api/src/db/{schema.sql,run-migrations.ts,rule-repository.ts}` | 加 extract_discount/code_pattern/link_anchor_pattern 列 + DROP verification_codes 迁移 |
| `vps-api/src/services/verification.service.ts` | **删除** |
| `vps-api/src/routes/verification.ts` | **删除** |
| `vps-api/src/routes/index.ts` | 删除 verificationRoutes 导出 |
| `vps-api/src/index.ts` | 删除 verificationRoutes 挂载 |

## 15. 不做的事

- 不在 VPS 存验证码（全部移到 worker D1，VPS verification 模块全删）。
- 不让 email-worker 直接写 D1（通过 service binding 调 extraction-worker，职责单一）。
- 不改通用兜底提取逻辑（作为无配置时的默认，已验证够用）。
- 不做 yahoo 项目的 IMAP 拉取（本项目邮件由 Cloudflare Email Routing 推送）。
