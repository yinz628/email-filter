# Implementation Plan

- [x] 1. 扩展 DynamicConfig 类型和默认配置






  - [x] 1.1 更新 shared 包中的 DynamicConfig 接口，添加 timeSpanThresholdMinutes 字段

    - 修改 `packages/shared/src/types/dynamic-config.ts`
    - 添加 `timeSpanThresholdMinutes: number` 字段
    - 更新 DEFAULT_DYNAMIC_CONFIG 默认值
    - _Requirements: 4.1, 4.2, 6.1_

  - [x] 1.2 编写属性测试验证配置往返一致性

    - **Property 5: Configuration Round-Trip**
    - **Validates: Requirements 4.1**

- [x] 2. 更新 DynamicRuleService 检测逻辑





  - [x] 2.1 更新 getConfig() 方法支持新配置项


    - 修改 `packages/vps-api/src/services/dynamic-rule.service.ts`
    - 添加 timeSpanThresholdMinutes 配置项的读取
    - _Requirements: 4.1, 6.1_

  - [x] 2.2 更新 updateConfig() 方法支持新配置项

    - 添加 timeSpanThresholdMinutes 配置项的保存
    - _Requirements: 4.1_

  - [x] 2.3 重构 trackSubject() 方法实现数量优先检测

    - 先统计同主题邮件数量
    - 达到阈值后计算第一封和第N封的时间跨度
    - 时间跨度小于等于阈值时创建规则
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 2.1, 2.2_

  - [x] 2.4 编写属性测试验证数量优先检测逻辑

    - **Property 1: Count-First Detection Logic**
    - **Validates: Requirements 1.1, 1.2, 2.1, 2.2**

  - [x] 2.5 编写属性测试验证时间跨度阈值规则创建

    - **Property 2: Time Span Threshold Rule Creation**
    - **Validates: Requirements 1.3**

  - [x] 2.6 编写属性测试验证时间跨度阈值不创建规则

    - **Property 3: Time Span Threshold No Rule Creation**
    - **Validates: Requirements 1.4**

- [x] 3. 实现检测范围限制





  - [x] 3.1 添加 shouldTrack() 方法判断是否应该追踪邮件


    - 检查 filterResult.matchedCategory
    - 只有 matchedCategory 为 undefined 时才追踪
    - _Requirements: 3.1, 3.2, 3.3, 3.4_

  - [x] 3.2 更新 processDynamicTasks() 使用 shouldTrack() 过滤

    - 修改 `packages/vps-api/src/services/task-processors.ts`
    - 在处理前检查是否应该追踪

    - _Requirements: 3.1, 3.2, 3.3, 3.4_
  - [x] 3.3 编写属性测试验证追踪范围

    - **Property 4: Tracking Scope - Only Default Forwarded Emails**
    - **Validates: Requirements 3.1, 3.2, 3.3, 3.4**

- [x] 4. Checkpoint - 确保所有测试通过





  - Ensure all tests pass, ask the user if questions arise.

- [x] 5. 更新前端界面






  - [x] 5.1 添加时间跨度阈值配置输入框

    - 修改 `packages/vps-api/src/routes/frontend.ts`
    - 在动态规则配置区域添加新的输入字段
    - _Requirements: 5.1_

  - [x] 5.2 更新配置说明文字





    - 解释新的"先数量后时间跨度"检测逻辑

    - _Requirements: 5.2_
  - [x] 5.3 更新 saveDynamicConfig() 函数发送新配置项

    - 添加 timeSpanThresholdMinutes 到 API 请求
    - _Requirements: 5.3_
  - [x] 5.4 更新 loadDynamicConfig() 函数加载新配置项





    - 从 API 响应中读取 timeSpanThresholdMinutes
    - _Requirements: 5.4_

- [x] 6. 更新 API 路由





  - [x] 6.1 确保 /api/dynamic/config GET 端点返回新配置项


    - 检查并更新 `packages/vps-api/src/routes/dynamic.ts`
    - _Requirements: 5.4_

  - [x] 6.2 确保 /api/dynamic/config PUT 端点接受新配置项

    - 添加 timeSpanThresholdMinutes 参数验证
    - _Requirements: 5.3, 4.4_

  - [x] 6.3 编写属性测试验证配置验证逻辑

    - **Property 6: Configuration Validation**
    - **Validates: Requirements 2.4, 4.4**

- [x] 7. 验证向后兼容性






  - [x] 7.1 测试无新配置项时使用默认值

    - 确保系统在没有 timeSpanThresholdMinutes 配置时正常运行
    - _Requirements: 6.1, 6.3_

  - [x] 7.2 编写属性测试验证现有规则保留

    - **Property 7: Existing Rules Preservation**
    - **Validates: Requirements 6.2**

- [x] 8. 更新测试文件






  - [x] 8.1 更新 dynamic-rule.service.test.ts 中的测试用例

    - 更新现有测试以适应新的检测逻辑
    - 添加新的测试用例覆盖时间跨度检测
    - _Requirements: 1.1, 1.2, 1.3, 1.4_

  - [x] 8.2 添加集成测试验证完整流程

    - 测试从邮件接收到规则创建的完整流程
    - _Requirements: 1.1, 1.2, 1.3, 3.1, 3.2, 3.3, 3.4_

- [x] 9. Final Checkpoint - 确保所有测试通过





  - Ensure all tests pass, ask the user if questions arise.
