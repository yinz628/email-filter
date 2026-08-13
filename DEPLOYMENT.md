# 邮件过滤系统部署说明

## 当前架构

系统当前只部署一个后端服务：`vps-api`。

整体链路如下：

1. Cloudflare Email Routing 接收邮件
2. `packages/email-worker` 调用 VPS 上的 `POST /api/webhook/email`
3. `vps-api` 完成过滤决策、统计、监控、管理后台等能力
4. 管理后台由 `vps-api` 直接提供，访问路径为 `/admin`

不再部署 `vps-admin` 独立服务。

## 目录结构

```text
Cloudflare Email Routing
  -> email-worker
  -> vps-api
  -> SQLite
  -> /admin
```

## 环境要求

- VPS: Ubuntu 20.04+ / Debian 11+
- Node.js 20+ 或 Docker
- pnpm
- Cloudflare 已启用 Email Routing

## Docker 部署

### 1. 克隆项目

```bash
sudo mkdir -p /opt/email-filter
cd /opt
git clone https://github.com/yinz628/email-filter.git
cd /opt/email-filter
```

### 2. 配置环境变量

```bash
cp .env.example .env
```

至少需要配置：

```bash
PORT=3000
API_TOKEN=你的安全随机令牌
DEFAULT_FORWARD_TO=your-email@gmail.com
VPS_PUBLIC_URL=https://your-vps-domain.com
JWT_SECRET=你的JWT密钥
DEFAULT_ADMIN_USERNAME=admin
DEFAULT_ADMIN_PASSWORD=你的后台密码
NODE_ENV=production
HOST=0.0.0.0
# 功能开关（可选，默认启用）
SUBJECT_TRACKING_ENABLED=true # 邮件主题追踪统计
CAMPAIGN_ANALYTICS_ENABLED=true # 营销分析
SIGNAL_MONITORING_ENABLED=true  # 信号监控
# 调度器配置（可选，以下为默认值）
HEARTBEAT_CRON='*/5 * * * *'           # 信号监控心跳检查周期
CLEANUP_CRON='0 3 * * *'               # 数据清理周期（每日凌晨3点）
HIT_LOG_RETENTION_HOURS=72             # 命中日志保留小时数（48-72）
ALERT_RETENTION_DAYS=90                # 告警保留天数（30-90）
RUN_HEARTBEAT_ON_START=false           # 启动时立即执行一次心跳检查
```

> 注意：动态规则的参数（启用状态、时间窗口、阈值、过期）**不通过环境变量配置**，而是运行时通过 `/api/dynamic` 接口管理，存储在数据库的 `dynamic_config` 表中。请勿在 `.env` 中添加 `DYNAMIC_*` 变量。

### 3. 启动服务

```bash
docker compose build
docker compose up -d
```

### 4. 验证

```bash
docker compose ps
curl http://localhost:3000/health
```

后台入口：

- API: `http://localhost:3000`
- Admin: `http://localhost:3000/admin`

### 常用命令

```bash
docker compose logs -f api
docker compose restart api
docker compose down
docker compose build --no-cache api
docker compose up -d
docker compose exec api sh
```

## Systemd 部署

### 1. 安装依赖

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs build-essential python3 g++ make git
sudo npm install -g pnpm
```

### 2. 克隆并安装

```bash
sudo mkdir -p /opt/email-filter/data
cd /opt/email-filter
git clone https://github.com/yinz628/email-filter.git .
pnpm install
npm rebuild better-sqlite3
```

### 3. 构建

```bash
cd /opt/email-filter/packages/shared && pnpm build
cd /opt/email-filter/packages/vps-api && pnpm build
cp /opt/email-filter/packages/vps-api/src/db/schema.sql /opt/email-filter/packages/vps-api/dist/db/schema.sql
```

### 4. 配置环境变量

```bash
cp /opt/email-filter/.env.example /opt/email-filter/.env
```

示例补充：

```bash
DB_PATH=/opt/email-filter/data/filter.db
```

### 5. 安装 systemd 服务

服务文件：

- `/etc/systemd/system/email-filter-api.service`

启动命令：

```bash
sudo chown -R www-data:www-data /opt/email-filter/data
sudo systemctl daemon-reload
sudo systemctl enable --now email-filter-api
```

验证命令：

```bash
sudo systemctl status email-filter-api
curl http://localhost:3000/health
```

后台入口：

- API: `http://localhost:3000`
- Admin: `http://localhost:3000/admin`

