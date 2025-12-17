# Implementation Plan

- [x] 1. 设置项目结构和类型定义














  - [x] 1.1 在 shared 包中创建监控模块类型定义

    - 创建 `packages/shared/src/types/monitoring.ts`
    - 定义 MonitoringRule、SignalState、SignalStatus、Alert 等核心类型
    - 定义 DTO 类型（CreateRuleDTO、UpdateRuleDTO、EmailMetadata 等）
    - 导出类型到 shared 包入口
    - _Requirements: 1.1, 2.1, 5.5_
  - [x] 1.2 编写类型定义的属性测试


    - **Property 5: 状态计算公式正确性**
    - **Validates: Requirements 2.1**

- [x] 2. 实现数据库 Schema 和 Repository





  - [x] 2.1 创建监控模块数据库 Schema


    - 创建 `packages/vps-api/src/db/monitoring-schema.sql`
    - 定义 monitoring_rules、signal_states、hit_logs、alerts、heartbeat_logs、alert_channels 表
    - 创建必要的索引
    - _Requirements: 7.1, 7.2, 7.3_
  - [x] 2.2 创建数据库迁移脚本


    - 创建 `packages/vps-api/src/db/migrate-monitoring.ts`
    - 实现 Schema 迁移逻辑
    - _Requirements: 7.1_
  - [x] 2.3 实现 MonitoringRuleRepository


    - 创建 `packages/vps-api/src/db/monitoring-rule-repository.ts`
    - 实现 CRUD 操作：create、update、delete、getById、getAll、toggleEnabled
    - _Requirements: 1.1, 1.2, 1.3, 1.4_
  - [x] 2.4 编写规则 Repository 的属性测试


    - **Property 1: 规则创建完整性**
    - **Validates: Requirements 1.1, 1.4**
  - [x] 2.5 实现 SignalStateRepository


    - 创建 `packages/vps-api/src/db/signal-state-repository.ts`
    - 实现状态查询、更新、计数器操作
    - _Requirements: 2.5, 3.1, 3.2_
  - [x] 2.6 实现 AlertRepository


    - 创建 `packages/vps-api/src/db/alert-repository.ts`
    - 实现告警记录的创建、查询、更新发送状态
    - _Requirements: 5.5, 5.6_
  - [x] 2.7 实现 HitLogRepository


    - 创建 `packages/vps-api/src/db/hit-log-repository.ts`
    - 实现命中记录的创建、查询、清理
    - _Requirements: 3.4, 7.2_

- [x] 3. Checkpoint - 确保所有测试通过





  - Ensure all tests pass, ask the user if questions arise.

- [x] 4. 实现核心服务层





  - [x] 4.1 实现状态计算函数


    - 创建 `packages/vps-api/src/services/monitoring/state-calculator.ts`
    - 实现 calculateState(lastSeenAt, expectedInterval, deadAfter) 函数
    - 实现 calculateGapMinutes(lastSeenAt) 函数
    - _Requirements: 2.1_
  - [x] 4.2 编写状态计算的属性测试


    - **Property 5: 状态计算公式正确性**
    - **Validates: Requirements 2.1**
  - [x] 4.3 实现正则匹配服务


    - 创建 `packages/vps-api/src/services/monitoring/pattern-matcher.ts`
    - 实现 matchSubject(pattern, subject) 函数
    - 处理正则表达式错误
    - _Requirements: 1.5_
  - [x] 4.4 编写正则匹配的属性测试


    - **Property 4: 正则匹配正确性**
    - **Validates: Requirements 1.5**
  - [x] 4.5 实现 MonitoringRuleService


    - 创建 `packages/vps-api/src/services/monitoring/rule.service.ts`
    - 实现规则的创建、更新、删除、查询、启用/禁用
    - 验证规则配置的有效性
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5_
  - [x] 4.6 编写规则服务的属性测试


    - **Property 2: 规则更新立即生效**
    - **Property 3: 禁用规则跳过检查**
    - **Validates: Requirements 1.2, 1.3**

- [x] 5. Checkpoint - 确保所有测试通过





  - Ensure all tests pass, ask the user if questions arise.

- [x] 6. 实现信号状态管理服务






  - [x] 6.1 实现 SignalStateService

    - 创建 `packages/vps-api/src/services/monitoring/signal-state.service.ts`
    - 实现 getStatus(ruleId)、getAllStatuses() 方法
    - 实现 updateOnHit(ruleId, hitTime) 方法
    - 实现时间窗口计数器的滚动更新逻辑
    - _Requirements: 2.1, 2.5, 3.1, 3.2_

  - [x] 6.2 编写信号状态服务的属性测试

    - **Property 6: 状态查询完整性**
    - **Property 7: 邮件命中更新一致性**
    - **Validates: Requirements 2.5, 3.1, 3.2**
  - [x] 6.3 实现状态列表排序


    - 在 getAllStatuses() 中实现 DEAD > WEAK > ACTIVE 排序
    - _Requirements: 6.2_

  - [x] 6.4 编写状态排序的属性测试

    - **Property 12: 状态列表排序正确性**
    - **Validates: Requirements 6.2**

