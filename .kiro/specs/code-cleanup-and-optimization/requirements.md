# Requirements Document

## Introduction

本项目是一个邮件过滤和营销分析系统，包含多个模块：Worker 实例管理、过滤规则、信号监控、营销分析等。经过多次迭代开发和多实例支持的更新，代码出现了以下问题：

1. 自动刷新功能存在重复请求问题
2. 代码结构混乱，存在重复代码
3. 定时器管理不完善，导致内存泄漏风险

本次重构旨在清理和优化代码，提高系统稳定性和可维护性。

## Glossary

- **Auto-refresh**: 自动刷新功能，定期从服务器获取最新数据
- **Timer**: JavaScript 定时器，用于周期性执行任务
- **Worker Instance**: Cloudflare Email Worker 实例
- **Signal Monitoring**: 信号监控模块，监控邮件信号状态
- **Campaign Analytics**: 营销分析模块，分析商户营销活动

## Requirements

### Requirement 1

**User Story:** As a developer, I want the auto-refresh system to be properly managed, so that there are no duplicate API requests.

#### Acceptance Criteria

1. WHEN the system initializes auto-refresh timers THEN the system SHALL include all timer types in the autoRefreshTimers object
2. WHEN a user enables auto-refresh for a module THEN the system SHALL stop any existing timer before starting a new one
3. WHEN a user switches between tabs THEN the system SHALL only run auto-refresh for the active tab
4. WHEN the page unloads THEN the system SHALL clear all active timers to prevent memory leaks

### Requirement 2

**User Story:** As a developer, I want the auto-refresh functions to be consolidated, so that duplicate function definitions are eliminated.

#### Acceptance Criteria

1. WHEN defining auto-refresh functions THEN the system SHALL have exactly one function per refresh type
2. WHEN the autoRefreshTimers object is defined THEN the system SHALL include keys for all types defined in autoRefreshFunctions
3. WHEN a refresh function is called THEN the system SHALL execute only the necessary API calls without duplication

### Requirement 3

**User Story:** As a user, I want the auto-refresh to only run for the currently visible tab, so that unnecessary API calls are avoided.

#### Acceptance Criteria

1. WHEN a user switches to a different tab THEN the system SHALL pause auto-refresh for the previous tab
2. WHEN a user returns to a tab with auto-refresh enabled THEN the system SHALL resume the auto-refresh
3. WHEN multiple tabs have auto-refresh enabled THEN the system SHALL only execute refresh for the active tab

### Requirement 4

**User Story:** As a developer, I want to remove duplicate and unused code, so that the codebase is cleaner and more maintainable.

#### Acceptance Criteria

1. WHEN reviewing the frontend code THEN the system SHALL identify and remove duplicate function definitions
2. WHEN reviewing API calls THEN the system SHALL consolidate redundant endpoints
3. WHEN reviewing event handlers THEN the system SHALL remove unused or duplicate handlers

### Requirement 5

**User Story:** As a developer, I want the localStorage settings to be properly synchronized, so that auto-refresh state is correctly restored on page load.

#### Acceptance Criteria

1. WHEN saving auto-refresh settings THEN the system SHALL store the enabled state and interval for each type
2. WHEN restoring auto-refresh settings THEN the system SHALL only start timers for types that were previously enabled
3. WHEN the autoRefreshTimers object is missing a key THEN the system SHALL skip that type during restoration
