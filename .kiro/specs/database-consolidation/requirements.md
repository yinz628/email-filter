# Requirements Document

## Introduction

本项目由多个功能分支合并而来，导致数据库 schema 分散在多个文件中，存在表定义不一致、迁移脚本混乱等问题。同时代码结构也存在冗余、不一致等问题。本需求旨在整合数据库结构、梳理代码、建立统一的迁移机制，确保项目能够在新环境中顺利部署和运行。

## Glossary

- **Schema**: 数据库表结构定义文件
- **Migration**: 数据库迁移脚本，用于升级现有数据库结构
- **VPS-API**: 部署在 VPS 上的后端 API 服务
- **SQLite**: 项目使用的嵌入式数据库
- **Worker Instance**: Cloudflare Worker 实例，用于邮件处理
- **Repository**: 数据访问层，封装数据库操作
- **Service**: 业务逻辑层，处理业务规则

## Requirements

### Requirement 1

**User Story:** As a developer, I want a single consolidated schema file, so that I can understand the complete database structure in one place.

#### Acceptance Criteria

1. WHEN the system initializes the database THEN the VPS-API SHALL use a single schema.sql file containing all table definitions
2. WHEN reviewing database structure THEN the schema.sql file SHALL contain clear section comments separating different functional modules
3. WHEN a table is defined THEN the schema.sql file SHALL include all required columns with consistent naming conventions
4. IF duplicate table definitions exist in separate schema files THEN the system SHALL consolidate them into the main schema.sql with the most complete structure

### Requirement 2

**User Story:** As a developer, I want consistent table definitions, so that the application code works correctly with the database.

#### Acceptance Criteria

1. WHEN the monitoring_rules table is defined THEN the schema SHALL include all columns required by the monitoring service (id, name, merchant, subject_pattern, expected_interval_minutes, dead_after_minutes, tags, worker_scope, enabled, created_at, updated_at)
2. WHEN the alerts table is defined THEN the schema SHALL include all columns required by the alert service (id, rule_id, alert_type, previous_state, current_state, gap_minutes, count_1h, count_12h, count_24h, message, worker_scope, sent_at, created_at)
3. WHEN the campaign_emails table is defined THEN the schema SHALL include the worker_name column
4. WHEN any table references another table THEN the foreign key constraints SHALL be properly defined

### Requirement 3

**User Story:** As a developer, I want a unified migration system, so that I can safely upgrade existing databases.

#### Acceptance Criteria

1. WHEN a migration script runs THEN the system SHALL check if each migration has already been applied before executing
2. WHEN a new column needs to be added THEN the migration script SHALL verify the column does not exist before adding
3. WHEN a new table needs to be created THEN the migration script SHALL use CREATE TABLE IF NOT EXISTS syntax
4. WHEN migrations complete THEN the system SHALL log the results of each migration step

### Requirement 4

**User Story:** As a developer, I want to remove redundant schema files, so that there is no confusion about which schema to use.

#### Acceptance Criteria

1. WHEN the consolidation is complete THEN the system SHALL have only one authoritative schema.sql file
2. WHEN redundant schema files are identified THEN the system SHALL delete monitoring-schema.sql and campaign-schema.sql
3. WHEN code references old schema files THEN the references SHALL be updated to use the consolidated schema.sql

### Requirement 5

**User Story:** As a developer, I want clear deployment documentation, so that I can deploy the application on a new VPS without database errors.

#### Acceptance Criteria

1. WHEN deploying to a new environment THEN the deployment documentation SHALL include database initialization steps
2. WHEN upgrading an existing deployment THEN the documentation SHALL include migration execution steps
3. WHEN database errors occur THEN the documentation SHALL include troubleshooting guidance for common issues

### Requirement 6

**User Story:** As a developer, I want clean and organized code structure, so that I can easily understand and maintain the codebase.

#### Acceptance Criteria

1. WHEN reviewing the db folder THEN the system SHALL have only necessary migration files with clear naming conventions
2. WHEN a migration file is no longer needed THEN the system SHALL remove or archive obsolete migration scripts
3. WHEN multiple migration files exist THEN the system SHALL consolidate them into a single comprehensive migrate.ts file
4. IF dead code or unused imports exist THEN the system SHALL remove them from the codebase

### Requirement 7

**User Story:** As a developer, I want consistent code patterns across the project, so that the codebase is predictable and maintainable.

#### Acceptance Criteria

1. WHEN a repository class accesses the database THEN the repository SHALL use consistent error handling patterns
2. WHEN a service depends on database operations THEN the service SHALL use the repository layer instead of direct database access
3. WHEN TypeScript types are defined THEN the types SHALL match the actual database schema columns
4. WHEN SQL queries reference table columns THEN the queries SHALL use column names that exist in the schema

### Requirement 8

**User Story:** As a developer, I want the project to pass all tests after consolidation, so that I can be confident the changes do not break existing functionality.

#### Acceptance Criteria

1. WHEN running the test suite THEN all existing tests SHALL pass without modification to test logic
2. WHEN database schema changes THEN the test fixtures SHALL be updated to match the new schema
3. WHEN a test uses mock database THEN the mock SHALL include all required table columns
