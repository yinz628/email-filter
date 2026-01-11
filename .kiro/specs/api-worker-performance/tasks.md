# Implementation Plan

- [x] 1. SQLite 数据库性能优化





  - [x] 1.1 创建数据库优化模块


    - 创建 `packages/vps-api/src/db/optimizer.ts`
    - 实现 `applyOptimizations()` 函数配置 WAL 模式和 pragmas
    - 实现 `verifyIndexes()` 函数检查并创建缺失索引
    - _Requirements: 1.1, 1.2, 1.3, 6.3_
  - [x] 1.2 集成数据库优化到初始化流程


    - 修改 `packages/vps-api/src/db/index.ts`
    - 在 `initializeDatabase()` 中调用优化函数
    - _Requirements: 1.1, 1.2, 1.3_
  - [x] 1.3 编写数据库优化单元测试


    - 验证 WAL 模式正确启用
    - 验证 pragmas 正确配置
    - 验证索引存在
    - _Requirements: 1.1, 1.2, 1.3, 6.1, 6.2_

- [x] 2. 动态规则 Pattern 缓存





  - [x] 2.1 创建 Dynamic Pattern Cache 模块


    - 创建 `packages/vps-api/src/services/dynamic-pattern-cache.ts`
    - 实现 `DynamicPatternCache` 类，使用 Set 存储 patterns
    - 实现 `loadFromDatabase()`, `has()`, `add()`, `remove()` 方法
    - _Requirements: 4.1, 4.2, 4.3, 4.4_

  - [x] 2.2 创建 Pattern Cache 单例实例

    - 创建 `packages/vps-api/src/services/dynamic-pattern-cache.instance.ts`
    - 导出全局单例
    - _Requirements: 4.1_
  - [x] 2.3 集成 Pattern Cache 到动态规则服务


    - 修改 `packages/vps-api/src/services/dynamic-rule.service.ts`
    - 在 `findDynamicRuleBySubject()` 中先检查 Pattern Cache
    - 在规则创建时更新 Pattern Cache
    - _Requirements: 4.2, 4.3_

  - [x] 2.4 编写 Pattern Cache 属性测试

    - **Property 4: 动态 Pattern Set O(1) 查找**
    - **Validates: Requirements 2.4, 4.4**
    - _Requirements: 2.4, 4.4_

- [x] 3. Prepared Statement 优化





  - [x] 3.1 创建 Prepared Statement Manager


    - 创建 `packages/vps-api/src/db/prepared-statements.ts`
    - 实现语句缓存和复用逻辑
    - 预定义常用 SQL 语句
    - _Requirements: 3.1_
  - [x] 3.2 集成到动态规则服务


    - 修改 `packages/vps-api/src/services/dynamic-rule.service.ts`
    - 使用预编译语句替代内联 SQL
    - _Requirements: 3.1, 3.2_
  - [x] 3.3 编写 Prepared Statement 单元测试


    - 验证语句正确缓存和复用
    - _Requirements: 3.1_

- [x] 4. Checkpoint - 确保所有测试通过





  - Ensure all tests pass, ask the user if questions arise.

- [x] 5. Subject Hash 优化






  - [x] 5.1 实现快速哈希函数

    - 修改 `packages/vps-api/src/services/dynamic-rule.service.ts`
    - 使用 FNV-1a 或类似的快速非加密哈希
    - _Requirements: 3.3_

  - [x] 5.2 编写哈希函数属性测试

    - **Property 5: Subject Hash 计算性能**
    - **Validates: Requirements 3.3**
    - _Requirements: 3.3_

- [x] 6. 性能指标收集





  - [x] 6.1 创建性能指标模块


    - 创建 `packages/vps-api/src/services/performance-metrics.ts`
    - 实现 Phase 1 时间记录和统计
    - 实现 p95 计算
    - _Requirements: 8.1, 8.2_

  - [x] 6.2 集成到 webhook 路由

    - 修改 `packages/vps-api/src/routes/webhook.ts`
    - 记录 Phase 1 处理时间
    - 超过 100ms 时记录警告
    - _Requirements: 8.1, 8.2_

  - [x] 6.3 添加性能指标 API 端点

    - 添加 GET `/api/admin/metrics` 端点
    - 返回 Phase 1 时间统计
    - _Requirements: 8.3_

  - [x] 6.4 编写性能指标单元测试

    - 验证指标正确记录
    - 验证 p95 计算正确
    - _Requirements: 8.1_

- [x] 7. Checkpoint - 确保所有测试通过





  - Ensure all tests pass, ask the user if questions arise.

- [x] 8. Worker 端请求优化





  - [x] 8.1 优化 payload 构建


    - 修改 `packages/email-worker/src/index.ts`
    - 排除 null/undefined 字段
    - 优化 JSON 序列化
    - _Requirements: 9.1, 9.2_
  - [x] 8.2 优化邮件字段提取


    - 优化 `extractEmail()` 函数
    - 使用更高效的字符串操作
    - _Requirements: 9.3_
  - [x] 8.3 优化 debug 日志


    - 修改 `debugLog()` 函数
    - 禁用时跳过字符串构建
    - _Requirements: 9.4_
  - [x] 8.4 编写 Worker 优化属性测试


    - **Property 7: Worker Payload 最小化**
    - **Property 8: Worker 字段提取性能**
    - **Validates: Requirements 9.1, 9.3**
    - _Requirements: 9.1, 9.3_

- [x] 9. Worker 端超时优化






  - [x] 9.1 调整超时策略

    - 修改 `packages/email-worker/src/index.ts`
    - 将超时从 5 秒减少到 4 秒
    - _Requirements: 10.1_

  - [x] 9.2 优化超时日志

    - 记录超时事件详情
    - 包含 API URL 和持续时间
    - _Requirements: 10.4_

  - [x] 9.3 编写超时处理单元测试

    - 验证超时后正确 fallback
    - 验证日志正确记录
    - _Requirements: 10.1, 10.3, 10.4_

- [x] 10. Worker 端连接优化





  - [x] 10.1 添加 HTTP keep-alive


    - 修改请求头包含 Connection: keep-alive
    - _Requirements: 11.1_

  - [x] 10.2 缓存解析后的 URL

    - 实现 URL 缓存逻辑
    - 避免重复解析
    - _Requirements: 11.3_

  - [x] 10.3 编写连接优化单元测试

    - 验证 keep-alive 头存在
    - 验证 URL 缓存工作
    - _Requirements: 11.1, 11.3_

- [x] 11. Checkpoint - 确保所有测试通过





  - Ensure all tests pass, ask the user if questions arise.

- [x] 12. 并发性能属性测试






  - [x] 12.1 编写 WAL 并发测试

    - **Property 1: WAL 模式下并发读写不阻塞**
    - **Validates: Requirements 1.4, 5.3**
    - _Requirements: 1.4, 5.3_

  - [x] 12.2 编写并发请求处理测试

    - **Property 6: 并发请求处理**
    - **Validates: Requirements 5.1**
    - _Requirements: 5.1_

- [x] 13. Final Checkpoint - 确保所有测试通过





  - Ensure all tests pass, ask the user if questions arise.
