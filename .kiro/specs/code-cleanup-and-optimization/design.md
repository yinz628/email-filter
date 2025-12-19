# Design Document

## Overview

本设计文档描述了对 Email Filter 管理面板前端代码的清理和优化方案。主要解决自动刷新功能的重复请求问题，并清理冗余代码。

## Architecture

### 当前问题分析

1. **autoRefreshTimers 不完整**：
   - `autoRefreshTimers` 对象只包含 `alerts`, `status`, `funnel`, `heartbeat`, `merchants`
   - `autoRefreshFunctions` 包含 `alerts`, `status`, `funnel`, `heartbeat`, `campaign`, `merchants`, `dataStats`, `logs`, `stats`
   - 缺少的 key 导致定时器无法正确管理

2. **重复请求来源**：
   - 当 `startAutoRefresh` 被调用时，如果 `autoRefreshTimers[type]` 不存在，`stopAutoRefresh` 无法清除旧定时器
   - 多次调用会创建多个定时器，导致重复请求

3. **标签页切换未处理**：
   - 切换标签页时，所有启用的自动刷新都在运行
   - 应该只运行当前活动标签页的刷新

### 解决方案

```
┌─────────────────────────────────────────────────────────────┐
│                    Auto-Refresh System                       │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌──────────────────┐    ┌──────────────────┐               │
│  │ autoRefreshTimers│    │autoRefreshFunctions│              │
│  │ (完整的 key 列表) │◄───│ (刷新函数定义)    │              │
│  └────────┬─────────┘    └──────────────────┘               │
│           │                                                  │
│           ▼                                                  │
│  ┌──────────────────┐                                       │
│  │ Tab Visibility   │                                       │
│  │ Controller       │                                       │
│  │ (标签页可见性控制)│                                       │
│  └────────┬─────────┘                                       │
│           │                                                  │
│           ▼                                                  │
│  ┌──────────────────┐    ┌──────────────────┐               │
│  │ startAutoRefresh │───►│ Active Timers    │               │
│  │ stopAutoRefresh  │◄───│ (运行中的定时器)  │               │
│  └──────────────────┘    └──────────────────┘               │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

## Components and Interfaces

### 1. Auto-Refresh Timer Manager

```typescript
// 完整的定时器对象
const autoRefreshTimers = {
  alerts: null,
  status: null,
  funnel: null,
  heartbeat: null,
  merchants: null,
  dataStats: null,
  logs: null,
  stats: null
};

// 刷新函数映射
const autoRefreshFunctions = {
  alerts: () => loadMonitoringAlerts(),
  status: () => loadMonitoringStatus(),
  funnel: () => { loadRatioMonitors(); checkRatioMonitors(); },
  heartbeat: () => triggerHeartbeat(),
  merchants: () => { loadMerchantList(); loadProjects(); },
  dataStats: () => loadDataStats(),
  logs: () => loadLogs(),
  stats: () => { loadStats(); loadTrendingRules(); }
};
```

### 2. Tab Visibility Controller

```typescript
// 当前活动标签页
let currentActiveTab = 'workers';

// 标签页对应的刷新类型
const tabRefreshTypes = {
  'workers': [],
  'rules': [],
  'dynamic': [],
  'logs': ['logs'],
  'stats': ['stats'],
  'campaign': ['merchants'],
  'monitoring': ['alerts', 'status', 'funnel', 'heartbeat']
};

// 切换标签页时的处理
function showTab(tabName) {
  // 暂停旧标签页的刷新
  pauseTabRefresh(currentActiveTab);
  
  // 切换到新标签页
  currentActiveTab = tabName;
  
  // 恢复新标签页的刷新
  resumeTabRefresh(tabName);
}
```

### 3. Improved Start/Stop Functions

```typescript
function startAutoRefresh(type, interval) {
  // 确保先停止已有的定时器
  stopAutoRefresh(type);
  
  const fn = autoRefreshFunctions[type];
  if (fn && autoRefreshTimers.hasOwnProperty(type)) {
    autoRefreshTimers[type] = setInterval(fn, interval);
  }
}

function stopAutoRefresh(type) {
  if (autoRefreshTimers.hasOwnProperty(type) && autoRefreshTimers[type]) {
    clearInterval(autoRefreshTimers[type]);
    autoRefreshTimers[type] = null;
  }
}
```

## Data Models

### Auto-Refresh Settings (localStorage)

```typescript
interface AutoRefreshSettings {
  [type: string]: {
    enabled: boolean;
    interval: string;  // 秒数字符串
  };
}
```

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system-essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Timer Keys Completeness
*For any* key in autoRefreshFunctions, that key should also exist in autoRefreshTimers
**Validates: Requirements 1.1, 2.2**

### Property 2: No Duplicate Timers
*For any* refresh type, calling startAutoRefresh multiple times should result in exactly one active timer
**Validates: Requirements 1.2**

### Property 3: Active Tab Only Refresh
*For any* tab switch, only the auto-refresh timers associated with the new active tab should be running
**Validates: Requirements 1.3, 3.1, 3.2, 3.3**

### Property 4: Settings Persistence Round Trip
*For any* auto-refresh settings saved to localStorage, restoring those settings should produce the same enabled state and intervals
**Validates: Requirements 5.1, 5.2**

## Error Handling

1. **Missing Timer Key**: 如果 `autoRefreshTimers` 中缺少某个 key，`startAutoRefresh` 应该静默失败而不是抛出错误
2. **Invalid Interval**: 如果间隔值无效，应该使用默认值（60秒）
3. **localStorage 不可用**: 如果 localStorage 不可用，应该静默失败并使用默认设置

## Testing Strategy

### Unit Tests
- 测试 `startAutoRefresh` 和 `stopAutoRefresh` 的基本功能
- 测试 `saveAutoRefreshSettings` 和 `restoreAutoRefreshSettings` 的 localStorage 操作
- 测试标签页切换时的定时器管理

### Property-Based Tests
使用 fast-check 进行属性测试：
- 验证 autoRefreshTimers 和 autoRefreshFunctions 的 key 一致性
- 验证多次调用 startAutoRefresh 不会创建重复定时器
- 验证 localStorage 设置的往返一致性

### Integration Tests
- 测试完整的自动刷新流程
- 测试标签页切换时的刷新行为
- 测试页面卸载时的清理行为
