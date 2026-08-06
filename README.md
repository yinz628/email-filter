# Email Filter

基于 Cloudflare Email Routing + VPS 的邮件过滤转发系统。接收邮件后按规则决定转发到指定地址或静默丢弃，并附带动态拦截、营销分析、信号监控、**验证码/折扣码自动提取**等运营能力。

## 架构数据流

```text
Cloudflare Email Routing
   ↓ (收件)
email-worker (Cloudflare Workers, 边缘轻量计算, <10ms CPU)
   ├─ POST /api/webhook/email → vps-api 取过滤决策 (forward/drop)
   ├─ message.forward() 转发邮件 / 或按决策丢弃
   └─ [命中带提取标志的规则时] service binding 调 extraction-worker（与 forward/drop 无关）
        ↓ POST /extract (raw MIME + ruleId)
     extraction-worker (D1 存储: 解析 MIME → 正则提取验证码/折扣码 → 落库)
vps-api (Fastify + SQLite, VPS 上唯一后端)
   ↓ Phase 1 同步: 过滤决策 → 回传 forward/drop
   ↓ Phase 2 异步: 统计 / 日志 / 监控 / 营销分析
   ↓ 规则保存时自动推送提取配置到 extraction-worker D1
   ↓ 折扣码管理：代理 worker 取码内容 + 本地 discount_code_states 状态层（status/tags/favorite）
SQLite 持久化 + /admin 管理面板（验证码查询 + 折扣码分类管理）
```

- Worker 端有 4 秒超时，VPS 宕机时自动回退到默认转发，保证邮件不丢。
- Webhook 采用两阶段处理：Phase 1 同步返回决策（<100ms 目标），Phase 2 异步落库与统计。
- 提取与投递动作正交：丢弃的邮件也可提取验证码（blacklist + extractVerification）。

## 包结构（pnpm workspace）

| 包 | 路径 | 说明 |
| --- | --- | --- |
| email-worker | `packages/email-worker` | Cloudflare Email Worker，多实例（每个域名一个 `wrangler.*.toml`） |
| extraction-worker | `packages/extraction-worker` | Cloudflare Worker，验证码/折扣码提取服务（D1 存储 + 正则生成器）。作为 email-worker 的 service binding 被调用 |
| vps-api | `packages/vps-api` | 主后端，Fastify + better-sqlite3，含 `/admin` 管理面板 |
| shared | `packages/shared` | 共享类型定义与规则匹配算法 |
| perf-test-worker | `packages/perf-test-worker` | 性能压测 Worker |

## 核心过滤优先级

```
1. forward   (转发名单)   → 转发到 rule.forwardTo（选填，留空走默认地址，最高优先级）
2. whitelist (白名单)     → 转发到 rule.forwardTo（若 Worker 开关开启）否则默认地址
3. blacklist (黑名单)     → 静默丢弃
4. dynamic   (动态规则)   → 静默丢弃（系统自动生成，超过阈值时拦截）
5. 无匹配                  → 转发到默认地址
```

匹配维度：`sender` / `subject` / `domain` × `exact` / `contains` / `startsWith` / `endsWith` / `regex`。

**forwardTo 全类别可选**：所有类别规则的「转发地址」均为选填。留空时，forward/whitelist 转发到 Worker 的 `DEFAULT_FORWARD_TO`；blacklist/dynamic 本就丢弃，地址不生效。

**规则级转发覆写**：白名单等规则可携带 `forwardTo` 覆写默认地址，受 Worker 实例的 `ruleForwardEnabled` 开关门控（默认关闭）。详见 [`docs/specs/2026-07-23-rule-forward-override-spec.md`](docs/specs/2026-07-23-rule-forward-override-spec.md)。

## 验证码 / 折扣码提取

**提取是与规则动作正交的独立能力**——任何类别（forward/whitelist/blacklist/dynamic）的规则都可勾选提取，提取在邮件投递决策**之前**读取正文（流单次消费），无论邮件最终是转发还是丢弃，提取都会执行（如：拦截垃圾邮件的同时抽取其中的验证码）。

