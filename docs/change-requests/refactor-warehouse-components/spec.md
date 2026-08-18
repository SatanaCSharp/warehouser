---
kind: change-request
status: Draft
owner: 'YuriiH'
reviewers: ['Tech Lead']
updated_at: '2026-08-18'
feature_size: 'L'
change_record: './change.md'
---

# Change-request specification — refactor-warehouse-components

## 1. Context

[`change.md`](./change.md) approves moving the Warehouse administration slice from
`modules/warehouse` to `modules/workspace` (CH-W1, CH-W2), superseding
[ADR 14-08-2026](../../system/adr/14-08-2026-domain-owned-flat-modules.md) (CH-D1, CH-D2), splitting
two oversized components (CH-W5), reorganizing `shared/api` by domain (CH-W6), and recording a state
placement audit (CH-W7).

The affected actor is the **contributor**, not the end user. No end-user-visible behavior changes —
which makes §5.1 the substance of this specification. The acceptance criteria in §5 test that the
new rule is stated, declared and enforced; the regression boundaries in §5.1 test that the
Workspace administration destination behaves at `HEAD` exactly as it does at
`42f1205d552f8284f8ec57358ad9022340b5f76e`.

`/clarify` settled the request's contested premise. The `domain-expert` gate returned
`ESCALATION_REQUIRED` against `change.md` §3.1.1: the canonical glossaries
([`workspaces/CONTEXT.md`](../../features/workspaces/CONTEXT.md),
[`access/CONTEXT.md`](../../features/access/CONTEXT.md)) **refuse** the cross-cutting-capability vs.
subordinate-entity distinction. Workspace Role and Workspace membership are Workspace-owned by the
same relation as Warehouse (`aggregate root: workspaces`), Workspace Permission is system-owned and
outside the Workspace entirely, and the domain's own boundary — Workspace Capability vs. Warehouse
Capability, decided by the subject of the operation — does not separate the warehouses tab from the
access tabs. The glossary further states that the tabbed-administration naming "carries no domain
meaning". CH-D2 therefore **claims no domain asymmetry**: it is decided on placement grounds (a
single-consumer slice placed at the scope where its capabilities are exercised), and it narrows ADR
14-08's owning-entity tiebreak rather than restating a domain rule. §5 CR-AC-03 binds that shape.

Read alongside `change.md` §3 (the override map), §4.1 (the strongest objection to the request) and
§9 (open questions carried into `/clarify`).

## 2. Goals

- A contributor asking "where does a view that administers a Workspace's Warehouses go?" gets one
  answer from one Accepted ADR, and the guides that quote the old answer no longer contradict it.
- The Warehouse administration slice is self-contained: its components, hooks, API slice and schema
  live in one module, with no cross-module reach between them.
- The import-boundary declaration and its spec describe the new layout with **zero** per-file
  exceptions.
- `WarehouseList` and `WarehousePeopleList` each have one reason to change.
- Every `shared/api` module is reachable at a path that names its domain.
- The Workspace administration destination is byte-for-byte equivalent in behavior.

## 3. Non-goals

- **`modules/access/components/workspace-administration/*` does not move.** The narrow rule is a
  deliberate intake decision (`change.md` §3.1.1), reaffirmed at `/clarify` and **unconditional**:
  it does not become contingent on CH-D2's rule generalizing. The access tabs keep their current
  placement, and the `change.md` §6 abort threshold's third bullet is discharged by CR-AC-03's
  stated basis rather than by widening scope.
- **No new Redux slice.** The `change.md` §4.2 audit found no qualifying state; adding empty
  `store/` scaffolding was considered and rejected.
- **No server change.** `apps/server`, `packages/contracts`, route paths, `@Controller` prefixes and
  permission identifiers are untouched.
- **Server-facing documentation is out of scope.** ADR 14-08-2026 is also cited by
  `docs/system/server-index.md` §Decisions and `docs/system/guides/adding-a-server-module.md`
  §"The decision behind these rules". Neither is edited by this request. Accepted consequence,
  decided at `/clarify`: until a later request reconciles them, those two documents advertise a
  Superseded ADR as the live server-side placement decision. CR-AC-03 does not assert otherwise.
- **No behavior change of any kind**, including the selected Warehouse surviving navigation, which
  is explicitly deferred to a separate request.
