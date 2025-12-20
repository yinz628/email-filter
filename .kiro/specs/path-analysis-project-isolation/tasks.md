# Implementation Plan

- [x] 1. 数据库Schema升级







  - [x] 1.1 创建项目级数据表

    - 在 migrate-campaign.ts 中添加 project_root_campaigns 表
    - 添加 project_new_users 表
    - 添加 project_user_events 表
    - 添加 project_path_edges 表
    - 添加 analysis_projects.last_analysis_time 列
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5_


  - [x] 1.2 编写Schema迁移属性测试

    - **Property 8: Schema Migration Backward Compatibility**
    - 验证迁移后原有表数据不变
    - **Validates: Requirements 10.6**

- [x] 2. 实现ProjectPathAnalysisService核心服务






  - [x] 2.1 创建ProjectPathAnalysisService类


    - 创建 packages/vps-api/src/services/project-path-analysis.service.ts
    - 实现构造函数和基础依赖注入
    - _Requirements: 1.1_

  - [x] 2.2 实现项目Root活动管理方法

    - 实现 setProjectRootCampaign() 方法
    - 实现 getProjectRootCampaigns() 方法
    - 实现 removeProjectRootCampaign() 方法
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5_

  - [x] 2.3 编写项目隔离属性测试


    - **Property 1: Project Data Isolation**
    - 创建两个项目，修改一个项目的Root，验证另一个不受影响
    - **Validates: Requirements 1.2, 1.3, 1.5, 2.2, 2.4**

  - [x] 2.4 实现项目新用户管理方法

    - 实现 addProjectNewUser() 方法
    - 实现 getProjectNewUsers() 方法
    - 实现 getProjectUserStats() 方法
    - _Requirements: 3.1, 3.2, 3.3, 3.4_

  - [x] 2.5 实现项目用户事件流管理方法

    - 实现 addUserEvent() 方法（自动计算seq）
    - 实现 getUserEvents() 方法
    - 实现 getMaxSeq() 方法
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5_

  - [x] 2.6 编写序列号一致性属性测试


    - **Property 2: Sequence Number Consistency**
    - 验证seq从1开始连续递增
    - **Validates: Requirements 4.1, 4.2, 6.5, 7.3**

  - [x] 2.7 实现项目路径边管理方法

    - 实现 updatePathEdge() 方法
    - 实现 getProjectPathEdges() 方法
    - 实现 buildPathEdgesFromEvents() 方法
    - _Requirements: 5.1, 5.2, 5.3, 5.4_

  - [x] 2.8 编写路径边计数属性测试


    - **Property 4: Path Edge Count Accuracy**
    - 验证user_count等于实际转移用户数
    - **Validates: Requirements 5.1, 5.4, 6.6**

- [x] 3. Checkpoint - 确保核心服务测试通过





  - Ensure all tests pass, ask the user if questions arise.

- [x] 4. 实现批量处理器







  - [x] 4.1 创建BatchProcessor类

    - 创建 packages/vps-api/src/utils/batch-processor.ts
    - 实现 processBatch() 方法，支持yield控制权
    - 实现进度回调机制
    - _Requirements: 8.1, 8.2, 8.3_


  - [x] 4.2 编写批处理非阻塞属性测试

    - **Property 7: Batch Processing Non-Blocking**
    - 验证主线程阻塞时间不超过50ms
    - **Validates: Requirements 8.3**

- [x] 5. 实现路径分析算法







  - [x] 5.1 实现首次全量分析方法

    - 实现 runFullAnalysis() 方法
    - 处理所有历史Root活动邮件
    - 解析收件人，识别新用户
    - 生成seq=1事件
    - 构建路径边
    - 更新last_analysis_time
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7_


  - [x] 5.2 编写新用户首个Root一致性属性测试

    - **Property 3: New User First Root Consistency**
    - 验证first_root_campaign_id与seq=1事件匹配
    - **Validates: Requirements 3.1, 3.4, 6.4, 7.4**

  - [x] 5.3 实现增量分析方法

    - 实现 runIncrementalAnalysis() 方法
    - 获取现有新用户列表
    - 处理新增邮件，更新现有用户事件（seq=max+1）
    - 处理新Root邮件，添加新用户（seq=1）
    - 更新路径边
    - 更新last_analysis_time
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6_


  - [x] 5.4 编写增量分析正确性属性测试

    - **Property 5: Incremental Analysis Correctness**
    - 验证增量分析结果与全量分析一致
    - **Validates: Requirements 7.2, 7.3, 7.4, 7.5**

  - [x] 5.5 实现分析入口方法

    - 实现 analyzeProject() 方法
    - 自动判断首次/增量分析
    - 集成进度回调
    - _Requirements: 6.1, 7.1_


  - [x] 5.6 编写分析时间更新属性测试

    - **Property 6: Last Analysis Time Update**
    - 验证分析完成后last_analysis_time被更新
    - **Validates: Requirements 6.7, 7.6**

- [x] 6. Checkpoint - 确保分析算法测试通过





  - Ensure all tests pass, ask the user if questions arise.

- [x] 7. 添加REST API端点






 
  - [x] 7.1 添加项目Root活动API

    - GET /api/campaign/projects/:id/root-campaigns
    - POST /api/campaign/projects/:id/root-campaigns
    - DELETE /api/campaign/projects/:id/root-campaigns/:campaignId
    - _Requirements: 2.1, 2.2, 2.4, 2.5_


  - [x] 7.2 添加项目分析API

    - POST /api/campaign/projects/:id/analyze (SSE进度)
    - GET /api/campaign/projects/:id/path-analysis
    - _Requirements: 6.1, 7.1, 9.1, 9.2, 9.3, 9.4_


  - [x] 7.3 添加分析队列管理

    - 实现分析请求队列
    - 确保同时只有一个分析在运行
    - _Requirements: 8.4_

- [x] 8. 更新前端UI






  - [x] 8.1 更新项目Root确认UI


    - 修改Root确认逻辑，使用项目级API
    - 显示项目独立的Root列表
    - _Requirements: 2.1, 2.2, 2.3, 2.4_

  - [x] 8.2 更新路径分析UI


    - 修改loadPathAnalysis()使用项目级API
    - 修改renderProjectPathAnalysis()显示项目级数据
    - _Requirements: 4.3, 5.2, 5.3_

  - [x] 8.3 添加分析进度显示


    - 添加进度条组件
    - 实现SSE连接接收进度更新
    - 显示当前阶段和完成统计
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5_

  - [x] 8.4 添加分析触发按钮


    - 添加"开始分析"按钮
    - 分析进行中禁用按钮
    - 显示上次分析时间
    - _Requirements: 6.1, 7.1_

- [x] 9. 清理和优化







  - [x] 9.1 添加项目删除级联清理

    - 删除项目时清理所有项目级数据
    - 使用数据库级联删除
    - _Requirements: 1.4_


  - [x] 9.2 更新shared类型定义

    - 添加ProjectRootCampaign接口
    - 添加ProjectPathAnalysisResult接口
    - 添加AnalysisProgress接口
    - _Requirements: 所有_

- [x] 10. Final Checkpoint - 确保所有测试通过





  - Ensure all tests pass, ask the user if questions arise.

