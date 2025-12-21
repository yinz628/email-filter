# Implementation Plan

- [x] 1. Pre-cleanup verification












  - [x] 1.1 Search codebase for references to `@email-filter/admin-panel`


    - Verify no other packages import or depend on admin-panel
    - _Requirements: 3.1_


  - [x] 1.2 Search codebase for references to `@email-filter/worker-api`


    - Verify no other packages import or depend on worker-api
    - _Requirements: 3.2_

- [x] 2. Delete unused Cloudflare Workers packages






  - [x] 2.1 Delete `packages/admin-panel` directory

    - Remove the entire directory including all source files, configs, and node_modules
    - _Requirements: 1.1_

  - [x] 2.2 Delete `packages/worker-api` directory

    - Remove the entire directory including all source files, configs, and node_modules
    - _Requirements: 1.2_

- [x] 3. Update dependencies and verify build






  - [x] 3.1 Run `pnpm install` to update lock file

    - This will regenerate pnpm-lock.yaml without the deleted packages
    - _Requirements: 2.1, 3.3_

  - [x] 3.2 Run `pnpm build` to verify all remaining packages build correctly

    - Ensure vps-api, vps-admin, email-worker, and shared all build
    - _Requirements: 2.2_

  - [x] 3.3 Run `pnpm typecheck` to verify type checking passes

    - Ensure no type errors in remaining packages
    - _Requirements: 2.3_

- [x] 4. Final verification






  - [x] 4.1 Verify preserved packages are intact

    - Confirm packages/email-worker exists
    - Confirm packages/shared exists
    - Confirm packages/vps-api exists
    - Confirm packages/vps-admin exists
    - _Requirements: 1.3, 1.4, 1.5, 1.6_

  - [x] 4.2 Run `pnpm test` to verify all tests pass

    - Run tests for remaining packages
    - _Requirements: 2.4_