- **No fix for the known-red baseline spec** carried through from `modules-level-refactor`; see
  CR-RG-06.
- **`frontend-architecture.md` is not reconciled during this pipeline** (CH-D5 is a ship step).
- **No new in-Warehouse capability.** Locations, crate/pallet acceptance and every other future
  entity a Warehouse owns are out of scope. When they are built they become **flat top-level
  sibling modules**, per [`adding-a-web-module.md`](../../system/guides/adding-a-web-module.md) §1
  ("a module that seems to need a submodule is a module that should be promoted to its own
  top-level sibling") — they do not grow inside `modules/warehouse`. This corrects `change.md` §4.1,
  which defends the residual module on the opposite expectation.

## 4. Changed user stories

### CR-US-01: One placement rule for Workspace-scoped administration

**As a** contributor adding or changing a view that administers a Workspace's Warehouses
**I want** one Accepted decision that names the owning module, with the guides agreeing with it
**So that** I do not have to reconcile an ADR against a guide that uses the opposite arrangement as
its worked example.

### CR-US-02: A self-contained administration slice

**As a** contributor changing how Warehouses are created, renamed, archived or shared
**I want** the components, hooks, API slice and schema for that flow in one module
**So that** a single-consumer slice is not split across a module boundary that buys nothing.

### CR-US-03: Components with one reason to change

**As a** contributor changing the Warehouse list or its people pane
**I want** each file to own one concern
**So that** a change to row rendering does not require reading search, loading and empty-state logic
in the same file.

### CR-US-04: A `shared/api` layer that names its domains

**As a** contributor looking for the Workspace context endpoint
**I want** `shared/api` grouped by domain
**So that** the transport primitives are distinguishable from the domain endpoint slices at a
glance.

## 5. Acceptance criteria

### CR-AC-01 (CR-US-02, CH-W1/CH-W2/CH-W3) — structural

**Given** the repository at `HEAD` after this request
**When** the `apps/web` source tree is enumerated
**Then** all 13 CH-W1 files and all 9 CH-W2 files resolve under `modules/workspace/`, none resolves
under `modules/warehouse/`, and `WORKSPACE_MODULE_MANIFEST` in `apps/web/src/test/module-surface.ts`
lists exactly the resulting `modules/workspace` file set.

`modules/warehouse` retains exactly **six** files — `route.tsx`, `page.tsx`,
`components/DesignSystemExample.tsx`, `components/DesignSystemExample.spec.tsx`,
`hooks/useRecordWarehouseEntry.ts` and `hooks/useRecordWarehouseEntry.spec.tsx`. Both colocated
specs are retained; neither is deleted nor relocated. (`change.md` §4 and §4.1 call this a
"four-file" module by omitting the two specs — six is the number under test.)

### CR-AC-02 (CR-US-02, CH-W3/CH-W4) — enforced boundary

**Given** the boundary spec `apps/web/src/modules/module-boundaries.spec.ts`
**When** `pnpm --filter @warehouser/web test` runs it
**Then** it passes; `MODULE_SURFACE.warehouse` no longer declares any
`workspace-administration/warehouses` entry; every remaining declared entry is required by a real
importer; and **no** per-file exception exists — an import permitted despite violating the rule
trips the `change.md` §6 abort threshold.

**And** no stale reference survives in the boundary machinery. Two classes, both currently present:

- **Moved paths.** `module-boundaries.spec.ts`'s SCAN SCOPE comment names
  `modules/warehouse/hooks/warehouse-name-validation.spec.ts`, which CH-W2 moves; and
  `MODULE_SURFACE.auth`'s comment names "the three `selectCurrentUser` call sites in `modules/access`
  and `modules/warehouse`", some of which become `modules/workspace`. Both are updated to the
  post-move paths.
- **Predecessor identifiers.** `module-boundaries.spec.ts`'s header cites `(CH-W5)`, its
  `SURFACE_RULE` constant cites `(CR-AC-04)`, and `WORKSPACE_MODULE_MANIFEST`'s docblock cites
  `per CR-AC-03`. All three are **`modules-level-refactor` identifiers**, and this request re-uses
  `CH-W5`, `CR-AC-03` and `CR-AC-04` for unrelated things. Each is qualified with its owning request
  (e.g. `modules-level-refactor CR-AC-03`); none is renumbered to this request's identifiers.

Editing `SURFACE_RULE`'s message text is **not** assertion drift under CR-RG-01: it is a rule
description, and `module-boundaries.spec.ts` is not a moved spec.

### CR-AC-03 (CR-US-01, CH-D1–CH-D4/CH-D6) — the rule is stated

**Given** `docs/system/`
**When** a contributor follows `web-index.md` to the placement decision
**Then** ADR 14-08-2026 reads `Superseded by …` with a forward link and an intact body; the new ADR
reads `Accepted`; `placing-web-components.md` no longer uses the warehouses tab as its worked example
of a cross-module surface import; and `web-index.md` lists both ADRs with correct status.

**And** CH-D2's ADR takes the shape settled at `/clarify`:

- It **narrows ADR 14-08's owning-entity tiebreak** and preserves everything else that ADR decides —
  flat modules, one entity per top-level module, no nested submodules, and declared public surfaces.
  The narrowing: where a slice's **sole** consumer exercises its capabilities at another scope,
  placement follows the scope of exercise rather than the owning entity.
- It **answers ADR 14-08's "organize by consumer" rejection** on its own terms — by conceding that
  the rejection holds for _nesting a module under a screen_ (which this request does not do; both
  modules stay flat top-level siblings) and does not reach a tiebreak between two existing flat
  modules. It does not deny that its own basis is a consumer argument.
- It **claims no domain asymmetry.** The `change.md` §3.1.1 cross-cutting-capability vs.
  subordinate-entity distinction is **not** stated as a rule, because the `domain-expert` gate found
  the canonical glossaries refuse it (§1). CH-D2 records that finding and the fact that the access
  tabs stay on a placement decision, not a domain one.
- It carries the **i18n namespace rule**: a namespace names the domain its copy describes, not the
  module that renders it, so `public/locales/{en,uk}/warehouse.json` stays a `warehouse` namespace.

**And** `adding-a-web-module.md` carries the scope carve-out in §1 **and retains no statement
contradicting CH-D2**. Four locations require reconciliation, not one: §1's "a capability exercised
at several scopes lives in one module … never in a second module"; §1's flatness paragraph, "a
second domain entity never acquires a home inside another module's tree", which read alongside ADR
14-08's worked example names this request's target directory — it gains
[`sad.md` §4.2](./sad.md#42-the-flatness-test-becomes-is-it-a-home-not-does-its-name-mention-another-entity)'s
home-vs-grouping test (module identity — a name in the module list, a surface entry, its own
`route.tsx`/`page.tsx` — is what makes a directory a home; a directory with none of those is a
component grouping); §1's closing pointer routing the reader to ADR 14-08 as the governing decision;
and §"Common failures", whose first bullet currently reads _"Placing an entity's code in the module
of the entity that contains it — Warehouse administration under `modules/workspace/` because a
Workspace contains Warehouses"_ — i.e. it names this request's outcome as a failure.

> Amended after `/design` per `sad.md` §11 O1. The third statement was absent from the original
> enumeration, so a conforming implementation could have left a live guide contradicting CH-D2.

### CR-AC-04 (CR-US-03, CH-W5) — the splits

**Given** the post-split tree
**When** `WarehouseList.tsx` and `WarehousePeopleList.tsx` and their new children are read
**Then** each file exports exactly one component; each new file's placement satisfies
`placing-web-components.md`; each moved component's colocated spec sits beside it; and the resulting
file set **matches the split recorded in this request's design artifact**, which `/design` fixes from
the `change.md` §3.2.2 candidate. ("One reason to change" is the design-time criterion; the file set
is the review-time one.)

Two clauses were ambiguous and are settled here:

- **Branching.** `WarehouseList`'s three-way `if (isLoading) … else if (warehouses.length === 0) …
else …` assignment to `content` **survives in `WarehouseList`** — it is the flat branching the
  criterion protects, not an `if` chain the criterion forbids. Only the branch _bodies_ extract
  (the skeleton, the list and its rows). No nested ternary and no lookup-shaped `if` chain is
  introduced anywhere in the split.
- **Prop hops.** The two-hop budget is counted **from `WarehouseList`**, the root of the split.
  `WarehousesTab` → `WarehouseList` is the pre-existing boundary this request does not change, so it
  is not hop one. No new hook, context or read is introduced at a leaf to satisfy the budget.

### CR-AC-05 (CR-US-04, CH-W6) — the API layout

**Given** `apps/web/src/shared/api/`
**When** the tree is enumerated and the application type-checks
**Then** the nine files — **seven modules and two colocated specs** — resolve under `client/`,
`workspace/`, `access/` and `warehouse/`; every importer resolves through the new path; and no file
remains at the `shared/api/` root.

**And** equivalence is verified explicitly, not inferred from a green build: `tsc` does not detect a
changed `providesTags` value, an altered cache key or a re-ordered endpoint builder. Each of the
seven moved modules is diffed against `baseline_revision` with rename detection
(`git diff -M --find-copies-harder <baseline> -- <old> <new>`), and the review records that every
hunk is an import specifier. No exported symbol, endpoint, tag or cache key differs.

### CR-AC-06 (CR-US-02, CH-W7) — the state audit

**Given** `change.md` §4.2
**When** the three modules are re-enumerated at `HEAD`
**Then** the audit table accounts for every `useState` in them; no new Redux slice exists; no empty
`store/` directory was created in `warehouse` or `workspace`; and
`modules/auth/store/auth.slice.spec.ts` exists with `authSlice.spec.ts` gone and its assertions
unchanged.

## 5.1 Regression boundaries

These carry more weight than §5. Each is measured against
`baseline_revision = 42f1205d552f8284f8ec57358ad9022340b5f76e`.

### CR-RG-01 — the Warehouses tab is behaviorally identical

**Given** a member with the Workspace Permissions each action requires
**When** they open Workspace administration and use the Warehouses tab
**Then** listing, searching, selecting, entering, creating, renaming, archiving, restoring, granting
access and withdrawing access behave exactly as at `baseline_revision`, including the responsive
split-view collapse, the loading/empty states, the archived chip and read-only meta text, and the
per-Warehouse people counts.

**Assertion drift, defined.** CH-W5 re-splits `WarehousesTab.spec.tsx` (1122 lines) into colocated
specs, which necessarily changes render setup — so "assertion content unchanged" needs a decidable
meaning, and getting it wrong trips the `change.md` §6 abort threshold. Drift is **an expectation
whose subject or expected value changes**. Permitted, and not drift: re-scoped `describe` blocks,
a per-file render harness, mounting a child component in isolation rather than through the tab, and
**new** setup-level assertions that pin the harness. Forbidden, and an abort: an existing
expectation that now asserts a different value, or asserts against a different subject, in order to
pass. No existing expectation may be deleted to make a split work.

### CR-RG-02 — the Enter affordance

**Given** a Warehouse row
**When** the row renders
**Then** the Enter link appears only when the Warehouse is non-archived _and_ present in
`membershipWarehouseIds`; a non-qualifying row renders no Enter control at all — hidden, never
disabled; the link is a **sibling** of the selection `<button>` and never nested inside it, so the
selection button stays first in focus order; and the link's accessible name still names its
Warehouse, so a screen-reader link list shows N distinguishable entries.

### CR-RG-03 — the withdraw-access affordance

**Given** the selected Warehouse's people pane
**When** it renders for an actor holding `WAREHOUSE_MEMBERSHIPS_REVOKE`
**Then** the actor's own row is disabled with its reason exposed via `aria-describedby` to a
visually hidden element; no Warehouse Role is displayed for any person; and the protected Warehouse
Manager case is still refused by the server rather than guessed at in the client.

### CR-RG-04 — permission gating

**Given** any combination of `WAREHOUSES_WATCH`, `WAREHOUSES_CREATE`, `WAREHOUSES_RENAME`,
`WAREHOUSES_ARCHIVE`, `WAREHOUSE_MEMBERSHIPS_REVOKE` and `WORKSPACE_MEMBERS_WATCH`
**When** Workspace administration renders
**Then** exactly the tabs, controls and network requests admitted at `baseline_revision` are
admitted — no dataset is requested outside its own watch Permission, and the tab shell still
disappears entirely for an actor whose Permissions admit no tab.

### CR-RG-05 — bundle shape

**Given** a production build
**When** the chunk graph is compared to `baseline_revision`
**Then** no new eager chunk appears and every lazy `import('./page')` route boundary is preserved.
In particular, no `index.ts` barrel is introduced for any module — the enumerated surface
declaration stays the mechanism.

**Method.** `apps/web/vite.config.ts` declares no `manualChunks`, so chunk filenames are
content-hashed and a raw `dist/assets` listing is not comparable. The comparison artifact is a
**normalized module→chunk manifest**: build at `baseline_revision` and at `HEAD` with
`pnpm --filter @warehouser/web build`, emit the Rollup output map, strip content hashes from chunk
names, rewrite every moved source path to its post-move path, sort, and diff. The criterion passes
when that diff is empty. A build that cannot be produced at `baseline_revision` leaves CR-RG-05
**unverified**, not satisfied.

### CR-RG-06 — the known-red baseline spec

**Given** `apps/server/src/access/rest/controllers/access-http-contract.integration.spec.ts`
**When** the suite runs at `HEAD`
**Then** its manager-transfer concurrency case fails **identically** to `baseline_revision` — same
assertion, same 403-where-409-expected. It is out of scope; making it pass is a behavior change
belonging to a separate `/fix`.

This criterion requires the server integration suite to actually run, which needs a container
runtime (`require_integration: auto` probes for one). If it cannot run, CR-RG-06 is **blocked, not
satisfied**: an unrunnable suite is not evidence of identical failure. The fallback evidence — that
no file under `apps/server/` was modified (CR-RG-07) — bounds the risk but does not discharge this
criterion.

### CR-RG-07 — the untouched neighbours

**Given** `modules/access`, `modules/home`, `modules/auth` and `apps/server`
**When** their trees are compared to `baseline_revision`
**Then** each neighbour's permitted diff is exactly this and nothing more:

| Tree                                | Permitted diff at `HEAD`                                                                                                                                                                                                                                                                        |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `modules/access`                    | `shared/api` import specifiers in its 33 importing files, **plus the single comment hunk at `hooks/workspace-role-name-validation.spec.ts:17-18`** re-pointing a moved path. `components/workspace-administration/*` is **unmoved** and otherwise unedited — no file added, removed or renamed. |
| `modules/home`                      | **None.** It imports no `shared/api` module, so its tree is byte-identical.                                                                                                                                                                                                                     |
| `modules/auth`                      | The CR-AC-06 spec filename, plus `shared/api` import specifiers in its 2 importing files.                                                                                                                                                                                                       |
| `apps/server`, `packages/contracts` | **None.** Unchanged.                                                                                                                                                                                                                                                                            |

"Unmoved" is not "unedited": CH-W6 is path-only churn and reaches `modules/access` legitimately.
Any hunk in these trees that is not an import specifier — or, for `modules/access`, the one comment
hunk named above; or, for `modules/auth`, the rename — is a CR-RG-07 failure.

> Amended after `/design` per `sad.md` §11 O2. `workspace-role-name-validation.spec.ts:17-18` names
> `modules/warehouse/hooks/warehouse-name-validation.spec.ts` as where its Warehouse half lives; the
> move makes that path dangling. The original table forbade the fix that CR-AC-02's "no stale
> reference survives" requires. The carve-out is exactly one comment hunk — nothing executable in
> `modules/access` may change.

## 6. Non-functional requirements

| Aspect               | Previous target                  | New target                                                                                                                                | Measurement                                                                                                                                                           |
| -------------------- | -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Bundle: eager chunks | Lazy route boundaries per module | Unchanged — no new eager chunk                                                                                                            | `pnpm --filter @warehouser/web build` at `baseline_revision` and `HEAD`; empty diff of the normalized, hash-stripped, path-rewritten module→chunk manifest (CR-RG-05) |
| Boundary exceptions  | 0                                | 0 — unchanged, and non-negotiable                                                                                                         | `module-boundaries.spec.ts` passes with an empty exception list                                                                                                       |
| Test assertion drift | N/A                              | 0 expectations whose subject or expected value changes; 0 deleted. New setup-level assertions and per-file harnesses permitted (CR-RG-01) | Diff review of every moved `*.spec.tsx`                                                                                                                               |
| Type safety          | `tsc -p tsconfig.json` clean     | Unchanged                                                                                                                                 | `pnpm --filter @warehouser/web build`                                                                                                                                 |
| Lint                 | `eslint src` clean               | Unchanged                                                                                                                                 | `pnpm --filter @warehouser/web lint`                                                                                                                                  |
| Component size       | 157 / 101 lines                  | Resulting file set matches the split recorded in the design artifact; two-hop budget counted from `WarehouseList`                         | `writing-web-components.md` §9 checklist against the design artifact's file list (CR-AC-04)                                                                           |

## 6.1 Security / privacy

- **Data classification:** unchanged. No new data is read, stored or transmitted.
- **Personal data impact:** none. The people pane displays the same member emails, under the same
  `WORKSPACE_MEMBERS_WATCH` gate, and still deliberately withholds Warehouse Role.
- **Authorization impact:** none. Every client-side Permission check moves verbatim; server-side
  authorization is untouched. The client gate remains an affordance, not the enforcement point.
- **Security review:** N/A — no authentication, session, credential or authorization logic changes.
  `modules/auth`'s only edit is a spec filename.

## 7. Metrics / KPIs

Contributor-facing and structural; there is no runtime metric for a refactor.

- **Placement questions answerable from one document** — baseline: 0 (ADR and guide disagree after
  this move); target: 1, at CR-AC-03.
- **Modules spanned by the Warehouse administration slice** — baseline: 2 (`WorkspaceAdministration`
  in `modules/workspace` reaches `WarehousesTab` in `modules/warehouse`, which is the slice's only
  cross-module import today); target: 1, with that import becoming intra-module.
- **Boundary-rule exceptions** — baseline: 0; target: 0. Any increase aborts the request.
- **Files in the largest component of the moved slice** — baseline: `WarehouseList.tsx` at 157 lines
  with 3 reasons to change (the search affordance, the loading/empty/list branch, row rendering);
  target: one reason to change per file, with the resulting file set fixed by the design artifact
  (CR-AC-04).

## 8. Open questions

The four questions carried from [`change.md` §9](./change.md#9-open-questions) with
`due: /clarify` were **all closed at `/clarify`**; their resolutions are recorded below and written
into the sections named. One question with `due: /design` was absent from this list and is restored.

### Still open

- [ ] `shared/api/warehouse/warehouse-path.ts` keeps a domain-named directory inside the composition
      layer. This is legal under the existing promotion rule (its consumers live in `guards/` and
      `shared/hooks/`), which this request does not change, but it reads oddly beside CH-D2's
      scope-placement rule. Default now: accept it as-is. — owner: Tech Lead, due: `/design`

### Closed at `/clarify`

- [x] **Does the cross-cutting-capability vs. subordinate-entity distinction hold?** **No — it is
      refused by the canonical glossaries** (`domain-expert` returned `ESCALATION_REQUIRED`; see §1).
      Resolution: proceed narrow anyway, on placement grounds rather than domain grounds. CH-D2
      states no domain asymmetry, narrows ADR 14-08's owning-entity tiebreak, and answers its
      "organize by consumer" rejection directly. The access tabs stay put **unconditionally** (§3).
      Written into §1, §3 and CR-AC-03. — resolved by: Product Owner
- [x] **Does the `warehouse` i18n namespace stay?** Yes, unchanged. `public/locales/{en,uk}/
warehouse.json` keeps its name; CH-D2 states that a namespace names the domain its copy
      describes, not the module that renders it. Confirmed against the tree: `workspace.json`
      already defines `tabs.warehouses`, so folding would collide, and `WarehouseList.tsx:49-53`
      deliberately reads both namespaces. Written into CR-AC-03. — resolved by: Tech Lead
- [x] **Is a thin `modules/warehouse` acceptable, or should it be removed?** Keep it — and the
      residual is **six** files, not four (CR-AC-01). The reason recorded in `change.md` §4.1 was
      wrong: future in-Warehouse entities (Locations, crate/pallet acceptance) become **flat
      top-level sibling modules**, not growth inside `modules/warehouse`. It is kept for the
      in-Warehouse route/page, `useRecordWarehouseEntry`, and the design-system example. Written
      into §3 and CR-AC-01. — resolved by: Product Owner
- [x] **Should the selected Warehouse survive navigation?** No — it is a behavior change, not a
      refactor, and belongs to its own request. Already fenced by the §3 non-goal. — resolved by:
      Product Owner
