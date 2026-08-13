---
status: Accepted
owner: 'Tech Lead'
reviewers: ['Security Lead', 'Backend Lead']
updated_at: '2026-08-11'
feature_size: 'L'
ticket: ''
---

# 0002 — Parallel Workspace authority relations instead of scoping the Warehouse ones

## Context

The approved Access model persists Warehouse authority in four relations created by
`apps/server/migrations/1785859200000-CreateAccessSchema.ts`: `permissions` (a system catalogue with an
`assignable | reserved` kind), `roles` (per Warehouse, with a `custom | warehouse_manager` kind),
`role_permissions`, and `warehouse_memberships`. Several approved invariants are enforced _in the schema_
rather than only in code: a composite foreign key ties a membership's `role_id` to its `warehouse_id` and
`role_kind`, a partial uniqueness constraint gives each Warehouse exactly one Warehouse Manager, Role
names are unique per Warehouse under the `C` collation, and `uq_permissions_id_kind` lets
`role_permissions` reference a Permission's kind so a reserved Permission cannot land in a custom Role.

This feature adds a second authority level with the same internal shape one level up: a system-managed
Workspace Permission catalogue with an assignable/reserved classification, custom Workspace Roles plus one
protected Workspace Owner Role per Workspace, Workspace Role-Permission membership, and exactly one
Workspace Role per Workspace Member (`spec.md` AC-14 – AC-22, AC-26 – AC-28, AC-35). The structural
similarity is close enough that reusing the existing relations with a scope discriminator is a real
option, and cheaper on paper.

The decision determines the shape of every authorization read at both levels, every constraint that
backstops concurrency, the type of every Permission identifier crossing `packages/shared-types` into both
applications, and the migration path. Changing it after Warehouse-scoped stock, Locations and movement
history reference these relations would mean rewriting the schema that authorizes all of them. It affects
`workspaces`, `access`, `users`, both guards, contracts and the web. It therefore passes the feature ADR
blast-radius gate.

## Decision drivers

- Every approved Warehouse constraint above must keep its current strength; none may be relaxed to make
  room for a second scope.
- The Workspace Permission catalogue is a _different vocabulary_, not more values of the same one
  (`spec.md` §1: `WORKSPACE_OWNER_ROLE:REASSIGN` is reserved at the Workspace level; the Warehouse level
  has its own reserved `WAREHOUSE_MANAGER_ROLE:REASSIGN`).
- [ADR 0001](./0001-two-level-request-authorization.md) makes level confusion a compile error by keeping
  `PermissionId` and `WorkspacePermissionId` distinct types; the persistence shape should not undermine
  that.
- Each guard read must stay a point lookup plus one bounded read, independent of the other level's data
  volume (`spec.md` §6).
- AC-35 requires a release migration to extend one catalogue and grant to every protected Role of that
  level, without touching custom Roles or the other level.
- `data-model` must be able to express "a Workspace Role assignment never crosses a Workspace" and
  "exactly one Owner per Workspace" as constraints, mirroring how the Warehouse level already does it.
- Specialized repositories are shaped around cohesive operations and stay feature-agnostic
  ([creating a server repository](../../../system/guides/creating-a-server-repository.md)); neither option
  is favoured by that rule.

## Considered options

1. **Parallel relations.** New `workspaces`, `workspace_permissions`, `workspace_roles`,
   `workspace_role_permissions`, `workspace_memberships`, mirroring the approved Warehouse shapes with a
   `custom | workspace_owner` Role kind and their own catalogue. The existing four relations keep their
   current meaning unchanged.
2. **Scope discriminator on the existing relations.** Add `scope ('workspace' | 'warehouse')` to
   `permissions`, `roles` and `role_permissions`, make `roles.warehouse_id` nullable with a new
   `workspace_id`, and add a Workspace membership either as a nullable-Warehouse row in
   `warehouse_memberships` or as one new table.
3. **Polymorphic owner columns.** One `roles` table with a nullable `warehouse_id` and nullable
   `workspace_id` plus a check that exactly one is set, and one `permissions` table whose rows are
   classified by identifier prefix rather than by a column.

## Decision outcome

Chosen: **option 1 — parallel Workspace relations.**

Option 3 is rejected first: classifying a Permission's level by parsing its identifier prefix puts a
security-relevant distinction in a string convention, and nullable-owner columns turn every existing
foreign key and uniqueness constraint into a conditional one.

