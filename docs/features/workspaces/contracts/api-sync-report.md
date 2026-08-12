---
status: Draft
owner: 'Backend Lead'
reviewers: ['Tech Lead', 'Security Lead', 'Frontend Lead']
updated_at: '2026-08-11'
feature_size: 'L'
---

# API sync report — workspaces

Companion to [`openapi.yaml`](./openapi.yaml). The contract is a **derived** artifact:
[`data-model.md`](../data-model.md) (typed fields and constraints) + [`sad.md`](../sad.md) §6
sequence `alt`-branches (error responses) + [`spec.md`](../spec.md) §4/§5 (endpoint list, observable
outcomes) → OpenAPI 3.1. This report records where every field came from and what the bidirectional
drift check found.

**Interface kind.** Read from `sad.md` frontmatter `target_surfaces: ['web-frontend',
'backend-service']`, not re-derived. `backend-service` selects the REST/OpenAPI boundary already
established in `docs/system`; `web-frontend` consumes it. No `worker` surface, and `sad.md` §2/§3
state the feature introduces no asynchronous work, so **`contracts/events.md` is deliberately
absent**.

**Size.** `L`, route `full` (`docs/features/workspaces/.size`, `.route`) → full surface, not one
resource.

**Scale.** 29 paths, 35 operations, 49 schemas, 70 `$ref`s (all resolving), 40 distinct error codes.

## Conventions and deviations from the `api` defaults

Each default below is overridden by **implemented repository evidence**, which the skill's input
rules treat the same way as an ADR-mandated deviation. Every deviation is listed; nothing else
deviates.

| Default                                                 | This contract                                                                                     | Why                                                                                                                                                                                                  |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `BearerAuth` global                                     | `SessionCookie` (`apiKey` in cookie `warehouser_session`) global                                  | The repository authenticates with an opaque session cookie: `apps/server/src/auth/rest/auth-cookie.ts:3`, resolved by `apps/server/src/shared/guards/session-auth.guard.ts`. No bearer token exists. |
| Page wrapper `{items, has_next, has_prev, next_cursor}` | `{items, hasNext, hasPrev, nextCursor}`                                                           | `packages/contracts/src/access/access-projections.ts:34-38` — `sad.md` §7 requires the existing cursor page shape be retained where it already exists.                                               |
| snake_case fields                                       | camelCase                                                                                         | Every existing shared contract is camelCase (`warehouseId`, `roleId`, `permissionIds`). Mixing cases inside one API would be the real defect.                                                        |
| Cursor pagination on every list                         | Cursor **only** on the pre-existing Warehouse-level lists; new Workspace-level lists return whole | `sad.md` §7 + `spec.md` §1 (fifth boundary): ~50 Warehouses, ~500 Members. Paging is explicitly out of scope, and the retained page shape means it can be added without a contract break.            |
| `Idempotency-Key` on mutating operations                | Absent                                                                                            | No §6 flow carries a retry note or an async actor; `sad.md` §2 records BullMQ/Redis as unavailable and the feature as fully synchronous.                                                             |
| `error` codes are the contract's proposal               | 17 of 40 codes already exist in `packages/shared-types/src/enums/error-code.ts`                   | See drift point 2.                                                                                                                                                                                   |

Unchanged from the defaults: OpenAPI **3.1.0**, `type: [string, "null"]` nullability (no
`nullable: true`), the `{code, message, details?}` envelope with `module.error_name` codes, URL
versioning (`/api/v1/...`), mandatory `$ref` for shared schemas, and placeholder-only example data
(`*@example.test`, `<placeholder-password>`, `Test Warehouse North`) — no real PII.

## Path shape and the level boundary

`sad.md` §7 fixes three shape decisions; this contract applies them and adds one readability rule.

1. Workspace-scoped routes carry no Workspace identifier — `/api/v1/workspace/**`, the actor's
   Workspace resolved from the session.
2. Every Warehouse-scoped route names its Warehouse in the path —
   `/api/v1/warehouses/{warehouseId}/**`.
3. Warehouse-**record** and membership-**edge** routes are Workspace-scoped even though a Warehouse
   identifier appears in their path.

Decisions 2 and 3 together mean a `warehouseId` in the path does **not** identify the authorization
level. Because `sad.md` §8's coverage check exists precisely to catch a handler declaring the wrong
level, this contract puts the Workspace-scoped Warehouse-record and edge routes under
`/api/v1/workspace/warehouses/{warehouseId}/...` rather than sharing the `/api/v1/warehouses/`
prefix. The level is then readable from the path prefix alone:

| Prefix                                | Guard                                       | Vocabulary              | Archived Warehouse                                            |
| ------------------------------------- | ------------------------------------------- | ----------------------- | ------------------------------------------------------------- |
| `/api/v1/workspace/**`                | `SessionAuthGuard` + `WorkspaceAccessGuard` | `WorkspacePermissionId` | Never consulted — rename/restore/edges stay available (AC-11) |
| `/api/v1/warehouses/{warehouseId}/**` | `SessionAuthGuard` + `WarehouseAccessGuard` | `PermissionId`          | Reads tolerated (AC-12a), mutations denied (AC-12)            |

This is a path-layout choice, not a new architectural rule; it adds nothing `sad.md` does not
already require. If `design` prefers the shared `/api/v1/warehouses/` prefix, only the path strings
change — no schema, no error code, no guard assignment moves.

## Old-to-new path mapping (breaking)

`sad.md` §11 requires `api` to record this mapping; the `tasks` order keeps server and web in step.
There is no deployed consumer other than this repository's web application, so all of it ships in
one release.

