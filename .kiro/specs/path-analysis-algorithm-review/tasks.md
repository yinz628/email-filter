# Implementation Plan

本任务列表用于审查和优化现有的路径分析算法实现。

## 现有代码位置
- 服务: `packages/vps-api/src/services/project-path-analysis.service.ts`
- 路由: `packages/vps-api/src/routes/campaign.ts`
- 前端: `packages/vps-api/src/routes/frontend.ts`

---

- [x] 1. 代码审查：验证现有实现



  - [x] 1.1 审查 Worker 过滤逻辑

    - 检查 `getProjectInfo()` 方法是否正确解析 `worker_names` JSON
    - 验证 `getRootCampaignEmails()` 的 SQL 查询是否正确使用 `IN` 子句
    - 验证 `getAllCampaignEmails()` 的 SQL 查询是否正确过滤
    - _Requirements: 设计文档 Worker实例过滤机制_


  - [x] 1.2 审查首次分析流程

    - 验证 `runFullAnalysis()` 是否正确清空数据
    - 验证 Phase 1 是否正确识别新用户
    - 验证 Phase 2 是否正确构建事件流
    - 验证 Phase 3 是否正确生成路径边
    - _Requirements: 6.1-6.8_

  - [x] 1.3 审查增量分析流程


    - 验证 `runIncrementalAnalysis()` 是否正确加载现有用户
    - 验证时间过滤条件 `received_at > last_analysis_time`
    - 验证新用户和新事件的处理逻辑
    - _Requirements: 7.1-7.8_

  - [x] 1.4 审查重新分析流程


    - 验证 `forceFullAnalysis()` 是否正确清空 `last_analysis_time`
    - 验证是否正确调用 `runFullAnalysis()`
    - _Requirements: 8.1-8.6_

- [x] 2. 修复已知问题



  - [x] 2.1 修复事件计数逻辑


    - 当前 `runIncrementalAnalysis()` 中的 `eventsCreated` 计数逻辑有问题
    - 检查 `isNewEvent` 判断是否正确
    - _Requirements: 7.5_

  - [x] 2.2 优化路径边重建


    - 当前增量分析会完全重建路径边
    - 考虑是否需要优化为增量更新（可选）
    - _Requirements: 4.4, 7.7_

- [x] 3. 添加单元测试



  - [x] 3.1 测试 Worker 过滤逻辑


    - 测试单 Worker 场景
    - 测试多 Worker 场景
    - 测试 `worker_names` 为 null 的向后兼容
    - **Property 1: Worker Filter Isolation**
    - **Validates: Requirements 设计文档 Worker实例过滤机制**

  - [x] 3.2 测试首次分析


    - 测试空数据场景
    - 测试有 Root 活动场景
    - 测试无 Root 活动场景
    - **Property 9: Analysis Mode Selection**
    - **Validates: Requirements 6.1**

  - [x] 3.3 测试增量分析

    - 测试新增 Root 用户
    - 测试已有用户新增邮件
    - 测试无新数据场景
    - **Property 4: Sequence Number Continuity**
    - **Validates: Requirements 7.1-7.6**

  - [x] 3.4 测试重新分析

    - 测试数据清空
    - 测试重建结果一致性
    - **Property 7: Path Edge Rebuild Consistency**
    - **Validates: Requirements 8.1-8.5**

- [x] 4. 文档更新



  - [x] 4.1 更新 API 文档


    - 记录 `/api/campaign/projects/:id/analyze` 端点
    - 记录 `/api/campaign/projects/:id/reanalyze` 端点
    - 记录返回值格式
    - _Requirements: 6.8, 8.6_

  - [x] 4.2 更新部署文档


    - 记录 Worker 配置说明
    - 记录多 Worker 聚合分析的使用方法
    - _Requirements: 设计文档 Worker实例过滤机制_

- [x] 5. Checkpoint - 确保所有测试通过



  - Ensure all tests pass, ask the user if questions arise.

---

## 有价值活动优先计算 (Requirements 9.1-9.6)

- [x] 6. 实现有价值活动统计





  - [x] 6.1 添加 ValuableStats 接口和计算方法




    - 在 `project-path-analysis.service.ts` 中添加 `ValuableStats` 接口
    - 实现 `calculateValuableStats()` 方法
    - 统计 valuableCampaignCount, highValueCampaignCount
    - 计算 valuableUserReach (到达有价值活动的用户数)
    - 计算 valuableConversionRate (有价值转化率)
    - _Requirements: 9.3, 9.4, 9.5_

  - [x] 6.2 修改层级统计排序逻辑




    - 修改 `buildLevelStats()` 或相关方法
    - 同一层级内按价值优先排序: tag=2 > tag=1 > 其他(按userCount)
    - _Requirements: 9.1_

  - [x] 6.3 更新路径分析 API 返回值



    - 在 `/api/campaign/projects/:id/path-analysis` 返回中添加 `valuableStats`
    - 确保前端可以获取有价值活动统计数据
    - _Requirements: 9.3_

- [x] 7. 更新前端展示





  - [x] 7.1 添加有价值活动统计卡片




    - 在路径分析页面添加统计卡片
    - 显示: 有价值活动数、高价值活动数、触达用户数、转化率
    - _Requirements: 9.3, 9.5_

  - [x] 7.2 优化层级展示排序



    - 确保前端按后端返回的顺序显示
    - 有价值活动在同层级内排在前面
    - _Requirements: 9.1_

  - [x] 7.3 高亮通往高价值活动的路径




    - 在转移路径树中标记通往 tag=2 活动的路径
    - 使用特殊颜色或图标标识优先路径
    - _Requirements: 9.2, 9.6_

- [x] 8. 添加有价值活动相关测试








  - [x] 8.1 测试有价值活动统计计算




    - 测试 valuableCampaignCount 计算
    - 测试 valuableUserReach 计算
    - 测试 valuableConversionRate 计算
    - **Property 13: Valuable User Reach Accuracy**
    - **Property 14: Valuable Conversion Rate Calculation**
    - **Validates: Requirements 9.3, 9.4, 9.5**

  - [x] 8.2 测试层级排序逻辑




    - 测试同层级内 tag=2 排在 tag=1 前面
    - 测试 tag=1 排在普通活动前面
    - **Property 12: Valuable Campaign Priority Sorting**
    - **Validates: Requirements 9.1**

- [x] 9. Final Checkpoint - 确保所有测试通过





  - Ensure all tests pass, ask the user if questions arise.
