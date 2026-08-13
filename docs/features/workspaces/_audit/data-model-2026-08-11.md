# Data-model audit — workspaces (2026-08-11)

Inputs read: [`spec.md`](../spec.md), [`sad.md`](../sad.md), [`CONTEXT.md`](../CONTEXT.md),
[ADR 0001](../adr/0001-two-level-request-authorization.md),
[ADR 0002](../adr/0002-parallel-workspace-authority-tables.md),
[`docs/system/server-architecture.md`](../../../system/server-architecture.md),
[`docs/features/access/data-model.md`](../../access/data-model.md), the three live migrations under
`apps/server/migrations/`, every entity in `apps/server/src/shared/domain/entities/`, and every
repository in `apps/server/src/shared/domain/repositories/`.

## Artifacts produced

- [`../data-model.md`](../data-model.md)
- [`../migrations/01-create-workspace-authority-schema.ts`](../migrations/01-create-workspace-authority-schema.ts)
- [`../migrations/02-add-workspace-relations.ts`](../migrations/02-add-workspace-relations.ts)
- [`../migrations/03-create-workspace-memberships.ts`](../migrations/03-create-workspace-memberships.ts)
- [`../migrations/04-rekey-warehouse-memberships.ts`](../migrations/04-rekey-warehouse-memberships.ts)
- [`../migrations/05-add-active-warehouse-selection.ts`](../migrations/05-add-active-warehouse-selection.ts)

Nothing was written to `apps/server/migrations/`. No existing migration was edited.

## System-rule conformance

PostgreSQL and TypeORM confirmed as the baseline; `synchronize` stays `false`; entities stay in
`shared/domain/entities/`, specialized repositories in `shared/domain/repositories/`; no
`BaseRepository`, no repository port, no feature-owned persistence adapter; no MongoDB/Mongoose
artifact introduced; no telemetry added. No feature proposal contradicted a system persistence rule,
so no stop condition was triggered.

## Conventions detected and followed

| Convention                                                                                                | Source evidence                                                              |
| --------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| Application-generated UUID primary keys, no database defaults                                             | `1753444800000-CreateAuthSchema`, `1785859200000-CreateAccessSchema`         |
| `created_at`/`updated_at` `timestamptz` with `CURRENT_TIMESTAMP` default, `updated_at` set by code        | all lifecycle tables; `RoleLifecycleRepository.updateCustomRole`             |
| Names stored as `text COLLATE "C"` with a non-empty-and-trimmed CHECK, length validated in code           | `chk_warehouses_name_stored_trimmed`, `chk_roles_name_stored_trimmed`        |
| Catalogue tables keyed by `VARCHAR(64)` identifier with an identifier-shape CHECK and `(id, kind)` unique | `permissions`, `chk_permissions_identifier`, `uq_permissions_id_kind`        |
| Classification carried into join tables by composite FK plus a CHECK that excludes reserved grants        | `role_permissions`, `chk_role_permissions_reserved_exclusive`                |
| Protected singleton expressed as a partial unique index                                                   | `uq_roles_one_manager_per_warehouse`, `uq_warehouse_memberships_one_manager` |
| `snake_case` DDL with `chk_`/`uq_`/`idx_`/`fk_` prefixes                                                  | all three live migrations                                                    |
| Reversible state as a nullable timestamp plus an ordering CHECK                                           | `sessions.revoked_at`, `chk_sessions_revocation_order`                       |
| `DEFERRABLE INITIALLY DEFERRED` where one transaction writes a mutually-referencing pair                  | `fk_accounts_user_id`, `fk_users_account_id`                                 |
| Catalogue extension as idempotent insert + `INSERT ... SELECT` grant with an explicit `down`              | `1786025100000-GrantUsersManagementPermissions`                              |
| `ON DELETE RESTRICT` by default, `CASCADE` only for grant rows owned by their Role                        | `fk_role_permissions_role` vs every other FK                                 |

Each was mirrored one level up rather than reinvented. `workspace_role_permissions` uses
`workspace_role_kind`/`workspace_permission_kind` rather than the shorter `role_kind`/`permission_kind`
of `role_permissions`, so that a column name never reads as belonging to the other level — the one
deliberate naming departure, consistent with ADR 0002's insistence that the two vocabularies stay
distinguishable.

## Decisions taken here that the SAD delegated

1. **Same-Workspace membership expressed as a schema guarantee.** `sad.md` §7 named "a composite
   reference through the Workspace relation" as the candidate shape and left it open. Adopted:
   `uq_users_id_workspace` on `users(id, workspace_id)` plus a denormalized `workspace_id` on both
   membership tables, so `workspace_memberships` and `warehouse_memberships` each carry two composite
   foreign keys. A cross-Workspace membership is unrepresentable rather than merely refused (AC-24).
   Cost: one redundant column per membership table.