| Was                                        | Now                                                                 | Cause                               |
| ------------------------------------------ | ------------------------------------------------------------------- | ----------------------------------- |
| `GET /api/v1/access/current`               | `GET /api/v1/warehouses/{warehouseId}/access/current`               | AC-03a; response gains `archivedAt` |
| `GET /api/v1/access/roles`                 | `GET /api/v1/warehouses/{warehouseId}/access/roles`                 | AC-03a                              |
| `POST /api/v1/access/roles`                | `POST /api/v1/warehouses/{warehouseId}/access/roles`                | AC-03a                              |
| `PATCH /api/v1/access/roles/{roleId}`      | `PATCH /api/v1/warehouses/{warehouseId}/access/roles/{roleId}`      | AC-03a                              |
| `DELETE /api/v1/access/roles/{roleId}`     | `DELETE /api/v1/warehouses/{warehouseId}/access/roles/{roleId}`     | AC-03a                              |
| `GET /api/v1/access/permissions`           | `GET /api/v1/warehouses/{warehouseId}/access/permissions`           | AC-03a                              |
| `GET /api/v1/access/members`               | `GET /api/v1/warehouses/{warehouseId}/access/members`               | AC-03a                              |
| `PUT /api/v1/access/members/{userId}/role` | `PUT /api/v1/warehouses/{warehouseId}/access/members/{userId}/role` | AC-03a                              |
| `POST /api/v1/access/manager-transfer`     | `POST /api/v1/warehouses/{warehouseId}/access/manager-transfer`     | AC-03a — **see OQ-1**               |
| `POST /api/v1/users`                       | `POST /api/v1/warehouses/{warehouseId}/users`                       | AC-03a — **see F-2**                |
| `DELETE /api/v1/users/{userId}`            | `DELETE /api/v1/warehouses/{warehouseId}/users/{userId}`            | AC-03a — **see F-2**                |
| `PATCH /api/v1/users/{userId}/email`       | `PATCH /api/v1/warehouses/{warehouseId}/users/{userId}/email`       | AC-03a — **see F-2**                |
| `PATCH /api/v1/users/{userId}/password`    | `PATCH /api/v1/warehouses/{warehouseId}/users/{userId}/password`    | AC-03a — **see F-2**                |
| `POST /api/v1/auth/sign-up`                | unchanged path, **changed response** (`RegistrationResult`)         | AC-01                               |

`/api/v1/auth/sign-in` and `/api/v1/auth/session` are untouched and are not restated in this
contract.

---

# Section A — field origins

One row per contract field. Fields are grouped by schema rather than repeated per
`(operation, field)` pair: 35 operations over 49 schemas would produce ~400 rows of which the great
majority would be duplicates, and every field below appears exactly once with the operations that
carry it named in the header. Traceability is complete; the redundancy is not.

Confidence: **high** = maps to a `data-model.md` column (or a column of the existing schema, named
by its migration) with a matching type/constraint. **medium** = response-only projection derived
from a spec field with no column of its own. **low** = inferred from a sequence message only.

## Workspace-level projections

### `Workspace` — `renameWorkspace`, `readWorkspaceContext`, `signUp`

| Field  | Origin                                                                                                                       | Confidence |
| ------ | ---------------------------------------------------------------------------------------------------------------------------- | ---------- |
| `id`   | `data-model.md` → `workspaces.id` (UUID PK)                                                                                  | high       |
| `name` | `data-model.md` → `workspaces.name` (TEXT NULL, `COLLATE "C"`, non-empty-when-set CHECK); `null` = the unnamed state (AC-29) | high       |

### `WorkspaceRename` — `renameWorkspace`

| Field  | Origin                                                                                                                      | Confidence |
| ------ | --------------------------------------------------------------------------------------------------------------------------- | ---------- |
| `name` | `data-model.md` → `workspaces.name`; rules from the promoted `shared/domain/value-objects/access-name.ts` (`sad.md` §5, §7) | high       |

### `WorkspaceContext` — `readWorkspaceContext`

| Field                      | Origin                                                                                                                                                                  | Confidence |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| `workspace`                | `data-model.md` → `workspaces`                                                                                                                                          | high       |
| `workspacePermissionIds[]` | `data-model.md` → `workspace_role_permissions.workspace_permission_id` joined through `workspace_memberships.workspace_role_id`; `sad.md` §6.2 guard read               | high       |
| `warehouses[]`             | `data-model.md` → `warehouse_memberships` (`user_id` prefix of the new composite PK) joined to `warehouses`                                                             | high       |
| `effectiveWarehouseId`     | **Derived**, not stored: `users.active_warehouse_id` filtered through the live non-archived memberships per `sad.md` §6.8 / §4 effective-selection rule (AC-03, AC-03b) | medium     |

### `ContextWarehouse` — `readWorkspaceContext`

| Field         | Origin                                                                                                       | Confidence |
| ------------- | ------------------------------------------------------------------------------------------------------------ | ---------- |
| `warehouseId` | `data-model.md` → `warehouse_memberships.warehouse_id` (new PK component)                                    | high       |
| `name`        | `data-model.md` → `warehouses.name` (existing, `chk_warehouses_name_stored_trimmed`)                         | high       |
| `archivedAt`  | `data-model.md` → `warehouses.archived_at` (**new**, TIMESTAMPTZ NULL, `chk_warehouses_archival_order`)      | high       |
| `roleId`      | `data-model.md` → `warehouse_memberships.role_id`                                                            | high       |
| `roleKind`    | `data-model.md` → `warehouse_memberships.role_kind` → `roles.kind` (existing `custom` / `warehouse_manager`) | high       |

### `ActiveWarehouseWrite` / `ActiveWarehouseSelection` — `setActiveWarehouse`

| Field                         | Origin                                                                                                                 | Confidence |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------- | ---------- |
| `warehouseId` (write)         | `data-model.md` → `users.active_warehouse_id` (**new**, composite FK → `warehouse_memberships(user_id, warehouse_id)`) | high       |
| `effectiveWarehouseId` (read) | Derived as above from `users.active_warehouse_id` (`sad.md` §6.8)                                                      | medium     |

### `WorkspaceRole` / `WorkspaceRoleWrite` — `listWorkspaceRoles`, `createWorkspaceRole`, `updateWorkspaceRole`

| Field                      | Origin                                                                                                                                                      | Confidence |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| `id`                       | `data-model.md` → `workspace_roles.id` (UUID PK)                                                                                                            | high       |
| `name`                     | `data-model.md` → `workspace_roles.name` (TEXT NOT NULL, `COLLATE "C"`, non-empty CHECK, `uq_workspace_roles_workspace_name`)                               | high       |
| `kind`                     | `data-model.md` → `workspace_roles.kind` (VARCHAR(24), CHECK in `custom`, `workspace_owner`)                                                                | high       |
| `workspacePermissionIds[]` | `data-model.md` → `workspace_role_permissions.workspace_permission_id` (composite FK → `workspace_permissions(id, kind)`)                                   | high       |
| `assignedMemberCount`      | Aggregate over `workspace_memberships.workspace_role_id` (index `idx_workspace_memberships_role_id`); mirrors the approved `roleSchema.assignedMemberCount` | medium     |

