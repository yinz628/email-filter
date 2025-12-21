# Design Document

## Overview

本设计文档描述了如何安全地从项目中移除不再使用的 Cloudflare Workers 包（`admin-panel` 和 `worker-api`）。这是一个简单的清理操作，主要涉及文件系统操作和依赖更新。

## Architecture

清理操作不涉及架构变更。清理后的项目结构如下：

```
packages/
├── email-worker/    # 保留 - Cloudflare Email Routing Worker
├── shared/          # 保留 - 共享类型和工具
├── vps-api/         # 保留 - VPS 版本 API 服务
└── vps-admin/       # 保留 - VPS 版本管理面板
```

移除的包：
- `packages/admin-panel/` - Cloudflare Workers 版本管理面板
- `packages/worker-api/` - Cloudflare Workers 版本 API

## Components and Interfaces

### 受影响的组件

1. **packages/admin-panel** (删除)
   - Hono 框架的 Cloudflare Workers 应用
   - D1 数据库绑定
   - 管理面板前端和 API

2. **packages/worker-api** (删除)
   - Hono 框架的 Cloudflare Workers 应用
   - D1 数据库绑定
   - 邮件过滤 API 和 Email Worker 处理

### 不受影响的组件

1. **packages/email-worker** - 独立的邮件接收 Worker
2. **packages/shared** - 共享库，被其他包依赖
3. **packages/vps-api** - VPS API 服务
4. **packages/vps-admin** - VPS 管理面板

## Data Models

无数据模型变更。删除的包使用 Cloudflare D1 数据库，与 VPS 版本使用的 SQLite 数据库完全独立。

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system-essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

由于这是一个文件系统清理操作，所有验收标准都是具体的示例验证，而非通用属性。验证将通过以下方式进行：

1. **目录存在性检查** - 验证删除和保留的目录状态
2. **构建验证** - 运行 pnpm 命令验证项目完整性
3. **代码搜索** - 确保无残留引用

## Error Handling

### 潜在风险

1. **依赖引用** - 如果其他包引用了被删除的包，会导致构建失败
   - 缓解措施：删除前搜索所有引用

2. **pnpm-lock.yaml 不一致** - 删除包后需要更新锁文件
   - 缓解措施：运行 `pnpm install` 重新生成

### 回滚策略

如果清理导致问题，可以通过 Git 恢复：
```bash
git checkout -- packages/admin-panel packages/worker-api
```

## Testing Strategy

### 验证步骤

1. **删除前检查**
   - 搜索代码库确认无外部引用
   - 记录当前目录结构

2. **删除后验证**
   - 确认目标目录已删除
   - 确认保留目录完整
   - 运行 `pnpm install` 更新依赖
   - 运行 `pnpm build` 验证构建
   - 运行 `pnpm typecheck` 验证类型
   - 运行 `pnpm test` 验证测试

### 测试框架

由于这是一次性清理操作，不需要自动化测试。验证将通过手动执行命令完成。
