# Implementation Plan

- [x] 1. 扩展服务层方法






  - [x] 1.1 增强 rebuildRecipientPaths 方法支持多 Worker

    - 修改方法签名接受 `workerNames?: string[]` 参数
    - 当 workerNames 为空或 undefined 时，包含所有 Worker 的邮件
    - 当 workerNames 有值时，只包含指定 Worker 的邮件
    - 重建完成后调用 `recalculateAllNewUsers` 更新新老用户标记
    - _Requirements: 3.2, 3.3, 4.2, 4.3, 4.6_


  - [x] 1.2 编写 rebuildRecipientPaths 属性测试

    - **Property 1: Path Rebuild Consistency**
    - **Property 2: Worker Filter Isolation**
    - **Validates: Requirements 3.2, 3.3, 4.1, 4.2**

  - [x] 1.3 实现 cleanupOldCustomerPaths 方法


    - 创建新方法删除老客户的 recipient_paths 记录
    - 保留 campaign_emails 记录不删除
    - 返回删除的路径数和影响的收件人数
    - _Requirements: 7.4, 7.5, 7.6_


  - [x] 1.4 编写 cleanupOldCustomerPaths 属性测试

    - **Property 3: Old Customer Identification**
    - **Property 4: Old Customer Cleanup Preservation**
    - **Validates: Requirements 7.1, 7.2, 7.5**

- [-] 2. 添加 REST API 端点




  - [x] 2.1 添加 POST /api/campaign/merchants/:id/rebuild-paths 端点










    - 接受 workerNames 数组参数
    - 调用 rebuildRecipientPaths 方法
    - 返回重建统计信息
    - _Requirements: 3.1, 3.4_

  - [x] 2.2 添加 POST /api/campaign/merchants/:id/cleanup-old-customers 端点





    - 接受 workerNames 数组参数
    - 调用 cleanupOldCustomerPaths 方法
    - 返回清理统计信息
    - _Requirements: 7.4, 7.6_

  - [x] 2.3 编写 API 端点集成测试





    - 测试 rebuild-paths 端点
    - 测试 cleanup-old-customers 端点
    - _Requirements: 3.1, 7.4_

- [x] 3. Checkpoint - 确保所有测试通过





  - Ensure all tests pass, ask the user if questions arise.

- [x] 4. 更新前端路径分析 UI





  - [x] 4.1 添加重新分析路径按钮和函数


    - 在路径分析标签页添加"重新分析路径"按钮
    - 实现 recalculatePathsForProject() 函数调用 API
    - 显示重建统计信息并刷新显示
    - _Requirements: 3.1, 3.4, 3.6_


  - [x] 4.2 添加清理老客户数据按钮和函数
    - 在路径分析标签页添加"清理老客户数据"按钮
    - 实现 cleanupOldCustomersForProject() 函数调用 API
    - 显示清理统计信息并刷新显示
    - _Requirements: 7.4, 7.6, 7.7_

  - [x] 4.3 增强 renderProjectPathAnalysis 函数


    - 移除层级数量限制，显示所有层级
    - 移除转移树深度限制
    - 增强高亮显示：tag=1 绿色★，tag=2 金色★★
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 2.1, 2.2, 2.3, 2.4, 2.5_

- [x] 5. 扩展项目数据模型支持多 Worker






  - [x] 5.1 扩展 analysis_projects 表结构

    - 添加 worker_names 列存储 JSON 数组
    - 保持 worker_name 列向后兼容
    - _Requirements: 6.3_


  - [x] 5.2 更新项目创建/编辑 UI

    - 添加多 Worker 选择器组件
    - 支持单选、多选、全选模式
    - _Requirements: 6.1, 6.2_


  - [x] 5.3 更新项目详情显示

    - 显示项目包含的 Worker 列表
    - _Requirements: 6.4_

- [x] 6. 更新路径分析数据获取逻辑






  - [x] 6.1 修改 loadPathAnalysis 函数

    - 使用项目的 workerNames 配置
    - 支持多 Worker 数据聚合
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5_


  - [x] 6.2 编写路径分析属性测试


    - **Property 5: Level Stats Completeness**
    - **Property 6: User Statistics Accuracy**
    - **Validates: Requirements 1.1, 5.1, 8.1, 8.2, 8.3, 8.4**

- [x] 7. Final Checkpoint - 确保所有测试通过
  - Ensure all tests pass, ask the user if questions arise.
