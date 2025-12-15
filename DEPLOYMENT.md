# 邮件过滤系统部署教程

本文档详细介绍如何部署邮件过滤系统，包括 VPS API 和 Cloudflare Email Worker。

## 目录

- [系统架构](#系统架构)
- [前置要求](#前置要求)
- [第一部分：VPS API 部署](#第一部分vps-api-部署)
  - [方式一：Docker 部署（推荐）](#方式一docker-部署推荐)
  - [方式二：Systemd 原生部署](#方式二systemd-原生部署)
- [第二部分：Cloudflare Email Worker 部署](#第二部分cloudflare-email-worker-部署)
- [第三部分：Nginx 反向代理配置](#第三部分nginx-反向代理配置)
- [第四部分：多 Worker 配置](#第四部分多-worker-配置)
- [第五部分：管理面板使用](#第五部分管理面板使用)
- [故障排除](#故障排除)

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

# 安装依赖
pnpm install

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

## 第二部分：Cloudflare Email Worker 部署

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

## 第三部分：Nginx 反向代理配置

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

## 第四部分：多 Worker 配置

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

## 第五部分：管理面板使用

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

### 4. 数据库权限问题

**症状**: `SQLITE_CANTOPEN` 错误

**解决方案**:
```bash
# 检查目录权限
ls -la /opt/email-filter/data/

# 修复权限
sudo chown -R www-data:www-data /opt/email-filter/data/
sudo chmod 750 /opt/email-filter/data/
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