Option 2 is the substantive alternative and is rejected on constraint strength and blast radius, not on
aesthetics. Making `roles.warehouse_id` nullable weakens the composite foreign key
`fk_warehouse_memberships_role (role_id, warehouse_id, role_kind)` that currently makes a
cross-Warehouse Role assignment unrepresentable — the approved same-Warehouse invariant would degrade from
a schema guarantee to a code guarantee for the benefit of an unrelated level. The partial uniqueness that
gives each Warehouse exactly one Manager, and the per-Warehouse Role-name uniqueness, would both need a
scope predicate added, meaning every already-reviewed Warehouse constraint is re-opened by a change that
is supposed to be additive. `uq_permissions_id_kind` would have to become scope-aware for
`role_permissions` to keep rejecting reserved Permissions in custom Roles. And the two catalogues would
share one table while being two vocabularies, which invites exactly the query that reads both — the
persistence-level version of the level confusion ADR 0001 spends a type distinction to prevent.

Option 1 keeps the approved Warehouse schema untouched, so no constraint is re-reviewed and no Warehouse
guarantee is weakened by a Workspace change. Each guard reads only its own level's relations, so neither
level's row volume affects the other's authorization latency. AC-35's catalogue migration targets one
catalogue and one protected Role kind, mirroring the existing
`1786025100000-GrantUsersManagementPermissions` migration exactly, including its idempotent insert and its
`down`. `workspace_memberships` can carry its own partial uniqueness for the sole Owner and its own
composite reference tying a Workspace Role assignment to the Workspace, in the same style the Warehouse
level already proves works. And the persistence split matches the type split in `packages/shared-types`,
so a Workspace Permission identifier cannot be typed, stored, or read as a Warehouse one.

The accepted cost is duplication: two catalogues, two Role tables, two membership tables, two sets of
similarly shaped repository operations and migrations. This design treats that duplication as the price
of two independently-constrained authority levels, consistent with `spec.md` §1's insistence that the two
levels are separate and neither substitutes for the other.

Cross-level relations that this option does add: `warehouses.workspace_id` and `users.workspace_id`, both
non-null, which are the aggregation and membership-Workspace facts the specification requires. They are
plain references and do not scope any authority relation.

## Consequences

### Positive

- Every approved Warehouse constraint keeps its current strength; no already-reviewed migration is
  re-opened.
- "A Workspace Role assignment never crosses a Workspace" and "exactly one Owner per Workspace" are
  expressible as constraints in the same proven style as their Warehouse counterparts.
- The two catalogues cannot be read or written as one, at the type level and at the schema level.
- Each guard's read touches only its own level's relations, keeping both p95 targets independent.
- AC-35 catalogue releases follow the existing migration pattern with no change of technique.

### Negative

- Five new relations and a similarly shaped set of repository operations and migrations duplicate the
  Warehouse level's structure; a bug fixed in one level's lifecycle logic must be considered for the
  other.
- A future third level would duplicate again; that is the point at which generalization should be
  reconsidered, with the constraint-strength question re-asked.
- Two Role-name-uniqueness implementations must keep the same collation and case-sensitivity semantics in
  step, verified by tests rather than by sharing one definition.

### Neutral

- The name value object and name rules are shared rather than duplicated: Workspace and Warehouse names
  follow the same approved rules, with Workspace additionally allowing the unset state.
- `warehouse_memberships` still changes in this release (its key becomes (User, Warehouse)), but that is
  required by multi-Warehouse membership itself, not by this decision.
- Exact columns, constraint names, partial-uniqueness predicates, indexes and migration order remain
  `data-model`'s to fix.

## Links

- [`spec.md`](../spec.md) AC-14 – AC-22, AC-26 – AC-28, AC-35, §1
- [`sad.md`](../sad.md) §4, §5, §7
- [ADR 0001](./0001-two-level-request-authorization.md) — the guards and vocabularies that read these relations
- [PostgreSQL persistence with TypeORM](../../../system/adr/21-07-2026-postgresql-with-typeorm.md)
- [Creating a server repository](../../../system/guides/creating-a-server-repository.md)
- `apps/server/migrations/1785859200000-CreateAccessSchema.ts` — the Warehouse-level constraints preserved here
- `apps/server/migrations/1786025100000-GrantUsersManagementPermissions.ts` — the catalogue-extension pattern AC-35 mirrors
