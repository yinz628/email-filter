# Email Filter

基于 Cloudflare Email Routing + VPS 的邮件过滤转发系统。接收邮件后按规则决定转发到指定地址或静默丢弃，并附带动态拦截、营销分析、信号监控、**验证码/折扣码自动提取**等运营能力。

## 架构数据流

```text
Cloudflare Email Routing
   ↓ (收件)
email-worker (Cloudflare Workers, 边缘轻量计算, <10ms CPU)
   ├─ POST /api/webhook/email → vps-api 取过滤决策 (forward/drop)
   ├─ message.forward() 转发邮件
   └─ [命中提取规则时] service binding 调 extraction-worker
        ↓ POST /extract (raw MIME + ruleId)
     extraction-worker (D1 存储: 解析 MIME → 正则提取验证码/折扣码 → 落库)
vps-api (Fastify + SQLite, VPS 上唯一后端)
   ↓ Phase 1 同步: 过滤决策 → 回传 forward/drop
   ↓ Phase 2 异步: 统计 / 日志 / 监控 / 营销分析
   ↓ 规则保存时自动推送提取配置到 extraction-worker D1
SQLite 持久化 + /admin 管理面板（含验证码/折扣码查询）
```

- Worker 端有 4 秒超时，VPS 宕机时自动回退到默认转发，保证邮件不丢。
- Webhook 采用两阶段处理：Phase 1 同步返回决策（<100ms 目标），Phase 2 异步落库与统计。

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
1. forward   (转发名单)   → 转发到 rule.forwardTo（必填，核心地址，最高优先级）
2. whitelist (白名单)     → 转发到 rule.forwardTo（若 Worker 开关开启）否则默认地址
3. blacklist (黑名单)     → 静默丢弃
4. dynamic   (动态规则)   → 静默丢弃（系统自动生成，超过阈值时拦截）
5. 无匹配                  → 转发到默认地址
```

匹配维度：`sender` / `subject` / `domain` × `exact` / `contains` / `startsWith` / `endsWith` / `regex`。

**规则级转发覆写**：白名单等规则可携带 `forwardTo` 覆写默认地址，受 Worker 实例的 `ruleForwardEnabled` 开关门控（默认关闭）。`forward` 规则的 `forwardTo` 属核心语义，不受开关影响。详见 [`docs/specs/2026-07-23-rule-forward-override-spec.md`](docs/specs/2026-07-23-rule-forward-override-spec.md)。

## 验证码 / 折扣码提取

命中 `forward` 类别的规则可触发**自动提取**——从邮件正文中识别验证码/折扣码并存入 extraction-worker 的 D1，供管理面板查询或 API 取用。

- **触发条件**：forward 规则勾选 `extractVerification`（验证码）或 `extractDiscount`（折扣码），二者互斥。
- **提取方式**：
  - 填写 `codePattern` 正则 → 精确匹配（推荐，如 `\d{6}` 匹配 6 位验证码）
  - 留空 → 使用通用提取逻辑（识别常见验证码/折扣码格式，覆盖面广但不如正则精准）
- **存储**：extraction-worker 的 D1（`verification_codes` / `discount_codes` 表），不经过 VPS，不影响转发延迟（`ctx.waitUntil` 异步执行）。
- **查询**：
  - 管理面板「验证码/折扣码」页面
  - API `GET /api/extraction/codes`、`GET /api/extraction/codes/latest/:recipient`
- **配置同步**：在管理面板保存/更新带提取标志的规则时，vps-api 自动将提取配置（`extract_type` / `code_pattern` / `link_anchor_pattern`）推送到 extraction-worker D1，无需手动同步。

> **与「规则转发覆写」开关无关**：提取只绑定在 forward 规则的核心地址上，不受 Worker 的 `ruleForwardEnabled` 开关影响（该开关默认关闭即可）。详见 [`docs/specs/`](docs/specs/) 下提取相关规格。
>
> **正则生成器**：管理面板规则表单提供「正则编辑器」，可粘贴真实样例自动生成候选正则并测试匹配，标志固定为不区分大小写。

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