2. **Sole Workspace Role per Member from the key, not from a constraint.** `workspace_memberships` is
   keyed by `user_id` alone. That is only sound because a User belongs to exactly one Workspace
   (`spec.md` §3); it is recorded in `data-model.md` so the reasoning is not lost if that non-goal is
   ever revisited.
3. **Archiving lock shape.** `sad.md` §6.5 draws "lock the Workspace's Warehouse rows and re-count"
   and explicitly delegates the lock shape. Specialized to locking the parent `workspaces` row
   first: it serializes concurrent archivings _and_ concurrent Warehouse creation, removing the
   phantom the row-set lock leaves open, at one row lock instead of one per Warehouse. This also
   establishes a single Workspace-level lock order that cannot form a cycle with the approved
   Warehouse-level order, because no Warehouse-level command takes a Workspace lock. Recorded as a
   specialization, not a deviation.
4. **Selection cleared by referential rule.** `sad.md` §6.6 requires the selection to be cleared
   "through the selection's referential rule". Implemented as
   `fk_users_active_warehouse (id, active_warehouse_id) → warehouse_memberships(user_id, warehouse_id)
ON DELETE SET NULL (active_warehouse_id)`.
5. **Registration write order.** `fk_users_workspace_id` is `DEFERRABLE INITIALLY DEFERRED`, so
   `RegisterCommand` need not be reordered to insert the Workspace before the User. Without this,
   `sad.md` §6.1's stated order (Account, User, Session, _then_ Workspace) would violate the new
   non-null relation. Flagged because it is a real constraint on the implementation that the SAD's
   flow does not make visible.

## Deviations

- **Raw SQL for one constraint** (`05-add-active-warehouse-selection.ts`). TypeORM's `OnDeleteType`
  union has no column-list form, so `ON DELETE SET NULL (active_warehouse_id)` cannot be expressed
  through `TableForeignKey`. Raw `queryRunner.query` is precedented by
  `1786025100000-GrantUsersManagementPermissions`. Requires PostgreSQL ≥ 15; `docker-compose.yml`
  pins `postgres:17-alpine`, so the floor is met. Without the column list PostgreSQL would attempt to
  null `users.id`.
- **No other deviation from `docs/system` is proposed.**

## Drift between the documented model, entities and live migrations

All of the following is drift this feature _creates_ and implementation must close. None of it is
pre-existing drift between the current entities and the current schema — those were verified
consistent.

| #   | Location                                                                | Drift                                                                                                                                | Severity                                                                                                                                                                                  |
| --- | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `AccessCurrentUserRepository` (3 methods)                               | Every membership lookup is `findOneBy({ userId })`. After the key change that matches an arbitrary one of the member's memberships.  | **Highest.** It still compiles and still returns a row, so nothing fails loudly — it silently authorizes against the wrong Warehouse, defeating AC-05. Must take `(userId, warehouseId)`. |
| 2   | `WarehouseMembershipEntity`                                             | `@PrimaryColumn user_id` only; no `workspaceId`.                                                                                     | High — must become a composite primary key with a `workspaceId` column.                                                                                                                   |
| 3   | `UserEntity`                                                            | No `workspaceId`, no `activeWarehouseId`.                                                                                            | High — `workspace_id` is non-null, so an insert through the current entity fails.                                                                                                         |
| 4   | `WarehouseEntity`                                                       | No `workspaceId`, no `archivedAt`.                                                                                                   | High — same reason.                                                                                                                                                                       |
| 5   | `AccessProvisioningRepository.provisionInitialAccess`                   | Inserts the `warehouses` row and a membership without `workspace_id`.                                                                | High — Warehouse-row creation moves to `workspaces` per `sad.md` §5; the membership insert must carry `workspace_id`.                                                                     |
| 6   | `MemberLifecycleRepository.insertMembership`, `RoleLifecycleRepository` | Membership inserts omit `workspace_id`; reads and updates already scope by `(warehouseId, userId)` and stay correct.                 | Medium — insert paths only.                                                                                                                                                               |
| 7   | `ManagerTransferRepository`                                             | `lockMembers`/`assignRole` already scope by `warehouseId`; no change needed beyond entity typing.                                    | None — verified compatible.                                                                                                                                                               |
| 8   | Five entities that do not exist yet                                     | `WorkspaceEntity`, `WorkspacePermissionEntity`, `WorkspaceRoleEntity`, `WorkspaceRolePermissionEntity`, `WorkspaceMembershipEntity`. | Expected new work.                                                                                                                                                                        |
| 9   | [`docs/features/access/data-model.md`](../../access/data-model.md)      | Documents `warehouse_memberships.user_id` as the sole primary key and "exactly zero or one membership per User".                     | Documentation drift — belongs to the Access change request already tracked in `spec.md` §8, not to this stage.                                                                            |

No live database was introspected; repository and migration evidence was sufficient.

## Destructive-change sequencing

One destructive change: the `warehouse_memberships` primary key swap, plus the two plain foreign keys
it replaces. Expand/backfill/contract is **not** used, and that is a deliberate, authorized choice
rather than an oversight — `spec.md` §1 (fourth boundary) and §3 state that no deployment carries data
that must survive, and `sad.md` §7 records the rebuild procedure.

