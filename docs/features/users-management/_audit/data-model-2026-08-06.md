# Data-model audit — users-management — 2026-08-06

## Inputs read

- `docs/features/users-management/spec.md` (Approved), `sad.md` (Approved), `adr/0001-shared-credential-rules-for-member-lifecycle.md` (Accepted).
- `docs/system/server-architecture.md`, `docs/system/architecture-map.md`,
  `docs/system/guides/creating-a-server-repository.md`.
- Existing entities: `account.entity.ts`, `user.entity.ts`, `session.entity.ts`, `role.entity.ts`,
  `permission.entity.ts`, `role-permission.entity.ts`, `warehouse-membership.entity.ts`,
  `warehouse.entity.ts`.
- Existing migrations: `1753444800000-CreateAuthSchema.ts`, `1785859200000-CreateAccessSchema.ts`.
- Existing repositories: `authentication.repository.ts`, `role-lifecycle.repository.ts`,
  `access-current-user.repository.ts`, `access-read.repository.ts`,
  `access-provisioning.repository.ts`, `manager-transfer.repository.ts`.
- Existing commands: `register.command.ts`, `transfer-warehouse-manager.command.ts`,
  `delete-role.command.ts`, `assign-member-role.command.ts`,
  `provision-initial-access.command.ts`.

## Staged migration

- `migrations/01-grant-users-management-permissions.ts` — additive `permissions` catalogue insert
  (3 rows) + idempotent `role_permissions` grant to every existing `warehouse_manager` Role (4
  permission IDs, `NOT EXISTS`-guarded). Reversible: `down` removes only the 3 new permission rows
  and their grants, leaving `USERS:CREATE`'s pre-existing grants untouched.
- No table, column, or index migration — confirmed against every read/write path this feature's
  `sad.md` §6 flows require. See `data-model.md`'s Indexes section for the full existing-index
  coverage check.

## Detected conventions followed

- PK type: UUID, app-generated via `crypto.randomUUID()` (`authRuntime.identityId`), not UUID v7 —
  the template's "UUID v7" is illustrative only; this repo's actual convention is v4.
  `MemberLifecycleRepository`/`AuthenticationRepository` extensions follow the same generation
  point (the calling command generates IDs, repositories only persist them).
- Repository shape: no `BaseRepository`, no repository interfaces/ports — confirmed against every
  existing repository under `shared/domain/repositories/`, matching `server-architecture.md`
  (canonical) over the stale "every new repository must extend `BaseRepository<TEntity>`" line in
  `apps/server/AGENTS.md`, which contradicts the actual, current codebase and the durable system
  doc the data-model skill treats as authoritative.
- Pessimistic locking: `SELECT ... FOR UPDATE` via `createQueryBuilder(...).setLock('pessimistic_write')`,
  exactly as `RoleLifecycleRepository.lockCustomRole`/`ManagerTransferRepository.lockMembers`
  already do. `MemberLifecycleRepository.lockMembership` reuses this shape; creation reuses the
  existing `RoleLifecycleRepository.lockCustomRole` rather than adding a duplicate lock method.
- Bulk/session revocation shape: `UPDATE ... SET revoked_at = :at WHERE account_id = :accountId AND
revoked_at IS NULL`, sibling to the existing single-digest `revokeSessionByDigest`.
- Permission-catalogue seeding shape: `INSERT INTO permissions (...)` matching
  `chk_permissions_identifier`/`chk_permissions_kind`, then grant rows into `role_permissions`,
  exactly as `1785859200000-CreateAccessSchema.ts` established for the original catalogue.

## Drift / gaps found (and how this stage resolved them)

1. **`sad.md` §6.4 narrative vs. an existing, non-deferrable FK.** The deletion flow's prose says
   "revoke every Session for the target's Account, delete the Warehouse Membership row, delete the
   target's Account+User pair." Taken literally, this cannot work: `fk_sessions_account_id`
   (`sessions.account_id → accounts.id`) is `ON DELETE RESTRICT`, not deferrable, and is checked
   immediately per-statement — a merely-revoked (row-retained) Session blocks the subsequent
   `accounts` delete. This constraint already existed in the auth schema; it was never previously
   exercised because no feature has deleted an Account before this one.
   **Resolution:** documented in `data-model.md` under "Deletion sequencing" — deletion hard-deletes
   `sessions` rows (not merely revokes them) before deleting `accounts`, in an order that also
   respects the immediate `fk_warehouse_memberships_user_id` RESTRICT and relies on the existing
   `INITIALLY DEFERRED` `accounts`/`users` FK pair for the final two deletes. No schema change; this
   is a repository-method behavior clarification, not a contradiction of `sad.md`'s intent (AC-08's
   "ends any of the target's existing sessions" is still satisfied — deletion is a strictly stronger
   guarantee than revocation).