### `WorkspaceRoleDeletion` — `deleteWorkspaceRole`

| Field                        | Origin                                                                                                                                                                    | Confidence |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| `replacementWorkspaceRoleId` | `data-model.md` → `workspace_roles.id`, constrained to `kind = 'custom'` of the same Workspace (`uq_workspace_roles_id_workspace_kind`); `sad.md` §6.7 replacement branch | high       |

### `WorkspacePermission` — `listWorkspacePermissions`

| Field   | Origin                                                                                             | Confidence |
| ------- | -------------------------------------------------------------------------------------------------- | ---------- |
| `id`    | `data-model.md` → `workspace_permissions.id` (VARCHAR(64) PK, `^[A-Z][A-Z0-9_]*:[A-Z][A-Z0-9_]*$`) | high       |
| `label` | `data-model.md` → `workspace_permissions.label` (VARCHAR(100), non-empty CHECK)                    | high       |
| `kind`  | `data-model.md` → `workspace_permissions.kind` (VARCHAR(16), CHECK in `assignable`, `reserved`)    | high       |

### `WorkspaceMember` / `WorkspaceMemberAdd` / `WorkspaceRoleAssignment`

Operations: `listWorkspaceMembers`, `addWorkspaceMember`, `assignWorkspaceMemberRole`.

| Field               | Origin                                                                                                                                                                                                                                                                | Confidence |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| `userId`            | `data-model.md` → `workspace_memberships.user_id` (sole PK — one Workspace Role per Member)                                                                                                                                                                           | high       |
| `workspaceRoleId`   | `data-model.md` → `workspace_memberships.workspace_role_id`                                                                                                                                                                                                           | high       |
| `workspaceRoleKind` | `data-model.md` → `workspace_memberships.workspace_role_kind` (composite FK → `workspace_roles(id, workspace_id, kind)`)                                                                                                                                              | high       |
| `email`             | Existing schema — `accounts.email` via `1753444800000-CreateAuthSchema`; same optional presence as the approved `memberSchema.email` (`packages/contracts/src/access/access-projections.ts:31`). Not covered by `data-model.md`, which states `accounts` is unchanged | medium     |

### `WorkspaceUser` / `WorkspaceUserWarehouse` — `listWorkspaceUsers`

| Field                      | Origin                                                                                                                                                                               | Confidence |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------- |
| `userId`                   | `data-model.md` → `users.id`, scoped by `users.workspace_id` (index `idx_users_workspace_id`)                                                                                        | high       |
| `email`                    | Existing schema — `accounts.email` (as above)                                                                                                                                        | medium     |
| `isWorkspaceMember`        | Existence of a `workspace_memberships` row for that `user_id`; AC-33 needs the candidate list to distinguish them, AC-21 needs the flag to survive losing every Warehouse membership | medium     |
| `warehouses[].warehouseId` | `data-model.md` → `warehouse_memberships.warehouse_id` (index `idx_warehouse_memberships_workspace_user`)                                                                            | high       |
| `warehouses[].roleId`      | `data-model.md` → `warehouse_memberships.role_id`                                                                                                                                    | high       |
| `warehouses[].roleKind`    | `data-model.md` → `warehouse_memberships.role_kind`                                                                                                                                  | high       |

### `WorkspaceOwnerTransfer` / `WorkspaceOwnerTransferResult` — `transferWorkspaceOwner`

| Field                              | Origin                                                                                                             | Confidence |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------ | ---------- |
| `recipientUserId`                  | `data-model.md` → `workspace_memberships.user_id`; `uq_workspace_memberships_one_owner` is the concurrency arbiter | high       |
| `formerOwnerWorkspaceRoleId`       | `data-model.md` → `workspace_roles.id` where `kind = 'custom'`                                                     | high       |
| `ownerUserId`, `formerOwnerUserId` | Same columns, restated as the outcome; mirrors the approved `ManagerTransferResult` shape                          | high       |

## Warehouse record and membership edges

### `Warehouse` / `WarehouseWrite` / `WarehouseArchival`

Operations: `listWorkspaceWarehouses`, `createWarehouse`, `renameWarehouse`, `setWarehouseArchival`.

| Field              | Origin                                                                                                               | Confidence |
| ------------------ | -------------------------------------------------------------------------------------------------------------------- | ---------- |
| `id`               | Existing schema — `warehouses.id` (`1785859200000-CreateAccessSchema`)                                               | high       |
| `name`             | Existing schema — `warehouses.name`, `chk_warehouses_name_stored_trimmed`; unchanged by `data-model.md`              | high       |
| `archivedAt`       | `data-model.md` → `warehouses.archived_at` (**new**)                                                                 | high       |
| `archived` (write) | Write-side intent for `warehouses.archived_at`; `sad.md` §6.5 "submit the Warehouse and the intended archived state" | high       |

### `AssignableWarehouseRole` — `listAssignableWarehouseRoles`

| Field  | Origin                                                                        | Confidence |
| ------ | ----------------------------------------------------------------------------- | ---------- |
| `id`   | Existing schema — `roles.id`, narrowed in SQL to identifier and name (AC-23a) | high       |
| `name` | Existing schema — `roles.name`                                                | high       |

### `WarehouseMembershipAssignment` / `WarehouseMembership`

Operations: `assignWarehouseMembership`, `revokeWarehouseMembership`.

| Field         | Origin                                                                                                             | Confidence |
| ------------- | ------------------------------------------------------------------------------------------------------------------ | ---------- |
| `userId`      | `data-model.md` → `warehouse_memberships.user_id` (composite FK → `users(id, workspace_id)`)                       | high       |
| `warehouseId` | `data-model.md` → `warehouse_memberships.warehouse_id` (**now PK**, composite FK → `warehouses(id, workspace_id)`) | high       |
| `roleId`      | `data-model.md` → `warehouse_memberships.role_id`                                                                  | high       |
| `roleKind`    | `data-model.md` → `warehouse_memberships.role_kind`                                                                | high       |

## Warehouse-level projections (re-shaped, otherwise unchanged)

### `WarehouseAccessProjection` — `readWarehouseAccess`, `signUp`

