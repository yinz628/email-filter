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

若需在管理面板查询提取结果或让 vps-api 推送提取规则，在 `.env` 配置（已含在 `.env.example` 与 `docker-compose.yml`）：

```bash
EXTRACTION_WORKER_URL=https://extraction-worker.<account>.workers.dev
EXTRACTION_WORKER_TOKEN=与 extraction-worker 的 ADMIN_TOKEN 相同
```

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

| 优先级 | 类别 | forwardTo | 行为 |
|--------|------|-----------|------|
| 最高 | 转发名单 (forward) | 必填 | 匹配后直接转发到指定地址 |
| 高 | 白名单 (whitelist) | 选填 | 匹配后放行，填写后覆写默认转发地址 |
| 中 | 黑名单 (blacklist) | 忽略 | 匹配后静默丢弃 |
| 低 | 动态规则 (dynamic) | 忽略 | 系统自动生成，匹配后丢弃 |

### 规则级转发地址覆写

转发地址控制采用双层语义：

1. **forward 规则的核心地址**：`forward` 类别规则的 `forwardTo` 属于核心语义（必填），在求值时始终生效，不受任何开关影响。这是最高优先级的定向转发，确保命中邮件转往指定地址。
2. **其他规则的覆写地址**：白名单等规则的可选 `forwardTo` 属于「覆写」，受 Worker 实例的 `ruleForwardEnabled` 开关门控：
   - 在管理面板 Worker 编辑页开启「启用规则转发覆写」开关（数据库字段 `worker_instances.rule_forward_enabled`）
   - 创建白名单规则时填写「转发地址」字段，命中后优先使用该地址
   - **关闭 Worker 级开关后（默认状态），所有白名单规则的 forwardTo 被剥离忽略，统一使用默认地址** —— 保证升级后行为不变
3. **管理入口**：规则的 `forward` 类别与 `forwardTo` 字段在管理面板的规则表单中配置；Worker 开关在 Worker 编辑表单中配置。

> 相关规格文档见 `docs/specs/2026-07-23-rule-forward-override-{requirements,spec,task-list}.md`。

### 验证码 / 折扣码提取

仅 `forward` 类别规则可触发提取（与「规则转发覆写」开关无关，开关保持默认关闭即可）：

| 配置项 | 说明 |
| --- | --- |
| `extractVerification` | 勾选后提取验证码（与 extractDiscount 互斥）|
| `extractDiscount` | 勾选后提取折扣码 |
| `codePattern` | 正则，如 `\d{6}`。留空则用通用提取逻辑 |
| `linkAnchorPattern` | 链接锚文本正则（可选，提取验证/激活链接）|

规则保存时 vps-api 自动把提取配置推送到 extraction-worker D1。提取结果存于 extraction-worker D1，经 `GET /api/extraction/codes`、`GET /api/extraction/discounts` 查询（管理面板「验证码/折扣码」页面）。

> 生产排障提示：若规则命中但 D1 无记录，优先检查 `codePattern` 是否匹配邮件正文格式。通用逻辑（codePattern 留空）对非标准格式可能识别不到，建议配明确正则；可用管理面板「正则编辑器」从样例生成并测试。

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
