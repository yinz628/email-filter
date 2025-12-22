# 邮件过滤系统部署教程

## 目录

- [系统架构](#系统架构)
- [前置要求](#前置要求)
- [VPS API 部署](#vps-api-部署)
- [数据库管理](#数据库管理)
- [Cloudflare Email Worker 部署](#cloudflare-email-worker-部署)
- [Nginx 反向代理配置](#nginx-反向代理配置)
- [多 Worker 配置](#多-worker-配置)
- [故障排除](#故障排除)
- [常用命令速查](#常用命令速查)

---

## 系统架构

```
┌─────────────────────────────────────────────────────────────────┐
│                    Cloudflare Email Routing                     │
│  收件邮箱: *@your-domain.com                                    │
│                    │                                            │
│                    ▼                                            │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │              Email Worker (email-filter-forwarder)       │   │
│  └─────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
                              │ POST /api/webhook/email
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                         VPS 服务器                               │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                    Nginx (:443 HTTPS)                    │   │
│  └─────────────────────────────────────────────────────────┘   │
│              ┌───────────────┴───────────────┐                 │
│              ▼                               ▼                  │
│  ┌───────────────────────┐    ┌───────────────────────┐        │
│  │    VPS API (:3000)    │    │  VPS Admin (:3001)    │        │
│  └───────────────────────┘    └───────────────────────┘        │
│              └───────────────┬───────────────┘                 │
│                              ▼                                  │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │              SQLite (/opt/email-filter/data/)            │   │
│  └─────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

---

## 前置要求

| 组件 | 要求 |
|------|------|
| VPS | Ubuntu 20.04+ / Debian 11+，512MB+ 内存，公网 IP |
| Cloudflare | 已添加域名，已启用 Email Routing |
| 本地环境 | Node.js 18+，pnpm，Wrangler CLI |

---

## VPS API 部署

### 方式一：Docker 部署（推荐）

#### 步骤 1：安装 Docker

```bash
# 安装 Docker
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER

# 重新登录以应用 docker 组权限
exit
# 重新 SSH 登录后继续
```

#### 步骤 2：克隆项目

```bash
# 创建目录
sudo mkdir -p /opt/email-filter
cd /opt/

# 克隆项目
git clone -b feature/backup-restore https://github.com/yinz628/email-filter.git
```

#### 步骤 3：配置环境变量

```bash
# 复制示例配置
cd /opt/email-filter
cp .env.example .env

# 生成随机令牌
echo "API_TOKEN: $(openssl rand -hex 32)"
echo "SESSION_SECRET: $(openssl rand -hex 32)"

# 编辑配置文件
nano .env
```

`.env` 必填配置：
```bash
# API 配置
API_PORT=3000
API_TOKEN=你生成的32位随机令牌
DEFAULT_FORWARD_TO=your-email@gmail.com

# 管理面板配置
ADMIN_PORT=3001
ADMIN_PASSWORD=设置一个安全的密码
SESSION_SECRET=你生成的另一个32位随机令牌

# JWT 配置
JWT_SECRET=再生成一个32位随机令牌
DEFAULT_ADMIN_USERNAME=admin
DEFAULT_ADMIN_PASSWORD=管理员密码
```

#### 步骤 4：构建并启动

```bash
# 构建镜像（首次需要较长时间）
docker compose build

# 启动服务
docker compose up -d

# 查看启动日志
docker compose logs -f
```
# 清理后重新构建
docker system prune -af


docker compose down


#### 步骤 5：验证部署

```bash
# 检查容器状态
docker compose ps

# 测试 API 健康检查
curl http://localhost:3000/health

# 测试管理面板健康检查
curl http://localhost:3001/health
```

预期输出：
```json
{"status":"healthy","service":"vps-email-filter-api","timestamp":"..."}
```

#### Docker 常用命令

```bash
# 查看日志
docker compose logs -f api      # API 日志
docker compose logs -f admin    # 管理面板日志

# 重启服务
docker compose restart

# 停止服务
docker compose down

# 重新构建（代码更新后）
docker compose build --no-cache
docker compose up -d

# 进入容器调试
docker compose exec api sh
docker compose exec admin sh

# 查看数据卷
docker volume ls
docker volume inspect email-filter_email-filter-data
```

#### Docker 数据持久化

数据存储在 Docker 卷 `email-filter-data` 中：
- API 数据库：`/app/data/filter.db`
- Admin 数据库：`/app/data/admin.db`

备份数据：
```bash
# 创建备份目录
mkdir -p /opt/email-filter/backups

# 从容器复制数据库
docker compose exec api cp /app/data/filter.db /app/data/filter-backup.db
docker cp email-filter-api:/app/data/filter-backup.db /opt/email-filter/backups/filter-$(date +%Y%m%d).db
```

### 方式二：Systemd 原生部署

```bash
# 1. 安装依赖
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs build-essential python3 g++ make git
sudo npm install -g pnpm

# 2. 创建目录并克隆项目
sudo mkdir -p /opt/email-filter/data
cd /opt/email-filter && git clone -b feature/database-consolidation https://github.com/yinz628/email-filter.git .
pnpm install && npm rebuild better-sqlite3

# 构建各包
cd packages/shared && pnpm build
cd ../vps-api && pnpm build
cp src/db/schema.sql dist/db/

# 3. 配置环境变量
cp .env.example /opt/email-filter/.env
# 添加: DB_PATH=/opt/email-filter/data/filter.db
```

创建 Systemd 服务 `/etc/systemd/system/email-filter-api.service`：
```ini
[Unit]
Description=Email Filter API Service
After=network.target

[Service]
Type=simple
User=www-data
WorkingDirectory=/opt/email-filter/packages/vps-api
ExecStart=/usr/bin/node dist/index.js
Restart=on-failure
Environment=NODE_ENV=production
EnvironmentFile=/opt/email-filter/.env
ReadWritePaths=/opt/email-filter/data

[Install]
WantedBy=multi-user.target
```

```bash
# 4. 设置权限并启动
sudo chown -R www-data:www-data /opt/email-filter/data
sudo systemctl daemon-reload
sudo systemctl enable --now email-filter-api
```

---

## 数据库管理

### 数据库位置

| 部署方式 | 路径 |
|---------|------|
| Docker | `/app/data/filter.db` (容器内) |
| Systemd | `/opt/email-filter/data/filter.db` |
| 开发环境 | `packages/vps-api/data/filter.db` |

### Systemd 部署权限设置

```bash
# 创建 vps-api 下的 data 目录并设置权限
sudo mkdir -p /opt/email-filter/packages/vps-api/data
sudo chown -R www-data:www-data /opt/email-filter/packages/vps-api/data

# 同时确保主 data 目录也有权限
sudo mkdir -p /opt/email-filter/data
sudo chown -R www-data:www-data /opt/email-filter/data

# 重启服务
sudo systemctl restart email-filter-api
```

### 迁移

```bash
# 备份后运行迁移
cp /opt/email-filter/data/filter.db /opt/email-filter/data/filter-backup-$(date +%Y%m%d).db

# Systemd
cd /opt/email-filter/packages/vps-api
DB_PATH=/opt/email-filter/data/filter.db npx tsx src/db/migrate.ts

# Docker
docker compose exec api npx tsx src/db/migrate.ts
```

### 定期备份

```bash
cat > /opt/email-filter/backup.sh << 'EOF'
#!/bin/bash
BACKUP_DIR="/opt/email-filter/backups"
mkdir -p $BACKUP_DIR
cp /opt/email-filter/data/filter.db $BACKUP_DIR/filter-$(date +%Y%m%d-%H%M%S).db
find $BACKUP_DIR -name "filter-*.db" -mtime +7 -delete
EOF
chmod +x /opt/email-filter/backup.sh
(crontab -l 2>/dev/null; echo "0 3 * * * /opt/email-filter/backup.sh") | crontab -
```

---

## Cloudflare Email Worker 部署

```bash
# 1. 安装并登录
npm install -g wrangler && wrangler login

# 2. 配置 packages/email-worker/wrangler.toml
```

```toml
name = "email-filter-forwarder"
main = "src/index.ts"
compatibility_date = "2024-01-01"

[vars]
VPS_API_URL = "https://your-vps-domain.com/api/webhook/email"
VPS_API_TOKEN = "你的API令牌"
DEFAULT_FORWARD_TO = "your-email@gmail.com"
WORKER_NAME = "my-domain-worker"

[[send_email]]
name = "SEB"
```

```bash
# 3. 部署
cd packages/email-worker && wrangler deploy

# 4. 在 Cloudflare Dashboard 配置 Email Routing
#    Email > Email Routing > Routing rules
#    Custom address: * → Send to Worker → email-filter-forwarder
```

---

## Nginx 反向代理配置

```bash
sudo apt install -y nginx certbot python3-certbot-nginx
sudo nano /etc/nginx/sites-available/email-filter
```

```nginx
server {
listen 80;
server_name jpacc-e.feimails.com; # 你设置的A解析的域名
return 301 https://$server_name$request_uri;
}
server {
listen 443 ssl http2;
server_name jpacc-e.feimails.com; # 你设置的A解析的域名
# SSL证书配置
ssl_certificate /opt/api/server.cer; # 替换为你的证书路径
ssl_certificate_key /opt/api/server.key; # 替换为你的私钥路径
location / {
proxy_pass http://127.0.0.1:3000;
proxy_set_header Host $host;
proxy_set_header X-Real-IP $remote_addr;
proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
proxy_set_header X-Forwarded-Proto $scheme;
proxy_http_version 1.1;
proxy_set_header Upgrade $http_upgrade;
proxy_set_header Connection "Upgrade";
# 禁用代理缓冲
proxy_buffering off;
# 允许大文件上传（50M）
client_max_body_size 50M;
}
}
```

```bash
sudo ln -s /etc/nginx/sites-available/email-filter /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d your-vps-domain.com
```

---

## 多 Worker 配置

为每个域名创建独立的 Worker，修改 `wrangler.toml` 中的 `name`、`WORKER_NAME`、`DEFAULT_FORWARD_TO`。

通过 API 注册 Worker：
```bash
curl -X POST https://your-vps-domain.com/api/workers \
  -H "Authorization: Bearer YOUR_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name": "domain1-worker", "domain": "domain1.com", "defaultForwardTo": "admin@domain1.com", "enabled": true}'
```

---

## 故障排除

| 问题 | 解决方案 |
|------|----------|
| Worker 无法连接 VPS | 检查防火墙 `sudo ufw allow 443/tcp`，检查 Nginx 日志 |
| 认证失败 (401) | 确认 Worker 的 `VPS_API_TOKEN` 与 VPS `.env` 中的 `API_TOKEN` 一致 |
| Worker 未找到 (404) | 确认 `WORKER_NAME` 已在 VPS API 中注册 |
| 数据库权限问题 | `sudo chown -R www-data:www-data /opt/email-filter/data/` |
| Schema 文件缺失 | `cp src/db/schema.sql dist/db/` |
| 数据库损坏 | `sqlite3 filter.db "PRAGMA integrity_check;"` 或从备份恢复 |

### better-sqlite3 编译问题

**症状**: `Could not locate the bindings file` 或 `better_sqlite3.node was compiled against a different Node.js version`

**解决方案（按顺序尝试）**:

```bash
# 1. 安装编译工具
sudo apt-get update
sudo apt-get install -y build-essential python3 g++ make

# 2. 清理并重新编译
cd /opt/email-filter
rm -rf node_modules
pnpm install
npm rebuild better-sqlite3

# 3. 如果仍然失败，手动进入模块目录编译
cd node_modules/.pnpm/better-sqlite3@*/node_modules/better-sqlite3
npm run build-release

# 4. 如果使用 Docker，确保在容器内编译（不要从本地复制 node_modules）
docker compose down
docker compose build --no-cache
docker compose up -d

# 方法1: 检查 .node 文件是否存在
find /opt/email-filter/node_modules -name "better_sqlite3.node" 2>/dev/null

# 方法2: 直接测试加载模块
cd /opt/email-filter
node -e "require('better-sqlite3'); console.log('✓ better-sqlite3 加载成功')"

# 方法3: 查看详细信息
node -e "const db = require('better-sqlite3')(':memory:'); console.log('✓ 版本:', require('better-sqlite3/package.json').version)"


# 5. 检查 Node.js 版本一致性
node -v  # 确保与编译时版本一致
```

**常见原因**:
- 本地开发环境与服务器 Node.js 版本不同
- 从本地复制了 `node_modules` 到服务器
- pnpm 跳过了 postinstall 脚本

### 部署检查清单

```bash
ls -la /opt/email-filter/data/                              # 数据目录
ls -la /opt/email-filter/packages/vps-api/dist/db/schema.sql # schema 文件
sudo systemctl status email-filter-api                       # 服务状态
curl http://localhost:3000/health                            # 健康检查
```

---

## 常用命令速查

```bash
# Docker
docker compose up -d / down / logs -f / restart

# Systemd
sudo systemctl start/stop/restart/status email-filter-api
sudo journalctl -u email-filter-api -f

# Cloudflare Worker
wrangler deploy / tail / dev

# 数据库
cp /opt/email-filter/data/filter.db /backup/filter-$(date +%Y%m%d).db
sqlite3 /opt/email-filter/data/filter.db "VACUUM; ANALYZE;"
```

---

## 安全建议

```bash
# 防火墙配置
sudo ufw default deny incoming
sudo ufw allow ssh && sudo ufw allow http && sudo ufw allow https
sudo ufw enable
```

- 使用 32 位以上随机字符串作为 API Token
openssl rand -hex 32
- 始终使用 HTTPS
- 定期备份数据库
- 定期检查日志和更新依赖


