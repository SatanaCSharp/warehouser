---
kind: code-review-front-end
work_item: 'change-request:global-loader'
work_item_root: 'docs/change-requests/global-loader'
baseline_revision: 'ba5e9e09fa1ba8374807b237b68d353b18f00e7c'
head_revision: '367674d'
reviewed_on: '2026-08-21'
reviewer: 'code-review-front-end (three fanned-out reviewer passes, reasoning tier, effort xhigh)'
size: 'L'
verdict: 'CHANGES REQUESTED'
fix_batch: 'F1-F4 applied 2026-08-25; B1 open pending /decide-adr'
---

# Front-end conformance review — change-request:global-loader

Scope is `apps/web` only. Acceptance-criteria compliance is `/review`'s gate and is not adjudicated
here; items noticed for it are listed in §6.

## 1. Diff scope

`git diff ba5e9e09fa1ba8374807b237b68d353b18f00e7c..HEAD -- apps/web packages/contracts`

- **83 files changed, 7,684 insertions(+), 608 deletions(-)** — all under `apps/web/`.
- `packages/contracts` is **not** touched by this change, so the contracts half of the scope is
  empty and `guides/adding-and-using-contracts.md` applies vacuously.
- `apps/server` is **not** touched, so
  [`code-review-back-end`](../../../../.claude/skills/code-review-back-end/SKILL.md) does not run
  for this work item.
- Outside `apps/web`, the same range also touches `docs/system/` (four files) and
  `tests/refactor/moved-modules.mjs`. The `docs/system` edits are **not** review scope but they
  bear on it — see §2.
- Deleted: `modules/access/components/workspace-administration/WorkspaceListSkeleton.tsx`,
  `modules/workspace/components/workspace-administration/warehouses/WarehouseListSkeleton.tsx`.
- New directories: `modules/workspace/loaders/`, `modules/access/loaders/`,
  `src/test/loader-permission-parity/`, `src/test/readiness-documentation/`,
  `src/test/readiness-removal/`, `src/test/route-readiness/`.

## 2. Provenance caveat — the change edited its own rulebook

Commit `9e91a30` amended `docs/system/frontend-architecture.md`,
`docs/system/guides/adding-a-web-module.md`, `docs/system/guides/writing-web-components.md` and
`docs/system/web-index.md` on this branch. The change request's own rollout
([`change.md`](../change.md) §6 step 6) places that reconciliation **at ship, after review PASSes** —
so it landed early, and judging the code against rules the same branch wrote is circular.

Every reviewer pass therefore dated each cited rule against `ba5e9e0`. Result:

- `docs/system/adr/*`, `guides/placing-web-*.md`, `guides/writing-web-conditional-components.md`,
  `guides/sharing-web-state-with-context.md`, `guides/web-error-handling.md`,
  `guides/adding-and-maintaining-web-localization.md`, `guides/heroui-design-principles.md`,
  `sad.md` and `architecture-map.md` are **byte-identical** at `ba5e9e0` and `HEAD`. Every finding
  below that cites one of these cites a rule that predates the change.
- Finding **B3** is the exception and says so: it cites a `frontend-architecture.md` §Page sentence
  this change wrote. The finding is that the change does not satisfy the rule it authored.

Related: `frontend-architecture.md` §Source structure and `guides/adding-a-web-module.md` §5 now
cite [`adr/0001-module-owned-route-loaders.md`](../adr/0001-module-owned-route-loaders.md) as the
governing decision for `modules/<module>/loaders/`, but that ADR lives under `docs/change-requests/`
and `docs/system/web-index.md` §Decisions does not list it. Folded into **B1**'s resolution.

## 3. Document manifest

Read in full this run. The floor is `frontend-architecture.md`, `architecture-map.md` and every
Accepted ADR in the index; the rest were selected from `web-index.md`'s own "when it applies"
descriptions against the changed paths.

### Architecture

