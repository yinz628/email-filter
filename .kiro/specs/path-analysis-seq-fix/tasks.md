# Implementation Plan

本任务列表用于修复新用户转移路径分析中的事件序列号计算问题。

## 现有代码位置
- 服务: `packages/vps-api/src/services/project-path-analysis.service.ts`
- 测试: `packages/vps-api/src/services/project-path-analysis.service.test.ts`

---

- [x] 1. 修改 addUserEvent 方法







  - [x] 1.1 实现按时间顺序计算 seq 号

    - 修改 `addUserEvent` 方法，使用 `received_at` 时间计算正确的 seq 位置
    - 使用 `COUNT(*) WHERE received_at <= ?` 计算新事件应该在的位置
    - _Requirements: 1.1_


  - [x] 1.2 实现 seq 号调整逻辑
    - 当新事件需要插入到中间位置时，调整后续事件的 seq 号
    - 使用 `UPDATE SET seq = seq + 1 WHERE received_at > ?` 调整后续事件
    - _Requirements: 1.2, 3.1, 3.2_

  - [x] 1.3 编写 Property 16 测试: Event Insertion Correctness


    - **Property 16: Event Insertion Correctness**
    - **Validates: Requirements 1.2, 3.1, 3.2**

- [x] 2. 添加数据验证方法






  - [x] 2.1 实现 validateEventSequence 方法


    - 验证每个用户的 seq 号是否从1开始连续
    - 验证 seq 顺序是否与 received_at 时间顺序一致
    - 返回验证结果和不一致的记录
    - _Requirements: 6.1, 6.2_

  - [x] 2.2 实现 fixEventSequence 方法


    - 按 received_at 时间重新分配 seq 号
    - 修复后自动重建路径边
    - _Requirements: 6.3_

  - [x] 2.3 编写 Property 15 测试: Seq-Time Consistency


    - **Property 15: Seq-Time Consistency**
    - **Validates: Requirements 1.1, 1.4, 2.2, 6.1, 6.2**

- [x] 3. 优化全量分析流程







  - [x] 3.1 修改 runFullAnalysis 按用户分组处理

    - 先按用户分组邮件，再按 received_at 时间排序每个用户的邮件
    - 确保每个用户的邮件按时间顺序处理
    - _Requirements: 2.1, 2.2_


  - [x] 3.2 编写 Property 17 测试: Full Analysis Event Order

    - **Property 17: Full Analysis Event Order**
    - **Validates: Requirements 2.1, 2.3**

- [x] 4. 添加数据库索引







  - [x] 4.1 添加时间索引优化查询性能

    - 在 `project_user_events` 表添加 `(project_id, recipient, received_at)` 索引
    - 优化按时间查询的性能
    - _Requirements: 1.1_

- [x] 5. Checkpoint - 确保所有测试通过






  - Ensure all tests pass, ask the user if questions arise.

- [x] 6. 添加路径边重建测试







  - [x] 6.1 编写 Property 18 测试: Path Edge Rebuild After Modification

    - **Property 18: Path Edge Rebuild After Modification**
    - **Validates: Requirements 3.3, 5.1, 5.2**

- [x] 7. Final Checkpoint - 确保所有测试通过






  - Ensure all tests pass, ask the user if questions arise.