- **触发条件**：任意规则勾选 `extractVerification`（验证码）或 `extractDiscount`（折扣码），二者互斥。
- **提取方式**：
  - 填写 `codePattern` 正则 → 精确匹配（推荐，如 `\d{6}` 匹配 6 位验证码）
  - 留空 → 使用通用提取逻辑（识别常见验证码/折扣码格式，覆盖面广但不如正则精准）
- **存储**：extraction-worker 的 D1（`verification_codes` / `discount_codes` 表），不经过 VPS，不影响转发延迟（`ctx.waitUntil` 异步执行）。
- **查询**：
  - vps-api 管理面板「验证码」/「折扣码」页面（折扣码含状态/收藏/标签管理，详见下节）
  - extraction-worker 独立面板 `/admin`
  - API `GET /api/extraction/codes`、`GET /api/extraction/codes/latest/:recipient`、`GET /api/extraction/discounts`
- **配置同步**：在管理面板保存/更新带提取标志的规则时，vps-api 自动将提取配置（`extract_type` / `code_pattern` / `link_anchor_pattern`）推送到 extraction-worker D1，无需手动同步。

> **提取与转发地址无关**：提取不再绑定 forward 类别，也不要求填写 forwardTo。一个典型的「只要验证码、不要邮件」规则：blacklist + `extractVerification`，邮件被丢弃但验证码仍被提取。
>
> **正则生成器**：管理面板规则表单提供「正则编辑器」，可粘贴真实样例自动生成候选正则并测试匹配，标志固定为不区分大小写。
>
> 架构变更详情见 [`docs/specs/2026-08-06-extraction-independence-and-discount-management-spec.md`](docs/specs/2026-08-06-extraction-independence-and-discount-management-spec.md)。

### 折扣码管理（vps 中心化）

折扣码采用**双层数据架构**，实现 worker 端轻量、vps 端富管理：

- **L1 提取库**（extraction-worker D1 的 `discount_codes`）：存储码内容（code/link/商户/主题等），只增不改，保持纯净。
- **L2 管理状态**（vps-api SQLite 的 `discount_code_states`）：只存管理状态（`status` / `tags` / `favorite` / `note`），通过 `discount_id` 与 L1 关联，**不复制码内容**。状态行按需创建（用户操作时才 upsert），避免与 L1 数据漂移。

vps-api 管理面板「🏷️ 折扣码」tab 提供完整管理：多维筛选（收件人/商户下拉/主题下拉/状态/收藏/时间范围）、状态管理（未用/已用/过期/归档）、收藏、自定义标签、批量操作（删除/标记/归档）、CSV 导出（当前筛选全部）、分页（每页 20/50/100 可选）。查询时 vps-api 代理 worker 取码内容 + 本地状态按 `discount_id` 合并展示。

**外部项目取码**：[`scripts/get_verification_code.py`](scripts/get_verification_code.py) —— 单文件、零依赖的 Python 脚本，轮询等待指定邮箱的新验证码（阻塞直到本次触发的新码到达），可整体拷贝到任意项目使用。CLI 与 Python `import` 双形态，详见 [使用文档](scripts/get_verification_code.md)。

## 快速开始

1. 复制 `.env.example` 为 `.env` 并填入配置（`API_TOKEN`、`DEFAULT_FORWARD_TO`、`JWT_SECRET` 等）。
2. 部署后端：参见 [DEPLOYMENT.md](DEPLOYMENT.md)（支持 Docker / systemd）。
3. 部署 Worker：在 `packages/email-worker` 用对应的 `wrangler.<name>.toml` 执行 `pnpm deploy`。
4. 访问管理面板：`http://<vps-host>:<PORT>/admin`。

## 关键文档

- [DEPLOYMENT.md](DEPLOYMENT.md) — 部署、环境变量、排障
- [.env.example](.env.example) — 环境变量模板
- [docs/specs/](docs/specs/) — 按日期归档的功能规格文档（requirements / spec / task-list 三件套）
- [.kiro/specs/](.kiro/specs/) — 按特性组织的规格文档

## 开发

```bash
pnpm install          # 安装依赖
pnpm typecheck        # 类型检查
pnpm test             # 运行全部测试
pnpm lint             # 代码检查
```

各包独立脚本见对应 `package.json`。