- `docs/system/web-index.md` — the authoritative index, read first
- `docs/system/frontend-architecture.md`
- `docs/system/architecture-map.md`
- `docs/system/sad.md`

### Guides

- `docs/system/guides/adding-a-web-module.md` — new routes, loaders, module surface
- `docs/system/guides/placing-web-components.md` — two components deleted, several moved
- `docs/system/guides/writing-web-components.md` — every touched component
- `docs/system/guides/writing-web-conditional-components.md` — readiness branches removed
- `docs/system/guides/placing-web-hooks.md` — new projection, new utils, five query hooks
- `docs/system/guides/placing-web-tests.md` — four new `src/test/` directories, many colocated specs
- `docs/system/guides/sharing-web-state-with-context.md` — `useWorkspaceAdministrationContext`
- `docs/system/guides/web-error-handling.md` — error/empty/success ownership
- `docs/system/guides/adding-and-maintaining-web-localization.md` — 14 keys removed
- `docs/system/guides/heroui-design-principles.md` — `Skeleton`/`Spinner` removal, `Tabs.Panel`
- `docs/system/guides/heroui-react-v3-docs-index.md` — resolved `Tabs.Panel` before judging it
- `docs/system/guides/adding-and-using-contracts.md` — applies vacuously; `packages/contracts` untouched

### Decisions

- `docs/system/adr/19-08-2026-declarative-permission-gates.md` — **Accepted**
- `docs/system/adr/19-08-2026-generated-mutation-hooks-in-components.md` — **Accepted**
- `docs/system/adr/18-08-2026-scope-of-exercise-placement-tiebreak.md` — **Accepted**, governs placement
- `docs/system/adr/14-08-2026-domain-owned-flat-modules.md` — **Superseded**; read for reasoning only
- `docs/system/adr/02-08-2026-rtk-query-for-web-api-calls.md` — **Accepted**
- `docs/system/adr/27-07-2026-bundled-centralized-web-translations.md` — **Accepted**
- `docs/system/adr/12-07-2026-schema-validation-with-zod.md` — **Accepted**

### Read for context, never cited as the rule

- `docs/change-requests/global-loader/change.md`, `sad.md`, `spec.md`
- `docs/change-requests/global-loader/adr/0001-module-owned-route-loaders.md`
- `docs/change-requests/global-loader/adr/0002-one-pending-boundary-per-route-branch.md`

### Manifest-vs-index disagreement

None. `references/web-manifest.md`'s selector agreed with `web-index.md` on every changed path.

## 4. Findings

Every finding below was verified against the working tree by the coordinating skill, independently
of the reviewer that raised it.

### Blocking