2. **`sad.md` §7 vs. §11 tension on the Members-list read path.** §7 states the feature "does not
   change that read path"; §11's risk table asks data-model/api to confirm whether
   `GET /access/members` must be extended to return email, since the approved design handoff needs
   it to render/label rows. **Resolution:** resolved in favor of §11 — the read needs an `email`
   field, requires no schema change (`accounts.normalized_email` already stores it, and
   `accounts.user_id` is already indexed via `uq_accounts_user_id` for the join), and is an
   `access`-owned query change (`AccessReadRepository.listMembersAndAssignments`), not new `users`
   persistence. Flagged under "Non-schema follow-ups" for `tasks`/`api` to route to the right owner.
3. **Not drift, but a forward-looking gap `sad.md` doesn't call out:** the migration only backfills
   Permission grants for Warehouses that exist _before_ this feature ships. `ProvisionInitialAccessCommand
.MANAGER_PERMISSION_IDS` (a hardcoded const, not catalogue-driven) must also gain the three new
   IDs, or every Warehouse registered after this feature ships would silently lack them — reopening
   AC-17. Flagged under "Non-schema follow-ups."
4. **`packages/shared-types/permission-id.ts` parity:** the migration inserts exact string IDs
   (`USERS:EMAIL_UPDATE`, `USERS:PASSWORD_CHANGE`, `USERS:DELETE`) that the `PermissionId` const
   must mirror byte-for-byte once `access`/`users` code references them via
   `@RequiredPermission(PermissionId.USERS_EMAIL_UPDATE)` etc. Flagged, not this stage's file to
   edit (no schema impact).

No entity, column, type, nullability, relation, constraint, or index mismatch was found between
`sad.md`, the existing TypeORM entities, and the existing migrations — the schema this feature reads
and writes is already fully present and correctly shaped for every operation `sad.md` §6 describes,
aside from the two gaps above (both resolved without a schema change).

## Destructive-change sequencing

None. The staged migration is purely additive (new catalogue rows, new grant rows via `NOT EXISTS`).
No column is added as non-null to an existing populated table; no expand/backfill/contract sequence
is needed. `down` is a clean, non-destructive-to-pre-existing-data reversal (see above).

## Unresolved decisions carried forward

- `spec.md` §8's dormant `USERS:UPDATE` Permission question — left dormant per its default; the
  staged migration does not touch it.
- Whether a future module's foreign reference to a deleted Warehouse Member's identifier should
  block or survive deletion — `spec.md` §8 default (no such module exists yet) still holds; nothing
  in this schema pre-empts that future module's own FK choice.

## Validation performed

- Mermaid `erDiagram` rendered via `npx @mermaid-js/mermaid-cli` (`mmdc`) — one diagram block,
  balanced delimiters, all referenced entities declared, no unresolved placeholders. First pass
  failed: underscore-joined composite keys (`PK_FK`, `FK_UK`) are not valid `erDiagram` attribute-key
  tokens, and a quoted key cannot be followed by a quoted comment on the same attribute line. Fixed
  to comma-separated quoted keys (`"PK, FK"`, `"FK, UK"`) with no trailing comment on those two
  lines; re-rendered cleanly to SVG with no errors.
- Migration class reviewed for: reversible `up`/`down`, no `BaseRepository`/raw-query use inside a
  `shared/domain/repositories/*.repository.ts` file (N/A — migrations aren't scanned by
  `repository-boundaries.spec.ts`, and it's not a repository file), correct FK/constraint parity
  with the existing `permissions`/`role_permissions` shape. Not yet applied/reverted against a live
  database — that verification happens once this migration is copied into the live
  `apps/server/migrations/` tree during `implement`, per `apps/server/AGENTS.md`'s "verify
  migrations by applying and reverting them against the real development database."