| Field                                                  | Origin                                                                                                                                                                                | Confidence |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| `warehouseId`, `roleId`, `roleKind`, `permissionIds[]` | Existing contract — `packages/contracts/src/access/access-projections.ts:9-14`, backed by `warehouse_memberships` / `role_permissions`                                                | high       |
| `archivedAt`                                           | **New** — `data-model.md` → `warehouses.archived_at`, read by the Warehouse guard in the same round trip (`sad.md` §6.3) so the web can render archived Warehouses read-only (AC-12a) | high       |

### `WarehouseRole`, `WarehouseRoleWrite`, `WarehouseRoleDeletion`, `WarehouseRoleAssignment`, `WarehousePermission`, `WarehouseMember`, `WarehouseManagerTransfer`, `WarehouseManagerTransferResult`, and the three `*Page` wrappers

Every field is carried over verbatim from the existing approved contracts —
`packages/contracts/src/access/access-projections.ts`,
`packages/contracts/src/access/access-pagination.ts`, and
`apps/server/src/access/rest/controllers/access.controller.ts` — backed by the `roles`,
`permissions`, `role_permissions` and `warehouse_memberships` columns that
[`data-model.md`](../data-model.md) § "Unchanged approved relations" states this feature does not
touch. **Confidence: high.** Only the _paths_ change (AC-03a), and only
`WarehouseAccessProjection.archivedAt` is added.

### `WarehouseUserCreate`, `WarehouseUser`, `WarehouseUserEmailChange`, `WarehouseUserEmail`, `WarehouseUserPasswordChange`, `WarehouseUserConfirmation`

Carried over verbatim from `packages/contracts/src/users` and
`apps/server/src/users/rest/controllers/users.controller.ts`; `email` and `password` bounds from
`packages/contracts/src/auth/index.ts:24-38`. **Confidence: high.** Only the paths change — see
**F-2**.

## Registration

### `RegistrationInput` — `signUp`

| Field                                | Origin                                                                      | Confidence |
| ------------------------------------ | --------------------------------------------------------------------------- | ---------- |
| `email`, `password`, `warehouseName` | Existing contract — `packages/contracts/src/auth/index.ts:61-70`, unchanged | high       |

### `RegistrationResult` — `signUp`

| Field                      | Origin                                                                                                                                           | Confidence |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | ---------- |
| `user.id`                  | Existing contract — `userSchema`                                                                                                                 | high       |
| `access`                   | Existing contract — `accessProjectionSchema`, plus the new `archivedAt`                                                                          | high       |
| `workspace`                | **New** — `data-model.md` → `workspaces`; `sad.md` §6.1 step 5 "return the current User plus the initial Workspace and Warehouse projection"     | high       |
| `workspacePermissionIds[]` | **New** — the sixteen seeded rows of `data-model.md` → `workspace_permissions`, granted to the protected Owner Role at provisioning (spec.md §1) | high       |
| `effectiveWarehouseId`     | **New** — the first Warehouse; the single membership makes it effective with no one choosing (AC-03b, `sad.md` §6.1 postcondition)               | medium     |

## Shared vocabularies

| Field                                           | Origin                                                                                                                                                                              | Confidence |
| ----------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| `WorkspacePermissionId` (pattern, maxLength 64) | `data-model.md` → `workspace_permissions.id` VARCHAR(64) + identifier CHECK `^[A-Z][A-Z0-9_]*:[A-Z][A-Z0-9_]*$`                                                                     | high       |
| `PermissionId` (pattern, maxLength 64)          | Existing contract — `permissionIdSchema`, `packages/contracts/src/access/access-projections.ts:3-6`                                                                                 | high       |
| `Name` (minLength 1, maxLength 100)             | `data-model.md` → the `text COLLATE "C"` name columns + the shared name value object; see **F-5** for the grapheme caveat                                                           | high       |
| `Error.code` / `.message` / `.details`          | Existing schema — `SafeErrorEnvelope`, `apps/server/src/shared/errors/global-http-exception.filter.ts:16-20`; `errorResponseSchema`, `packages/contracts/src/auth/index.ts:105-111` | high       |

**No field in this contract lacks an origin in `data-model.md`, the existing schema, or the existing
approved contracts. Nothing was invented, and no field that left `data-model.md` was silently
dropped.**

---

# Section B — drift findings

## 1. Endpoint ↔ data-model — ✓

Every one of the 35 operations reads or writes at least one entity in `data-model.md` or in the
existing schema it declares unchanged.

- `workspaces` → `renameWorkspace`, `readWorkspaceContext`, `signUp`
- `workspace_permissions` → `listWorkspacePermissions`, `createWorkspaceRole`, `updateWorkspaceRole`
- `workspace_roles` → `listWorkspaceRoles`, `createWorkspaceRole`, `updateWorkspaceRole`, `deleteWorkspaceRole`
- `workspace_role_permissions` → `createWorkspaceRole`, `updateWorkspaceRole`, `readWorkspaceContext`, `signUp`
- `workspace_memberships` → `listWorkspaceMembers`, `addWorkspaceMember`, `removeWorkspaceMember`, `assignWorkspaceMemberRole`, `transferWorkspaceOwner`, `deleteWorkspaceRole`, `readWorkspaceContext`
- `users` (`workspace_id`) → `listWorkspaceUsers`, `createWarehouseUser`, `signUp`
- `users` (`active_warehouse_id`) → `setActiveWarehouse`, `readWorkspaceContext`, `revokeWarehouseMembership` (`ON DELETE SET NULL`)
- `warehouses` (`workspace_id`, `archived_at`) → `listWorkspaceWarehouses`, `createWarehouse`, `renameWarehouse`, `setWarehouseArchival`, `readWarehouseAccess`, every Warehouse-scoped guard read
- `warehouse_memberships` (re-keyed) → `assignWarehouseMembership`, `revokeWarehouseMembership`, `listWorkspaceUsers`, `readWorkspaceContext`, every Warehouse-scoped guard read
- `roles` / `permissions` / `role_permissions` (unchanged) → `listAssignableWarehouseRoles` and the nine `warehouse-access` operations
- `accounts` (unchanged) → the four `warehouse-users` operations, `signUp`

**No entity in `data-model.md` is unreachable from the contract**, and no operation touches an
entity the model does not define. `workspace_permissions` is written only by a release migration
(AC-35) — deliberately, since no endpoint accepts a definition or label mutation.

