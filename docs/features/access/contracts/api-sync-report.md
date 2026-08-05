# Access API sync report

## A. Field origins

| schema_path                                    | origin                                                      | confidence |
| ---------------------------------------------- | ----------------------------------------------------------- | ---------- |
| `signUpWithWarehouse.email`                    | existing auth contract → `AuthCredentials.email`            | high       |
| `signUpWithWarehouse.password`                 | existing auth contract → `AuthCredentials.password`         | high       |
| `signUpWithWarehouse.warehouseName`            | `data-model.md` → `warehouses.name`; spec AC-02a            | high       |
| `signUpWithWarehouse.response.user.id`         | existing auth contract → `users.id`                         | high       |
| `signUpWithWarehouse.response.access.*Id`      | `data-model.md` → `warehouse_memberships` identifiers       | high       |
| `getCurrentAccess.warehouseId`                 | `data-model.md` → `warehouse_memberships.warehouse_id`      | high       |
| `getCurrentAccess.roleId`                      | `data-model.md` → `warehouse_memberships.role_id`           | high       |
| `getCurrentAccess.roleKind`                    | `data-model.md` → `warehouse_memberships.role_kind`         | high       |
| `getCurrentAccess.permissionIds[]`             | `data-model.md` → `role_permissions.permission_id`          | high       |
| `listRoles.items[].id`                         | `data-model.md` → `roles.id`                                | high       |
| `listRoles.items[].name`                       | `data-model.md` → `roles.name`                              | high       |
| `listRoles.items[].kind`                       | `data-model.md` → `roles.kind`                              | high       |
| `listRoles.items[].permissionIds[]`            | `data-model.md` → `role_permissions.permission_id`          | high       |
| `createRole.name`                              | `data-model.md` → `roles.name`; spec AC-03/AC-06b           | high       |
| `createRole.permissionIds[]`                   | `data-model.md` → `role_permissions.permission_id`          | high       |
| `updateRole.roleId`                            | `data-model.md` → `roles.id`                                | high       |
| `updateRole.name`                              | `data-model.md` → `roles.name`; spec AC-06a/AC-06b          | high       |
| `updateRole.permissionIds[]`                   | `data-model.md` → `role_permissions.permission_id`          | high       |
| `deleteRole.roleId`                            | `data-model.md` → `roles.id`                                | high       |
| `deleteRole.replacementRoleId`                 | `data-model.md` → `warehouse_memberships.role_id`; SAD §6.3 | high       |
| `listPermissions.items[].id`                   | `data-model.md` → `permissions.id`                          | high       |
| `listPermissions.items[].label`                | `data-model.md` → `permissions.label`                       | high       |
| `listPermissions.items[].kind`                 | `data-model.md` → `permissions.kind`                        | high       |
| `listMembers.items[].userId`                   | `data-model.md` → `warehouse_memberships.user_id`           | high       |
| `listMembers.items[].roleId`                   | `data-model.md` → `warehouse_memberships.role_id`           | high       |
| `listMembers.items[].roleKind`                 | `data-model.md` → `warehouse_memberships.role_kind`         | high       |
| `assignMemberRole.userId`                      | `data-model.md` → `warehouse_memberships.user_id`           | high       |
| `assignMemberRole.roleId`                      | `data-model.md` → `warehouse_memberships.role_id`           | high       |
| `transferWarehouseManager.recipientUserId`     | `data-model.md` → `warehouse_memberships.user_id`; SAD §6.4 | high       |
| `transferWarehouseManager.formerManagerRoleId` | `data-model.md` → `warehouse_memberships.role_id`; SAD §6.4 | high       |
| `*.hasNext`                                    | derived cursor-page convention                              | high       |
| `*.hasPrev`                                    | derived cursor-page convention                              | high       |
| `*.nextCursor`                                 | derived cursor-page convention                              | high       |

## B. Drift findings

1. ✓ **Endpoint ↔ data-model (core)** — every operation reads or writes `warehouses`, `roles`, `permissions`, `role_permissions`, or `warehouse_memberships`; registration also preserves the existing auth boundary.
2. ✓ **Error code ↔ repository definition (core, accepted ahead of implementation)** — existing `auth.*`, `request.invalid`, and `system.*` codes match the current registry/filter. The new `access.*` codes are intentional contract proposals and, per the owner's 2026-08-03 decision, will be added to `packages/shared-types/src/enums/error-code.ts` and the global HTTP mapping during implementation.
3. ✓ **Validation ↔ constraint (core)** — UUIDs, Permission ID length/pattern, catalogue and Role enums, label bound, exact Warehouse-local Role-name uniqueness, and 1–100 grapheme name rules match `data-model.md` and AC-02a/AC-03–AC-06b.
4. ✓ **OpenAPI ↔ sequence (supporting)** — registration, protected operations, Role deletion/replacement, manager transfer, and partial-authority reads map to SAD §6.1–§6.5. The SAD uses prose runtime flows rather than Mermaid `sequenceDiagram` blocks; their explicit rejection/concurrency branches are represented as responses.

## Coverage cross-check

| Source                     | Contract coverage                                                                       |
| -------------------------- | --------------------------------------------------------------------------------------- |
| US-01; AC-01–AC-02a        | `POST /api/v1/auth/sign-up`                                                             |
| US-02; AC-03–AC-05, AC-19  | `POST /api/v1/access/roles`, `GET /api/v1/access/permissions`                           |
| US-03; AC-06–AC-07, AC-19  | `PATCH /api/v1/access/roles/{roleId}`                                                   |
| US-04; AC-08–AC-10         | `PUT /api/v1/access/members/{userId}/role`                                              |
| US-05; AC-11–AC-12a, AC-19 | `DELETE /api/v1/access/roles/{roleId}`                                                  |
| US-06; AC-13–AC-14a        | `POST /api/v1/access/manager-transfer`                                                  |
| US-07; AC-15–AC-17         | `GET /api/v1/access/current` plus auth/ownership responses on every protected operation |
| US-08; AC-18               | No runtime endpoint: fulfilled by reviewed catalogue migrations, as specified           |
| US-09; AC-20–AC-22         | Role, Permission, and member list operations                                            |

## Contract decisions

- Uses `SessionCookie`, overriding the generic bearer template in accordance with the accepted auth ADR and implemented server boundary.
- Current-Warehouse routes never accept a Warehouse ID; scope comes from fresh server-side membership.
- Lists use bounded cursor pagination (`limit` 1–100, default 20) and deterministic model-backed ordering.
- No `Idempotency-Key` is declared: the SAD introduces no async actor or retry-safe mutation contract, and registration explicitly must not replay automatically after a lost success response.
- No events contract is produced because the specification explicitly introduces no queue, worker, or event interface.
- Access error codes remain documentation-only proposals until implementation extends the shared registry and global exception mapping.
