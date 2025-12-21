# Requirements Document

## Introduction

本功能为邮件过滤系统添加数据自动清理设置界面，允许管理员在前端配置各类数据的自动清理策略和保留时间。系统包含多种高增长数据表（如系统日志、监控命中日志、心跳日志等），需要定期清理以防止数据库膨胀。

## Glossary

- **System**: 邮件过滤系统的 VPS API 后端服务
- **Admin Panel**: 系统的前端管理界面
- **Cleanup Settings**: 数据清理配置，包括保留时间、清理频率等参数
- **Retention Period**: 数据保留时间，超过此时间的数据将被自动清理
- **System Logs**: 系统日志表 (system_logs)，记录邮件转发/丢弃等操作
- **Hit Logs**: 监控命中日志表 (hit_logs)，记录监控规则命中的邮件
- **Heartbeat Logs**: 心跳日志表 (heartbeat_logs)，记录定时心跳检查结果
- **Alerts**: 告警记录表 (alerts)，记录信号状态变化告警
- **Subject Tracker**: 邮件主题追踪表 (email_subject_tracker)，用于动态规则检测
- **Scheduler**: 定时任务调度器，负责执行自动清理任务

## Requirements

### Requirement 1

**User Story:** As an administrator, I want to view and configure data cleanup settings in the admin panel, so that I can control how long different types of data are retained.

#### Acceptance Criteria

1. WHEN an administrator navigates to the settings page THEN the System SHALL display a "数据清理设置" section with all configurable cleanup parameters
2. WHEN the cleanup settings section is displayed THEN the System SHALL show current values for all retention periods and cleanup schedules
3. WHEN an administrator modifies a cleanup setting THEN the System SHALL validate the input value is within acceptable range
4. WHEN an administrator saves cleanup settings THEN the System SHALL persist the configuration to the database
5. WHEN cleanup settings are saved successfully THEN the System SHALL display a success notification to the administrator

### Requirement 2

**User Story:** As an administrator, I want to configure system logs retention period, so that I can balance between storage usage and audit trail requirements.

#### Acceptance Criteria

1. WHEN configuring system logs cleanup THEN the System SHALL allow setting retention period in days (range: 1-365 days)
2. WHEN system logs retention is configured THEN the System SHALL display the estimated storage impact
3. WHEN the cleanup task runs THEN the System SHALL delete system_logs records older than the configured retention period

### Requirement 3

**User Story:** As an administrator, I want to configure monitoring data retention periods, so that I can manage hit logs, alerts, and heartbeat logs storage.

#### Acceptance Criteria

1. WHEN configuring hit logs cleanup THEN the System SHALL allow setting retention period in hours (range: 24-168 hours)
2. WHEN configuring alerts cleanup THEN the System SHALL allow setting retention period in days (range: 7-365 days)
3. WHEN configuring heartbeat logs cleanup THEN the System SHALL allow setting retention period in days (range: 1-90 days)
4. WHEN the cleanup task runs THEN the System SHALL delete records older than their respective configured retention periods

### Requirement 4

**User Story:** As an administrator, I want to configure the cleanup schedule, so that I can run cleanup during low-traffic periods.

#### Acceptance Criteria

1. WHEN configuring cleanup schedule THEN the System SHALL allow setting the cleanup time using hour selection (0-23)
2. WHEN the configured cleanup time arrives THEN the System SHALL execute all cleanup tasks
3. WHEN cleanup tasks complete THEN the System SHALL log the results including number of records deleted per table

### Requirement 5

**User Story:** As an administrator, I want to manually trigger data cleanup, so that I can immediately free up storage when needed.

#### Acceptance Criteria

1. WHEN an administrator clicks the manual cleanup button THEN the System SHALL execute all cleanup tasks immediately
2. WHILE cleanup is running THEN the System SHALL display a progress indicator
3. WHEN manual cleanup completes THEN the System SHALL display a summary of deleted records per table

### Requirement 6

**User Story:** As an administrator, I want to view data storage statistics, so that I can understand current storage usage and cleanup effectiveness.

#### Acceptance Criteria

1. WHEN the cleanup settings page loads THEN the System SHALL display record counts for each cleanable table
2. WHEN the cleanup settings page loads THEN the System SHALL display the oldest record date for each table
3. WHEN cleanup completes THEN the System SHALL refresh the storage statistics display