## 2. Error code ↔ repo error definition — ✓ with a required registry extension

Checked in the form the repository uses: the `ErrorCode` constant map at
`packages/shared-types/src/enums/error-code.ts`, plus the status/message mappings in
`apps/server/src/shared/errors/global-http-exception.filter.ts`.

**Already defined (17 of 40 used):** `access.concurrent_change`, `access.denied`,
`access.invalid_manager_transfer`, `access.invalid_role`, `access.manager_transfer_unavailable`,
`access.membership_required`, `access.role_deletion_unavailable`, `access.role_name_conflict`,
`access.target_unavailable`, `auth.email_already_registered`, `auth.invalid_input`,
`auth.registration_unavailable`, `system.internal_error`, `users.creation_unavailable`,
`users.deletion_unavailable`, `users.password_change_unavailable` — and `request.invalid`, which is
not in the enum but is emitted directly by the filter's `HttpException` branch (filter line 264).

**One mismatch found and fixed in the contract.** The first pass gave the 401 response
`auth.invalid_credentials`. `SessionAuthGuard` raises `UnauthorizedException`, which the filter maps
to `request.invalid`, not to the sign-in failure code. The `Unauthenticated` response now carries
`request.invalid` and says why. This is exactly the class of divergence the check exists for: the
contract matched the spec-as-read while diverging from the implemented error mapping.

**New codes this contract proposes (22).** They must be added to `ErrorCode` and to the filter's
`applicationErrors` / `systemErrors` maps as part of implementation; the `tasks` breakdown must carry
that work. Naming follows the neutral `module.error_name` convention already in the repo, and the
statuses mirror the closest approved precedent.

| Code                                       | Status | Map         | Precedent / AC                                                           |
| ------------------------------------------ | ------ | ----------- | ------------------------------------------------------------------------ |
| `workspace.denied`                         | 403    | application | mirrors `access.denied` — AC-30, AC-31                                   |
| `workspace.invalid_input`                  | 400    | application | mirrors `auth.invalid_input` — AC-08, AC-15a, AC-29a                     |
| `workspace.target_unavailable`             | 404    | application | mirrors `access.target_unavailable` — AC-10, AC-24, AC-25d, AC-28, AC-34 |
| `workspace.role_name_conflict`             | 409    | application | mirrors `access.role_name_conflict` — AC-15                              |
| `workspace.protected_role`                 | 409    | application | mirrors `access.protected_role` — AC-16                                  |
| `workspace.system_managed_permission`      | 409    | application | AC-18                                                                    |
| `workspace.owner_transfer_required`        | 409    | application | mirrors `access.manager_transfer_required` — AC-21a, AC-22               |
| `workspace.role_assignment_required`       | 403    | application | AC-17d                                                                   |
| `workspace.replacement_role_required`      | 400    | application | mirrors `access.replacement_required` — AC-17c, AC-26a                   |
| `workspace.member_exists`                  | 409    | application | §6.6a add branch                                                         |
| `workspace.warehouse_membership_required`  | 409    | application | AC-20                                                                    |
| `workspace.self_action_denied`             | 409    | application | mirrors `users.self_action_denied` — AC-25a, AC-25c                      |
| `workspace.manager_transfer_required`      | 409    | application | mirrors `users.manager_role_protected` — AC-25, AC-25c                   |
| `workspace.membership_exists`              | 409    | application | AC-25 (one Role per Warehouse)                                           |
| `workspace.warehouse_archived`             | 409    | application | AC-11 (selection)                                                        |
| `workspace.last_unarchived_warehouse`      | 409    | application | AC-11a                                                                   |
| `workspace.concurrent_change`              | 409    | application | mirrors `access.concurrent_change` — AC-27, AC-28                        |
| `access.warehouse_archived`                | 409    | application | AC-12 (Warehouse guard denies a mutating handler)                        |
| `workspace.warehouse_creation_unavailable` | 503    | system      | AC-07                                                                    |
| `workspace.archival_unavailable`           | 503    | system      | AC-13                                                                    |
| `workspace.role_deletion_unavailable`      | 503    | system      | mirrors `access.role_deletion_unavailable` — AC-17b                      |
| `workspace.owner_transfer_unavailable`     | 503    | system      | mirrors `access.manager_transfer_unavailable` — §6.7                     |

`users.manager_role_protected`, `users.permission_exceeded` and `users.reserved_role_selection`
remain in the registry and keep applying to the re-pathed `warehouse-users` operations; this
contract does not restate them per-operation because they are unchanged approved behaviour.

## 3. Validation ↔ constraint — ✓ with two documented inexpressibles

| Contract                                                                                             | `data-model.md`                                                                                   | Verdict                                         |
| ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| `WorkspacePermissionId` `maxLength: 64` + `^[A-Z][A-Z0-9_]*:[A-Z][A-Z0-9_]*$`                        | `workspace_permissions.id` VARCHAR(64) + identical CHECK                                          | aligned                                         |
| `WorkspacePermission.label` `maxLength: 100`, `minLength: 1`                                         | `workspace_permissions.label` VARCHAR(100) + non-empty CHECK                                      | aligned                                         |
| `WorkspacePermission.kind` `enum: [assignable, reserved]`                                            | `workspace_permissions.kind` VARCHAR(16) CHECK in the same two                                    | aligned                                         |
| `WorkspaceRoleKind` `enum: [custom, workspace_owner]`                                                | `workspace_roles.kind` VARCHAR(24) CHECK in the same two                                          | aligned                                         |
| `WarehouseRoleKind` `enum: [custom, warehouse_manager]`                                              | existing `roles.kind`; matches `roleKindSchema`                                                   | aligned                                         |
| `Workspace.name` `type: [string, "null"]`, `minLength: 1`                                            | `workspaces.name` TEXT **NULL**, `chk_workspaces_name_stored_trimmed` (NULL or non-empty trimmed) | aligned — the only name column that is nullable |
| `Warehouse.archivedAt` / `ContextWarehouse.archivedAt` `type: [string, "null"]`, `format: date-time` | `warehouses.archived_at` TIMESTAMPTZ NULL                                                         | aligned                                         |
| `effectiveWarehouseId` `type: [string, "null"]`                                                      | `users.active_warehouse_id` UUID NULL                                                             | aligned                                         |
| all `id` fields `format: uuid`                                                                       | UUID PKs throughout                                                                               | aligned                                         |
| `email` `maxLength: 254` / `password` 8–128                                                          | existing `packages/contracts/src/auth/index.ts`                                                   | aligned                                         |