- **[blocking] B1 — the three access Permission sets were promoted into a shared exported table** —
  `apps/web/src/modules/access/utils/access-permission-sets.ts:28,41,56`; consumers
  `modules/access/components/access-workspace/AccessWorkspace.tsx:9`,
  `modules/access/hooks/queries/useAccessRoles.ts:4`, `.../useAccessMembers.ts:4`,
  `.../useAccessPermissions.ts:4`, `modules/access/loaders/access-surface.loader.ts:2-6`;
  rule: `docs/system/adr/19-08-2026-declarative-permission-gates.md` §Decision 5 — "the list is a
  `const` in that surface's own file, named for what it admits … and **exported to nobody**. There is
  no shared capability table to consult"; problem: at `ba5e9e0` all four sets were file-private in the
  surfaces that named them, and the change lifted three of them into one exported module. The
  arrangement is the `accessGrants` alternative §Alternatives records as "tried, then rejected", and
  §Consequences already priced the duplication it removes ("two sites can drift. That is the accepted
  price of having no capability layer"). The fusion has already cost something: `useAccessPermissions`'s
  own 3-id `permissionsReadPermissions` was deleted and replaced by the 6-id `rolesTabPermissions`, so
  one shared name now carries two rules. [ADR 0001](../adr/0001-module-owned-route-loaders.md) decided
  the move, but a work-item ADR may narrow an Accepted system rule, never loosen one, and it is not
  listed in `web-index.md` §Decisions; suggested: either restore the file-private consts, or amend
  ADR 19-08 §Decision 5 with a system ADR.
  **Resolution: Change the rule.** The centralization is the intended steady state. Route to
  `/decide-adr` for a `docs/system/adr/` ADR amending 19-08-2026 §Decision 5, add it to
  `web-index.md` §Decisions, and promote ADR 0001 to `docs/system/adr/` alongside it, repointing the
  two `docs/system` links named in §2. The code stays as written. This also closes the ADR-0001-home
  advisory.

- **[blocking] B2 — `shouldForceMount` renders every admitted tab panel visible at once** —
  `apps/web/src/modules/access/components/access-workspace/AccessWorkspace.tsx:101`,
  `apps/web/src/modules/workspace/components/WorkspaceAdministration.tsx:146`;
  rule: `docs/system/guides/heroui-design-principles.md` §2 "Accessibility as the foundation, not an
  add-on" and §"Applying these principles here" ("Read the component's HeroUI documentation … before
  adding a prop"); problem: `shouldForceMount` is absent from the `Tabs.Panel` API table in
  `.heroui-docs/react/components/(navigation)/tabs.mdx`. It is a React Aria pass-through whose own
  contract states inactive forced-mount panels "are inert and cannot be interacted with. They **must be
  styled appropriately so this is clear to the user visually**"
  (`react-aria-components@1.20.0` `dist/types/src/Tabs.d.ts`). Verified in the installed packages:
  the implementation emits `inert` / `data-inert="true"` and **no** `hidden`; HeroUI's `TabPanel`
  (`@heroui/react@3.2.4` `dist/components/tabs/tabs.js:214-224`) only composes `className`;
  `@heroui/styles@3.2.4` `dist/components/tabs.css:195-212` `.tabs__panel` declares no `[data-inert]`
  rule; and `apps/web/src/styles/` contains no `inert` selector. So `/workspace` stacks all four
  admitted panels and `/warehouses/$id/access` stacks all three, duplicate `role="region"` landmarks
  included. The suite cannot catch it: an unselected panel carries no `tabpanel` role, so
  `AccessWorkspace.spec.tsx:203`'s `getAllByRole('tabpanel')).toHaveLength(1)` passes while the content
  is on screen. `sad.md` §4.4 records only the test-query consequence, not the visual one, so this is an
  oversight rather than an accepted trade.
  **Resolution: Fix now.** Supply the visibility rule the prop's contract requires — e.g.
  `data-[inert]:hidden` on both `Tabs.Panel` `className`s — and pin it with a spec asserting an
  unselected panel's content is not visible. Retains the loader-entry retention force-mounting buys.

- **[blocking] B3 — three Workspace-administration surfaces lost their readiness guard without gaining
  an error arm, so a failed secondary read paints a false empty** —
  `apps/web/src/modules/access/components/workspace-administration/roles/WorkspaceRolesTab.tsx:28`,
  `.../permissions/WorkspacePermissionsTab.tsx:28`,
  `apps/web/src/modules/workspace/components/workspace-administration/warehouses/WarehousesTab.tsx:52`;
  rule: `docs/system/frontend-architecture.md` §Page — "error, empty and success stay with the narrowest
  component that can coordinate them, so a permitted actor whose read failed still reaches that
  component's own error arm rather than an empty surface"; problem: **this sentence was written by this
  change** (`git show ba5e9e0:docs/system/frontend-architecture.md` §Page has only "the narrowest owner
  that can coordinate the complete loading, error, empty, and success behavior"), so the finding is that
  the change does not satisfy the rule it authored. Verified: `useWorkspaceRoles.ts:41` and
  `useWorkspacePermissionCatalogue.ts:42` both collapse a failed read to `data ?? []` and expose no
  `isError`, and `WarehousesTab.tsx:52` destructures `data: warehouses = []` alone. Each tab removed its
  only failed-read affordance (the `isReady` skeleton at `ba5e9e0`) and added nothing, so a permitted
  actor whose read fails is told `warehouses.empty` ("This workspace has no warehouse yet.",
  `WarehouseList.tsx:57`), `workspaceRoles.empty` (`WorkspaceRoleList.tsx:89`), or an empty Permission
  catalogue. `Promise.allSettled` at `workspace-administration.loader.ts:99` is what makes the state
  reachable, and that file asserts the opposite in prose at `:77` ("a failed entry is already in the
  cache with `isError: true` for the tab's own error arm to render (CR-AC-15)") — no such arm exists.
  The access surface conforms: `AccessDataset.isError` survives into `DatasetCard.tsx:35-36`. Note these
  three tabs had no error arm at `ba5e9e0` either; the change converts "skeleton forever" into "false
  empty", and CH-15's premise that the tab renders "its **existing** component-owned error message" is
  false for them.
  **Resolution: Fix now.** Surface `isError` from those three reads the way `AccessDataset` still does,
  and give each tab its own failed-read arm. Keeps error with the narrowest component while readiness
  stays with the route.

- **[blocking] B4 — a `src/test/` spec reaches past `modules/access`'s declared public surface** —
  `apps/web/src/test/loader-permission-parity/loader-permission-parity.spec.ts:11-15` imports
  `modules/access/utils/access-permission-sets`, which is absent from `MODULE_SURFACE.access`
  (`apps/web/src/test/module-boundaries/module-surface.ts:36-47`);
  rule: `docs/system/guides/adding-a-web-module.md` §2 "Import other modules through their declared
  surface" — "The composition layer — `router.ts`, `store/index.ts`, `guards/`, `shared/layouts/` and
  `test/` fixtures — is bound by the same rule. It differs in **reach**, not in **exemption**"; preserved
  by `docs/system/adr/18-08-2026-scope-of-exercise-placement-tiebreak.md` §Decision; problem: every other
  `src/test/` import of a module lands on a declared entry with its importer named beside it, and this
  one does not. It is invisible to enforcement because `module-boundaries.spec.ts:51` filters
  `*.spec.ts(x)` out of the scan — a documented scan _scope_ which that file's own header calls "not an
  exception". The declaration file that is meant to be the mechanism records the `loaders/` entry for
  the production import but silently omits this one.
  **Resolution: Fix now.** Add `'modules/access/utils/access-permission-sets'` to
  `MODULE_SURFACE.access` with the importing spec named beside it, matching the `auth.slice` entry's
  convention. (Initially routed as "follows from B1"; that no longer applies, because B1 keeps the
  shared table.)

### Advisory

- **[advisory] A1 — a durable `docs/system` rule is decided by a change-request ADR the index does not
  list** — `docs/system/frontend-architecture.md:96-105`, `docs/system/guides/adding-a-web-module.md:156`;
  rule: `docs/system/web-index.md` §Decisions and its opening line ("Table of contents for **every**
  `docs/system` document that governs work in `apps/web`"), held to the standard
  `adr/18-08-2026-scope-of-exercise-placement-tiebreak.md` §Consequences sets ("reachable from
  `web-index.md` without reconciling an ADR against a guide"). The rule's _content_ is consistent with
  the Accepted ADRs it must not loosen; only its home is at issue.
  **Resolution: subsumed by B1** — ADR 0001 is promoted to `docs/system/adr/` and indexed in the same
  `/decide-adr` routing.

- **[advisory] A2 — a `docs/system` documentation gate is filed inside `apps/web`'s spec tree** —
  `apps/web/src/test/readiness-documentation/readiness-documentation.spec.ts:1,56-60,404`;
  rule: `docs/system/guides/placing-web-tests.md` intro ("This guide applies to `apps/web`") and §3
  ("**Structural gates.** The subject is the arrangement of **the tree**"); problem: the spec's subject
  is four `docs/system` documents; it resolves `REPOSITORY_ROOT` two levels above `apps/web` and reads
  nothing under `apps/web/src`, so a `docs/system` copy-edit fails
  `pnpm --filter @warehouser/web test`. `tests/refactor/placement-decision.spec.mjs` is the
  repository-root precedent for exactly this shape. The three sibling new `src/test/` directories all
  read `apps/web/src` and are correctly placed.
  **Resolution: Defer.** Recorded in [`spec.md`](../spec.md) §8 Open questions — owner: Tech Lead,
  due: `ship`, when CH-01 reconciles `docs/system` anyway.

- **[advisory] A3 — the Permission-catalogue read is gated by a set named for a tab** —
  `apps/web/src/modules/access/hooks/queries/useAccessPermissions.ts:23`;
  rule: `docs/system/adr/19-08-2026-declarative-permission-gates.md` §Decision 5 ("named for what it
  admits").
  **Resolution: Not an issue.** `access-permission-sets.ts:22-26` states the identity deliberately —
  "every actor admitted to the Roles tab receives the catalogue, so **tab admission implies the dataset
  arrives** is an identity a reader can see rather than an invariant a comment claims. That identity is
  the reachability argument CR-RG-05 rests on." Borrowing the tab's name is the point, not an accident.
  The 3→6 widening itself is deliberate and recorded (`change.md` §4, CR-RG-02) and is flagged to
  `/review` in §6.

- **[advisory] A4 — `MemberRowTrailing` takes two booleans derived from one value** —
  `apps/web/src/modules/access/components/access-workspace/components/members/MemberRow.tsx:42,48,134-135,176`;
  rule: `docs/system/guides/writing-web-components.md` §5 "Depend on the narrowest contract" and §9
  "Resist boolean prop proliferation" (both predate the change); problem: the change added
  `isActorResolved` beside the existing `isSelf`, both computed at `:134-135` from the single
  `actorUserId`, so the helper carries five props for one identity question.
  **Resolution: Fix now.** Pass `actorUserId` and the member and let the helper answer "unresolved" and
  "self" itself, keeping the identity rule in one place. CR-RG-01's guarantee (an unresolved actor must
  not silently un-self a row) must stay pinned by its existing spec.

## 5. Checked and conforming

Recorded so a later run does not re-derive them:

- **Placement.** The two deleted skeletons left nothing stranded; `WORKSPACE_MODULE_MANIFEST` dropped
  `WarehouseListSkeleton.tsx` and no production file names either symbol.
  `modules/workspace/hooks/projections/useWorkspaceAdministrationContext.ts` is correctly filed
  (`placing-web-hooks.md` §2 — it derives from state already loaded, and calling a query hook does not
  make it a query) and correctly owned (entity scope and scope of exercise are both the Workspace, so
  the 18-08 tiebreak does not fire). `modules/access/loaders/workspace-administration-datasets.loader.ts`
  stays in `modules/access` for the same reason the access tabs do. All five module `hooks/` directories
  use only the five permitted names.
- **Cross-module production import.** `modules/workspace/loaders/workspace-administration.loader.ts:3`
  is declared at `module-surface.ts:45-46` and genuinely enforced by `module-boundaries.spec.ts:243-249`.
- **Loader rules** (`frontend-architecture.md` §Source structure). None of the three loaders imports a
  page or a component. `loadAccessSurface`'s `context.status !== 'entered'` check
  (`access-surface.loader.ts:124`) reads the verdict `resolveWarehouseEntry` published rather than
  deriving one, and throws no redirect — it dispatches, it does not decide access.
- **RTK Query boundary.** Both loaders dispatch `endpoints.<name>.initiate` and `unwrap()` the primary
  read, which is the non-React path `frontend-architecture.md` §Redux Toolkit infrastructure and
  ADR 02-08-2026 prescribe. `subscribe: false` and `Tabs.Panel shouldForceMount` are addressed by no
  `docs/system` rule, so neither is citable either way — B2 reaches the latter through the HeroUI guide.
- **Route layer.** `modules/workspace/route.tsx:35` and `modules/access/route.tsx:32` are `loader:`
  wiring with no dispatch. `routes/warehouse.route.tsx`'s `lastVerdictByStore` WeakMap and
  `cause === 'stay'` branch are **pre-existing at `ba5e9e0`** — this diff adds only
  `pendingComponent`/`pendingMs`/`pendingMinMs` — so they are an observation, not a finding.
- **Context.** No `createContext` exists anywhere in `apps/web/src`, so
  `guides/sharing-web-state-with-context.md`'s "`apps/web` contains no React context today" is still
  true. `useWorkspaceAdministrationContext` names a domain `WorkspaceContext`, not a React one.
- **Contracts.** None of the seven removed readiness fields crossed the web↔server boundary;
  `packages/contracts` is untouched and `access-dataset.ts` stays legitimately in `modules/access/utils/`.
- **Localization.** Exactly 7 keys per language removed (5 `access`, 1 `warehouse`, 1 `workspace`);
  `en`/`uk` key sets identical across all 11 namespaces; no production file references a removed key;
  the only surviving waiting copy is `common:shell.landing.pendingLabel`
  (`shared/components/RoutePendingState.tsx:22`); `apps/web/src` has zero `Skeleton` usages and one
  `Spinner`.
- **Test placement.** Every new colocated spec sits beside its subject; the three sibling `src/test/`
  gate directories are named for what they establish and carry the "why no owner exists" header §3
  requires.

### Observations — pre-existing at `ba5e9e0`, not findings

- `WorkspaceAdministration.tsx:121-128` `shortLabel ? <>…</> : label` is a ternary choosing between
  elements, against `guides/writing-web-conditional-components.md` §1. Unchanged by this diff.
- `WorkspaceAdministration.tsx:29-34,148` expresses a tab's panel as a module-level
  `Partial<Record<string, ReactElement>>` with `?? null`, where `AccessWorkspace.tsx`'s descriptor
  `panel` field is the shape ADR 19-08 §Decision 2 sanctions. The `Partial` + `?? null` pair means an
  `id` with no entry renders a silently empty panel with no type error. Neither line was written or
  moved by this change.
- `DatasetCard.tsx:34-39`'s `let content` + `if`/`else if` survives with two arms; the change rewrote
  the chain head at `:35`, but the shape and the mutable binding predate it and no manifest rule forbids
  a two-arm value assignment outside JSX.
- `src/test/locale-baseline.json` sits at the `src/test/` root but is read by exactly one spec
  (`src/i18n.spec.ts:5`), which `placing-web-tests.md` §4 files inside the consuming spec's directory.
  The change edited its contents, not its location.
- `hasPermission` / `hasWorkspacePermission` were already exported at `ba5e9e0`; the diff adds only
  three importers. `placing-web-hooks.md` §3 binds files, not exports, and both files declare hooks, so
  placement conforms. They are not a capability layer — they take a `PermissionId` and answer at the
  site that dispatches, which is ADR 19-08 §Decision 3's sanctioned "feeds a query `skip`" case.

## 6. Noted for `/review` — not adjudicated here

- `useAccessPermissions.ts:23` widens the catalogue skip set from 3 ids to 6. Recorded as the one
  deliberate widening (`change.md` §4, CR-RG-02), but it is a request-count and data-exposure change on
  a permitted-actor path — confirm an assertion fails if it widens further.
- CR-AC-03's force-mount clause and CR-AC-15's "the tab's own error arm" are asserted in `sad.md` §4.4
  and `workspace-administration.loader.ts:77` but are not realized in the code (B2, B3).
- `change.md` §6 step 6 places CH-01's `docs/system` reconciliation at ship, after review PASSes, but
  commit `9e91a30` already landed it and `src/test/readiness-documentation/` gates it. The rollout
  ordering and the merged state disagree.

## 6a. Correction — an advisory dropped when the three passes were merged

The state/authorization pass raised a fourth advisory that did not survive into §4 of this record,
and its omission was mine, not a resolution:

- **[advisory] A5 — `WorkspaceMembersTab` answers a failed read with silence** —
  `apps/web/src/modules/access/components/workspace-administration/members/WorkspaceMembersTab.tsx:36-39`;
  rule: `docs/system/frontend-architecture.md` §Page; problem: `!members ? null : …` / `!users ? null : …`
  correctly refuses to state a false empty (CR-RG-05), but a permitted actor whose
  `listWorkspaceMembers` read failed gets a section holding only the Add control and no explanation.
  The file's own comment records the choice, so it is a deliberate half-measure rather than an
  oversight — which is why it was raised as advisory and not with B3's three surfaces.
  **Resolution: Defer.** Recorded in [`spec.md`](../spec.md) §8 Open questions — owner: Tech Lead,
  due: `ship`. `useWorkspaceMembers` now sits beside two sibling hooks that publish `isError`, so the
  fix is a one-line hook change plus an arm; it was left out of the F1–F4 batch to keep that batch to
  the findings this record actually resolved.

## 6b. Fix batch — F1–F4

Run by `/implement change-request:global-loader` on 2026-08-25, sequential mode, one commit per task,
each through the full gate (`unit` + `lint` + `vet`; integration NON-red — `apps/web` has no
integration tier).

| Task | Finding | Commit                                                                                 | Gate                                           |
| ---- | ------- | -------------------------------------------------------------------------------------- | ---------------------------------------------- |
| F1   | B2      | `cc004b1` fix(global-loader): hide the inert force-mounted tab panels                  | 800/800, lint clean, tsc clean, build verified |
| F2   | B3      | `d612a94` fix(global-loader): give the three Workspace surfaces a failed-read arm      | 803/803, lint clean, tsc clean                 |
| F3   | B4      | `64efe76` fix(global-loader): declare the Permission-set entry the parity gate crosses | 804/804, lint clean, tsc clean                 |
| F4   | A4      | `e3f0fd1` refactor(global-loader): let MemberRowTrailing answer the identity question  | 804/804, lint clean, tsc clean                 |

Notes that bear on a re-review:

- **F1 was verified beyond the assertion.** jsdom applies no stylesheet, so the spec can only read the
  class. `pnpm --filter @warehouser/web build` was run and the emitted stylesheet contains
  `.data-\[inert\]\:hidden[data-inert]{display:none}` — the panels are genuinely hidden, not merely
  annotated.
- **F2 touched three structural gates, each through its own sanctioned mechanism**: the case
  inventory's `ADDED_CASES`, the split gate's branch-shape assertion, and the locale identity
  baseline. Both hook contract gates remain exact key-set assertions, so a readiness field returning
  still fails them — `isError` is not one of CH-09's seven fields, and `readiness-removal.spec.ts`
  neither forbids it nor was modified.
- **F3 extended the boundary scan** to `src/test/` specs rather than only declaring the entry, because
  the entry alone would have stayed unenforced. Colocated specs remain out of scope; the one
  pre-existing test-only coupling (`modules/workspace/utils/warehouse-name-validation`) is carried as
  a named, closed exception with the reason the scan-scope note already gives.
- **F4 was a refactor against green**, not a RED cycle: the "You" chip and CR-RG-01's unresolved-actor
  case are already pinned by `MemberList.spec.tsx` and `MembersTab.spec.tsx`, and no observable
  behavior changed.
- **B1 is not addressed by this batch and remains open by design** — its resolution is a system ADR
  amending 19-08-2026 §Decision 5, routed to `/decide-adr`. A re-run of this skill will still report
  it until that ADR lands.

## 7. Verdict

**CHANGES REQUESTED**

Four blocking findings. B2, B3 and B4 are fixes to `apps/web`; B1 is resolved by amending the system
decision rather than the code, and carries A1 with it. A4 is a small fix taken in the same batch;
A2 is deferred to `spec.md` §8; A3 is dismissed with the document text that disproves it recorded
above.
