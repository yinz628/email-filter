# Implementation Plan

- [x] 1. 整合数据库 Schema






  - [x] 1.1 分析现有 schema 文件差异

    - 对比 schema.sql、monitoring-schema.sql、campaign-schema.sql 中的表定义
    - 识别冲突的表结构（monitoring_rules, alerts, hit_logs 等）
    - _Requirements: 1.1, 2.1, 2.2_

  - [x] 1.2 更新 schema.sql 中的 monitoring_rules 表

    - 使用 monitoring-schema.sql 中的完整结构（包含 merchant, subject_pattern, expected_interval_minutes, dead_after_minutes 字段）
    - 保留所有必要的索引
    - _Requirements: 2.1_

  - [x] 1.3 更新 schema.sql 中的 alerts 表

    - 使用 monitoring-schema.sql 中的完整结构（包含 alert_type, previous_state, current_state, gap_minutes, count_1h, count_12h, count_24h, message, worker_scope, sent_at, created_at 字段）
    - _Requirements: 2.2_

  - [x] 1.4 验证所有表的外键约束正确

    - 检查所有 FOREIGN KEY 引用的表和列存在
    - _Requirements: 2.4_
  - [x] 1.5 Write property test for schema completeness


    - **Property 1: Schema completeness after initialization**
    - **Validates: Requirements 1.1, 1.3**

- [x] 2. 整合迁移脚本






  - [x] 2.1 分析现有迁移脚本

    - 列出所有迁移脚本的功能
    - 识别重复或冲突的迁移逻辑
    - _Requirements: 3.1, 6.3_
  - [x] 2.2 重写 migrate.ts 为统一迁移脚本


    - 实现 tableExists 和 columnExists 辅助函数
    - 整合所有迁移逻辑到单一文件
    - 添加迁移日志输出
    - _Requirements: 3.1, 3.2, 3.4_
  - [x] 2.3 确保迁移脚本幂等性


    - 每个迁移操作前检查是否已执行
    - 使用 CREATE TABLE IF NOT EXISTS 和 ALTER TABLE 前检查
    - _Requirements: 3.1, 3.2_
  - [x] 2.4 Write property test for migration idempotency


    - **Property 2: Migration idempotency**
    - **Validates: Requirements 3.1, 3.2**

- [x] 3. Checkpoint - 确保所有测试通过





  - Ensure all tests pass, ask the user if questions arise.

- [x] 4. 清理冗余文件
  - [x] 4.1 删除 monitoring-schema.sql
    - 确认所有内容已整合到 schema.sql
    - _Requirements: 4.2_
  - [x] 4.2 删除 campaign-schema.sql
    - 确认所有内容已整合到 schema.sql
    - _Requirements: 4.2_
  - [x] 4.3 删除分散的迁移脚本
    - 删除 migrate-add-tags.ts
    - 删除 migrate-campaign.ts
    - 删除 migrate-monitoring.ts
    - 删除 migrate-worker-instance.ts
    - 删除 migrate-ratio-monitoring.ts
    - 删除 migrate-monitoring-worker-scope.ts
    - 删除 migrate-match-mode.js
    - _Requirements: 6.2_
  - [x] 4.4 更新代码中对旧文件的引用
    - 搜索并更新所有对已删除文件的 import
    - _Requirements: 4.3_

- [x] 5. 代码一致性检查






  - [x] 5.1 检查 Repository 层与 schema 一致性

    - 验证 SQL 查询中的列名与 schema 匹配
    - 更新不一致的查询
    - _Requirements: 7.4_

  - [x] 5.2 检查 TypeScript 类型定义

    - 验证接口定义与数据库列匹配
    - 更新不一致的类型定义
    - _Requirements: 7.3_

  - [x] 5.3 移除死代码和未使用的导入

    - 检查并删除未使用的函数和变量
    - _Requirements: 6.4_

- [x] 6. 更新测试






  - [x] 6.1 更新测试中的 mock schema

    - 确保测试使用的 schema 与实际一致
    - _Requirements: 8.2, 8.3_

  - [x] 6.2 运行完整测试套件

    - 确保所有测试通过
    - _Requirements: 8.1_

  - [x] 6.3 Write property test for test suite passes

    - **Property 4: Test suite passes**
    - **Validates: Requirements 8.1**

- [x] 7. 更新部署文档






  - [x] 7.1 更新 DEPLOYMENT.md

    - 添加数据库初始化步骤
    - 添加迁移执行步骤
    - 添加常见问题排查指南
    - _Requirements: 5.1, 5.2, 5.3_

- [x] 8. Final Checkpoint - 确保所有测试通过





  - Ensure all tests pass, ask the user if questions arise.
