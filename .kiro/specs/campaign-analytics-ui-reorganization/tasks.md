# Implementation Plan

- [x] 1. 添加按 Worker 分组的商户列表 API

  - [x] 1.1 实现 getMerchantsByWorker 服务方法
    - 在 campaign-analytics.service.ts 中添加新方法
    - 查询 campaign_emails 表获取每个 Worker 的商户统计
    - 返回商户-Worker 组合列表，包含各自的统计数据
    - _Requirements: 1.1, 1.2, 1.3_

  - [x] 1.2 添加 GET /api/campaign/merchants-by-worker 端点
    - 在 campaign.ts 中添加新路由
    - 支持 workerName 查询参数筛选（可选）
    - 返回按 Worker 分组的商户列表
    - _Requirements: 1.4, 3.2, 3.3_

  - [x] 1.3 编写 Worker 分组属性测试






    - **Property 1: Worker Instance Separation**
    - **Validates: Requirements 1.1, 1.2, 1.3**

- [x] 2. 简化营销分析 UI 结构





  - [x] 2.1 移除标题区




    - 删除 campaign-header-section HTML 元素
    - 将 Worker 筛选下拉框移动到商户列表区
    - _Requirements: 2.1, 2.2_


  - [x] 2.2 隐藏数据管理区

    - 确保 campaign-data-management-section 保持隐藏
    - _Requirements: 2.3_

- [x] 3. 更新商户列表 UI




  - [x] 3.1 更新 Worker 实例筛选下拉框

    - 添加"全部实例"选项作为第一个选项
    - 保持现有的 Worker 实例选项
    - _Requirements: 3.1, 3.2_


  - [x] 3.2 更新商户表格显示

    - 添加 Worker 实例列，显示为彩色标签
    - 当选择"全部实例"时显示 Worker 列
    - 当选择特定 Worker 时隐藏 Worker 列
    - _Requirements: 1.1, 3.4_



  - [x] 3.3 更新 loadMerchantList 函数
    - 当选择"全部实例"时调用新 API
    - 当选择特定 Worker 时使用现有 API
    - _Requirements: 3.2, 3.3_

  - [x] 3.4 更新 renderMerchants 函数

    - 根据筛选模式渲染不同的表格结构
    - 始终显示删除数据按钮（传递 workerName）
    - _Requirements: 4.1, 4.2, 4.3, 4.4_


  - [x] 3.5 编写 Worker 筛选属性测试


    - **Property 2: Worker Filter Isolation**
    - **Validates: Requirements 1.4, 3.2, 3.3**

- [x] 4. 修复创建项目功能






  - [x] 4.1 确保数据库迁移正确运行

    - 检查 analysis_projects 表是否有 worker_names 列
    - 如果没有，运行 migrate-campaign.ts 迁移脚本
    - VPS 上执行: `cd /opt/email-filter && pnpm --filter @email-filter/vps-api run migrate`
    - _Requirements: 5.3_


  - [x] 4.2 调试项目创建 API 调用

    - 检查 create-project-form 提交逻辑
    - 确保 workerNames 数组正确传递
    - 添加详细的错误日志
    - _Requirements: 5.3, 5.4_


  - [x] 4.3 更新创建项目弹窗

    - 确保多 Worker 选择正常工作
    - 修复任何 UI 交互问题
    - _Requirements: 5.1, 5.2_


  - [x] 4.4 编写项目创建属性测试


    - **Property 4: Project Creation with Multiple Workers**
    - **Validates: Requirements 5.2, 5.3**

- [x] 5. 更新分析项目列表






  - [x] 5.1 更新项目列表显示

    - 确保显示项目名称、商户域名、关联的 Worker 实例
    - 显示项目状态（使用现有样式）
    - _Requirements: 6.1, 6.2_


  - [x] 5.2 验证项目操作

    - 确保编辑、删除操作正常工作
    - 确保点击项目跳转到详情页
    - _Requirements: 6.3, 6.4_

- [x] 6. Checkpoint - 确保所有测试通过





  - Ensure all tests pass, ask the user if questions arise.

