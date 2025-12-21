# 邮件过滤系统部署教程

本文档详细介绍如何部署邮件过滤系统，包括 VPS API 和 Cloudflare Email Worker。

## 目录

- [系统架构](#系统架构)
- [前置要求](#前置要求)
- [第一部分：VPS API 部署](#第一部分vps-api-部署)
  - [方式一：Docker 部署（推荐）](#方式一docker-部署推荐)
  - [方式二：Systemd 原生部署](#方式二systemd-原生部署)
- [第二部分：数据库管理](#第二部分数据库管理)
  - [数据库初始化](#数据库初始化)
  - [数据库迁移](#数据库迁移)
  - [数据库备份与恢复](#数据库备份与恢复)
- [第三部分：Cloudflare Email Worker 部署](#第三部分cloudflare-email-worker-部署)
- [第四部分：Nginx 反向代理配置](#第四部分nginx-反向代理配置)
- [第五部分：多 Worker 配置](#第五部分多-worker-配置)
- [第六部分：管理面板使用](#第六部分管理面板使用)
- [故障排除](#故障排除)
  - [数据库常见问题](#数据库常见问题)

---

## 系统架构

```
┌─────────────────────────────────────────────────────────────────┐
│                    Cloudflare Email Routing                     │
│                                                                 │
│  收件邮箱: *@your-domain.com                                    │
│                    │                                            │
│                    ▼                                            │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │              Email Worker (email-filter-forwarder)       │   │
│  │              WORKER_NAME = "my-domain-worker"            │   │
│  └─────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ POST /api/webhook/email
                              │ Authorization: Bearer <token>
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                         VPS (你的服务器)                         │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                    Nginx (反向代理)                       │   │
│  │                    :443 (HTTPS)                          │   │
│  └─────────────────────────────────────────────────────────┘   │
│                              │                                  │
│              ┌───────────────┴───────────────┐                 │
│              ▼                               ▼                  │
│  ┌───────────────────────┐    ┌───────────────────────┐        │
│  │    VPS API (:3000)    │    │  VPS Admin (:3001)    │        │
│  │  /api/webhook/email   │    │  管理面板 (可选)       │        │
│  │  /api/rules           │    │                       │        │
│  │  /api/workers         │    │                       │        │
│  │  /admin               │    │                       │        │
│  └───────────────────────┘    └───────────────────────┘        │
│              │                               │                  │
│              └───────────────┬───────────────┘                 │
│                              ▼                                  │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                    SQLite Database                       │   │
│  │                    /opt/email-filter/data/               │   │
│  └─────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

---

## 前置要求

### VPS 服务器
- 操作系统：Ubuntu 20.04+ / Debian 11+ / CentOS 8+
- 内存：512MB+ (推荐 1GB)
- 存储：1GB+ 可用空间
- 网络：公网 IP（支持 IPv4 或 IPv6）
- 域名：已解析到 VPS 的域名（用于 HTTPS）

### Cloudflare 账户
- 已添加域名到 Cloudflare
- 已启用 Email Routing 功能
- Workers 免费套餐即可

### 本地开发环境（用于部署 Worker）
- Node.js 18+
- pnpm 或 npm
- Wrangler CLI

---

## 第一部分：VPS API 部署

### 方式一：Docker 部署（推荐）

#### 1. 安装 Docker

```bash
# Ubuntu/Debian
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER

# 重新登录以应用 docker 组权限
exit
# 重新 SSH 登录
```

#### 2. 创建项目目录

```bash
sudo mkdir -p /opt/email-filter
cd /opt/email-filter
```

#### 3. 上传项目文件

从本地上传项目文件到服务器：

```bash
# 在本地执行
scp -r ./* user@your-vps:/opt/email-filter/
```

或者使用 Git：

```bash
cd /opt/email-filter
git clone https://github.com/your-repo/email-filter.git .
```

#### 4. 配置环境变量

```bash
cd /opt/email-filter
cp .env.example .env
nano .env
```

编辑 `.env` 文件：

```bash
# ===========================================
# VPS API 配置
# ===========================================

# API 端口
API_PORT=3000

# API 认证令牌（生成一个安全的随机字符串）
# 重要：这个令牌需要配置到 Cloudflare Worker 中
API_TOKEN=生成一个32位以上的随机字符串

# 默认转发邮箱（当没有规则匹配时转发到这里）
DEFAULT_FORWARD_TO=your-email@gmail.com

# ===========================================
# 管理面板配置
# ===========================================

# 管理面板端口
ADMIN_PORT=3001

# 管理面板密码
ADMIN_PASSWORD=设置一个安全的密码

# Session 密钥
SESSION_SECRET=生成另一个32位以上的随机字符串

# ===========================================
# 动态规则配置
# ===========================================

# 启用动态规则
DYNAMIC_ENABLED=true

# 时间窗口（分钟）- 在此时间内统计相同主题邮件
DYNAMIC_TIME_WINDOW=60

# 阈值 - 超过此数量自动创建动态规则
DYNAMIC_THRESHOLD=5

# 过期时间（小时）- 动态规则多久未命中后删除
DYNAMIC_EXPIRATION=48
```

生成随机令牌：

```bash
# 生成 API_TOKEN
openssl rand -hex 32

# 生成 SESSION_SECRET
openssl rand -hex 32
```

#### 5. 启动服务

```bash
cd /opt/email-filter
docker compose up -d
```

#### 6. 验证部署

```bash
# 查看容器状态
docker compose ps

# 查看日志
docker compose logs -f

# 测试健康检查
curl http://localhost:3000/health
```

预期输出：

```json
{
  "status": "healthy",
  "service": "vps-email-filter-api",
  "timestamp": "2024-12-15T12:00:00.000Z",
  "responseTime": "1ms"
}
```

---

### 方式二：Systemd 原生部署

#### 1. 安装 Node.js 20

```bash
# 使用 NodeSource 仓库
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# 验证安装
node -v  # 应显示 v20.x.x
npm -v
```

#### 2. 安装 pnpm

```bash
sudo npm install -g pnpm
pnpm -v
```

#### 3. 创建目录结构

```bash
sudo mkdir -p /opt/email-filter/{data,vps-api,vps-admin,shared}
sudo chown -R $USER:$USER /opt/email-filter
```

#### 4. 上传并构建项目

```bash
cd /opt/email-filter

# 上传项目文件（从本地）
# scp -r ./* user@your-vps:/opt/email-filter/

# 安装编译工具（用于编译原生模块）
sudo apt-get install -y build-essential python3

# 安装依赖
pnpm install

# 编译原生模块（better-sqlite3 需要编译）
# pnpm 可能会跳过 build scripts，需要手动编译
npm rebuild better-sqlite3

# 构建 shared 包
cd packages/shared
pnpm build

# 构建 vps-api
cd ../vps-api
pnpm build

# 构建 vps-admin（可选）
cd ../vps-admin
pnpm build
```

#### 5. 配置环境变量

```bash
cp .env.example /opt/email-filter/.env
nano /opt/email-filter/.env
```

添加数据库路径配置：

```bash
# 数据库路径
DB_PATH=/opt/email-filter/data/filter.db
ADMIN_DB_PATH=/opt/email-filter/data/admin.db
```

#### 6. 创建 Systemd 服务文件

VPS API 服务：

```bash
sudo nano /etc/systemd/system/email-filter-api.service
```

```ini
[Unit]
Description=Email Filter API Service
After=network.target

[Service]
Type=simple
User=www-data
Group=www-data
WorkingDirectory=/opt/email-filter/packages/vps-api
ExecStart=/usr/bin/node dist/index.js
Restart=on-failure
RestartSec=10

# 环境变量
Environment=NODE_ENV=production
Environment=PORT=3000
Environment=HOST=0.0.0.0

# 从文件加载环境变量
EnvironmentFile=/opt/email-filter/.env

# 安全加固
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=/opt/email-filter/data
PrivateTmp=true

[Install]
WantedBy=multi-user.target
```

VPS Admin 服务（可选）：

```bash
sudo nano /etc/systemd/system/email-filter-admin.service
```

```ini
[Unit]
Description=Email Filter Admin Panel
After=network.target email-filter-api.service

[Service]
Type=simple
User=www-data
Group=www-data
WorkingDirectory=/opt/email-filter/packages/vps-admin
ExecStart=/usr/bin/node dist/index.js
Restart=on-failure
RestartSec=10

Environment=NODE_ENV=production
Environment=PORT=3001
Environment=HOST=0.0.0.0

EnvironmentFile=/opt/email-filter/.env

NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=/opt/email-filter/data
PrivateTmp=true

[Install]
WantedBy=multi-user.target
```

#### 7. 设置权限

```bash
sudo chown -R www-data:www-data /opt/email-filter/data
sudo chmod 750 /opt/email-filter/data
```

#### 8. 启动服务

```bash
# 重新加载 systemd
sudo systemctl daemon-reload

# 启用开机自启
sudo systemctl enable email-filter-api
sudo systemctl enable email-filter-admin

# 启动服务
sudo systemctl start email-filter-api
sudo systemctl start email-filter-admin

# 查看状态
sudo systemctl status email-filter-api
```

#### 9. 查看日志

```bash
# 实时查看日志
sudo journalctl -u email-filter-api -f

# 查看最近 100 行
sudo journalctl -u email-filter-api -n 100
```

---

## 第二部分：数据库管理

本系统使用 SQLite 数据库，所有表结构定义在统一的 `schema.sql` 文件中。

### 数据库初始化

#### 新环境部署

对于新环境部署，数据库会在首次启动时自动初始化。系统会：

1. 检查数据库文件是否存在
2. 如果不存在，创建新数据库并执行 `schema.sql`
3. 初始化所有必要的表和索引

**手动初始化（可选）**：

如果需要手动初始化数据库，可以执行：

```bash
# Docker 部署
docker compose exec api sh -c "cat /app/src/db/schema.sql | sqlite3 /data/filter.db"

# Systemd 部署
cd /opt/email-filter/packages/vps-api
sqlite3 /opt/email-filter/data/filter.db < src/db/schema.sql
```

#### 数据库文件位置

| 部署方式 | 数据库路径 |
|---------|-----------|
| Docker | `/opt/email-filter/data/filter.db` (宿主机) |
| Systemd | `/opt/email-filter/data/filter.db` |
| 开发环境 | `packages/vps-api/data/filter.db` |

可通过环境变量 `DB_PATH` 自定义数据库路径。

### 数据库迁移

当系统升级需要修改数据库结构时，需要运行迁移脚本。迁移脚本是幂等的，可以安全地多次运行。

#### 运行迁移

```bash
# Docker 部署
docker compose exec api npx tsx src/db/migrate.ts

# Systemd 部署
cd /opt/email-filter/packages/vps-api
npx tsx src/db/migrate.ts

# 或者使用 node（需要先构建）
node dist/db/migrate.js
```

#### 迁移输出示例

```
============================================================
Database Migration Script
============================================================
Database path: /opt/email-filter/data/filter.db

Running 19 migrations...

[○] worker_instances.worker_url: Column already exists
[○] filter_rules.tags: Column already exists
[✓] campaign_emails.worker_name: Column and index added successfully
[○] system_logs.worker_name: Column already exists
...

============================================================
Migration Summary
============================================================
Applied: 1
Skipped: 18
Errors:  0

✓ All migrations completed successfully!
```

- `✓` 表示迁移已应用
- `○` 表示迁移已跳过（已存在）
- `✗` 表示迁移失败

#### 迁移前备份

**重要**：在运行迁移前，建议先备份数据库：

```bash
# 创建备份
cp /opt/email-filter/data/filter.db /opt/email-filter/data/filter-backup-$(date +%Y%m%d-%H%M%S).db
```

### 数据库备份与恢复

#### 定期备份

建议设置定期备份任务：

```bash
# 创建备份脚本
cat > /opt/email-filter/backup.sh << 'EOF'
#!/bin/bash
BACKUP_DIR="/opt/email-filter/backups"
DB_PATH="/opt/email-filter/data/filter.db"
DATE=$(date +%Y%m%d-%H%M%S)

mkdir -p $BACKUP_DIR
cp $DB_PATH $BACKUP_DIR/filter-$DATE.db

# 保留最近 7 天的备份
find $BACKUP_DIR -name "filter-*.db" -mtime +7 -delete
EOF

chmod +x /opt/email-filter/backup.sh

# 添加到 crontab（每天凌晨 3 点备份）
(crontab -l 2>/dev/null; echo "0 3 * * * /opt/email-filter/backup.sh") | crontab -
```

#### 恢复数据库

```bash
# 停止服务
docker compose stop api
# 或
sudo systemctl stop email-filter-api

# 恢复备份
cp /opt/email-filter/backups/filter-20241220-030000.db /opt/email-filter/data/filter.db

# 重启服务
docker compose start api
# 或
sudo systemctl start email-filter-api
```

#### 数据库完整性检查

```bash
# 检查数据库完整性
sqlite3 /opt/email-filter/data/filter.db "PRAGMA integrity_check;"

# 预期输出：ok
```

---

## 第三部分：Cloudflare Email Worker 部署

### 1. 安装 Wrangler CLI

```bash
npm install -g wrangler

# 登录 Cloudflare
wrangler login
```

### 2. 配置 Worker

编辑 `packages/email-worker/wrangler.toml`：

```toml
name = "email-filter-forwarder"
main = "src/index.ts"
compatibility_date = "2024-01-01"

[vars]
# VPS API 的 Webhook 地址
VPS_API_URL = "https://your-vps-domain.com/api/webhook/email"

# API 认证令牌（与 VPS .env 中的 API_TOKEN 相同）
VPS_API_TOKEN = "你的API令牌"

# 默认转发邮箱（VPS 不可用时的备用）
DEFAULT_FORWARD_TO = "your-email@gmail.com"

# Worker 名称（用于多 Worker 场景，必须唯一）
WORKER_NAME = "my-domain-worker"

# 邮件发送绑定
[[send_email]]
name = "SEB"
```

### 3. 部署 Worker

```bash
cd packages/email-worker

# 部署到 Cloudflare
wrangler deploy
```

### 4. 配置 Email Routing

1. 登录 [Cloudflare Dashboard](https://dash.cloudflare.com)
2. 选择你的域名
3. 进入 **Email** > **Email Routing**
4. 点击 **Routing rules** 标签
5. 添加规则：
   - **Custom address**: `*` (匹配所有邮箱)
   - **Action**: Send to a Worker
   - **Destination**: 选择 `email-filter-forwarder`
6. 保存规则

### 5. 验证 Worker

发送测试邮件到你的域名邮箱，检查：

1. VPS API 日志是否收到 webhook 请求
2. 邮件是否正确转发或拦截

```bash
# 查看 VPS API 日志
docker compose logs -f api
# 或
sudo journalctl -u email-filter-api -f
```

---

## 第四部分：Nginx 反向代理配置

### 1. 安装 Nginx 和 Certbot

```bash
sudo apt update
sudo apt install -y nginx certbot python3-certbot-nginx
```

### 2. 创建 Nginx 配置

```bash
sudo nano /etc/nginx/sites-available/email-filter
```

```nginx
# HTTP 重定向到 HTTPS
server {
    listen 80;
    listen [::]:80;
    server_name your-vps-domain.com;
    
    location /.well-known/acme-challenge/ {
        root /var/www/html;
    }
    
    location / {
        return 301 https://$server_name$request_uri;
    }
}

# HTTPS 配置
server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name your-vps-domain.com;
    
    # SSL 证书（由 Certbot 自动配置）
    ssl_certificate /etc/letsencrypt/live/your-vps-domain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/your-vps-domain.com/privkey.pem;
    
    # SSL 安全配置
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256;
    ssl_prefer_server_ciphers off;
    
    # 安全头
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    
    # API 代理
    location /api/ {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        
        # Webhook 超时设置
        proxy_connect_timeout 10s;
        proxy_send_timeout 30s;
        proxy_read_timeout 30s;
    }
    
    # 管理面板代理
    location /admin {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
    
    # 健康检查
    location /health {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
    }
    
    # 根路径重定向到管理面板
    location = / {
        return 301 /admin;
    }
}
```

### 3. 启用配置

```bash
# 创建符号链接
sudo ln -s /etc/nginx/sites-available/email-filter /etc/nginx/sites-enabled/

# 删除默认配置（可选）
sudo rm /etc/nginx/sites-enabled/default

# 测试配置
sudo nginx -t

# 重新加载 Nginx
sudo systemctl reload nginx
```

### 4. 获取 SSL 证书

```bash
sudo certbot --nginx -d your-vps-domain.com
```

### 5. 自动续期

Certbot 会自动设置续期任务，可以手动测试：

```bash
sudo certbot renew --dry-run
```

---

## 第五部分：多 Worker 配置

如果你有多个域名需要不同的过滤规则，可以配置多个 Worker。

### 1. 在 VPS API 中注册 Worker

访问管理面板 `https://your-vps-domain.com/admin`，或使用 API：

```bash
# 添加 Worker 实例
curl -X POST https://your-vps-domain.com/api/workers \
  -H "Authorization: Bearer YOUR_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "domain1-worker",
    "domain": "domain1.com",
    "defaultForwardTo": "admin@domain1.com",
    "enabled": true
  }'

curl -X POST https://your-vps-domain.com/api/workers \
  -H "Authorization: Bearer YOUR_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "domain2-worker",
    "domain": "domain2.com",
    "defaultForwardTo": "admin@domain2.com",
    "enabled": true
  }'
```

### 2. 为每个域名部署 Worker

复制 `packages/email-worker` 目录，修改 `wrangler.toml`：

**domain1-worker/wrangler.toml:**
```toml
name = "email-filter-domain1"
main = "src/index.ts"
compatibility_date = "2024-01-01"

[vars]
VPS_API_URL = "https://your-vps-domain.com/api/webhook/email"
VPS_API_TOKEN = "你的API令牌"
DEFAULT_FORWARD_TO = "admin@domain1.com"
WORKER_NAME = "domain1-worker"

[[send_email]]
name = "SEB"
```

**domain2-worker/wrangler.toml:**
```toml
name = "email-filter-domain2"
main = "src/index.ts"
compatibility_date = "2024-01-01"

[vars]
VPS_API_URL = "https://your-vps-domain.com/api/webhook/email"
VPS_API_TOKEN = "你的API令牌"
DEFAULT_FORWARD_TO = "admin@domain2.com"
WORKER_NAME = "domain2-worker"

[[send_email]]
name = "SEB"
```

### 3. 为每个 Worker 配置独立规则

```bash
# 为 domain1-worker 添加规则
curl -X POST https://your-vps-domain.com/api/rules \
  -H "Authorization: Bearer YOUR_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "workerId": "domain1-worker-id",
    "category": "blacklist",
    "matchType": "sender",
    "matchMode": "contains",
    "pattern": "spam@",
    "enabled": true
  }'
```

---

## 第六部分：管理面板使用

### 访问管理面板

打开浏览器访问：`https://your-vps-domain.com/admin`

### 功能说明

1. **Workers 管理**
   - 添加/删除/编辑 Worker 实例
   - 设置每个 Worker 的默认转发地址
   - 启用/禁用 Worker

2. **规则管理**
   - 添加白名单/黑名单/动态规则
   - 支持多种匹配模式：精确、包含、前缀、后缀、正则
   - 支持匹配类型：发件人、主题、域名
   - 按 Worker 筛选规则

3. **统计查看**
   - 规则命中统计
   - 邮件处理统计

4. **设置**
   - API Token 配置
   - 默认转发地址
   - 动态规则参数

---

## 故障排除

### 1. Worker 无法连接 VPS

**症状**: 邮件直接转发到默认地址，没有经过过滤

**检查步骤**:
```bash
# 1. 检查 VPS API 是否运行
curl https://your-vps-domain.com/health

# 2. 检查防火墙
sudo ufw status
sudo ufw allow 443/tcp

# 3. 检查 Nginx 日志
sudo tail -f /var/log/nginx/error.log

# 4. 检查 API 日志
docker compose logs -f api
```

### 2. 认证失败 (401)

**症状**: Worker 日志显示 `VPS API returned 401`

**解决方案**:
1. 确认 Worker 的 `VPS_API_TOKEN` 与 VPS `.env` 中的 `API_TOKEN` 完全一致
2. 检查是否有多余的空格或换行符

### 3. Worker 未找到 (404)

**症状**: API 返回 `Worker not found`

**解决方案**:
1. 确认 Worker 的 `WORKER_NAME` 已在 VPS API 中注册
2. 检查名称是否完全匹配（区分大小写）

### 4. 原生模块编译问题 (better-sqlite3)

**症状**: `Could not locate the bindings file` 或 `better_sqlite3.node` 找不到

**原因**: `better-sqlite3` 是原生 Node.js 模块，需要在目标系统上编译。pnpm 可能会跳过 build scripts。

**解决方案**:
```bash
# 1. 安装编译工具
sudo apt-get install -y build-essential python3

# 2. 重新编译原生模块
cd /opt/email-filter
npm rebuild better-sqlite3

# 3. 如果上述方法不行，手动进入模块目录编译
cd /opt/email-filter/node_modules/.pnpm/better-sqlite3@9.6.0/node_modules/better-sqlite3
npm run build-release

# 4. 重启服务
sudo systemctl restart email-filter-api
```

### 5. 数据库权限问题

**症状**: `SQLITE_CANTOPEN` 错误

**解决方案**:
```bash
# 检查目录权限
ls -la /opt/email-filter/data/

# 修复权限
sudo chown -R www-data:www-data /opt/email-filter/data/
sudo chmod 750 /opt/email-filter/data/
```

### 数据库常见问题

#### 数据库文件不存在

**症状**: `Database file not found` 或 `SQLITE_CANTOPEN`

**解决方案**:
```bash
# 1. 检查数据目录是否存在
ls -la /opt/email-filter/data/

# 2. 如果目录不存在，创建它
sudo mkdir -p /opt/email-filter/data
sudo chown -R www-data:www-data /opt/email-filter/data

# 3. 手动初始化数据库
cd /opt/email-filter/packages/vps-api
sqlite3 /opt/email-filter/data/filter.db < src/db/schema.sql

# 4. 重启服务
sudo systemctl restart email-filter-api
```

#### 表结构不完整

**症状**: `no such table` 或 `no such column` 错误

**解决方案**:
```bash
# 1. 检查表是否存在
sqlite3 /opt/email-filter/data/filter.db ".tables"

# 2. 运行迁移脚本
cd /opt/email-filter/packages/vps-api
npx tsx src/db/migrate.ts

# 3. 如果迁移失败，检查 schema 完整性
sqlite3 /opt/email-filter/data/filter.db ".schema monitoring_rules"
```

#### 迁移脚本失败

**症状**: 迁移输出显示 `[✗]` 错误

**解决方案**:
```bash
# 1. 备份当前数据库
cp /opt/email-filter/data/filter.db /opt/email-filter/data/filter-backup.db

# 2. 检查具体错误信息
cd /opt/email-filter/packages/vps-api
npx tsx src/db/migrate.ts 2>&1 | tee migration.log

# 3. 常见错误处理：

# 错误：duplicate column name
# 原因：列已存在，迁移脚本应该跳过
# 解决：检查 migrate.ts 中的 columnExists 检查

# 错误：foreign key constraint failed
# 原因：引用的表或记录不存在
# 解决：确保按正确顺序创建表

# 错误：database is locked
# 原因：其他进程正在使用数据库
# 解决：停止 API 服务后再运行迁移
sudo systemctl stop email-filter-api
npx tsx src/db/migrate.ts
sudo systemctl start email-filter-api
```

#### 数据库损坏

**症状**: `database disk image is malformed` 或 `SQLITE_CORRUPT`

**解决方案**:
```bash
# 1. 尝试修复
sqlite3 /opt/email-filter/data/filter.db "PRAGMA integrity_check;"

# 2. 如果显示错误，尝试导出数据
sqlite3 /opt/email-filter/data/filter.db ".dump" > dump.sql

# 3. 创建新数据库并导入
mv /opt/email-filter/data/filter.db /opt/email-filter/data/filter-corrupted.db
sqlite3 /opt/email-filter/data/filter.db < dump.sql

# 4. 如果导出失败，从备份恢复
cp /opt/email-filter/backups/filter-latest.db /opt/email-filter/data/filter.db
```

#### 外键约束错误

**症状**: `FOREIGN KEY constraint failed`

**解决方案**:
```bash
# 1. 检查外键状态
sqlite3 /opt/email-filter/data/filter.db "PRAGMA foreign_keys;"
# 应该返回 1

# 2. 检查外键违规
sqlite3 /opt/email-filter/data/filter.db "PRAGMA foreign_key_check;"

# 3. 如果有违规记录，需要清理孤立数据
# 例如：清理引用不存在规则的告警
sqlite3 /opt/email-filter/data/filter.db "
DELETE FROM alerts WHERE rule_id NOT IN (SELECT id FROM monitoring_rules);
"
```

#### 数据库性能问题

**症状**: 查询缓慢，API 响应时间长

**解决方案**:
```bash
# 1. 检查数据库大小
ls -lh /opt/email-filter/data/filter.db

# 2. 分析查询性能
sqlite3 /opt/email-filter/data/filter.db "
EXPLAIN QUERY PLAN SELECT * FROM system_logs ORDER BY created_at DESC LIMIT 100;
"

# 3. 重建索引
sqlite3 /opt/email-filter/data/filter.db "REINDEX;"

# 4. 清理旧数据（保留最近 30 天）
sqlite3 /opt/email-filter/data/filter.db "
DELETE FROM system_logs WHERE created_at < datetime('now', '-30 days');
DELETE FROM hit_logs WHERE created_at < datetime('now', '-3 days');
VACUUM;
"

# 5. 优化数据库
sqlite3 /opt/email-filter/data/filter.db "VACUUM; ANALYZE;"
```

### 5. SSL 证书问题

**症状**: `SSL certificate problem` 或 `certificate verify failed`

**解决方案**:
```bash
# 检查证书状态
sudo certbot certificates

# 手动续期
sudo certbot renew

# 重新获取证书
sudo certbot --nginx -d your-vps-domain.com --force-renewal
```

### 6. IPv6 VPS 配置

如果你的 VPS 只有 IPv6 地址：

1. 确保 Cloudflare 代理已启用（橙色云朵）
2. 在 Cloudflare DNS 中添加 AAAA 记录
3. Worker 通过 Cloudflare 代理访问，会自动处理 IPv4/IPv6 转换

---

## 常用命令速查

```bash
# Docker 部署
docker compose up -d          # 启动
docker compose down           # 停止
docker compose logs -f        # 查看日志
docker compose restart        # 重启
docker compose pull && docker compose up -d  # 更新

# Systemd 部署
sudo systemctl start email-filter-api    # 启动
sudo systemctl stop email-filter-api     # 停止
sudo systemctl restart email-filter-api  # 重启
sudo systemctl status email-filter-api   # 状态
sudo journalctl -u email-filter-api -f   # 日志

# Cloudflare Worker
wrangler deploy              # 部署
wrangler tail                # 实时日志
wrangler dev                 # 本地开发

# 数据库备份
cp /opt/email-filter/data/filter.db /backup/filter-$(date +%Y%m%d).db
```

---

## 安全建议

1. **API Token**: 使用 32 位以上的随机字符串
2. **HTTPS**: 始终使用 HTTPS，不要暴露 HTTP 端口
3. **防火墙**: 只开放必要端口 (22, 80, 443)
4. **定期备份**: 定期备份 SQLite 数据库
5. **日志监控**: 定期检查日志，发现异常及时处理
6. **更新**: 定期更新系统和依赖包

```bash
# 设置防火墙
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow ssh
sudo ufw allow http
sudo ufw allow https
sudo ufw enable
```