The safety mechanism substituted for backfill is an explicit assertion: `02` and `04` count rows and
throw a message naming the rollback-and-replay procedure if any table is non-empty. `04.down` asserts
too, because a set of multi-Warehouse memberships cannot be re-keyed by User alone.

**The honest limit:** these migrations are reversible as schema, not as data. Once real Workspaces
exist, any later change to these shapes needs expand/backfill/contract. This is stated in
`data-model.md` so it is not rediscovered later.

Ordering is dependency-forced: `02` before `03`/`04` (both reference `users(id, workspace_id)`),
`04` before `05` (the selection references the new membership key). Reverting runs in reverse, which
is required — `05`'s constraint depends on the key `04.down` drops.

## Validation performed

- **Migration syntax and types:** all five files type-check clean under
  `tsc --noEmit --strict` against the server package's TypeORM (`TSC_EXIT:0`). Every class implements
  `MigrationInterface` with both `up` and `down`.
- **Reversibility:** every `up` step has a matching `down` step in reverse order — read by inspection,
  file by file. Not executed against a database; per `apps/server/AGENTS.md` migrations are not
  unit-tested and are verified by applying and reverting them against the real development database.
  **That apply/revert run has not happened and is outstanding.**
- **Foreign-key indexing:** every new foreign key's leading column is covered by a primary key,
  unique constraint, or an index listed in `data-model.md` §Indexes. Checked individually.
- **Index justification:** every index in the table names a concrete serving query from a `sad.md` §6
  flow or a `spec.md` acceptance criterion. No speculative index was added.
- **Mermaid:** `mmdc` is not installed in this repository, so the fallback path in
  `_shared/mermaid-check.md` ran — a scripted structural check of the single `erDiagram` block:
  one diagram declaration, balanced braces and quotes once cardinality tokens are stripped, 11 unique
  entity blocks, 15 relationships all using valid cardinality tokens, every referenced entity defined,
  every attribute line matching `type name [KEY[,KEY]] ["comment"]`, and no unresolved placeholder.
  **PASS.** Visual rendering was not verified.
- **Transaction requirements:** no step needs to run outside a migration transaction. All tables are
  empty (new, or empty by the release precondition), so `CREATE INDEX CONCURRENTLY` is unnecessary.
- **PII:** the only seeded rows are the 16 system Workspace Permission identifiers and labels. No
  personal or real-looking data appears in any migration; fixtures are directed to
  `apps/server/src/test/factories` with `example.test` identities.

## Unresolved decisions and gates

1. **`spec.md` §8, question 1 — still open, and it was due before `design`.** The approved Access
   spec excludes multi-Warehouse membership and the approved Users-management spec creates a User
   without a Workspace relation; both are reversed here. `sad.md` §11 requires resolution before
   `tasks`. This stage proceeded under the recorded default (a change request against each). Drift
   row 9 is the data-model-visible part of it. Owner: Tech Lead.
2. **`sad.md` §6 flag — AC-11 versus the read/mutating classification.** Whether the protected
   Warehouse Manager transfer over an archived Warehouse is Warehouse-guarded with a third
   "archived-tolerant mutation" classification or moves behind the Workspace guard. Unresolved, and
   deliberately not resolved here: it changes no table, column, constraint or index. `warehouses.archived_at`
   serves either outcome. Owner: Tech Lead + Security Lead, before `tasks`.
3. **`spec.md` §8, question 2 — presentation of the selection fallback.** No schema impact; the
   effective-selection derivation is a read-time computation over rows this model already provides.
   Owner: PM + Frontend Lead, at `design-ui`.
4. **Immutability of `users.workspace_id` is assumed, not enforced.** The denormalized `workspace_id`
   on both membership tables is only consistent because a User never changes Workspace (`spec.md` §3
   non-goal). The composite foreign keys default to `ON UPDATE NO ACTION`, so an attempted change on a
   User who holds any membership is rejected by the database — the desired behaviour, reached by
   default rather than by an explicit declaration. Worth an explicit test rather than a comment.
5. **Migration timestamps.** The staged files carry placeholder ordinals and class-name timestamps in
   the `1786550400000`–`1786550800000` range. `tasks` assigns real timestamps when promoting them to
   `apps/server/migrations/`, preserving relative order.
6. **`apps/server/migrations/README.md`** should gain the rollback-and-replay procedure alongside this
   change, per `sad.md` §11. Not done here — it is a live-tree edit outside this stage's scope.

## Definition of done

- [x] The model links to and conforms with system persistence architecture.
- [x] Every schema change has a staged TypeORM migration with reversible `up`/`down`.
- [x] Runtime synchronization never enabled; no MongoDB/Mongoose artifact introduced.
- [x] Drift and safety checks reported with evidence.
- [ ] Migrations applied and reverted against the development database — outstanding, see Validation.
