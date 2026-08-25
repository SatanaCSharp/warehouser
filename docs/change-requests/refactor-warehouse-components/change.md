---
kind: change-request
slug: 'refactor-warehouse-components'
status: Draft
owner: 'YuriiH'
reviewers: ['Product Owner', 'Tech Lead']
updated_at: '2026-08-18'
baseline_revision: '42f1205d552f8284f8ec57358ad9022340b5f76e' # PINNED — the single "before" for every CR-RG-* boundary in spec.md §5.1. Captured on a clean tree at the tip of `20-workspaces-and-warehouse-behaviour`, i.e. after the whole `modules-level-refactor` request landed. No later task may re-pin it: the "nothing changed" claim is measured against this revision and moving it invalidates every regression boundary.
# Known-red carry-through at baseline_revision, inherited from `modules-level-refactor`.
# apps/server/src/access/rest/controllers/access-http-contract.integration.spec.ts — "POST
# /api/v1/warehouses/:warehouseId/access/manager-transfer maps a concurrent transfer to 409
# access.concurrent_change ... (AC-36a)" fails at the baseline, returning 403 where it expects 409.
# Red since df929ca and unrelated to this request. It must fail IDENTICALLY afterwards; that
# identity is the CR-RG-06 obligation. Fixing it is a behavioral change and belongs to a separate
# /fix cycle, never to this request.
baseline_known_red: 1
compatibility: 'backward-compatible'
affected_sources:
  - docs/system/adr/14-08-2026-domain-owned-flat-modules.md (Accepted today; superseded by CH-D1/CH-D2)
  - docs/system/adr/ (new ADR; see CH-D2)
  - docs/system/guides/placing-web-components.md (§"When not to nest" uses the warehouses tab as its worked example of a legal cross-module surface import; see CH-D3)
  - docs/system/guides/adding-a-web-module.md (§1 "Name the module for the domain entity that owns the behavior"; see CH-D4)
  - docs/system/frontend-architecture.md (§ Source structure; see CH-D5, reconciled at ship)
  - docs/system/web-index.md (see CH-D6)
  - apps/web/src/modules/warehouse/** (loses the Warehouse administration slice; see CH-W1, CH-W2)
  - apps/web/src/modules/workspace/** (receives it; see CH-W1, CH-W2, CH-W4)
  - apps/web/src/test/module-surface.ts (MODULE_SURFACE + WORKSPACE_MODULE_MANIFEST; see CH-W3)
  - apps/web/src/modules/module-boundaries.spec.ts (its scan-scope comment cites a file this request moves; see CH-W3)
  - apps/web/src/shared/api/** and its 68 importing files across guards/, shared/, store/, test/ and all four modules (see CH-W6)
  - apps/web/src/modules/auth/store/authSlice.spec.ts (see CH-W7)
  - code-only — no canonical document states that Warehouse administration is a Workspace-scoped activity; the current placement is stated only by ADR 14-08-2026, which this request overrides
---

# Change request — refactor-warehouse-components

## 1. Behavioral delta

When a contributor places a view that administers a Warehouse from inside the Workspace
administration destination, current behavior is that the file lands in the module of the entity
whose invariants it enforces — `modules/warehouse` — because
[ADR 14-08-2026](../../system/adr/14-08-2026-domain-owned-flat-modules.md) states that placement
follows the owning entity and not the screen; approved behavior will be that a view administering a
Workspace's **subordinate** entities lands in the module of the **scope at which the capability is
exercised** — `modules/workspace` — carrying the hooks, API slice and schemas that serve only it.

### 1.1 Why `change-request` and not `decide-adr`

This request changes no user-observable behavior, which is the condition
[`SKILL.md`](../../../.claude/skills/change-request/SKILL.md) uses to route work to `decide-adr`. It
is filed as a change request anyway, deliberately:

- **It overrides a rule with consumers, not a blank slate.** ADR 14-08-2026 is `Accepted`, is listed
  in [`web-index.md`](../../system/web-index.md), and is read before every `apps/web` change by
  contract (`AGENTS.md`). One of the guides it governs —
  [`placing-web-components.md`](../../system/guides/placing-web-components.md) — currently uses the
  warehouses tab as its _worked example of correct placement_. Amending a rule that actively
  instructs contributors needs the old-to-new trace §3 provides; an ADR alone would leave the guide
  contradicting itself.
- **The deliverable is not the decision.** The decision is one document (CH-D2). The request also
  relocates 22 files, reorganizes a nine-file shared layer touched by 68 importing files, splits two
  components and a 1122-line spec, and rewrites the application's only import-boundary declaration.
  That is implementation work with a rollout order, an abort threshold and a rollback — none of
  which an ADR carries.
- **The regression surface is the whole Workspace administration destination.** "Nothing changed" is
  the claim under test, so it needs acceptance criteria. §5.1 of [`spec.md`](./spec.md#51-regression-boundaries)
  is the substance of this request, and ADRs have no equivalent.

CH-D2 is therefore an ADR **produced by** this request, not a substitute for it.

### 1.2 Relationship to `modules-level-refactor`

This request reverses one conclusion of its immediate predecessor, four commits earlier on the same
branch. `modules-level-refactor` moved the Warehouse administration slice **out of**
`modules/workspace` and **into** `modules/warehouse`; this request moves it back and supersedes the
ADR that justified the first move.

That is recorded here rather than hidden, because it is the single largest risk to the request's
credibility. Two things follow, and the review gate should hold this request to both:

1. **The predecessor's reasoning is not refuted by silence.** ADR 14-08-2026 explicitly considered
   and rejected "organize modules by consumer — nest a module under the screen that uses it", on the
   grounds that it makes ownership a function of the current UI, so every navigation change becomes
   a source move. CH-D2 does not get to ignore that objection; it must answer it (see §3.1).
2. **The churn is real and is paid twice.** ADR 14-08-2026 itself warns that "a wrongly-placed module
   is expensive to move… moving a module rewrites every importing file, its tests and its boundary
   declarations." This request pays that cost a second time on the same files. §7 records what that
   means for rollback.

## 2. Motivation

The Workspace administration destination is one screen with four tabs, composed by
`modules/workspace/components/WorkspaceAdministration.tsx`. Three of its tabs come from
`modules/access` and one from `modules/warehouse`, so the screen's own module owns none of its
content and the composition root reaches across two module boundaries to assemble a single page.

Every capability behind the Warehouses tab is a _Workspace_ capability in the permission model it
already obeys: `WAREHOUSES_WATCH`, `WAREHOUSES_CREATE`, `WAREHOUSES_RENAME`, `WAREHOUSES_ARCHIVE`,
`WAREHOUSE_MEMBERSHIPS_REVOKE` and `WORKSPACE_MEMBERS_WATCH` are all `WorkspacePermissionId` values,
checked against the Workspace context (`WarehousesTab.tsx:53-71`). The tab creates, renames,
archives and grants access to Warehouses; it never operates _inside_ one. Operating inside a
Warehouse is a separate destination with its own route, layout and switcher, and that stays in
`modules/warehouse`.

The practical consequence today is that a slice with exactly one consumer sits on the far side of a
module boundary from that consumer. The API slice, five hooks, a validator and a schema in
`modules/warehouse` serve nothing but the tab, and the tab is reachable only from
`modules/workspace`'s administration shell — so the boundary the current layout draws separates the
screen from the entire slice it exists to render, while buying no reuse, no independent lifecycle
and no second consumer.

## 3. Override map

### 3.1 Documentation

| ID    | Target/source                                                        | Existing behavior                                                                                                                                                 | Operation | New behavior                                                                                                                                                                   | Compatibility | CR acceptance criteria |
| ----- | -------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------- | ---------------------- |
| CH-D1 | `docs/system/adr/14-08-2026-domain-owned-flat-modules.md`            | `Status: Accepted`; placement follows the owning entity, not the screen                                                                                           | AMEND     | `Status: Superseded by <CH-D2 ADR>`, with a forward link. Body preserved verbatim as the historical baseline.                                                                  | Doc-only      | CR-AC-03               |
| CH-D2 | `docs/system/adr/18-08-2026-scope-of-exercise-placement-tiebreak.md` | Absent                                                                                                                                                            | ADD       | Accepted ADR stating the scope-placement rule **and** answering both the §3.1.1 asymmetry and ADR 14-08's "organize by consumer" rejection                                     | Doc-only      | CR-AC-03               |
| CH-D3 | `docs/system/guides/placing-web-components.md` §"When not to nest"   | "A route owner composing another module's page-level view — `modules/workspace`'s administration shell rendering the warehouses tab owned by `modules/warehouse`" | AMEND     | The warehouses tab stops being the worked example — it is now intra-module. The surface-exemption paragraph keeps a valid example (the access tabs) or is restated abstractly. | Doc-only      | CR-AC-03               |
| CH-D4 | `docs/system/guides/adding-a-web-module.md` §1                       | "Name the module for the domain entity that owns the behavior"                                                                                                    | AMEND     | Adds the scope carve-out: administration of a subordinate entity belongs to the scope that administers it                                                                      | Doc-only      | CR-AC-03               |
| CH-D5 | `docs/system/frontend-architecture.md` § Source structure            | Describes module ownership per ADR 14-08                                                                                                                          | AMEND     | Reconciled to CH-D2. **Deferred to ship**, per the change-request contract                                                                                                     | Doc-only      | — ship step (§8)       |
| CH-D6 | `docs/system/web-index.md`                                           | Lists ADR 14-08 as the live placement decision (§Decisions)                                                                                                       | AMEND     | Lists CH-D2's ADR as live and ADR 14-08 as superseded                                                                                                                          | Doc-only      | CR-AC-03               |

#### 3.1.1 The asymmetry CH-D2 must justify — OPEN

`modules/access/components/workspace-administration/{members,roles,permissions}/` is structurally
identical to the warehouses tab: a Workspace-scoped administration view, rendered by
`WorkspaceAdministration.tsx`, owned by another entity's module. **It is staying** (user decision at
intake: narrow rule, Warehouse only).

A rule that moves one and not the other is not coherent until CH-D2 states the distinction. The
candidate line, to be tested at `/clarify`:

> Access is a _cross-cutting capability_ whose subject is the Workspace itself — its members, its
> roles, its permissions. `modules/access` is therefore already the module of the entity whose
> invariants those views enforce, and no move is implied. A Warehouse is a _subordinate entity_
> owned by the Workspace; administering the set of Warehouses is a Workspace management activity,
> and is distinct from operating inside one Warehouse, which remains `modules/warehouse`.

This is recorded as a candidate, not a conclusion. If the `devils-advocate` and `critic` gates find
it unfalsifiable — in particular if it cannot be applied by a contributor to a _new_ entity without
re-deciding per case — the honest response is to reopen the intake decision and move the access tabs
too, not to ship a rule that only rationalizes the one move already chosen. See §9.

### 3.2 Code

| ID    | Target/source                                                                    | Existing behavior                                                                              | Operation | New behavior                                                                                                     | Compatibility         | CR acceptance criteria       |
| ----- | -------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- | --------- | ---------------------------------------------------------------------------------------------------------------- | --------------------- | ---------------------------- |
| CH-W1 | `apps/web/src/modules/warehouse/components/workspace-administration/warehouses/` | 13 files (12 components + `WarehousesTab.spec.tsx`) live under `modules/warehouse`             | REPLACE   | The same 13 files live under `modules/workspace/components/workspace-administration/warehouses/`                 | Internal; no behavior | CR-AC-01, CR-RG-01           |
| CH-W2 | `modules/warehouse/{api,hooks,schemas}` (9 files, listed in §3.2.1)              | Serve only the CH-W1 components, but sit behind a module boundary from them                    | REPLACE   | Move to `modules/workspace/{api,hooks,schemas}`; the slice becomes self-contained                                | Internal; no behavior | CR-AC-01, CR-RG-01           |
| CH-W3 | `apps/web/src/test/module-surface.ts`                                            | `MODULE_SURFACE.warehouse` declares `WarehousesTab`; `WORKSPACE_MODULE_MANIFEST` has 8 entries | AMEND     | `warehouse` surface drops that entry; the manifest enumerates the post-move, post-split `modules/workspace` tree | Internal              | CR-AC-01, CR-AC-02           |
| CH-W4 | `modules/workspace/components/WorkspaceAdministration.tsx:10`                    | Imports `WarehousesTab` across a module boundary                                               | AMEND     | Imports it intra-module. The three `modules/access` tab imports at :7-9 are untouched                            | Internal              | CR-AC-02, CR-RG-01           |
| CH-W5 | `WarehouseList.tsx` (157 lines), `WarehousePeopleList.tsx` (101 lines)           | Each file carries several reasons to change                                                    | ADD       | Split per `writing-web-components.md`; one exported component per file. See §3.2.2                               | Internal; no behavior | CR-AC-04, CR-RG-02, CR-RG-03 |
| CH-W6 | `apps/web/src/shared/api/` (9 flat files)                                        | Flat directory mixing transport primitives with domain endpoint slices                         | REPLACE   | `client/`, `workspace/`, `access/`, `warehouse/` subdirectories. See §3.2.3                                      | Internal; path-only   | CR-AC-05                     |
| CH-W7 | `modules/{warehouse,workspace,auth}` state placement                             | `auth` has a conformant slice; `warehouse`/`workspace` hold RTK Query + local `useState` only  | AMEND     | Audit recorded (§4 "State placement"); no slice added; `authSlice.spec.ts` renamed. See §3.2.4                   | Internal              | CR-AC-06                     |

**Omission means unchanged.** `apps/server`, `packages/contracts`, every route path, every
`@Controller` prefix, every permission identifier, `modules/home`, `modules/access` and
`shared/{components,constants,errors,icons,layouts,alerts,hooks}` are outside this request.

#### 3.2.1 The CH-W2 file set

Each was confirmed by import scan at `baseline_revision` to have **no consumer outside the moving
set**, which is why the whole slice moves and no cross-module surface entry is created:

```text
modules/warehouse/api/warehouse-api.ts                    → modules/workspace/api/
modules/warehouse/hooks/useCreateWarehouse.ts             → modules/workspace/hooks/
modules/warehouse/hooks/useRenameWarehouse.ts             → modules/workspace/hooks/
modules/warehouse/hooks/useSetWarehouseArchival.ts        → modules/workspace/hooks/
modules/warehouse/hooks/useAssignWarehouseMembership.ts   → modules/workspace/hooks/
modules/warehouse/hooks/useRevokeWarehouseMembership.ts   → modules/workspace/hooks/
modules/warehouse/hooks/warehouse-name-validation.ts      → modules/workspace/hooks/
modules/warehouse/hooks/warehouse-name-validation.spec.ts → modules/workspace/hooks/
modules/warehouse/schemas/warehouse-name-form.schema.ts   → modules/workspace/schemas/
```

`modules/warehouse/hooks/useRecordWarehouseEntry.ts` **stays**: its one production consumer is
`shared/layouts/WarehouseLayout.tsx` (`store/middleware/api-error.middleware.ts` mentions it only in
a comment and imports nothing from it), and it serves entering a Warehouse rather than administering
one — the exact boundary CH-D2 draws.

`modules/module-boundaries.spec.ts`'s scan-scope comment names
`modules/warehouse/hooks/warehouse-name-validation.spec.ts` as its example of test-only cross-module
coupling. That path changes; the comment must be updated with it or it becomes a dangling reference.

#### 3.2.2 The CH-W5 splits

Shape to be confirmed at `/design` against `placing-web-components.md`; the obligations below are
not negotiable at that stage because each is load-bearing for an existing acceptance criterion.

`WarehouseList.tsx` carries three reasons to change — the search affordance, the
loading/empty/list branch, and row rendering. Candidate split: `WarehouseList` retains `query` and
branch selection; `WarehouseSearchField`, `WarehouseListSkeleton`, `WarehouseRow` and
`WarehouseEnterLink` become owned children.

`WarehousePeopleList.tsx` extracts `WarehousePersonRow`. Preferred: the `target` state and
`WithdrawWarehouseAccessDialog` move **into** the row, since the withdraw button is the control that
triggers them — which is what `writing-web-components.md` requires — removing the
`WorkspaceUser | null` state from the list entirely.

Must survive the split unchanged, each with its current explanatory docblock carried across:

- `canEnter = !isArchived && membershipWarehouseIds.includes(warehouse.id)`, and the rule that a
  non-qualifying row renders **no** Enter control — hidden, never disabled.
- The Enter link as a **sibling** of the selection `<button>`, never nested inside it (a link cannot
  nest in a button), so the selection button stays first in focus order.
- The per-Warehouse `aria-label` on the Enter link, which prevents a screen-reader link list of N
  identical "Enter" entries.
- `WarehousePeopleList`'s `isSelf` disabled state with its `aria-describedby` sr-only reason, and
  the deliberate omission of Warehouse Role from this pane (the level boundary is design, not
  styling).

`WarehousesTab.spec.tsx` (1122 lines) is re-split alongside the components it covers, per
`placing-web-components.md` ("colocate a component's test with the component after the move"). This
is the largest single piece of work in the request.

#### 3.2.3 The CH-W6 layout

```text
shared/api/
  client/     api-client.ts (15 importers), mutation-outcome.ts (37)
  workspace/  workspace-context-api.ts (+spec), workspace-users-api.ts, workspace-mutation.ts
  access/     access-permissions-api.ts (+spec)
  warehouse/  warehouse-path.ts
```

68 distinct files import `shared/api` today. Path-only churn: no symbol, signature, endpoint or
cache key changes. Colocated specs move with their subjects.

#### 3.2.4 The CH-W7 outcome

The audit is the deliverable; see §4 "State placement" for the evidence and the conclusion that no
slice is warranted. The only edit is renaming `modules/auth/store/authSlice.spec.ts` →
`auth.slice.spec.ts`. No empty `store/` scaffolding is created in `warehouse` or `workspace`.

## 4. Impact analysis

| Area                         | State     | Evidence and consequence                                                                                                                                                                                                                                                                      |
| ---------------------------- | --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Domain invariants            | unchanged | No rule about Warehouses, Workspaces, membership or archival changes. Only the source location of the code enforcing them moves.                                                                                                                                                              |
| Permissions                  | unchanged | Every `WorkspacePermissionId` check in `WarehousesTab.tsx:53-71`, `WarehousePeopleList.tsx:42` and the dialogs moves verbatim. No permission is added, removed or re-scoped. Server-side authorization is untouched.                                                                          |
| Workflows and state          | unchanged | Tab order, selection behavior, responsive split-view collapse and dialog flows are preserved. CH-W5 moves `target` from list to row, which is not observable.                                                                                                                                 |
| API and events               | unchanged | `warehouse-api.ts` changes directory; its endpoints, tags and cache keys do not. `apps/server` and `packages/contracts` are untouched.                                                                                                                                                        |
| Persisted data               | N/A       | No schema, migration or stored shape is in scope.                                                                                                                                                                                                                                             |
| UI behavior                  | unchanged | This is the claim under test. Every rendered element, accessible name and interaction is pinned by §5.1 of `spec.md`.                                                                                                                                                                         |
| Cross-feature behavior       | affected  | `modules/warehouse` shrinks to `route.tsx`, `page.tsx`, `components/DesignSystemExample.tsx` and `hooks/useRecordWarehouseEntry.ts` — approximately the stub it was before `modules-level-refactor`. See §4.1.                                                                                |
| Security and privacy         | unchanged | No authentication, session, credential or personal-data handling is touched. `auth`'s only edit is a spec **filename**.                                                                                                                                                                       |
| Operations and observability | N/A       | No logging, metric or deployment surface is in scope. No telemetry is added.                                                                                                                                                                                                                  |
| Tests                        | affected  | `WarehousesTab.spec.tsx` moves and is re-split; `warehouse-name-validation.spec.ts` moves; `access-permissions-api.spec.ts` and `workspace-context-api.spec.ts` move; `authSlice.spec.ts` is renamed. `module-boundaries.spec.ts` needs a comment fix. Assertion **content** must not change. |
| Canonical documentation      | affected  | CH-D1 through CH-D6. CH-D5 is reconciled at ship, not now.                                                                                                                                                                                                                                    |

### 4.1 The consequence this request is weakest on

After CH-W1 and CH-W2, `modules/warehouse` contains four files, one of which
(`DesignSystemExample.tsx`) is a demo. A reviewer is entitled to ask whether a module that thin
should exist at all, and whether the request has really relocated a slice or has instead dissolved
the Warehouse module and re-derived the layout that `modules-level-refactor` was written to correct.

The answer this request offers — and which `/clarify` must test rather than assume — is that
`modules/warehouse` is thin _today_ because the in-Warehouse destination is barely built: its route,
page and entry-recording hook are the beginning of a surface that grows with every subordinate
Warehouse entity (stock, entries, operators). If that is true, thinness is temporary and the
boundary is correct. If it is not — if no in-Warehouse capability is actually planned — then the
module should be removed rather than left as a shell, and this request has the wrong shape.

This is stated here rather than omitted because it is the strongest available argument against the
request.

### 4.2 State placement (the CH-W7 audit)

Governing rule, [`frontend-architecture.md`](../../system/frontend-architecture.md) §"Redux Toolkit
infrastructure": _"Add a slice only for state used across modules or needed globally across routes.
Server-owned resource data belongs to an RTK Query API slice rather than an ordinary state slice."_

The audit was first taken at `baseline_revision` and **re-taken at `HEAD`** after the move (CH-W1,
CH-W2) and the splits (CH-W5). §4.2.2 is the current enumeration and is the one CR-AC-06 is judged
against; §4.2.1 is retained, clearly marked as historical, only so a reader can see what changed.

**Which modules are enumerated.** CH-W7's row names `modules/{warehouse,workspace,auth}`;
[T15](./tasks/t15-record-usestate-audit.md) names `modules/{warehouse,workspace,access}`. The two
readings disagree on the third module, so §4.2.2 enumerates **all four** rather than picking one.
That is a superset of either reading, and the wording disagreement is recorded here as a finding
rather than settled by silently choosing.

#### 4.2.1 The enumeration at `baseline_revision` — historical, superseded by §4.2.2

Line numbers below are pre-move and pre-split and no longer resolve; the paths are the
`baseline_revision` ones.

| Location                                                                                              | State                                   | Verdict                                                                      |
| ----------------------------------------------------------------------------------------------------- | --------------------------------------- | ---------------------------------------------------------------------------- |
| `workspace/components/WorkspaceAdministration.tsx:46`                                                 | `selectedTab`                           | Transient; one consumer. Stays local.                                        |
| `.../warehouses/WarehousesTab.tsx:72,75`                                                              | `selectedWarehouseId`, `isDetailActive` | Transient; one consumer. Stays local.                                        |
| `.../warehouses/WarehouseList.tsx:54`                                                                 | `query`                                 | Owned by its search field. Stays local.                                      |
| `AddWarehouseAction`, `GiveWarehouseAccessAction`, `NameWorkspaceAction`, `WarehouseLifecycleActions` | dialog-open flags                       | Owned by the control that triggers them — explicitly required to stay local. |
| `ArchiveWarehouseDialog.tsx:26`                                                                       | `isSubmitting`                          | Transient. Stays local.                                                      |
| `WarehousePeopleList.tsx:45`                                                                          | `target`                                | Removed by the CH-W5 split.                                                  |
| `auth/sign-up/page.tsx:22`                                                                            | `emailError`                            | Form-local. Stays local.                                                     |

Seven audit entries, covering ten `useState` calls in `modules/warehouse` (8) and
`modules/workspace` (2), plus one in `modules/auth`. `modules/access` was not enumerated at
baseline; it is enumerated at `HEAD` below.

#### 4.2.2 The enumeration at `HEAD`

`modules/warehouse` now holds **zero** `useState`. The whole Warehouse administration slice left it
under CH-W1/CH-W2, and what remains — `route.tsx`, `page.tsx`,
`components/DesignSystemExample.tsx`, `hooks/useRecordWarehouseEntry.ts` — declares no local state.

**`modules/workspace` — 10 calls in 9 files. Six audit entries.**

| Location                                                                                                                                                                                                                                                | State                                   | Verdict                                                                      |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------- | ---------------------------------------------------------------------------- |
| `components/WorkspaceAdministration.tsx:46`                                                                                                                                                                                                             | `selectedTab`                           | Transient; one consumer. Stays local.                                        |
| `components/workspace-administration/warehouses/WarehousesTab.tsx:72,75`                                                                                                                                                                                | `selectedWarehouseId`, `isDetailActive` | Transient; one consumer. Stays local.                                        |
| `components/workspace-administration/warehouses/WarehouseList.tsx:46`                                                                                                                                                                                   | `query`                                 | Owned by its search field. Stays local.                                      |
| `.../warehouses/AddWarehouseAction.tsx:31`, `.../warehouses/GiveWarehouseAccessAction.tsx:32`, `.../workspace-administration/NameWorkspaceAction.tsx:22`, `.../warehouses/WarehouseLifecycleActions.tsx:35`, `.../warehouses/WarehousePersonRow.tsx:47` | dialog-open flags                       | Owned by the control that triggers them — explicitly required to stay local. |
| `components/workspace-administration/warehouses/ArchiveWarehouseDialog.tsx:26`                                                                                                                                                                          | `isSubmitting`                          | Transient. Stays local.                                                      |
| —                                                                                                                                                                                                                                                       | `WarehousePeopleList`'s `target`        | **Gone.** Removed by the CH-W5 split; see §4.2.3.                            |

`WarehousePersonRow.tsx:47`'s `isWithdrawing` is the newcomer, and it joins the existing dialog-open
row rather than adding one: the row is mounted per person, so the withdraw dialog seeds itself from
the person it was opened for and the flag is a plain `useState(false)` owned by the button that sets
it — exactly what [`writing-web-components.md`](../../system/guides/writing-web-components.md)
requires of transient UI state.

Two further `useState` calls exist in `modules/workspace`, both in **test harnesses** added by the
CH-W5 split specs — `.../warehouses/WarehouseList.spec.tsx:66` and
`.../warehouses/WarehouseRow.spec.tsx:68`, each holding a `selectedWarehouseId` so the split leaf
can be mounted from plain props (CR-AC-04). They are excluded from the audit, which governs where
**production** state lives; they are named here so the enumeration accounts for every occurrence in
the tree.

**`modules/auth` — 1 call.**

| Location                   | State        | Verdict                  |
| -------------------------- | ------------ | ------------------------ |
| `auth/sign-up/page.tsx:22` | `emailError` | Form-local. Stays local. |

**`modules/access` — 22 calls in 20 files. Untouched by this request.**

CR-RG-07 permits only import specifiers in this tree, plus one comment hunk; no `useState` was
added, removed or moved in it. Every occurrence is one of four kinds, and each stays local for the
same reason its `workspace` counterpart does.

| Kind                           | Locations                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | Verdict                                   |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| dialog-open flags              | `access-workspace/components/members/CreateMemberAction.tsx:22`, `access-workspace/components/roles/CreateRoleAction.tsx:22`, `access-workspace/components/roles/TransferManagerAction.tsx:26`, `workspace-administration/members/AddWorkspaceMemberAction.tsx:23`, `.../members/ChangeWorkspaceRoleAction.tsx:28`, `.../members/RemoveWorkspaceMemberAction.tsx:29`, `.../members/TransferWorkspaceOwnershipAction.tsx:24`, `workspace-administration/roles/CreateWorkspaceRoleAction.tsx:29`, `.../roles/DeleteWorkspaceRoleAction.tsx:34` | Owned by the control that triggers them.  |
| list search queries            | `access-workspace/components/members/MemberList.tsx:81`, `access-workspace/components/roles/RoleList.tsx:26`, `workspace-administration/roles/WorkspaceRoleList.tsx:27`                                                                                                                                                                                                                                                                                                                                                                      | Owned by their search field. Stay local.  |
| selection and pending-target   | `access-workspace/components/members/MemberDirectory.tsx:51` (`dialog`), `access-workspace/components/roles/MemberAssignmentList.tsx:24` (`selectedMemberId`), `access-workspace/components/roles/RoleDirectory.tsx:40,44` (`selectedRoleId`, `rolePendingDeletion`), `workspace-administration/roles/WorkspaceRoleDirectory.tsx:35` (`selectedRoleId`)                                                                                                                                                                                      | Transient; one consumer each. Stay local. |
| in-flight and refusal feedback | `workspace-administration/members/ChangeWorkspaceRoleDialog.tsx:34`, `.../members/RemoveWorkspaceMemberDialog.tsx:28,29`, `.../members/TransferWorkspaceOwnershipDialog.tsx:40`, `workspace-administration/roles/DeleteWorkspaceRoleDialog.tsx:41`                                                                                                                                                                                                                                                                                           | Transient, dialog-scoped. Stay local.     |

Totals at `HEAD`: `warehouse` 0, `workspace` 10 production (+2 harness), `auth` 1, `access` 22 —
**33 production calls, all accounted for**.

#### 4.2.3 The delta, stated precisely

CR-AC-06 and [`sad.md` §8](./sad.md) say the `useState` count "drops by exactly one". Two different
things can be counted here, and only one of them drops. Both are stated so neither is overclaimed:

- **Audit entries — 7 at baseline, 6 at `HEAD`: −1, as recorded.** The
  `WarehousePeopleList.tsx` / `WorkspaceUser | null` entry is gone. Its replacement in
  `WarehousePersonRow.tsx` is a `useState(false)` open flag, which is not a new kind of state: it is
  an instance of the table's pre-existing "dialog-open flags — owned by the control that triggers
  them" entry and joins it rather than adding a seventh.
- **Raw `useState` calls — 10 before, 10 after, across `modules/warehouse` + `modules/workspace`
  combined: unchanged.** One call was removed from `WarehousePeopleList` and one was added in
  `WarehousePersonRow`. Counting the two new split-spec harnesses, the raw figure in the tree rises
  to 12.

**The reading applied is the first**, because it is the one the criterion's own stated reason
supports: `sad.md` §8 attributes the drop to `WorkspaceUser | null` "becom[ing] a boolean at the
row", and a boolean at the row is still a `useState` call. What the split removed is a _kind_ of
state — a list-level handle on a selected `WorkspaceUser`, the only piece of non-trivial local state
the audit had to reason about — not a call. The substance the audit exists to check holds exactly:
no state grew in scope, and the one entry that could have argued for a slice collapsed into a
transient flag owned by its trigger, one level down.

**The criterion's wording is imprecise, and that is recorded as a finding rather than papered
over.** "The `useState` count drops by exactly one" does not say whether it counts calls or audit
entries, and read literally as calls it is false. `spec.md` and `sad.md` are not edited here — the
[review gate](./test-plan.md#review-gates) that names this audit is where the wording is
adjudicated. A reviewer reading it as a raw call count should treat CR-AC-06 as met on substance and
the wording as a follow-up amendment, not treat the request as failing; a reviewer reading it as
audit entries should find it met as written.

#### 4.2.4 The slice test, re-applied to the post-split state

Applying `frontend-architecture.md`'s rule to §4.2.2's enumeration: no state is _used across
modules_ — every entry has exactly one consuming component, and the two that cross a component
boundary at all (`selectedWarehouseId`, `selectedTab`) are passed as props inside one tab. No state
is _needed globally across routes_ — every entry is discarded when its dialog closes, its list
unmounts or its tab is left. And no entry holds _server-owned resource data_: that is already in RTK
Query (`workspace-context-api`, `warehouse-api`, `workspace-users-api`), which the move relocated by
directory without touching an endpoint, tag or cache key.

**Conclusion: unchanged from baseline — no state qualifies for a slice.** CH-W7 is therefore an
audit plus one filename fix. No slice was added, no context was introduced, and no empty `store/`
scaffolding was created in `warehouse` or `workspace`; that last part is mechanically enforced by
T14's guard, `apps/web/src/modules/state-placement.spec.ts` ("keeps a store directory only where a
slice is warranted", "registers no state slice beyond the baseline inventory"), so
`modules/auth/store/` remains the only one. `modules/auth/store/` itself still conforms exactly to
the documented `actions` / `slice` / `selectors` convention.

If the selected Warehouse should survive navigation, that is a **behavior change** requiring its own
`CR-AC` row and is not part of this request. Raised in §9.

## 5. Compatibility and transition

- **Compatibility:** backward-compatible. No API, contract, persisted-data, URL or permission change.
- **Affected consumers:** none outside `apps/web`'s own source tree. There is no published package,
  no external importer and no stored client state keyed on any of these paths.
- **Transition window and exit condition:** none required. There is no coexistence period — each
  rollout step in §6 lands complete, and no old path is left importable.
- **Existing-data treatment:** N/A. No data is read, written or reinterpreted.

## 6. Rollout

Ordered so that each step is independently revertible and the riskiest step lands against an
already-verified tree.

1. **CH-W6** — `shared/api` reorganization. Independent of everything else, pure path churn, and it
   proves the import-rewrite approach on 68 files before the move relies on it.
2. **CH-W1 + CH-W2 + CH-W3 + CH-W4** — the move, as one commit with **no** content edits beyond
   import specifiers, the surface declaration and the manifest. Keeping content edits out of this
   commit is what makes CR-RG-01 checkable by diff.
3. **CH-W5** — the splits, applied to the already-moved files.
4. **CH-W7** — the audit record and the `authSlice.spec.ts` rename.
5. **CH-D1 – CH-D4, CH-D6** — documentation. CH-D5 is deferred to ship.

**Monitoring signals:** `pnpm --filter @warehouser/web test`, `lint` and `build` after every step;
the baseline pass/fail set captured at `42f1205` before step 1 is the comparison basis.

**Abort threshold** — any one of these stops the request rather than being worked around:

- An import that must be permitted _despite_ violating the surface rule. The declaration admits
  inputs, not exceptions; a needed exception means CH-D2's rule is wrong.
- A moved spec that requires an **assertion** change to pass. Import-path edits are expected; a
  changed expectation means behavior moved, which CR-RG-01 forbids.
- `/clarify` failing to produce a §3.1.1 asymmetry rule that a contributor could apply to a new
  entity without re-deciding per case.

## 7. Rollback

A single `git revert` of the branch restores `baseline_revision` exactly. No data migration, no
feature flag, no coexistence path, so rollback is complete and cheap in the mechanical sense.

The honest qualification: the _documentation_ rollback is not free. CH-D1 marks ADR 14-08-2026
superseded, and reverting restores it to `Accepted` — but the repository will then have carried two
opposite placement rules within days of each other, and the ADR's authority is weakened by the
episode whichever way it ends. That is an argument for settling §3.1.1 at `/clarify` rather than
discovering it at review.

## 8. Canonical reconciliation after PASS

| Canonical owner                                                      | Required edit                                                                                | Backlink                                                       |
| -------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| `docs/system/adr/14-08-2026-domain-owned-flat-modules.md`            | Status → `Superseded by …`; forward link added; body preserved                               | `docs/change-requests/refactor-warehouse-components/change.md` |
| `docs/system/adr/18-08-2026-scope-of-exercise-placement-tiebreak.md` | Created `Accepted`, narrowing ADR 14-08's owning-entity tiebreak and answering its objection | same                                                           |
| `docs/system/guides/placing-web-components.md`                       | §"When not to nest" worked example replaced                                                  | same                                                           |
| `docs/system/guides/adding-a-web-module.md`                          | §1 scope carve-out added                                                                     | same                                                           |
| `docs/system/frontend-architecture.md`                               | § Source structure reconciled to the new rule                                                | same                                                           |
| `docs/system/web-index.md`                                           | §Decisions entries updated for both ADRs                                                     | same                                                           |

## 9. Open questions

- [ ] Does the §3.1.1 distinction (cross-cutting capability vs. subordinate entity) survive the
      `devils-advocate` gate as a rule a contributor can apply to a _new_ entity without re-deciding
      per case? Default now: proceed with the narrow Warehouse-only rule as decided at intake; if the
      distinction does not hold, reopen and move the access tabs too rather than ship an
      unjustifiable rule. — owner: Tech Lead, due: `/clarify`
- [ ] Should `public/locales/{en,uk}/warehouse.json` stay a `warehouse` namespace once its only
      readers live in `modules/workspace`? Default now: **keep it unchanged**, and have CH-D2 state
      that a namespace names the domain its copy describes, not the module that renders it. Folding
      it into `workspace.json` risks key collisions (`tabs.warehouses` already exists there) for no
      behavioral gain. Note `WarehouseList.tsx:53` already reads _both_ namespaces deliberately.
      — owner: Tech Lead, due: `/clarify`
- [ ] Is `modules/warehouse` shrinking to four files acceptable, or does §4.1 mean the module should
      be removed instead? Default now: keep it, on the stated expectation that the in-Warehouse
      destination grows. — owner: Product Owner, due: `/clarify`
- [ ] Should the selected Warehouse survive navigation? Default now: **no** — out of scope; it is a
      behavior change, not a refactor, and belongs to its own request. — owner: Product Owner,
      due: `/clarify`
- [ ] `shared/api/warehouse/warehouse-path.ts` remains a domain-named directory inside the
      composition layer, which is legal under the existing promotion rule (consumers in `guards/`
      and `shared/hooks/`) but reads oddly beside CH-D2. Default now: accept it; the promotion rule
      is unchanged by this request. — owner: Tech Lead, due: `/design`
