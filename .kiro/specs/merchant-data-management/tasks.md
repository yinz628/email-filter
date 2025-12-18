# Implementation Plan

- [x] 1. 实现商户数据删除服务






  - [x] 1.1 在 CampaignAnalyticsService 中添加 deleteMerchantData 方法





    - 实现按 Worker 删除商户邮件记录的逻辑
    - 实现按 Worker 删除路径记录的逻辑
    - 实现检查商户是否还有其他 Worker 数据的逻辑
    - 实现删除空商户记录的逻辑
    - 使用事务确保操作原子性
    - _Requirements: 3.2, 3.3, 3.5, 3.6_

  - [x] 1.2 编写删除移除 Worker 邮件的属性测试


    - **Property 5: Delete Removes Worker Emails**
    - **Validates: Requirements 3.2**

  - [x] 1.3 编写删除移除 Worker 路径的属性测试


    - **Property 6: Delete Removes Worker Paths**
    - **Validates: Requirements 3.3**

  - [x] 1.4 编写删除保留其他 Worker 数据的属性测试


    - **Property 7: Delete Preserves Other Worker Data**
    - **Validates: Requirements 3.5**

  - [x] 1.5 编写删除清理空商户的属性测试


    - **Property 8: Delete Cleans Up Empty Merchant**
    - **Validates: Requirements 3.6**

- [x] 2. 实现删除 API 端点







  - [x] 2.1 添加 DELETE /api/campaign/merchants/:id/data 路由

    - 验证 merchantId 和 workerName 参数
    - 调用 deleteMerchantData 服务方法
    - 返回删除结果统计
    - _Requirements: 3.2, 3.3, 3.4_


  - [x] 2.2 编写删除 API 的集成测试

    - 测试成功删除场景
    - 测试商户不存在场景
    - 测试 Worker 名称无效场景
    - _Requirements: 3.2, 3.3_

- [x] 3. Checkpoint - 确保所有测试通过





  - Ensure all tests pass, ask the user if questions arise.

- [x] 4. 实现前端删除功能




  - [x] 4.1 在商户列表中添加删除按钮


    - 在每个商户行添加"删除数据"按钮
    - 按钮仅在选择了 Worker 时可用
    - _Requirements: 3.1_


  - [x] 4.2 实现删除确认对话框
    - 显示将要删除的数据范围（邮件数、活动数）
    - 显示 Worker 名称
    - 提供确认和取消按钮
    - _Requirements: 3.1_


  - [x] 4.3 实现删除操作和结果显示

    - 调用删除 API
    - 显示删除结果（删除了多少数据）
    - 刷新商户列表
    - _Requirements: 3.4_

- [x] 5. 增强 Worker 数据隔离显示







  - [x] 5.1 确保商户列表正确按 Worker 过滤

    - 验证 getMerchants 方法的 workerName 过滤逻辑
    - 确保统计数据只计算当前 Worker 的数据
    - _Requirements: 2.1, 2.2_


  - [x] 5.2 编写 Worker 过滤隔离的属性测试

    - **Property 2: Worker Filter Isolation**
    - **Validates: Requirements 1.3, 2.1**


  - [x] 5.3 编写 Worker 统计准确性的属性测试

    - **Property 3: Worker Statistics Accuracy**
    - **Validates: Requirements 2.2, 6.1, 6.2**


  - [x] 5.4 编写跨 Worker 数据独立性的属性测试

    - **Property 4: Cross-Worker Data Independence**
    - **Validates: Requirements 2.3**

- [x] 6. 增强未选择 Worker 时的提示







  - [x] 6.1 在商户列表区域添加 Worker 选择提示

    - 未选择 Worker 时显示提示信息
    - 提示用户先选择一个 Worker 实例
    - _Requirements: 2.4_

- [x] 7. Checkpoint - 确保所有测试通过





  - Ensure all tests pass, ask the user if questions arise.

- [x] 8. 验证现有数据来源标记功能







  - [x] 8.1 验证 trackEmail 方法正确保存 worker_name

    - 确认 campaign_emails 表中 worker_name 字段正确填充
    - _Requirements: 1.1, 1.2_


  - [x] 8.2 编写 Worker 数据来源标记的属性测试
    - **Property 1: Worker Data Source Tagging**
    - **Validates: Requirements 1.1, 1.2**

- [x] 9. 验证项目 Worker 关联功能







  - [x] 9.1 验证分析项目正确关联 Worker

    - 确认 createAnalysisProject 正确保存 worker_name
    - 确认 getAnalysisProjects 支持 workerName 过滤
    - _Requirements: 4.1, 4.4_


  - [x] 9.2 编写项目 Worker 关联的属性测试

    - **Property 9: Project Worker Association**
    - **Validates: Requirements 4.1, 4.4**

  - [x] 9.3 编写项目数据隔离的属性测试


    - **Property 10: Project Data Isolation**
    - **Validates: Requirements 4.2**

- [x] 10. 实现删除后统计更新







  - [x] 10.1 确保删除后商户统计正确更新

    - 删除后重新计算商户的邮件数和活动数
    - 如果商户被删除，从列表中移除
    - _Requirements: 6.4_


  - [x] 10.2 编写删除后统计更新的属性测试

    - **Property 11: Statistics Update After Delete**
    - **Validates: Requirements 6.4**

- [x] 11. Final Checkpoint - 确保所有测试通过





  - Ensure all tests pass, ask the user if questions arise.