- [x] 7. 实现告警服务




  - [x] 7.1 实现 AlertService

    - 创建 `packages/vps-api/src/services/monitoring/alert.service.ts`
    - 实现 createAlert(data) 方法
    - 实现 determineAlertType(previousState, currentState) 方法
    - 实现告警消息格式化
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5_

  - [x] 7.2 编写告警服务的属性测试

    - **Property 10: 状态转换告警矩阵**
    - **Property 11: 告警内容完整性**
    - **Validates: Requirements 5.1, 5.2, 5.3, 5.4, 5.5**

  - [x] 7.3 实现告警发送渠道

    - 实现 Webhook 发送器
    - 实现 Email 发送器（可选）
    - _Requirements: 5.6_

  - [x] 7.4 实现状态格式化输出
    - 实现 formatStatusDisplay(status) 函数
    - 格式：[状态图标] 商户 / 规则名 last: Xh ago | 24h: N | 12h: N | 1h: N
    - _Requirements: 6.3_
  - [x] 7.5 编写格式化输出的属性测试

    - **Property 13: 状态格式化输出**
    - **Validates: Requirements 6.3**

- [x] 8. Checkpoint - 确保所有测试通过





  - Ensure all tests pass, ask the user if questions arise.

- [x] 9. 实现邮件命中处理器






  - [x] 9.1 实现 HitProcessor

    - 创建 `packages/vps-api/src/services/monitoring/hit-processor.ts`
    - 实现 processEmail(email) 方法
    - 实现 matchRules(email) 方法 - 匹配所有启用的规则
    - 实现 recordHit(ruleId, email) 方法
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 8.2_

  - [x] 9.2 编写命中处理器的属性测试

    - **Property 8: 恢复事件触发**
    - **Property 15: 邮件元数据约束**
    - **Validates: Requirements 3.3, 8.2**

- [x] 10. 实现心跳检查服务






  - [x] 10.1 实现 HeartbeatService

    - 创建 `packages/vps-api/src/services/monitoring/heartbeat.service.ts`
    - 实现 runCheck() 方法 - 遍历所有启用规则
    - 实现状态变化检测和告警触发
    - 记录心跳检查日志
    - _Requirements: 4.1, 4.2, 4.3_
  - [x] 10.2 编写心跳检查的属性测试




    - **Property 9: 心跳检查覆盖所有启用规则**
    - **Validates: Requirements 4.1**

- [x] 11. Checkpoint - 确保所有测试通过





  - Ensure all tests pass, ask the user if questions arise.

- [x] 12. 实现数据清理服务






  - [x] 12.1 实现 CleanupService

    - 创建 `packages/vps-api/src/services/monitoring/cleanup.service.ts`
    - 实现 cleanupHitLogs(retentionHours) 方法 - 清理 48-72 小时前的记录
    - 实现 cleanupAlerts(retentionDays) 方法 - 清理 30-90 天前的记录
    - _Requirements: 7.2, 7.3_

  - [x] 12.2 编写数据清理的属性测试

    - **Property 14: 数据清理正确性**
    - **Validates: Requirements 7.2, 7.3**

- [x] 13. 实现 API 路由





  - [x] 13.1 实现规则管理 API


    - 创建 `packages/vps-api/src/routes/monitoring.ts`
    - POST /api/monitoring/rules - 创建规则
    - GET /api/monitoring/rules - 获取规则列表
    - GET /api/monitoring/rules/:id - 获取单个规则
    - PUT /api/monitoring/rules/:id - 更新规则
    - DELETE /api/monitoring/rules/:id - 删除规则
    - PATCH /api/monitoring/rules/:id/toggle - 启用/禁用规则
    - _Requirements: 1.1, 1.2, 1.3, 1.4_

  - [x] 13.2 实现状态查询 API
    - GET /api/monitoring/status - 获取所有信号状态
    - GET /api/monitoring/status/:ruleId - 获取单个信号状态

    - _Requirements: 2.5, 6.1, 6.2_
  - [x] 13.3 实现告警查询 API
    - GET /api/monitoring/alerts - 获取告警历史

    - GET /api/monitoring/alerts/:id - 获取单个告警详情
    - _Requirements: 5.5_

  - [x] 13.4 实现邮件命中 API
    - POST /api/monitoring/hit - 记录邮件命中

    - _Requirements: 3.1, 3.2, 3.3, 3.4_
  - [x] 13.5 实现心跳检查 API
    - POST /api/monitoring/heartbeat - 触发心跳检查
    - _Requirements: 4.1, 4.2, 4.3_
  - [x] 13.6 注册路由到主应用

    - 在 `packages/vps-api/src/routes/index.ts` 中注册监控路由
    - _Requirements: 8.1_

- [x] 14. Checkpoint - 确保所有测试通过





  - Ensure all tests pass, ask the user if questions arise.

- [x] 15. 集成 Email Worker






  - [x] 15.1 在 Email Worker 中添加监控调用

    - 修改 `packages/email-worker/src/index.ts`
    - 在 email() 处理函数中异步调用监控 API
    - 使用 ctx.waitUntil() 确保调用完成
    - _Requirements: 8.1, 8.2_

  - [x] 15.2 实现本地缓存和重试机制

    - 当 VPS API 不可用时缓存命中事件
    - 实现恢复后的同步逻辑
    - _Requirements: 8.4_

- [x] 16. 实现定时任务





  - [x] 16.1 配置心跳检查定时任务


    - 在 VPS API 中配置每 5 分钟执行心跳检查
    - 可使用 node-cron 或系统 cron
    - _Requirements: 4.1_
  - [x] 16.2 配置数据清理定时任务


    - 配置每日执行数据清理
    - _Requirements: 7.2, 7.3, 7.4_

- [x] 17. Final Checkpoint - 确保所有测试通过





  - Ensure all tests pass, ask the user if questions arise.