**F-5 — grapheme length is not expressible (accepted, mirrors `data-model.md`).** `Name` carries
`maxLength: 100`, which JSON Schema counts in code points. The authoritative bound is 100
**user-perceived characters** counted with `Intl.Segmenter`. This is the same division
`data-model.md` § "Constraints deliberately not expressed in the schema" makes for PostgreSQL, and
the same one the approved `access` contract already lives with. The `Name` schema says so in its
description; the shared name value object stays authoritative.

**F-6 — control/format character rejection is not expressible as a `pattern` (accepted).** The rule
needs `[\p{Cc}\p{Cf}]` with the Unicode flag, which JSON Schema's ECMA-262 regex dialect does not
guarantee across validators. Encoding it as a plain-ASCII approximation would reject valid names, so
the contract documents the rule in the `Name` description instead and leaves enforcement to the
shared value object and the `workspace.invalid_input` / `access.invalid_role` responses. Consistent
with the approved `warehouseNameSchema`, which enforces it in a `superRefine`, not a regex.

No conflict was found in either direction, so no "take the stricter value" resolution was needed.

## 4. OpenAPI ↔ sequence — ✓

Every `alt`/`else` branch in `sad.md` §6 has a response. Matched on flow and branch, not on
participant names.

| Flow                                       | Branches                                                                                                                                                                                                                      | Responses                                                                                                                                                                                |
| ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| §6.1 Registration bootstrap                | rules fail / email registered; any object cannot be created; success                                                                                                                                                          | `signUp` 400, 409, 503, 201                                                                                                                                                              |
| §6.2 Protected Workspace operation (spine) | no session; not a Member or Permission missing; wrong level declared; target of another Workspace or absent; success                                                                                                          | `Unauthenticated` 401, `WorkspaceDenied` 403 (both causes), `TargetUnavailable` 404, per-operation 2xx                                                                                   |
| §6.2a Rename the Workspace                 | lacks Permission; name rule; success                                                                                                                                                                                          | 403, 400, 200                                                                                                                                                                            |
| §6.3 Protected Warehouse operation (spine) | Warehouse not named; no membership; Permission from another Warehouse; wrong level; archived + mutating; archived + read tolerance; success                                                                                   | route does not match (see below), `WarehouseDenied` 403 ×3, `WarehouseArchivedOrConflict` 409, read operations 200, per-operation 2xx                                                    |
| §6.4 Add a Warehouse                       | name rule; Manager Role cannot be established; success                                                                                                                                                                        | `createWarehouse` 400, 503, 201                                                                                                                                                          |
| §6.4a Rename a Warehouse                   | foreign/absent Warehouse; name rule; success                                                                                                                                                                                  | `renameWarehouse` 404, 400, 200                                                                                                                                                          |
| §6.5 Archive and restore                   | foreign/absent; last non-archived; change cannot complete; success                                                                                                                                                            | `setWarehouseArchival` 404, 409, 503, 200                                                                                                                                                |
| §6.6 Assign a Warehouse membership         | foreign Warehouse on the Roles read; target/Warehouse/Role of another Workspace; target is the actor; Manager Role chosen; membership exists; success                                                                         | `listAssignableWarehouseRoles` 404; `assignWarehouseMembership` 404, 409 ×3 (three named examples), 201                                                                                  |
| §6.6 Revoke a Warehouse membership         | foreign/absent; Manager membership; own membership; success                                                                                                                                                                   | `revokeWarehouseMembership` 404, 409 ×2, 204                                                                                                                                             |
| §6.6a Add / remove a Workspace Member      | candidate of another Workspace or absent; no Warehouse membership; already a Member **or** Owner Role chosen; success — then: target foreign or not a Member; target is the Owner; success                                    | `addWorkspaceMember` 404, 409 ×3; `removeWorkspaceMember` 404, 409, 204 — see **F-3**                                                                                                    |
| §6.6a Move a Member to another Role        | target/Role foreign or absent; Owner Role chosen or target is Owner; success                                                                                                                                                  | `assignWorkspaceMemberRole` 404, 409, 200                                                                                                                                                |
| §6.7 Custom Workspace Role lifecycle       | protected Owner Role; name rule; exact-name conflict; catalogue/reserved/definition change; assigned + no assign Permission; assigned + only custom Role; assigned + replacement (and its failure); unassigned; create/update | `deleteWorkspaceRole` 409/400/403/204/503; `createWorkspaceRole` + `updateWorkspaceRole` 400/409/2xx                                                                                     |
| §6.7 Transfer Workspace Owner              | actor not Owner or lacks reserved Permission; recipient is actor / not a Member / another Workspace; no custom Role available; sole-Owner conflict; success                                                                   | `transferWorkspaceOwner` 403, 404, 400, 409, 200 (+503)                                                                                                                                  |
| §6.7a Transfer Warehouse Manager           | recipient not a member / is the Manager / no custom Role; one-Manager conflict; success                                                                                                                                       | `transferWarehouseManager` 400, 409, 200 (+503) — see **OQ-1**                                                                                                                           |
| §6.8 Select the Active Warehouse           | no membership; archived; success — then: stored selection live; exactly one membership; neither                                                                                                                               | `setActiveWarehouse` 404, 409, 200; `readWorkspaceContext.effectiveWarehouseId` covers all three derivation branches                                                                     |
| §6.9 Catalogue release                     | reserved; non-reserved                                                                                                                                                                                                        | **No endpoint, deliberately** — a migration with no person acting (AC-35). The contract enforces it negatively: no operation accepts a Workspace Permission definition or label mutation |
| §6.10 Administer in the web                | every capability unavailable; each dataset under its own watch Permission                                                                                                                                                     | `readWorkspaceContext` (empty `workspacePermissionIds`), the three list operations each with their own 403                                                                               |

**AC-03a has no operation by construction.** A Warehouse-scoped request that names no Warehouse
matches no route, so no handler is reached and the actor's selection is never substituted. The
contract encodes this structurally — `warehouseId` is a required path parameter on every
Warehouse-scoped path — and documents it on the `WarehouseIdPath` parameter. This is the correct
shape for that AC, not a coverage hole.

