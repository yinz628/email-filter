#!/bin/bash
# VPS API 更新脚本
# 用法: ./update.sh 或 bash update.sh

set -e

PROJECT_DIR="/opt/email-filter"
SERVICE_NAME="email-filter-api"

echo "=========================================="
echo "  Email Filter VPS API 更新脚本"
echo "=========================================="

# 切换到项目目录
cd "$PROJECT_DIR"
echo "📁 工作目录: $PROJECT_DIR"

# 拉取最新代码
echo ""
echo "📥 拉取最新代码..."
git pull

# 构建 VPS API
echo ""
echo "🔨 构建 VPS API..."
pnpm --filter @email-filter/vps-api build

# 复制 schema.sql
echo ""
echo "📋 复制数据库 schema..."
cp packages/vps-api/src/db/schema.sql packages/vps-api/dist/db/

# 重启服务
echo ""
echo "🔄 重启服务..."
systemctl restart "$SERVICE_NAME"

# 检查服务状态
echo ""
echo "✅ 服务状态:"
systemctl status "$SERVICE_NAME" --no-pager -l | head -10

echo ""
echo "=========================================="
echo "  更新完成!"
echo "=========================================="