## Nginx 反向代理

```nginx
server {
    listen 80;
    server_name your-vps-domain.com;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl;
    http2 on;
    server_name your-vps-domain.com;

    ssl_certificate /path/to/fullchain.pem;
    ssl_certificate_key /path/to/privkey.pem;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "Upgrade";
        proxy_buffering off;
        client_max_body_size 50M;
    }
}
```

应用配置：

```bash
sudo ln -s /etc/nginx/sites-available/email-filter /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

## Cloudflare Worker 配置

系统包含两类 Cloudflare Worker：

| Worker | 作用 | 部署 |
| --- | --- | --- |
| email-worker | 接收邮件、调 VPS 取决策、转发、触发提取 | 多实例（每域名一个 `wrangler.<name>.toml`） |
| extraction-worker | 验证码/折扣码提取服务（D1 存储 + 正则生成器） | 单实例，作为 email-worker 的 service binding 被调用 |

### email-worker 配置

`packages/email-worker/wrangler.toml`（默认）或 `wrangler.<name>.toml`（每域名）至少配置：

```toml
name = "email-filter-forwarder"        # 每域名唯一，如 email-filter-forwarder-gltemail
main = "src/index.ts"
compatibility_date = "2024-01-01"

[vars]
VPS_API_URL = "https://your-vps-domain.com/api/webhook/email"
VPS_API_TOKEN = "与你的 API_TOKEN 相同"   # worker 用 Bearer 认证调 VPS webhook
DEFAULT_FORWARD_TO = "your-email@gmail.com"
WORKER_NAME = "my-domain-worker"        # 必须与 VPS /api/workers 注册的 name 一致
DEBUG_LOGGING = "false"                 # 生产建议 false；调试提取时临时开 true

[[send_email]]
name = "SEB"

# Service binding 到 extraction-worker（启用验证码/折扣码提取必需）
# extraction-worker 必须先部署，否则 deploy 会失败
[[services]]
binding = "EXTRACTION_WORKER"
service = "extraction-worker"
```

> **提取是可选且容错的**：`EXTRACTION_WORKER` binding 缺失时，email-worker 静默跳过提取，不影响转发。删除该 binding 即可关闭某域名的提取能力。

### extraction-worker 配置

```toml
# packages/extraction-worker/wrangler.toml
name = "extraction-worker"
[[d1_databases]]
binding = "DB"
database_name = "extraction-db"
[vars]
ADMIN_TOKEN = "强随机令牌"   # 生产必须改！默认值 change-me-in-production 不安全
```

### 批量部署

```bash
cd packages/email-worker

# 部署全部：先 extraction-worker（被调用方先就绪），再所有 email-worker 实例
bash scripts/deploy-all.sh

# 仅更新 email-worker（extraction-worker 已部署时）
bash scripts/deploy-all.sh workers