No orphan sequence: every §6 flow maps to at least one operation, except §6.9, which is a migration
by design.

---

# Back-feed coverage cross-check

## Every `spec.md` §5 AC maps to ≥1 operation or response — ✓ (57/57)

All 57 acceptance criteria are covered. Four are covered by **documented structural absence** rather
than an operation, which is the correct shape for each:

| AC     | Covered by                                                                                                                                                                                           |
| ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| AC-03a | The required `warehouseId` path parameter on every Warehouse-scoped path — no route matches without it                                                                                               |
| AC-21  | The absence of any operation that removes Workspace membership implicitly; `removeWorkspaceMember` is the only exit, and `WorkspaceUser.isWorkspaceMember` stays `true` with an empty `warehouses[]` |
| AC-31  | The two disjoint vocabularies `WorkspacePermissionId` / `PermissionId` and the two disjoint route prefixes, plus both denial responses                                                               |
| AC-35  | The absence of any operation that writes `workspace_permissions`; the catalogue changes only by release migration                                                                                    |

## Every operation maps to a §4 user story + ≥1 AC — ✓ with one attribution note

| User story | Operations                                                                                                                |
| ---------- | ------------------------------------------------------------------------------------------------------------------------- |
| US-01      | `signUp`                                                                                                                  |
| US-02      | `readWorkspaceContext`, `setActiveWarehouse`, `readWarehouseAccess`                                                       |
| US-03      | `createWarehouse`                                                                                                         |
| US-04      | `renameWarehouse`                                                                                                         |
| US-05      | `setWarehouseArchival`                                                                                                    |
| US-06      | `createWorkspaceRole`, `updateWorkspaceRole`, `deleteWorkspaceRole`                                                       |
| US-07      | `addWorkspaceMember`, `removeWorkspaceMember`, `assignWorkspaceMemberRole`                                                |
| US-08      | `listAssignableWarehouseRoles`, `assignWarehouseMembership`                                                               |
| US-08a     | `revokeWarehouseMembership`                                                                                               |
| US-09      | `transferWorkspaceOwner`                                                                                                  |
| US-10      | `renameWorkspace`, `readWorkspaceContext`                                                                                 |
| US-11      | `listWorkspaceRoles`, `listWorkspacePermissions`, `listWorkspaceMembers`, `listWorkspaceUsers`, `listWorkspaceWarehouses` |
| US-12      | — (release migration, no endpoint)                                                                                        |
| US-13      | `transferWarehouseManager`                                                                                                |

**Attribution note.** Twelve operations — the eight remaining `warehouse-access` ones and the four
`warehouse-users` ones — implement no §4 user story of _this_ spec. They belong to the approved
`access` and `users-management` features and appear here only because AC-03a re-shapes their paths.
That is intended, not a coverage hole; they are listed so `tasks` plans the re-path work and the
web migration together.

## Sequence gaps found — 3 (all raised upstream, none silently fixed)

### OQ-1 — Warehouse Manager transfer versus the archived classification — **RESOLVED 2026-08-12**

**Resolution:** [ADR 0003](../adr/0003-archived-tolerant-membership-edge-mutations.md) (Accepted) adds
the third classification — the archived-tolerant **membership-edge** mutation — and `sad.md` §8 now
admits it. `transferWarehouseManager` is its only member, so this contract's provisional
documentation of the operation is promoted to the accepted design **with no path change**. The
alternative (Workspace-guarding the handler) was rejected because US-13/AC-36 make the outgoing
Warehouse Manager the actor and a Warehouse Manager need not be a Workspace Member.

<sub>Original finding, retained for the record:</sub>

`sad.md` §6 "Flags raised while drawing these flows" already records this and does not resolve it:
AC-11 keeps the protected Warehouse Manager transfer available on an archived Warehouse, but §5
keeps it in `access` as a Warehouse-scoped **mutating** operation and §6.3 denies exactly that. §8's
coverage check admits no archived-tolerant mutation.

The contract documents `transferWarehouseManager` as archived-tolerant mutating so AC-11 holds, and
says so in the operation description. **This is provisional.** The alternative resolution — moving
the handler under the Workspace guard — changes the path from
`/api/v1/warehouses/{warehouseId}/access/manager-transfer` to a `/api/v1/workspace/...` route and
changes its declared vocabulary from `PermissionId` to `WorkspacePermissionId`.

- **Owner:** Tech Lead + Security Lead (as `sad.md` §6 assigns).
- **Due:** before `tasks`.

### OQ-2 — `sad.md` §8's handler classification admits no self-projection read — **RESOLVED 2026-08-12**

**Resolution:** `sad.md` §8 Authorization coverage now enumerates five classes, the fifth being the
**self-projection read** — membership-scoped, declaring no Permission — with
`GET /api/v1/workspace/context` and `GET /api/v1/warehouses/{warehouseId}/access/current` named as its
members. The classification route was taken rather than an exemption list, so the architecture check
verifies the class rather than skipping the handlers. No contract field or path changes.

<sub>Original finding, retained for the record:</sub>

§8 requires every user-accessible handler outside authentication to be one of: Workspace-Permission;
Warehouse-Permission **plus** a `warehouseId` route parameter; infrastructure-exempt; or
session-only-with-a-documented-membership-check — and states the §6.8 selection route is **the only
member** of that last class.

Two operations this contract needs fit none of those:

- `GET /api/v1/workspace/context` — session-only with **no** membership check at all. It must
  answer for a User who is no Workspace Member, because that empty projection is precisely how
  AC-30 makes the web omit every Workspace control and destination. Drawn in §6.10 without a
  Permission gate.
- `GET /api/v1/warehouses/{warehouseId}/access/current` — membership-only, declaring no Warehouse
  Permission. It is the Warehouse-scoped capability projection §6.3 resolves authority for; requiring
  a Permission to read one's own capabilities would be circular. The precedent exists in the
  implemented `GET /api/v1/access/current`, which is `SessionAuthGuard`-only today.

Neither is a defect in this contract — both are required by the ACs. The gap is that §8's
classification, which the automated architecture check implements, would fail them. Either the
classification gains an explicit fourth/fifth class ("self-projection read, membership-scoped") or
these two handlers join an exemption list with a documented reason.

- **Owner:** `design` (Tech Lead), with Security Lead review — the coverage check is a release gate.
- **Due:** before `tasks`.

