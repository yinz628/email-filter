#!/bin/bash
# Email Filter VPS API Update Script
# VPS API 更新脚本
# 用法: ./update.sh [分支名]
# 示例: ./update.sh main
#       ./update.sh feature/campaign-analytics

set -e

# ============================================
# 配置
# ============================================
PROJECT_DIR="/opt/email-filter"
SERVICE_NAME="email-filter-api"
DB_PATH="/var/lib/email-filter/filter.db"
BACKUP_DIR="/var/lib/email-filter/backups"
LOG_FILE="/var/log/email-filter-update.log"
API_URL="http://localhost:3000"
BRANCH="${1:-}"

# ============================================
# 颜色定义
# ============================================
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# ============================================
# 辅助函数
# ============================================
log() {
  local timestamp=$(date '+%Y-%m-%d %H:%M:%S')
  echo -e "${CYAN}[$timestamp]${NC} $1"
  echo "[$timestamp] $1" >> "$LOG_FILE" 2>/dev/null || true
}

success() {
  echo -e "${GREEN}✅ $1${NC}"
  log "SUCCESS: $1"
}

warn() {
  echo -e "${YELLOW}⚠️  $1${NC}"
  log "WARNING: $1"
}

error() {
  echo -e "${RED}❌ $1${NC}"
  log "ERROR: $1"
}

info() {
  echo -e "${BLUE}ℹ️  $1${NC}"
}

# 错误处理
handle_error() {
  local line_no=$1
  error "脚本在第 $line_no 行发生错误"
  
  if [ -n "$BACKUP_FILE" ] && [ -f "$BACKUP_FILE" ]; then
    warn "如需回滚数据库，请运行: cp $BACKUP_FILE $DB_PATH"
  fi
  
  if [ -n "$OLD_COMMIT" ]; then
    warn "如需回滚代码，请运行: cd $PROJECT_DIR && git checkout $OLD_COMMIT"
  fi
  
  exit 1
}

trap 'handle_error $LINENO' ERR

# ============================================
# 主脚本
# ============================================
echo ""
echo -e "${CYAN}==========================================${NC}"
echo -e "${CYAN}  Email Filter VPS API 更新脚本${NC}"
echo -e "${CYAN}==========================================${NC}"
echo ""

# 检查是否以 root 运行
if [ "$EUID" -ne 0 ]; then
  warn "建议使用 root 权限运行此脚本"
fi

# 切换到项目目录
cd "$PROJECT_DIR"
log "工作目录: $PROJECT_DIR"

# 记录当前 commit
OLD_COMMIT=$(git rev-parse --short HEAD)
OLD_BRANCH=$(git branch --show-current)
info "当前版本: $OLD_COMMIT (分支: $OLD_BRANCH)"

# 如果指定了分支，先切换
if [ -n "$BRANCH" ]; then
  echo ""
  log "🔀 切换到分支: $BRANCH"
  git fetch origin
  git checkout "$BRANCH"
fi

# 检查是否有更新
echo ""
log "📡 检查远程更新..."
git fetch origin

LOCAL=$(git rev-parse HEAD)
REMOTE=$(git rev-parse @{u} 2>/dev/null || echo "")

if [ -z "$REMOTE" ]; then
  warn "无法获取远程分支信息，继续更新..."
elif [ "$LOCAL" = "$REMOTE" ]; then
  info "代码已是最新版本"
  read -p "是否仍要继续更新流程? (y/N) " -n 1 -r
  echo
  if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "取消更新"
    exit 0
  fi
fi

# 备份数据库
echo ""
log "💾 备份数据库..."
mkdir -p "$BACKUP_DIR"
BACKUP_FILE="$BACKUP_DIR/filter_$(date +%Y%m%d_%H%M%S).db"

