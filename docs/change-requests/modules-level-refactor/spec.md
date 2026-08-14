---
kind: change-request
status: Draft
owner: 'YuriiH'
reviewers: ['Tech Lead']
updated_at: '2026-08-14'
feature_size: 'L'
change_record: './change.md'
---

# Change-request specification — modules-level-refactor

## 1. Context

Code for a domain entity currently lands in the module of the entity that **contains** it rather than
the entity that **owns** it. Warehouse administration and both scopes of Access all live inside
`workspace`/`workspaces` on both applications, `apps/web/src/modules/warehouse/` is a four-file stub,
and `apps/server/src/` has no `warehouses` module at all. Nothing in `docs/system` forbids this, so
the pattern is stable and spreading: Warehouse is about to own Locations, crates, pallets and
picking.

This request makes ownership explicit in the source layout and states it as a checkable rule in
`docs/system`. It changes **no user-observable behavior** — see §5.1, which is unusually large here
because behavior preservation is the substance of the acceptance contract, not a side condition.
[`change.md` §1.1](./change.md#11-why-change-request-and-not-decide-adr) records why this is filed as
a change request rather than an ADR.

Each acceptance criterion below links to its override row in
[`change.md` §3](./change.md#3-override-map).

**Actors.** The primary actor is a **contributor** — a person or coding agent adding or extending
functionality, reading `docs/system` first as `AGENTS.md` requires. CR-US-04's actor is a **reviewer**
of this change. Neither is one of the canonical domain roles (Workspace Owner, Workspace Member,
Warehouse Manager, Warehouse Member): no domain role can observe this change, which is precisely why
every domain-role behavior appears in §5.1 as a regression boundary rather than in §5 as a changed
criterion.

**Two terms carry the whole contract** and are defined in
[`change.md` §2.1](./change.md#21-terms-fixed-by-this-request):

- **Public surface** of a web module — an **enumerated per-module export list**, declared as data the
  boundary spec reads, not a category inferred per file. It contains that module's page-level views
  plus any other export the application is entitled to reach; `modules/auth/store/` is a declared
  entry, not a special case. The public surface of a server module is the providers its
  `usecase.module.ts` exports. Imports are legal against a module's declared surface and illegal
  against anything else. A **declared surface entry is not an exception** — it is the rule's input;
  an exception is an import permitted _despite_ violating the rule, and this request has none.
- **Composition layer** (web) — `shared/`, `guards/`, `routes/`, `router.ts`, `store/`, `test/`. It
  is not a module and owns no domain, but it is **bound by the same rule**: it may import a module
  only through that module's declared surface. It differs from a module in what it may import
  (any module's surface, rather than only a sibling's), not in whether the rule applies to it.
  [`change.md` §2.2](./change.md#22-why-the-composition-layer-imports-module-surfaces) records why
  its files nonetheless stay where they are.

## 2. Goals

- A contributor can name the module that owns a piece of functionality from the domain entity alone,
  without reading the code that surrounds it.
- Warehouse owns its own module in both applications, so the entities it is about to own (Locations,
  crates, pallets, picking) attach to a module that exists.
- Access is one module carrying both of its scopes, so a workspace-scoped and a warehouse-scoped role
  editor are two files in one module rather than two modules with near-duplicate implementations.
- The ownership rule survives this change: it is written into the three web/server module guides and
  one ADR, and enforced by executable boundary specs in both applications rather than by review
  memory.
- Adding functionality to an existing entity extends that entity's module; only a new domain entity
  creates a new module, and it is created as a flat sibling.

## 3. Non-goals

- **Changing any product behavior.** No screen, route, permission, invariant, message or stored value
  changes. Every one of these is a regression boundary in §5.1.
- **Changing URLs to match modules.** `@Controller` prefixes stay byte-identical while their
  controllers change module. Source layout and URL layout are deliberately decoupled
  ([`change.md` §5](./change.md#5-compatibility-and-transition)); realigning them is a separate,
  genuinely breaking change request.
- **Moving authorization enforcement into `access`.** Guards, principal shapes, denial errors and
  permission decorators stay in `shared/` — CR-RG-06. `access` owns role/permission/membership
  _management_; `shared/` owns _enforcement_.
- **Moving anything out of the web composition layer.** `WarehouseSwitcher`, `WarehouseLayout`,
  `Sidebar`, `RootLayout`, `shared/api/warehouse-path.ts`, `shared/hooks/useEnteredWarehouse.ts`,
  `shared/api/access-permissions-api.ts`, `shared/api/workspace-context-api.ts` and
  `guards/warehouse-entry.guard.ts` all stay exactly where they are — CR-RG-07. An earlier draft
  proposed moving four of them; the fourteen consumers outside `modules/` refuted it
  ([`change.md` §2.2](./change.md#22-why-the-composition-layer-imports-module-surfaces)).
- **Moving `set-active-warehouse` out of `workspaces`.** It writes `users.active_warehouse_id` and is
  served by `GET /workspace/context` — the member's position within a Workspace, not the Warehouse
  record (CH-S4).
- **Folding `src/users/` into `access`, renaming modules for singular/plural symmetry, or moving
  `packages/contracts` subpaths.** Carried as [`change.md` §9](./change.md#9-open-questions)
  questions with a default of "no".
- **Adding an import-boundary ESLint plugin.** Boundaries stay enforced by the static-source-scan
  spec pattern the server already uses successfully.

## 4. Changed user stories

### CR-US-01: Find the module that owns an entity

**As a** contributor
**I want** each domain entity to own exactly one top-level module in each application
**So that** I can locate and extend Warehouse behavior without discovering it inside the workspace
module, and so the entities Warehouse is about to own have a place to attach to

### CR-US-02: Extend one module for a capability used at several scopes

**As a** contributor adding workspace-level or warehouse-level access behavior
**I want** both scopes of Access to live in the access module, with the scope in the file and symbol
names
**So that** I extend one implementation instead of choosing between two near-duplicates, and a fix to
role editing does not need applying twice

### CR-US-03: Know the rule before I place a file

**As a** contributor or coding agent reading `docs/system` before implementing
**I want** module ownership, the extend-versus-create rule, the flat-module rule and the permitted
cross-module dependencies stated consistently across the module guides and one ADR
**So that** the next feature is placed correctly by default rather than by review correction, and no
two canonical documents tell me opposite things

### CR-US-04: Trust that nothing moved but the files

**As a** reviewer of this change
**I want** every route, permission, screen and message provably identical before and after
**So that** I can approve a 150-file diff by verifying its boundaries rather than re-reviewing every
behavior the repository already accepted

## 5. Acceptance criteria

### CR-AC-01 (CR-US-01, CH-W1, CH-W4) — structure

**Given** the Warehouse domain in `apps/web`
**When** the module layout is inspected
**Then** `apps/web/src/modules/warehouse/` contains the warehouse administration components, the
warehouse API slice, the warehouse hooks and `warehouse-name-form.schema.ts`
**And** no file under `apps/web/src/modules/workspace/` **enforces a Warehouse rule** — the decision
test is §2.1's owning-module test (whose invariants does this file enforce?), not which domain nouns
it mentions; a file with consumers in two domains is not a Warehouse file and is placed by CH-W3
**And** a `warehouse` i18n namespace exists in `src/i18n.ts` with
`public/locales/{en,uk}/warehouse.json` carrying today's `workspace.json#warehouses` block at
identical values, **still nested under a `warehouses` key** — the block is not hoisted to the file
root, so only the namespace argument changes and every key path (`t('warehouses.add.trigger')`)
stays byte-identical, per CR-RG-04
**And** `src/test/setup.ts` registers the new namespace alongside the existing ten in both languages
— an addition CR-RG-07 explicitly permits, without which no moved component's spec can resolve a
string.

### CR-AC-02 (CR-US-02, CH-W2, CH-W4) — structure

**Given** the Access capability in `apps/web`
**When** the module layout is inspected
**Then** `apps/web/src/modules/access/` contains both scopes: the existing warehouse-scoped
`AccessWorkspace` surface **and** the workspace-scoped roles, members and permissions components,
their API slices, their hooks and their schema
**And** no file under `apps/web/src/modules/workspace/` enforces an Access role, permission, member
or membership rule, under the same decision test as CR-AC-01
**And** each file's scope is expressed in its name (`WorkspaceRolesTab`, `RolesTab`), not in a
directory that constitutes a second module
**And** `public/locales/{en,uk}/access.json` carries today's `workspace.json` `workspaceRoles`,
`members` and `permissions` blocks under **scope-named parents** — `workspaceRoles`,
`workspaceMembers`, `workspacePermissions` — at identical values. Scope-naming is forced, not
cosmetic: `access.json` already holds its own top-level `roles`, `members` and `permissions` blocks
for the warehouse scope, so merging under the incoming names would overwrite one scope's values and
breach CR-RG-04. The `t()` key paths in the moved files change with the parent, which CR-RG-04
permits only under this condition and only with every value byte-identical.

### CR-AC-03 (CR-US-01, CH-W3) — structure

**Given** `apps/web/src/modules/workspace/` after CR-AC-01 and CR-AC-02
**When** its contents are inspected
**Then** every remaining file is one of: the `/workspace` route and page, the administration shell
and its spec, `NameWorkspace{Action,Dialog}.tsx`, `schemas/name-workspace-form.schema.ts`, or
`useRenameWorkspace` — and no file remains that CH-W1, CH-W2 or CH-W3 does not name a destination for
**And** `WorkspaceAdministration.tsx` renders the same four tabs, in the same order, under the same
gating predicates, by importing `WarehousesTab` from `modules/warehouse` and the three workspace
access tabs from `modules/access`
**And** the multi-consumer files (`useFormFieldErrors`, `useReturnFocusOnClose`, `MutationOutcome`,
the mutation adapter, the feedback adapter, the permission-label hook) are each at a location
CH-W3 or [`change.md` §9.1](./change.md#9-open-questions) assigns — **none of those six** remains in
`modules/workspace`, which is compatible with the retained files this criterion enumerates above
**And** `workspace-users-api.ts` is at `shared/api/`, not in `modules/access`: it is read by
workspace-member add **and** by three warehouse-domain consumers
(`workspace-warehouses-api.ts:8`, `GiveWarehouseAccessDialog.tsx:5`, `WarehousesTab.tsx:7`), so
placing it in `access` would make three `modules/warehouse` files import an `access` API slice, which
CR-AC-04 forbids.

### CR-AC-04 (CR-US-01, CR-US-02, CH-W3, CH-W5, CH-D3) — boundary

**Given** any file under `apps/web/src/` that imports from `modules/` — whether it is itself in a
module or in the composition layer
**When** its imports are analyzed
**Then** the import resolves only to the target module's **declared public surface**, read from the
enumerated per-module export list (§1), and never to an undeclared hook, API slice, schema, type or
sub-component
**And** no module directory contains a nested module
**And** the rule holds **without a per-file exception list** — zero imports are permitted _despite_
violating it. It passes on day one because every legal import today resolves to a declared entry, not
because any is allowlisted: the three `selectCurrentUser` call sites (`MemberDirectory.tsx`,
`GiveWarehouseAccessDialog.tsx`, `WarehousePeopleList.tsx`) resolve to `modules/auth/store/`, and the
three composition-layer imports of module internals — `shared/layouts/WarehouseLayout.tsx` →
`modules/warehouse/hooks/useRecordWarehouseEntry`, `guards/auth.guard.ts` →
`modules/auth/session/session`, `shared/layouts/RootLayout.tsx` →
`modules/auth/sign-out/components/SignOutButton` — are legal because each target is **declared
surface** of its module. Declaring them is a decision this request makes explicitly, not an
accommodation discovered during implementation; none of those three files is edited (CR-RG-07)
**And** `docs/system/guides/placing-web-components.md` has been narrowed (CH-D3) so it no longer
directs a cross-module view into `shared/components/`.

### CR-AC-05 (CR-US-01, CH-S1, CH-S6) — structure

**Given** the Warehouse record in `apps/server`
**When** the module layout is inspected
**Then** `apps/server/src/warehouses/` exists and owns the four warehouse lifecycle commands
(`create`, `rename`, `archive`, `restore`), `list-workspace-warehouses.query.ts`,
`WarehouseController` with its four warehouse-record handlers, `warehouse-mutation.dto.ts`, and a
`domain/errors/warehouse.errors.ts` carrying exactly `workspaceLastUnarchivedWarehouseError`,
`workspaceWarehouseCreationUnavailableError` and `workspaceArchivalUnavailableError` under
**unchanged error codes** — three, not four: `workspaceWarehouseArchivedError` names a Warehouse
invariant but its only caller (`set-active-warehouse.command.ts`) stays in `workspaces`, so
CR-AC-06's second clause promotes it to `shared/errors/` rather than making `workspaces` deep-import
`warehouses/domain/errors` (which CR-AC-08 forbids). Resolved from
[`sad.md` §5.4](./sad.md#54-error-module-split-closes-changemd-6-step-2) and §11 O1
**And** it has `usecases/usecase.module.ts`, `rest/rest.module.ts` and `index.ts`, with no empty
directory created for symmetry
**And** `warehouse-http-contract.harness.ts` is at `apps/server/src/test/harnesses/`, reachable by
both `warehouses` and `access` without either importing the other.

### CR-AC-06 (CR-US-02, CH-S2, CH-S3, CH-S6) — structure

**Given** the Access capability in `apps/server`
**When** the module layout is inspected
**Then** `apps/server/src/access/` owns both scopes: its existing warehouse-scoped commands and
queries **and** the workspace role commands, workspace membership commands, owner transfer, the four
workspace list queries, `workspace-authority.predicates.ts` and `workspace-role-deletion.service.ts`
**And** it also owns `assign-warehouse-membership`, `revoke-warehouse-membership` and
`list-assignable-warehouse-roles` — which grant and revoke a Warehouse Role and therefore belong to
Access, not to `warehouses`, despite their names
**And** the access-shaped factories from `workspace.errors.ts` are in `access` under unchanged error
codes, so that no **production** file in `access` imports `workspaces` — the constraint
`tests/access/authorization-coverage.spec.mjs:161` already asserts over
`globSync('apps/server/src/access/**/*.ts')` minus `.spec.ts`, which CH-S6 preserves at that same
production-only scope (matching CR-AC-08's wording for `users`; access specs are not newly
constrained)
**And** the split is stated as a **rule, not a count**, because the counts do not survive contact
with the call graph: any member of the error module — factory _or_ helper — reachable from exactly
one destination module follows that module, and **anything reachable from two or more destination
modules is promoted to `shared/errors/`** rather than duplicated or left behind — **as is anything
whose named entity and whose only reachable consumer resolve to different destination modules**, the
second clause `sad.md` §5.4 adds so that reachability cannot send one module's invariant into
another module's error file. Three members force this: `workspaceTargetUnavailableError` is thrown
from all three destinations (13 call sites across `archive`/`restore`/`rename-warehouse` →
`warehouses`, six role and member commands → `access`, and `set-active-warehouse` → `workspaces`);
`unavailable-outcome.ts`'s `withUnavailableOutcome` wrapper is imported by
`create`/`archive`/`restore-warehouse` → `warehouses` and by
`transfer-workspace-owner`/`delete-workspace-role` → `access`; and
`workspaceWarehouseArchivedError` is reachable from `workspaces` alone while naming a **Warehouse**
invariant, which is the second clause's case. All three go to `shared/errors/`. The per-factory
application of this rule across all 19 factories plus the one helper is settled in
[`sad.md` §5.4](./sad.md#54-error-module-split-closes-changemd-6-step-2)
([`change.md` §6](./change.md#6-rollout) step 2); this criterion fixes the rule, not the table.

### CR-AC-07 (CR-US-01, CH-S3, CH-S4, CH-S6) — structure

**Given** `apps/server/src/workspaces/` after CR-AC-05 and CR-AC-06
**When** its contents are inspected
**Then** every remaining file is one of: `rename-workspace.command.ts`,
`read-workspace-context.query.ts`, `set-active-warehouse.command.ts`, `WorkspaceController` trimmed
to `GET context` / `PUT active-warehouse` / `PATCH`, the workspace half of
`workspace-mutation.dto.ts`, `workspace-provisioning.service.ts`,
`active-warehouse-selection-boundaries.spec.ts`,
`domain/module-boundaries.spec.ts`, `module-wiring.spec.ts`,
`workspaces-load-smoke.integration.spec.ts`, the two module files, and `index.ts` — with their
colocated specs
**And** `workspaces/domain/errors/` retains only members CR-AC-06's rule leaves behind, and is
**deleted outright if that set is empty** — no file is kept as a re-export shim, because a shim is
the deep import into `workspaces` that CR-AC-08 and the abort threshold forbid
**And** `WorkspaceProvisioningService` still provisions Workspace → owner role → first Warehouse →
initial access in that order, calling `access` and `warehouses` through their exported use-case
modules rather than reaching into their internals.

### CR-AC-08 (CR-US-01, CH-S1, CH-S2, CH-S5, CH-S6) — boundary

**Given** the server module graph after every move
**When** imports are analyzed
**Then** every cross-module dependency resolves through an exported `usecase.module.ts` provider or a
module barrel — never a deep file path, and specifically never another module's error factory,
domain predicate or DTO. This **extends** the rule
`docs/system/server-architecture.md` §"Dependency direction" states for controllers and persistence;
CH-S6 owns the extension and the new `warehouses` and `access` boundary specs assert it
**And** `apps/server/src/users/**` production code imports nothing from `access`, `auth`,
`warehouses` or `workspaces` — the first two are already asserted by
`users/module-boundaries.spec.ts:43-46`; the last two are a **new** constraint this request adds
**And** no file under `shared/domain/repositories/` imports a feature module.

### CR-AC-09 (CR-US-01, CH-S5) — boundary

**Given** the NestJS module graph after `WarehousesUsecaseModule` and `WarehousesRestModule` are
registered
**When** the application bootstraps
**Then** it resolves without any `forwardRef()`
**And** `AccessUsecaseModule` imports no feature module, remaining the leaf of the graph
**And** the DI and smoke specs pass — the two that exist today
(`workspaces/usecases/usecase.module.di.spec.ts`, `workspaces/workspaces-load-smoke.integration.spec.ts`)
plus the `warehouses` equivalents CH-S5 authorizes. No DI or smoke spec is added for `access`: none
exists today, CH-S5 does not authorize one, and adding test surface beyond the moved code is outside
this request (`access` is covered by the `module-boundaries.spec.ts` CH-S6 gives it).

### CR-AC-10 (CR-US-03, CH-D1–CH-D6) — documentation

**Given** a contributor reading `docs/system` before placing a new file
**When** they follow the index for the application they are changing
**Then** `docs/system/guides/adding-a-web-module.md` opens with an owner-selection step stating: name
the module for the domain entity that owns the behavior; extend an existing owner rather than adding
a second module for the same entity; a capability exercised at several scopes lives in one module and
carries the views for every scope; modules are flat; a module may import another module only through
its declared public surface, and the composition layer is bound by that same rule — it may reach any
module's surface rather than only a sibling's, but it is not exempt from the rule
**And** `docs/system/guides/adding-a-server-module.md` §1 carries the same four ownership rules, plus
the management-versus-enforcement boundary and the rule that error factories, predicates and DTOs are
module-private
**And** `docs/system/guides/placing-web-components.md` §"When not to nest" exempts a module's
declared public surface, so it no longer contradicts CR-AC-04
**And** `docs/system/adr/14-08-2026-domain-owned-flat-modules.md` exists with status `Accepted`,
covers both applications, and states honestly in its consequences that cross-module view imports
become legal on web, that two modules may serve one URL prefix, and that a wrongly-placed module is
expensive to move because neither application has path aliases
**And** both `docs/system/web-index.md` and `docs/system/server-index.md` list that ADR with a "read
before…" description, per the `AGENTS.md` rule that a document and its index change together
**And** `docs/system/frontend-architecture.md`'s "keep logic inside one module until another module
genuinely needs it; promote to `shared/`" sentence — the one CH-D6 concedes "produces exactly today's
layout" — is qualified **before the first web module moves**, not at ship with the rest of CH-D6. The
remaining CH-D6 reconciliation stays a ship step; only this sentence moves forward, because it is the
one that actively instructs the opposite of what CH-W1–CH-W3 do, and CR-US-03 promises a contributor
that no two canonical documents disagree **at any point during the rollout**, not only after it
**And** no new guide file was created — the guidance extends the three that already exist.

### CR-AC-11 (CR-US-04, CH-S1, CH-S2, CH-S3, CH-S4) — contract identity

**Given** the server's resolved HTTP route table captured at `baseline_revision` — the branch tip at
the moment implementation starts, re-pinned in `change.md`'s frontmatter then, and the single "before"
every identity comparison in this request uses (CR-AC-11, CR-RG-04, CR-RG-05 and the §6 duration and
bundle rows all name it, so no comparison is made against a different tree) — by the mechanism
[`change.md` §9.6](./change.md#9-open-questions) settles
**When** it is captured again after every server move
**Then** the two tables are identical in every method, full path, guard class set, `@RequiredPermission`
/ `@RequiredWorkspacePermission` metadata and DTO class — covering the 18 routes that change owning
module, the 14 of those that also change controller class, and the 3 that stay put
**And** exactly two prefixes are served by two controllers each — `api/v1/workspace` (`workspaces`
`WorkspaceController` + `access` `WorkspaceAccessController`) and `api/v1/workspace/warehouses`
(`warehouses` `WarehouseController` + `access` `WarehouseAccessController`) — with no path shadowed
and none unreachable
**And** request and response payloads are unchanged, evidenced by the existing
`*-http-contract.integration.spec.ts` suites, which assert real payloads and are the coverage for the
schema dimension the route table cannot capture.

### CR-AC-12 (CR-US-03, CH-W5, CH-S6) — boundary

**Given** a contributor who later places a file in the wrong module
**When** the test suite runs
**Then** a boundary spec fails and names the file and the rule it violates
**And** what the spec checks mechanically is the **file manifest and the import graph**, not the
owning-module judgement: `modules/workspace` must contain exactly the file set CR-AC-03 enumerates,
so any file added there fails until someone deliberately amends the manifest, and every import
resolves to a declared surface entry (CR-AC-04). The §2.1 question _whose invariants does this file
enforce?_ stays a **human review test** — CR-AC-01 and CR-AC-02 rule out inferring ownership from
domain nouns, and no static scan can compute it; the manifest is what forces the human answer to be
given rather than skipped
**And** `apps/web` has such a spec, following the pattern the server already uses, and it passes
without a per-file exception list (CR-AC-04)
**And** the server's existing boundary specs — including `tests/access/authorization-coverage.spec.mjs`
— assert the new layout with their **rules intact**: paths and path-valued exemption keys updated, no
rule weakened or deleted to accommodate the move.

## 5.1 Regression boundaries

These are the substance of this request's safety, not a footnote to it. Every one is verified, not
assumed.

### CR-RG-01 — Product behavior is byte-identical

**Given** any behavior any existing test asserts
**When** the full suite runs after every move
**Then** it passes with **no behavioral assertion changed** — an assertion about what the system does
**And** the assertions that do change are structural only, per
[`change.md` §2.1](./change.md#21-terms-fixed-by-this-request): import specifiers, file locations,
handler inventories, `readFileSync` on a controller path, and the path-valued exemption keys in
`tests/access/authorization-coverage.spec.mjs`
**And** the four specs whose subject splits — `modules/workspace/hooks/name-validation.spec.ts`,
`warehouse.controller.spec.ts`, `workspace.controller.spec.ts`,
`workspace-http-contract.integration.spec.ts` — split without losing a single case: the union of the
cases after equals the set before
**And** an existing test whose _expectation_ had to change is treated as evidence the refactor
altered behavior and blocks release ([`change.md` §6](./change.md#6-rollout), abort threshold),
rather than being absorbed as an update.

### CR-RG-02 — Authorization is unchanged

**Given** every Permission, Workspace Permission, Role, Workspace Role and guard in the system
**When** authorization is exercised
**Then** nothing is added, removed, renamed or re-scoped; every `@RequiredPermission` and
`@RequiredWorkspacePermission` moves with its handler carrying identical arguments
**And** `tests/access/authorization-coverage.spec.mjs` and every per-feature release-gate suite under
`tests/` pass with **every rule they assert unchanged** — their path-valued literals
(`INFRASTRUCTURE_EXEMPT` keys at `:23` and `:32`, the `workspaces/domain` glob at `:141`) are
re-pathed as structural assertions, and no handler moves from covered to exempt or from exempt to
covered
**And** every domain invariant holds: one Workspace Owner per Workspace, one Warehouse Manager per
Warehouse, one Role per (User, Warehouse), one Workspace Role per Workspace Member.

### CR-RG-03 — Persistence and published contracts are untouched

**Given** the database schema and the `packages/contracts` package
**When** the change ships
**Then** no migration is added, altered or run; the eight files under `apps/server/migrations/` are
unchanged; runtime schema synchronization stays disabled
**And** all 13 TypeORM entities remain in `shared/domain/entities/` and all 17 repositories remain in
`shared/domain/repositories/`
**And** the `@warehouser/contracts` export subpaths (`./access`, `./auth`, `./users`, `./workspaces`)
are unchanged in name and content.

### CR-RG-04 — User-visible copy is unchanged

**Given** every translated string in `apps/web/public/locales/{en,uk}/`
**When** the locale files are compared between `baseline_revision` and the post-move tree
**Then** every key's **value** is identical
**And** the namespace a key lives in may move, together with the `t()` call that reads it; a key's
**path within its namespace** may move only where a namespace merge would otherwise collide two
blocks — which happens exactly once, for CR-AC-02's `workspaceRoles` / `workspaceMembers` /
`workspacePermissions` parents, because `access.json` already holds warehouse-scoped `roles`,
`members` and `permissions`. Every other block, including `warehouse.json`'s, keeps its key paths
**And** no key exists in one language and not the other
**And** no computed-key lookup is restructured — specifically, `workspace.json`'s `tabs.*` and
`descriptions.*` stay in `workspace.json` because `WorkspaceAdministration.tsx` reads them through
``t(`descriptions.${openSection}`)`` and stays in `modules/workspace` (CH-W4)
**And** no string is hardcoded outside a namespace as a consequence of a move.

### CR-RG-05 — The `effectiveWarehouseId` restriction still holds

**Given** the `no-restricted-syntax` configuration in `apps/web/eslint.config.mjs` at
`baseline_revision`
**When** lint runs after the web moves
**Then** both selectors are still present — the `Identifier` selector and the `Literal` selector —
and both still forbid `effectiveWarehouseId`
**And** the `ignores` array still contains exactly its six entries: the three production paths
(`src/guards/landing.guard.ts`, `src/shared/components/RetainedContextMessage.tsx`,
`src/modules/warehouse/hooks/useRecordWarehouseEntry.ts`) and the three test globs
(`**/*.spec.ts`, `**/*.spec.tsx`, `src/test/**`) — with a production path corrected only if that file
moved, and none of the three does under CR-RG-07
**And** both selectors' message strings still name the same three files, updated in step if a path
changed
**And** no seventh entry is added to make a moved import resolve.

### CR-RG-06 — Server authorization enforcement and persistence stay in `shared/`

**Given** `shared/guards/`, `shared/access/`, `shared/decorators/`, `shared/domain/security/`,
`shared/domain/entities/` and `shared/domain/repositories/`
**When** the server layout is inspected
**Then** `SessionAuthGuard`, `WarehouseAccessGuard`, `WorkspaceAccessGuard`, `AccessCurrentUser`,
`WorkspaceCurrentUser`, `access-request.ts`, `access-denial.errors.ts`, `@ArchivedTolerantRead`,
`@RequiredPermission`, `@RequiredWorkspacePermission`, all 13 entities and all 17 repositories are
unchanged in location and content, apart from import specifiers naming a moved file
**And** `access` owns role/permission/membership management only, so no module gains a dependency on
`access` merely to obtain a guard.

### CR-RG-07 — The web composition layer is unchanged

**Given** `apps/web/src/shared/`, `guards/`, `routes/`, `router.ts`, `store/` and `test/`
**When** the web layout is inspected
**Then** no file moves out of them — specifically `shared/layouts/{WarehouseSwitcher,WarehouseLayout,Sidebar,RootLayout}.tsx`,
`shared/api/{warehouse-path,access-permissions-api,workspace-context-api}.ts`,
`shared/hooks/{useEnteredWarehouse,useEnteredContext,usePermissions,useWorkspacePermissions}.ts`,
`shared/components/{WarehouseEntryRefusal,RetainedContextMessage,PermissionGate,WorkspaceGate}.tsx`
and `guards/warehouse-entry.guard.ts` all stay where they are
**And** their content changes only where an import specifier names a moved file — with one named
exception: `src/test/setup.ts` gains a `warehouse` namespace import and map entry in both languages
(CR-AC-01). It hard-codes one static import per namespace, so this is an addition rather than a
re-path, and without it every moved component's spec renders untranslated keys
**And** the composition layer is bound by CR-AC-04's import rule like any other consumer; the three
files that import module internals today (`WarehouseLayout.tsx`, `RootLayout.tsx`,
`guards/auth.guard.ts`) are made legal by **declaring** their targets as module surface, not by
editing them
**And** the in-flight `WarehouseSwitcher.tsx` work on this branch is not touched by this request, and
lands before `baseline_revision` is pinned so it is never mistaken for a diff this request caused.

## 6. Non-functional requirements

| Aspect                  | Previous target                                                  | New target                                                                                                                                                                                        | Measurement                                                                                                    |
| ----------------------- | ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Runtime behavior        | current                                                          | unchanged                                                                                                                                                                                         | CR-RG-01: full suite green with zero behavioral assertion changes                                              |
| HTTP surface            | 21 routes across 2 controllers in 1 module (`workspaces`)        | identical routes; 3 stay, 18 change module, 14 of those change controller class; 4 controllers in 3 modules                                                                                       | CR-AC-11: captured route table diff is empty                                                                   |
| Build and test duration | `pnpm --filter … build`/`test` wall-clock at `baseline_revision` | ≤ 110% of baseline                                                                                                                                                                                | same machine, same warm/cold cache state, median of 3 runs before and after                                    |
| Bundle output (web)     | chunk graph at `baseline_revision`                               | no new eager chunk; lazy route boundaries preserved                                                                                                                                               | `pnpm --filter @warehouser/web build` output compared to that baseline                                         |
| Module depth            | mixed — Warehouse and Access nested inside workspace             | 1 level: `modules/<entity>` / `src/<entity>`                                                                                                                                                      | CR-AC-04, CR-AC-12: boundary specs                                                                             |
| Boundary exceptions     | 2 recorded `shared/` → module exceptions, no rule                | 0 per-file exceptions; the rule is stated so none is needed. A declared surface entry is the rule's input, not an exception (§1) — the count is of imports permitted _despite_ violating the rule | CR-AC-04: the web boundary spec passes with an empty exception list beside its per-module surface declarations |

## 6.1 Security / privacy

- **Data classification:** unchanged. No data is read, written, moved or reclassified.
- **Personal data impact:** none. No personal data is accessed, relocated, logged or exposed; the
  Pino calls that touch member identifiers move file with their use cases and keep identical fields.
- **Authorization impact:** none — CR-RG-02 and CR-RG-06. Same routes, same guards, same permission
  metadata, same denial errors, same `shared/domain/security/` credential primitives. The attack
  surface after the change is the attack surface before it.
- **Security review:** **N/A** — no authentication, authorization, session, credential, transport or
  data-exposure behavior changes, and the enforcement path is a non-goal. This waiver is conditional
  on CR-RG-02 and CR-RG-06 passing; if either fails, the change has altered authorization and a
  review becomes required.

## 7. Metrics / KPIs

This request has no runtime metric to move; its outcomes are structural and are measured at review.

- **Modules per domain entity** — baseline: Warehouse is spread across 3 locations per application
  and owns 0 modules on server; target: exactly 1 owning module per entity per application
  (CR-AC-01, CR-AC-05).
- **Implementations per capability** — baseline: Access has 2 near-duplicate implementations per
  application, one per scope; target: 1 implementation carrying both scopes (CR-AC-02, CR-AC-06).
- **Files in the workspace module** — baseline at `6fd9f5a`: 79 (web) and 78 (server), counted with
  `find … -type f`; target: only files CR-AC-03 and CR-AC-07 enumerate remain. The number is a proxy;
  the criterion is the enumeration, not the size.
- **Canonical documents that agree on module placement** — baseline: 5 documents state different
  parts of the rule and 1 (`placing-web-components.md`) contradicts it; target: all 5 agree and point
  at one ADR (CR-AC-10).
- **Boundary rules that are executable** — baseline: 5 specs, server only, encoding the current
  layout; target: those 5 assert the new layout with rules intact, plus 3 new specs (`warehouses`,
  `access`, web) (CR-AC-12).
- **Behavioral assertions changed to make the suite pass** — target: **0** (CR-RG-01). Any non-zero
  value is an abort condition, not a metric to improve.

## 8. Open questions

Carried from [`change.md` §9](./change.md#9-open-questions); each has a stated default so no
downstream stage is blocked. §9.1 and §9.5 change how large CH-W2 and CH-W3 are and should close
first.

- [ ] Where do the six multi-consumer web helpers land (`useFormFieldErrors`, `useReturnFocusOnClose`,
      `MutationOutcome`, the mutation adapter, the feedback adapter, the permission-label hook) — **and
      what happens to `modules/access`'s pre-existing near-copies of the first three**, which no CH row
      currently targets? Default now: the three generic ones to `shared/`, the three domain-flavoured
      ones as two scope-named files each inside `modules/access` — merging those would be a behavior
      change hiding inside a move, which CR-RG-01 forbids. The access-side copies are the same
      question in reverse: consolidating them onto the `shared/` version is a merge with the same
      risk, and leaving both contradicts §7's "1 implementation per capability", so the decision must
      be taken deliberately rather than falling out of the move. — owner: Tech Lead, due: `design`
- [ ] What exactly is each web module's declared public surface — **including the composition layer's
      permitted targets**, now that CR-AC-04 binds it to the same rule? Default now: an enumerated
      per-module export list the boundary spec reads as data, containing each module's page-level
      views, `modules/auth/store/`, and the three entries the composition layer already imports
      (`modules/warehouse/hooks/useRecordWarehouseEntry`, `modules/auth/session/session`,
      `modules/auth/sign-out/components/SignOutButton`). — owner: Tech Lead, due: `design`
- [ ] How is the route table captured for CR-AC-11? Default now: a committed script reflecting
      method + path + guards + permission metadata + DTO class, diffed in CI; response schemas covered
      by the existing HTTP-contract suites instead. — owner: Tech Lead, due: `design`
- [ ] Does `apps/server/src/users/` fold into `access`? Default now: no. — owner: Tech Lead,
      due: `design`
- [ ] Singular or plural module names across the two applications? Default now: leave both as they
      are; if decided, state it in the ADR (CH-D4) rather than renaming here. — owner: Tech Lead,
      due: `design`
- [ ] Do `packages/contracts` subpaths follow the modules? Default now: no — a published export is a
      separate breaking change, and moving one would violate CR-RG-03. — owner: Tech Lead,
      due: `design`