### F-3 — §6.6a lumps two distinct causes into one branch with one message — **RESOLVED 2026-08-12**

**Resolution:** `sad.md` §6.6a "Add and remove a Workspace Member" now splits the branch in two —
"the candidate is already a Workspace Member" (`workspace.member_exists`) and "the chosen Workspace
Role is the protected Owner Role" (`workspace.owner_transfer_required`, AC-22) — each with its own
message. The contract is unchanged: one `409` with the two named examples it already carried.

<sub>Original finding, retained for the record:</sub>

In the "Add and remove a Workspace Member" flow, the branch
`else the candidate is already a Workspace Member, or the chosen Workspace Role is the protected
Owner Role` gives a single deny message — AC-22's "Workspace Owner changes only through the
protected transfer action". That message is correct for the second cause and wrong for the first: a
candidate who is already a Workspace Member has nothing to do with Owner transfer.

The contract resolves it by keeping one `409` response with two named examples,
`workspace.member_exists` and `workspace.owner_transfer_required`. The sequence should be split into
two branches so the intended message per cause is unambiguous.

- **Owner:** `sequences` (Tech Lead).
- **Due:** before `tasks` — cosmetic for the contract, load-bearing for the message the user sees.

## Contract-level findings

### F-1 — `sad.md` §7 lists no status codes, so all 40 are this stage's mapping

Expected: §7 explicitly says "the `api` stage owns exact paths, methods and status codes". Recorded
so review knows the status column is a proposal to check, not a restatement. Class mapping used
throughout: 400 malformed or rule-violating input · 401 no session · 403 authorization denial ·
404 non-enumerating unavailable target · 409 state or invariant conflict · 503 the operation could
not complete (state unchanged) · 500 unexpected.

### F-2 — the breaking surface is wider than `sad.md` §7 and §11 name — **RESOLVED 2026-08-12**

**Resolution:** `sad.md` §7 "HTTP and shared contracts" and the §11 risk row now both name the four
`/api/v1/users/*` handlers alongside `/api/v1/access/*`, together with their DTOs, contracts and RTK
Query endpoints. The blast radius `tasks` sized against is therefore the full one; the server half is
[T27](../tasks/reshape-users-rest.md) and the web half is [T40](../tasks/migrate-warehouse-scoped-web.md).

<sub>Original finding, retained for the record:</sub>

§7 says the re-shaping breaks "the existing `/api/v1/access/*` endpoints", and the §11 risk row says
the same. But `apps/server/src/users/rest/controllers/users.controller.ts` guards all four of its
handlers with `SessionAuthGuard, WarehouseAccessGuard` and Warehouse Permissions (`USERS:CREATE`,
`USERS:EMAIL_UPDATE`, `USERS:PASSWORD_CHANGE`, `USERS:DELETE`). Under AC-03a they cannot survive
either: each resolves the actor's single membership from the session with no Warehouse named.

The contract re-shapes them to `/api/v1/warehouses/{warehouseId}/users/...`. The finding is that
`sad.md` under-names the blast radius, so `tasks` sizing and the web migration plan would miss four
handlers, their DTOs, their contracts and their RTK Query endpoints.

- **Owner:** `design` (Tech Lead) — a one-line correction to §7 and the §11 risk row.
- **Due:** before `tasks`.

### F-4 — `spec.md` §8's open question is still open and is upstream of this contract

`spec.md` §8 records that the approved Access spec excludes multi-Warehouse membership and the
approved Users-management spec creates a User without a Workspace relation, both reversed here; it
was due **before `design`** and `sad.md` §11 restates it as due before `tasks`. This contract
proceeds under the stated default (raise a change request against each). `createWarehouseUser`'s
description records where the Workspace relation now comes from.

- **Owner:** Tech Lead (unchanged).
- **Due:** before `tasks`.

## Summary

| Check                                | Result                                                         |
| ------------------------------------ | -------------------------------------------------------------- |
| 1. Endpoint ↔ data-model (core)      | ✓                                                              |
| 2. Error code ↔ repo registry (core) | ✓ — one mismatch found and fixed; 22 new codes to add          |
| 3. Validation ↔ constraint (core)    | ✓ — two inexpressibles accepted, mirroring `data-model.md`     |
| 4. OpenAPI ↔ sequence (supporting)   | ✓ — every `alt`-branch has a response                          |
| Back-feed: AC → operation            | ✓ 57/57                                                        |
| Back-feed: operation → story + AC    | ✓ (12 operations attributed to the approved upstream features) |
| Back-feed: §6 branch → response      | ✓ — 3 upstream gaps raised as OQ-1, OQ-2, F-3                  |

All three core points pass, so the run did not pause. Five items were parked for their upstream
owners — **OQ-1**, **OQ-2**, **F-3**, **F-2**, **F-4** — every one of them owned by `design`,
`sequences` or the Tech Lead, and every one due **before `tasks`**. None of them changed a field or
a constraint in this contract.

**Status as of 2026-08-12 (task T28 / T29):**

| Item     | Status                                                                                                                             |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| **OQ-1** | Resolved — [ADR 0003](../adr/0003-archived-tolerant-membership-edge-mutations.md); `sad.md` §6 flag, §8. No path change.           |
| **OQ-2** | Resolved — `sad.md` §8 gains the self-projection read class. No path change.                                                       |
| **F-3**  | Resolved — `sad.md` §6.6a branch split into its two causes.                                                                        |
| **F-2**  | Resolved — `sad.md` §7 and the §11 risk row now name the four `users` handlers.                                                    |
| **F-4**  | Resolved by [T29](../tasks/record-spec-supersession.md) — both approved specs carry supersession notes and `spec.md` §8 is closed. |

## Linting

No OpenAPI linter is wired into this repository — `turbo.json` has no `lint:openapi` target and
`spectral` is not a dependency. Suggested, not applied:

```sh
pnpm dlx @stoplight/spectral-cli lint docs/features/workspaces/contracts/openapi.yaml
```

Structural verification actually performed on this file: YAML parses; `openapi: 3.1.0`; 29 paths;
35 operations; 49 schemas; all 70 `$ref` targets resolve; every `operationId` present and unique;
every operation declares a 401 except `signUp`, which is the one operation with `security: []`.

If `spectral` is adopted, add it to the repository's check target so the contract is linted with the
rest of the gate rather than by hand.