if [ -f "$DB_PATH" ]; then
  cp "$DB_PATH" "$BACKUP_FILE"
  BACKUP_SIZE=$(du -h "$BACKUP_FILE" | cut -f1)
  success "数据库已备份: $BACKUP_FILE ($BACKUP_SIZE)"
  
  # 清理旧备份（保留最近7个）
  cd "$BACKUP_DIR"
  ls -t filter_*.db 2>/dev/null | tail -n +8 | xargs -r rm -f
  BACKUP_COUNT=$(ls -1 filter_*.db 2>/dev/null | wc -l)
  info "当前保留 $BACKUP_COUNT 个备份文件"
  cd "$PROJECT_DIR"
else
  warn "数据库文件不存在: $DB_PATH"
fi

# 拉取最新代码
echo ""
log "📥 拉取最新代码..."
git pull

NEW_COMMIT=$(git rev-parse --short HEAD)
if [ "$OLD_COMMIT" != "$NEW_COMMIT" ]; then
  success "代码已更新: $OLD_COMMIT → $NEW_COMMIT"
  
  # 显示更新内容
  echo ""
  info "更新内容:"
  git log --oneline "$OLD_COMMIT".."$NEW_COMMIT" | head -10
else
  info "代码版本未变化"
fi

# 安装依赖（如果 package.json 有变化）
echo ""
log "📦 检查依赖..."
if git diff "$OLD_COMMIT".."$NEW_COMMIT" --name-only 2>/dev/null | grep -q "package.json\|pnpm-lock.yaml"; then
  log "检测到依赖变化，安装依赖..."
  pnpm install
  success "依赖安装完成"
else
  info "依赖无变化，跳过安装"
fi

# 构建 shared 包（依赖）
echo ""
log "🔨 构建 shared 包..."
pnpm --filter @email-filter/shared build
success "shared 包构建完成"

# 构建 VPS API
echo ""
log "🔨 构建 VPS API..."
pnpm --filter @email-filter/vps-api build
success "VPS API 构建完成"

# 复制 schema.sql
echo ""
log "📋 复制数据库 schema..."
cp packages/vps-api/src/db/schema.sql packages/vps-api/dist/db/

# 运行数据库迁移
echo ""
log "🗄️ 运行数据库迁移..."
cd packages/vps-api
npx tsx src/db/migrate.ts
success "基础迁移完成"

# 运行 campaign analytics 迁移
echo ""
log "🗄️ 运行 Campaign Analytics 数据库迁移..."
npx tsx src/db/migrate-campaign.ts
success "Campaign Analytics 迁移完成"
cd "$PROJECT_DIR"

# 重启服务
echo ""
log "🔄 重启服务..."
systemctl restart "$SERVICE_NAME"
sleep 2

# 检查服务状态
echo ""
log "🔍 检查服务状态..."
if systemctl is-active --quiet "$SERVICE_NAME"; then
  success "服务运行正常"
  systemctl status "$SERVICE_NAME" --no-pager -l | head -8
else
  error "服务启动失败!"
  systemctl status "$SERVICE_NAME" --no-pager -l | tail -20
  exit 1
fi

# 健康检查
echo ""
log "🏥 执行健康检查..."
sleep 1

HEALTH_CHECK=$(curl -s -o /dev/null -w "%{http_code}" "$API_URL/health" 2>/dev/null || echo "000")
if [ "$HEALTH_CHECK" = "200" ]; then
  success "API 健康检查通过 (HTTP $HEALTH_CHECK)"
else
  warn "API 健康检查返回: HTTP $HEALTH_CHECK"
  info "API 可能需要更多时间启动，或 /health 端点不存在"
fi

# 完成
echo ""
echo -e "${GREEN}==========================================${NC}"
echo -e "${GREEN}  更新完成!${NC}"
echo -e "${GREEN}==========================================${NC}"
echo ""
info "版本: $OLD_COMMIT → $NEW_COMMIT"
info "备份: $BACKUP_FILE"
info "日志: $LOG_FILE"
echo ""