# 部署单个域名
npx wrangler deploy --config wrangler.gltemail.toml
```

`deploy-all.sh` 自动跳过 `*test*` 配置。需先 `npx wrangler login` 登录到 worker 所在账户。

> **Cloudflare Email Routing**：每个域名的 catch-all / 路由规则需在 Cloudflare Dashboard 指向对应的 `email-filter-forwarder-*` worker。

### VPS 端 extraction 配置（可选）

若需在管理面板查询提取结果或让 vps-api 推送提取规则，在 `.env` 配置：

```bash
EXTRACTION_WORKER_URL=https://extraction-worker.<account>.workers.dev
EXTRACTION_WORKER_TOKEN=与 extraction-worker 的 ADMIN_TOKEN 相同
```

> **务必确认 `docker-compose.yml` 的 `environment` 段透传了这两个变量**（仅配 `.env` 而不透传，容器内读不到，面板会 503）。详见排障「验证码/折扣码面板加载失败（503）」。

## 数据与备份

数据库位置：

- Docker: `/app/data/filter.db`
- Systemd: `/opt/email-filter/data/filter.db`
- 开发环境: `packages/vps-api/data/filter.db`

备份建议：

```bash
mkdir -p /opt/email-filter/backups
cp /opt/email-filter/data/filter.db /opt/email-filter/backups/filter-$(date +%Y%m%d-%H%M%S).db
```

恢复与下载能力已由 `vps-api` 的 `/api/admin/backup/*` 提供。

## 过滤规则说明

### 规则类别与优先级

| 优先级 | 类别 | 转发地址 | 行为 |
|--------|------|---------|------|
| 最高 | 转发名单 (forward) | 选填 | 匹配后转发，填写则转指定地址，留空走默认地址 |
| 高 | 提取验证码 (extract_verification) | 选填 | 转发 + 提取验证码（类别即提取类型）|
| 高 | 提取折扣码 (extract_discount) | 选填 | 转发 + 提取折扣码（类别即提取类型）|
| 中 | 白名单 (whitelist) | 不配置 | 匹配后放行到默认地址 |
| 中 | 黑名单 (blacklist) | 不配置 | 匹配后静默丢弃 |
| 低 | 动态规则 (dynamic) | 不配置 | 系统自动生成，匹配后丢弃 |

> 管理面板「添加规则」按类别控制字段显隐：extract_* 与 forward 显示转发地址（选填）；extract_* 额外显示提取正则设置；whitelist/blacklist 不配置转发地址。动态规则由系统生成，不在添加表单出现。

### 规则级转发地址覆写

转发地址控制采用双层语义：

1. **forward / extract_* 规则的转发地址**：`forwardTo` 选填，留空回退到 Worker 的 `DEFAULT_FORWARD_TO`。`forward` 与 `extract_*` 的 `forwardTo` 始终生效，不受开关影响。
2. **其他规则的覆写地址**：白名单等规则的可选 `forwardTo` 属于「覆写」，受 Worker 实例的 `ruleForwardEnabled` 开关门控：
   - 在管理面板 Worker 编辑页开启「启用规则转发覆写」开关（数据库字段 `worker_instances.rule_forward_enabled`）
   - **关闭 Worker 级开关后（默认状态），白名单等规则的 forwardTo 被剥离忽略，统一使用默认地址**
3. **管理入口**：规则类别与 `forwardTo` 字段在管理面板的规则表单中配置；Worker 开关在 Worker 编辑表单中配置。

> 相关规格文档见 `docs/specs/2026-07-23-rule-forward-override-{requirements,spec,task-list}.md`。

### 验证码 / 折扣码提取

**提取是与转发/白名单/黑名单平级的独立规则类别**——通过 `extract_verification` 或 `extract_discount` 类别实现。类别本身决定提取类型（单一数据源），其他类别不再具备提取能力（每个类别单一职责）。

| 配置项 | 说明 |
| --- | --- |
| 规则类别 | `extract_verification`（提取验证码）/ `extract_discount`（提取折扣码），二者择一 |
| `codePattern` | 正则，如 `\d{6}`。留空则用通用提取逻辑 |
| `linkAnchorPattern` | 链接锚文本正则（可选，提取验证/激活链接）|
| `linkUrlPattern` | 链接 URL 正则（可选，按 URL 形状精确匹配验证/激活链接。优先级介于 anchor 与通用启发式之间）|

> `extractVerification` / `extractDiscount` 标志由类别强制决定（后端校验保证一致），无需手动设置。

**链接提取优先级**：`linkAnchorPattern`（锚文本）> `linkUrlPattern`（URL 正则）> 通用启发式（URL 路径动词检测）。三个层次互为兜底，配置越多越精准。AWS SES `awstrack.me` 等跟踪包装 URL 会在正则生成和结果落库时自动解码为真实 URL。

规则保存时 vps-api 自动把提取配置推送到 extraction-worker D1。提取结果存于 extraction-worker D1，经 `GET /api/extraction/codes`、`GET /api/extraction/discounts` 查询（vps 管理面板「验证码」/「🏷️ 折扣码」页面，或 extraction-worker 独立面板 `/admin`）。

**折扣码管理状态**：vps-api 的 `discount_code_states` 表（status/tags/favorite/note）与 worker 的 `discount_codes` 通过 `discount_id` 松耦合关联——worker 保持纯提取库，管理状态全在 vps 侧。详见 README「折扣码管理」。

> 生产排障提示：若规则命中但 D1 无记录，优先检查 `codePattern` 是否匹配邮件正文格式。通用逻辑（codePattern 留空）对非标准格式可能识别不到，建议配明确正则；可用管理面板「正则编辑器」（支持验证码/折扣码与验证链接双模式）从样例生成并测试。

## 排障

### 健康检查

```bash
curl http://localhost:3000/health
```

### 查看日志

```bash
docker compose logs -f api
```

或：

```bash
sudo journalctl -u email-filter-api -f
```

### 验证码/折扣码面板加载失败（503）

管理面板「验证码」或「折扣码」tab 报 `503 Service Unavailable` / `{"error":"Extraction worker not configured"}`，通常是因为 `EXTRACTION_WORKER_URL` / `EXTRACTION_WORKER_TOKEN` 没传进容器：

1. 确认 `.env` 里配了这两个变量（值同 extraction-worker 的 `wrangler.toml` 的 `ADMIN_TOKEN`）。
2. **确认 `docker-compose.yml` 的 `environment` 段透传了它们**（关键易漏点）：
   ```yaml
   environment:
     - EXTRACTION_WORKER_URL=${EXTRACTION_WORKER_URL:-}
     - EXTRACTION_WORKER_TOKEN=${EXTRACTION_WORKER_TOKEN:-}
   ```
   只在 `.env` 配、而 compose 不透传，容器内 `process.env` 仍是空 → 503。
3. 改完 compose 必须重建容器（`docker compose up -d`，环境变量改变不会热加载）。
4. 验证容器内确实拿到：`docker compose exec api env | grep EXTRACTION`。

### 提取规则命中但 D1 无记录 / link_url_pattern 不生效

规则命中且邮件转发成功，但提取结果为空或 `link_url_pattern` 不生效，常见原因是 **extraction-worker 的 D1 表缺少新增列**：

- `CREATE TABLE IF NOT EXISTS` 对**已存在的表是 no-op**——Cloudflare D1 只在首次建表时执行 `schema.sql`，后续加列不会自动 ALTER。
- 当 extraction-worker 的 `schema.sql` 新增了列（如 `link_url_pattern`）但表已存在时，需手动 ALTER：

```bash
cd packages/extraction-worker
npx wrangler d1 execute extraction-db --remote --command \
  "ALTER TABLE extraction_rules ADD COLUMN link_url_pattern TEXT"
```

验证列已存在：

```bash
npx wrangler d1 execute extraction-db --remote --command \
  "PRAGMA table_info(extraction_rules)"
```

> 与 vps-api 不同，extraction-worker 目前没有幂等迁移机制（vps-api 的 `run-migrations.ts` 会检测列存在再 ALTER）。修改 extraction-worker schema 后，生产 D1 需手动同步。

### 某域名的邮件不触发提取

某个域名的邮件命中了 extract_* 规则但完全不触发提取（日志无 `[EXTRACTION]` 输出），通常是因为 **该域名的 email-worker 实例运行的是旧代码**：

- 系统有多个 email-worker 实例（每个域名一个 `wrangler.<name>.toml`），每个需**单独部署**。
- `deploy-all.sh` 部署全部，但若只部署了主 worker，其他域名仍是旧版本。
- 排查：在 Cloudflare Dashboard → Workers → 对应的 `email-filter-forwarder-*` → 查看部署时间，确认是否为最新。

```bash
cd packages/email-worker
# 部署单个域名（替换 <name>）
npx wrangler deploy --config wrangler.<name>.toml
# 或部署全部
bash scripts/deploy-all.sh workers
```

确认 worker 配置中有 `EXTRACTION_WORKER` service binding（缺失时会静默跳过提取）：

```bash
grep -A2 "EXTRACTION_WORKER" wrangler.<name>.toml
```

### 提取到的链接是 awstrack.me 跟踪包装而非真实 URL

若提取结果中的 link 形如 `https://xxx.r.us-west-2.awstrack.me/L0/https%3A...`，说明提取引擎未解码跟踪包装。`unwrapTrackingUrl()` 在 `extract()` 返回值处自动解码 AWS SES awstrack.me 格式。确认部署的是最新版 extraction-worker（2026-08-13 及之后的版本）。

### better-sqlite3 编译问题

```bash
sudo apt-get update
sudo apt-get install -y build-essential python3 g++ make

cd /opt/email-filter
rm -rf node_modules
pnpm install
npm rebuild better-sqlite3
```

### 检查部署文件

```bash
ls -la /opt/email-filter/data/
ls -la /opt/email-filter/packages/vps-api/dist/db/schema.sql
```
