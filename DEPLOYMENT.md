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
API_PORT=3000
API_TOKEN=你的安全随机令牌
DEFAULT_FORWARD_TO=your-email@gmail.com
VPS_PUBLIC_URL=https://your-vps-domain.com
JWT_SECRET=你的JWT密钥
DEFAULT_ADMIN_USERNAME=admin
DEFAULT_ADMIN_PASSWORD=你的后台密码
NODE_ENV=production
HOST=0.0.0.0
```

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

`packages/email-worker/wrangler.toml` 中至少配置：

```toml
name = "email-filter-forwarder"
main = "src/index.ts"
compatibility_date = "2024-01-01"

[vars]
VPS_API_URL = "https://your-vps-domain.com/api/webhook/email"
VPS_API_TOKEN = "与你的 API_TOKEN 相同"
DEFAULT_FORWARD_TO = "your-email@gmail.com"
WORKER_NAME = "my-domain-worker"

[[send_email]]
name = "SEB"
```

部署：

```bash
cd packages/email-worker
wrangler deploy
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
