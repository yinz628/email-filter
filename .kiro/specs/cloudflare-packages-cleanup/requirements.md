# Requirements Document

## Introduction

本功能用于清理项目中不再使用的 Cloudflare Workers 部署包（`admin-panel` 和 `worker-api`）。由于项目已完全迁移到 VPS 部署方案（使用 `vps-api` 和 `vps-admin`），这些 Cloudflare 版本的包已不再需要，应当从代码库中移除以减少维护负担和代码混淆。

## Glossary

- **admin-panel**: Cloudflare Workers 版本的管理面板，使用 Hono 框架和 D1 数据库
- **worker-api**: Cloudflare Workers 版本的邮件过滤 API，使用 Hono 框架和 D1 数据库
- **vps-api**: VPS 版本的完整 API 服务，使用 Fastify 框架和 SQLite 数据库
- **vps-admin**: VPS 版本的管理面板，使用 Fastify 框架和 SQLite 数据库
- **email-worker**: Cloudflare Email Routing 的邮件接收 Worker，仍在使用中
- **shared**: 共享类型定义和工具函数包
- **pnpm workspace**: pnpm 的工作区配置，管理 monorepo 中的多个包

## Requirements

### Requirement 1

**User Story:** As a developer, I want to remove unused Cloudflare Workers packages, so that the codebase is cleaner and easier to maintain.

#### Acceptance Criteria

1. WHEN the cleanup is performed THEN the System SHALL delete the entire `packages/admin-panel` directory
2. WHEN the cleanup is performed THEN the System SHALL delete the entire `packages/worker-api` directory
3. WHEN the packages are deleted THEN the System SHALL preserve the `packages/email-worker` directory intact
4. WHEN the packages are deleted THEN the System SHALL preserve the `packages/shared` directory intact
5. WHEN the packages are deleted THEN the System SHALL preserve the `packages/vps-api` directory intact
6. WHEN the packages are deleted THEN the System SHALL preserve the `packages/vps-admin` directory intact

### Requirement 2

**User Story:** As a developer, I want the remaining packages to build and run correctly after cleanup, so that the system continues to function properly.

#### Acceptance Criteria

1. WHEN the cleanup is complete THEN the System SHALL allow `pnpm install` to complete without errors
2. WHEN the cleanup is complete THEN the System SHALL allow `pnpm build` to complete without errors for remaining packages
3. WHEN the cleanup is complete THEN the System SHALL allow `pnpm typecheck` to complete without errors for remaining packages
4. WHEN the cleanup is complete THEN the System SHALL allow `pnpm test` to complete without errors for remaining packages

### Requirement 3

**User Story:** As a developer, I want any references to deleted packages removed, so that there are no broken imports or configurations.

#### Acceptance Criteria

1. WHEN the cleanup is complete THEN the System SHALL contain no import statements referencing `@email-filter/admin-panel`
2. WHEN the cleanup is complete THEN the System SHALL contain no import statements referencing `@email-filter/worker-api`
3. WHEN the cleanup is complete THEN the System SHALL have an updated `pnpm-lock.yaml` reflecting the removed packages
