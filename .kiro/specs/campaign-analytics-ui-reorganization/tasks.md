# Implementation Plan

- [x] 1. 重构页面 HTML 结构






  - [x] 1.1 重组 campaign-tab 的 HTML 结构为四个区域

    - 移除现有的混乱布局
    - 创建区域1: 标题区 (标题 + 实例选择器)
    - 创建区域2: 数据管理区 (商户列表卡片)
    - 创建区域3: 项目列表区 (项目列表卡片)
    - 创建区域4: 项目详情区 (带标签页导航)
    - _Requirements: 8.1, 8.2, 8.3_


  - [x] 1.2 实现项目详情区的标签页结构

    - 创建 Root确认、营销活动、路径分析 三个标签页
    - 实现标签页切换的 HTML 结构
    - 默认隐藏项目详情区
    - _Requirements: 5.1, 6.1, 7.1_

- [x] 2. 实现区域1: 标题区功能






  - [x] 2.1 实现实例选择器的数据加载和切换逻辑

    - 加载 Worker 实例列表到下拉框
    - 实现 onWorkerFilterChange 函数刷新商户和项目数据
    - 保持选中状态直到用户切换
    - _Requirements: 1.1, 1.2, 1.3, 1.4_


  - [x] 2.2 编写实例数据隔离的属性测试

    - **Property 1: Instance Data Isolation**
    - **Validates: Requirements 1.3, 2.1, 4.1**

- [x] 3. 实现区域2: 数据管理 - 商户列表功能




  - [x] 3.1 实现商户列表加载和渲染

    - 调用 /api/campaign/merchants?workerName=xxx 获取数据
    - 渲染商户域名、活动数、邮件数
    - 显示已有项目的标识
    - _Requirements: 2.1, 2.2, 2.5_


  - [x] 3.2 实现商户列表排序功能
    - 支持按邮件数量排序
    - 支持按活动数量排序
    - _Requirements: 2.3_


  - [x] 3.3 实现创建项目入口
    - 在商户行添加"创建项目"按钮
    - 点击后显示项目创建模态框
    - _Requirements: 2.4, 3.1_

  - [x] 3.4 编写列表渲染完整性的属性测试


    - **Property 2: List Rendering Completeness**
    - **Validates: Requirements 2.2, 4.2, 6.2**


  - [x] 3.5 编写排序正确性的属性测试

    - **Property 3: Sorting Correctness**
    - **Validates: Requirements 2.3, 6.5**

- [x] 4. 实现区域3: 项目列表功能





  - [x] 4.1 实现项目创建功能


    - 创建项目创建模态框 HTML
    - 实现项目名称输入和验证
    - 调用 POST /api/campaign/projects 创建项目
    - 创建成功后刷新列表并自动选中
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5_


  - [x] 4.2 编写项目名称验证的属性测试

    - **Property 5: Project Name Validation**
    - **Validates: Requirements 3.2**


  - [x] 4.3 实现项目列表加载和渲染

    - 调用 /api/campaign/projects?workerName=xxx 获取数据
    - 渲染项目名称、商户域名、状态、创建时间
    - 实现状态筛选功能
    - _Requirements: 4.1, 4.2, 4.5_


  - [x] 4.4 实现项目选择和删除功能

    - 点击项目行展开项目详情区
    - 实现删除按钮和确认逻辑
    - 删除后清除选中状态
    - _Requirements: 4.3, 4.4_


  - [x] 4.5 编写项目删除完整性的属性测试

    - **Property 6: Project Deletion Completeness**
    - **Validates: Requirements 4.4**


  - [x] 4.6 编写商户项目指示器的属性测试

    - **Property 7: Merchant Project Indicator**
    - **Validates: Requirements 2.5**

- [x] 5. Checkpoint - 确保所有测试通过





  - Ensure all tests pass, ask the user if questions arise.

- [x] 6. 实现区域4: 项目详情 - Root确认标签页






  - [x] 6.1 实现 Root 候选列表加载和渲染

    - 调用 /api/campaign/merchants/:id/root-campaigns 获取数据
    - 渲染营销活动列表供选择
    - 显示当前已选中的 Root
    - _Requirements: 5.2, 5.4_


  - [x] 6.2 实现 Root 选择功能

    - 点击活动设置为 Root
    - 调用 POST /api/campaign/campaigns/:id/root 保存
    - 更新 UI 显示选中状态
    - _Requirements: 5.3, 5.5_


  - [x] 6.3 编写 Root 候选列表的属性测试

    - **Property 8: Root Campaign Listing**
    - **Validates: Requirements 5.2**

  - [x] 6.4 编写 Root 选择持久化的属性测试


    - **Property 9: Root Selection Persistence**
    - **Validates: Requirements 5.3**

- [x] 7. 实现区域4: 项目详情 - 营销活动标签页





  - [x] 7.1 实现营销活动列表加载和渲染


    - 调用 /api/campaign/campaigns?merchantId=xxx 获取数据
    - 渲染活动主题、邮件数、收件人数、价值标记
    - 实现排序功能
    - _Requirements: 6.1, 6.2, 6.5_


  - [x] 7.2 实现活动详情和标记功能

    - 点击活动显示详情
    - 实现价值标记功能
    - 调用 POST /api/campaign/campaigns/:id/tag 保存
    - _Requirements: 6.3, 6.4_


  - [x] 7.3 编写活动标记持久化的属性测试

    - **Property 10: Campaign Tag Persistence**
    - **Validates: Requirements 6.4**

- [x] 8. 实现区域4: 项目详情 - 路径分析标签页






  - [x] 8.1 实现路径分析数据加载和渲染

    - 检查是否已选择 Root，未选择则显示提示
    - 调用 /api/campaign/merchants/:id/path-analysis 获取数据
    - 渲染路径节点和连接
    - _Requirements: 7.1, 7.2, 7.3_


  - [x] 8.2 实现路径节点详情显示

    - 显示收件人数量和占比
    - 高亮显示有价值活动节点
    - _Requirements: 7.4, 7.5_


  - [x] 8.3 编写路径节点数据完整性的属性测试

    - **Property 11: Path Node Data Completeness**
    - **Validates: Requirements 7.4**


  - [x] 8.4 编写有价值活动高亮的属性测试

    - **Property 12: Valuable Campaign Highlighting**
    - **Validates: Requirements 7.5**

- [x] 9. 实现状态管理和交互优化






  - [x] 9.1 实现区域状态隔离

    - 确保各区域操作不影响其他区域状态
    - 实现项目选中/取消选中的状态管理
    - _Requirements: 8.4_


  - [x] 9.2 编写区域状态隔离的属性测试

    - **Property 13: Section State Isolation**
    - **Validates: Requirements 8.4**

  - [x] 9.3 实现项目详情区的显示/隐藏逻辑


    - 未选中项目时隐藏详情区
    - 选中项目时展开详情区
    - 切换实例时清除选中状态
    - _Requirements: 8.2, 8.3_

- [x] 10. Final Checkpoint - 确保所有测试通过





  - Ensure all tests pass, ask the user if questions arise.
