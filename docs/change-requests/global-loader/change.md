---
kind: change-request
slug: 'global-loader'
status: Draft
owner: 'YuriiH'
reviewers: ['Product Owner', 'Tech Lead']
updated_at: '2026-08-21'
baseline_revision: 'ba5e9e09fa1ba8374807b237b68d353b18f00e7c'
compatibility: 'backward-compatible'
affected_sources:
  # Canonical documentation
  - 'docs/system/frontend-architecture.md#page'
  - 'docs/system/guides/writing-web-components.md#1-export-one-component-per-file'
  - 'docs/system/guides/writing-web-components.md#3-give-each-component-one-reason-to-change'
  - 'docs/system/guides/writing-web-components.md#4-read-data-where-you-use-it'
  - 'docs/system/guides/writing-web-components.md#6-keep-branching-flat'
  # Routes
  - 'apps/web/src/routes/warehouse.route.tsx'
  - 'apps/web/src/modules/workspace/route.tsx'
  - 'apps/web/src/modules/access/route.tsx'
  # Pages and composition roots
  - 'apps/web/src/modules/workspace/components/WorkspaceAdministration.tsx'
  - 'apps/web/src/modules/access/page.tsx'
  # Shared components and contracts
  - 'apps/web/src/shared/components/DatasetCard.tsx'
  - 'apps/web/src/modules/access/utils/access-dataset.ts'
  - 'apps/web/src/shared/hooks/queries/usePermissions.ts'
  - 'apps/web/src/shared/hooks/queries/useWorkspacePermissions.ts'
  - 'apps/web/src/modules/access/hooks/queries/useWorkspaceRoles.ts'
  - 'apps/web/src/modules/access/hooks/queries/useWorkspacePermissionCatalogue.ts'
  # Skeleton surfaces and their call sites
  - 'apps/web/src/modules/access/components/workspace-administration/WorkspaceListSkeleton.tsx'
  - 'apps/web/src/modules/workspace/components/workspace-administration/warehouses/WarehouseListSkeleton.tsx'
  - 'apps/web/src/modules/access/components/workspace-administration/roles/WorkspaceRolesTab.tsx'
  - 'apps/web/src/modules/access/components/workspace-administration/members/WorkspaceMembersTab.tsx'
  - 'apps/web/src/modules/access/components/workspace-administration/members/WorkspaceMemberList.tsx'
  - 'apps/web/src/modules/access/components/workspace-administration/permissions/WorkspacePermissionsTab.tsx'
  - 'apps/web/src/modules/access/components/access-workspace/components/members/MembersTab.tsx'
  - 'apps/web/src/modules/access/components/access-workspace/components/members/MembersDatasetCard.tsx'
  - 'apps/web/src/modules/access/components/access-workspace/components/members/MemberDirectory.tsx'
  - 'apps/web/src/modules/access/components/access-workspace/components/members/MemberList.tsx'
  - 'apps/web/src/modules/access/components/access-workspace/components/roles/RolesTab.tsx'
  - 'apps/web/src/modules/access/components/access-workspace/components/roles/RolesDatasetCard.tsx'
  - 'apps/web/src/modules/access/components/access-workspace/components/permissions/PermissionsTab.tsx'
  - 'apps/web/src/modules/workspace/components/workspace-administration/warehouses/WarehousesTab.tsx'
  - 'apps/web/src/modules/workspace/components/workspace-administration/warehouses/WarehouseList.tsx'
  # Structural tests
  - 'apps/web/src/test/module-boundaries/module-surface.ts'
  - 'apps/web/src/test/warehouse-administration-split/warehouse-administration-split.spec.ts'
  - 'apps/web/src/test/warehouses-tab-case-inventory/warehouses-tab-case-inventory.spec.ts'
  - 'apps/web/src/shared/layouts/Sidebar.spec.tsx'
  # Localization
  - 'apps/web/public/locales/en/access.json'
  - 'apps/web/public/locales/en/warehouse.json'
  - 'apps/web/public/locales/en/workspace.json'
  - 'apps/web/public/locales/uk/access.json'
  - 'apps/web/public/locales/uk/warehouse.json'
  - 'apps/web/public/locales/uk/workspace.json'
---

# Change request — global-loader

> Requested as `gloabal-loader`; the slug is spelled `global-loader` here and in every downstream
> handoff. Nothing else about the request is reinterpreted.

## 1. Behavioral delta

When an authenticated actor opens a destination whose data has not arrived yet, current behavior is
that each component decides for itself what to show while it waits — a full-page `Spinner` in
`WorkspaceAdministration` and `AccessPage`, and five distinct skeleton surfaces elsewhere (§1.1) —
while the window during which a route guard awaits the network is painted on only one of four
routes; approved behavior will be that the **route** owns that window and renders the one shared
`RoutePendingState`, and every component renders only data that has already arrived.

### 1.1 The baseline enumeration

Every count in this request and in `spec.md` §7 is graded against this list. There are **seven**
waiting affordances at `baseline_revision`:

| #   | Affordance                                                             | Rendered at                                                                                          |
| --- | ---------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| 1   | `Spinner` in `WorkspaceAdministration.tsx:78-85`                       | `/workspace`                                                                                         |
| 2   | `Spinner` in `access/page.tsx:13-20`                                   | `/warehouses/$id/access`                                                                             |
| 3   | `WorkspaceListSkeleton.tsx` (component)                                | 3 call sites: `WorkspaceRolesTab.tsx:32`, `WorkspaceMembersTab.tsx:28`, `WorkspaceMemberList.tsx:28` |
| 4   | `WarehouseListSkeleton.tsx` (component)                                | 1 call site: `WarehouseList.tsx:54`                                                                  |
| 5   | `DatasetSkeleton` (private helper in `DatasetCard.tsx:28-33`)          | 3 call sites: `MembersDatasetCard.tsx:23`, `RolesDatasetCard.tsx:24`, `PermissionsTab.tsx:21`        |
| 6   | Inline `Skeleton` block in `MemberList.tsx:26-34` (`'loading'` status) | the access Members list                                                                              |
| 7   | Inline `Skeleton` block in `WorkspacePermissionsTab.tsx:27-33`         | the Workspace Permissions tab                                                                        |

And **seven** readiness fields across the five contract files CH-09 targets:

`access-dataset.ts:5,7,9` (`isFetching`, `isLoading`, `isReady`) · `usePermissions.ts:28`
(`isLoading`) · `useWorkspacePermissions.ts:23` (`isLoading`) · `useWorkspaceRoles.ts:22`
(`isReady`) · `useWorkspacePermissionCatalogue.ts:21` (`isReady`).

Six further readiness values live in _component_ contracts and are removed by CH-07, CH-11, CH-13
and CH-14 rather than by CH-09: `DatasetCardProps.loading` and `.loadingLabel`
(`DatasetCard.tsx:11-12`), `MemberListProps.isLoading` (`MemberList.tsx:53`),
`MemberDirectoryProps.isRefreshing` (`MemberDirectory.tsx:27`), `WarehouseListProps.isLoading`
(`WarehouseList.tsx:13`), and `WarehousesTab.tsx:80-81`'s derived `isLoading`.

## 2. Motivation

The readiness rule is currently per-component, so it is inconsistent by construction, and one of its
instances is already dead:

- **The `/workspace` spinner does not run.** `guards/workspace.guard.ts:19-25` awaits
  `getWorkspaceContext` in `workspaceRoute.beforeLoad`, so RTK Query serves a fulfilled cache entry
  by the time `WorkspaceAdministration` mounts and `isLoading` reads `false` on its first render.
  The branch at `WorkspaceAdministration.tsx:78` is unreachable, and so is the
  `if (!workspaceContext) return null` at `:87` immediately below it (CH-13).
- **The window that is real is unpainted.** `workspaceRoute`, `warehouseRoute` and `accessRoute`
  declare no `pendingComponent`, so while their `beforeLoad` awaits the network the actor sits on
  the previous page with no signal. Only `homeRoute` handles this, and it handles it correctly — the
  pattern this request generalizes.

Seven different waiting affordances across three modules also means seven things to keep consistent
and seven ways for a reviewer to be unsure which is correct. One route-owned loader collapses that
to one decision recorded in one place, and moves the awaited reads to the router boundary where they
can be issued in parallel rather than discovered one component at a time
(`.claude/skills/vercel-react-best-practices` → `async-parallel`, `async-suspense-boundaries`).

> **Correction against an earlier draft of this request.** `MemberDirectory.tsx:122`'s
> `actor === null` arm is **not** dead. `SignOutButton.tsx:26-27` dispatches `authBecameAnonymous()`
> _before_ awaiting `navigate`, so `selectCurrentUser` becomes `null` while the member list is still
> mounted. CH-11 therefore removes a live guard, and CR-RG-01 is a load-bearing regression boundary
> rather than a formality.

## 3. Override map

Every row is graded against `baseline_revision`. Omission means unchanged; it never means silently
removed.

| ID     | Target/source                                                                                                                                                                                                                                                                                                                                                | Existing behavior                                                                                                                                                                                                                        | Operation | New behavior                                                                                                                                                                                                                                                                                      | Compatibility                                                                                   | CR acceptance criteria                 |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- | -------------------------------------- |
| CH-01  | `docs/system/frontend-architecture.md` §Page                                                                                                                                                                                                                                                                                                                 | "Use the narrowest owner that can coordinate the complete loading, error, empty, and success behavior." Loading may be owned by any component.                                                                                           | AMEND     | Loading — first-paint readiness of a destination — is owned by the **route**. The narrowest-owner rule continues to govern error, empty and success behavior, which stay component-owned.                                                                                                         | Backward-compatible; reconciled at **ship**, not at merge (§6 step 6)                           | CR-AC-01                               |
| CH-02  | `routes/warehouse.route.tsx:38-43`, `modules/workspace/route.tsx:8-12`, `modules/access/route.tsx:14-18`                                                                                                                                                                                                                                                     | None of the three declares `pendingComponent`; the guard/loader await window paints nothing and the actor remains on the previous page                                                                                                   | ADD       | Each declares `pendingComponent: RoutePendingState`, matching `homeRoute:23`. Exactly one pending state paints per navigation (CR-AC-13)                                                                                                                                                          | Backward-compatible; new affordance in an empty window                                          | CR-AC-02, CR-AC-13                     |
| CH-02a | `modules/workspace/route.tsx`, `modules/access/route.tsx`                                                                                                                                                                                                                                                                                                    | Neither declares `errorComponent`. `warehouse.route.tsx:43` and `home/route.tsx:22` **already declare it** and are untouched by this row                                                                                                 | ADD       | Both declare `errorComponent: RouteErrorState`, so a failed primary read paints the standard error state rather than propagating to the root                                                                                                                                                      | Backward-compatible                                                                             | CR-AC-02                               |
| CH-03  | `modules/workspace/route.tsx`                                                                                                                                                                                                                                                                                                                                | No `loader`. Each of the four administration tabs fetches its own dataset after the page mounts                                                                                                                                          | ADD       | A `loader` awaits every tab dataset the actor's Workspace Permissions admit, dispatched in parallel and **settled, not all-or-nothing** (CH-15). Tabs remain client state; the URL is unchanged                                                                                                   | Backward-compatible; `/workspace` first paint is later                                          | CR-AC-03                               |
| CH-04  | `modules/access/route.tsx`                                                                                                                                                                                                                                                                                                                                   | No `loader` and no `beforeLoad`; `getCurrentAccess` and each access tab's dataset are fetched after `AccessPage` mounts                                                                                                                  | ADD       | A `loader` that (1) returns immediately unless the parent verdict is `entered` (CH-16), (2) awaits `getCurrentAccess` — **sequentially, because every tab skip is derived from it** — then (3) dispatches the admitted tab datasets in parallel and settles                                       | Backward-compatible                                                                             | CR-AC-04, CR-AC-14                     |
| CH-05  | `WorkspaceAdministration.tsx:78-85`                                                                                                                                                                                                                                                                                                                          | `if (isLoading) return <Spinner/>` — already unreachable (§2)                                                                                                                                                                            | REMOVE    | Explicitly absent. The component reads `workspaceContext` and renders it                                                                                                                                                                                                                          | Backward-compatible; removes dead code                                                          | CR-AC-05                               |
| CH-06  | `modules/access/page.tsx:13-20`                                                                                                                                                                                                                                                                                                                              | `if (isLoading) return <Spinner/>` — reachable today, since no guard prefetches `getCurrentAccess`                                                                                                                                       | REMOVE    | Explicitly absent. CH-04's loader covers the window this branch covered                                                                                                                                                                                                                           | Backward-compatible                                                                             | CR-AC-06                               |
| CH-07  | `shared/components/DatasetCard.tsx:11-12,28-33,44-46`                                                                                                                                                                                                                                                                                                        | Takes `loading` + `loadingLabel` props and renders a private `DatasetSkeleton`                                                                                                                                                           | AMEND     | Both props and `DatasetSkeleton` are gone. The card's `error`, `empty` and content behavior is unchanged                                                                                                                                                                                          | Breaking for its 3 callers, all updated by CH-14                                                | CR-AC-07                               |
| CH-08  | `WorkspaceListSkeleton.tsx`, `WarehouseListSkeleton.tsx`, `MemberList.tsx:15,26-34`, `WorkspacePermissionsTab.tsx:27-33`                                                                                                                                                                                                                                     | Four of the seven affordances in §1.1 (rows 3, 4, 6, 7)                                                                                                                                                                                  | REMOVE    | Explicitly absent. Both skeleton component files are deleted; `MemberListStatus` narrows to `'empty' \| 'ready' \| 'searchEmpty'`; `WorkspacePermissionsTab` renders no `Skeleton`. Their five call-site branches are CH-14's                                                                     | Breaking for 4 test files, all named in §4                                                      | CR-AC-08                               |
| CH-09  | `access-dataset.ts:5,7,9`, `usePermissions.ts:28`, `useWorkspacePermissions.ts:23`, `useWorkspaceRoles.ts:22`, `useWorkspacePermissionCatalogue.ts:21`                                                                                                                                                                                                       | Seven readiness fields across five **contract** files (§1.1)                                                                                                                                                                             | REMOVE    | Explicitly absent from each of those five contracts. A hook returns the data it has. **This row is bounded to these five files**; component-level readiness is CH-07, CH-11, CH-13 and CH-14                                                                                                      | Breaking for in-repo callers, all updated by CH-14                                              | CR-AC-09                               |
| CH-10  | `MembersTab.tsx:36` → `MemberDirectory` `isRefreshing`                                                                                                                                                                                                                                                                                                       | A background refetch of an already-painted dataset re-enters the skeleton, replacing rows the actor is reading                                                                                                                           | REPLACE   | A refetch of already-painted data leaves the previous data on screen until the new data arrives. **A mutation-triggered cache invalidation must not re-run a route loader** and so must not paint `RoutePendingState` over a live destination                                                     | Backward-compatible; strictly less flicker                                                      | CR-AC-10                               |
| CH-11  | `MemberDirectory.tsx:122` `isLoading={isRefreshing \|\| actor === null}`                                                                                                                                                                                                                                                                                     | The list holds a skeleton until the auth store resolves the actor, so self-row gating never evaluates against an unresolved id. **Live, not dead — see §2's correction**                                                                 | REMOVE    | Explicitly absent. The `actorUserId={actor?.id ?? ''}` fallback at `:121` goes with it: an unresolved actor must not silently un-self every row. The guarantee moves to CR-RG-01                                                                                                                  | Backward-compatible **only if** CR-RG-01 holds                                                  | CR-AC-11, CR-RG-01                     |
| CH-12  | `public/locales/{en,uk}/access.json` (5 keys each), `.../warehouse.json` (1 each), `.../workspace.json` (1 each) — **7 per language, 14 total**                                                                                                                                                                                                              | Each skeleton names itself with its own translated loading label                                                                                                                                                                         | REMOVE    | Explicitly absent. `common.json` `shell.landing.pendingLabel`, which `RoutePendingState:21` already reads, becomes the only waiting copy in the app. Enumerated in CR-AC-12                                                                                                                       | Backward-compatible                                                                             | CR-AC-12                               |
| CH-13  | `WorkspaceAdministration.tsx:87-89` `if (!workspaceContext) return null`                                                                                                                                                                                                                                                                                     | A second unreachable branch, dead by the same argument §2 makes for `:78`                                                                                                                                                                | REMOVE    | Explicitly absent, together with CH-05. Leaving it would keep a readiness decision in a file CR-AC-05 declares free of one                                                                                                                                                                        | Backward-compatible; removes dead code                                                          | CR-AC-05                               |
| CH-14  | The nine call sites that consume what CH-07/CH-08/CH-09 remove — `MembersTab.tsx:26,36`, `RolesTab.tsx:46`, `MembersDatasetCard.tsx:19`, `RolesDatasetCard.tsx:20`, `PermissionsTab.tsx:17,21`, `WorkspaceRolesTab.tsx:31`, `WorkspaceMembersTab.tsx:27`, `WorkspaceMemberList.tsx:27`, plus `WarehousesTab.tsx:80-81,108,132` and `WarehouseList.tsx:13,53` | Each branches on a readiness value, and three conflate _not permitted_ with _not ready_ in one condition                                                                                                                                 | AMEND     | Each branch keeps only its permission and error/empty arms. `empty` becomes `items.length === 0` (CR-RG-05 constrains what this may change). `WarehousesTab`'s derived `isLoading` is deleted; its `detailPane` gate at `:108` becomes `!selectedWarehouse`                                       | Breaking in-repo only; **supersedes** `refactor-warehouse-components` CH-W5's anti-flash clause | CR-AC-07, CR-AC-08, CR-AC-09, CR-RG-05 |
| CH-15  | Loader failure semantics (new; no baseline)                                                                                                                                                                                                                                                                                                                  | N/A — no loader exists                                                                                                                                                                                                                   | ADD       | A **secondary** dataset that fails does not reject its route: the loader settles, the destination paints, and that dataset renders its existing component-owned error message. Only the destination's **primary** read (`getWorkspaceContext`, `getCurrentAccess`) rejects into `RouteErrorState` | Backward-compatible; preserves CR-RG-05                                                         | CR-AC-15                               |
| CH-16  | `modules/access/route.tsx` loader, around a refused Warehouse                                                                                                                                                                                                                                                                                                | `warehouseRoute.beforeLoad:56-61` _returns_ a refusal verdict rather than throwing, so child loaders still run. No request is issued today only because `useEnteredWarehouse:39` returns `undefined` and `usePermissions.ts:48-51` skips | ADD       | CH-04's loader returns immediately unless `context.status === 'entered'`. Without this row, moving the fetch to the route would issue `getCurrentAccess(refusedId)` for a Warehouse the actor was just refused                                                                                    | Backward-compatible; closes a leak the move would otherwise open                                | CR-AC-14, CR-RG-04                     |

Anything not listed is unchanged. In particular `FormModalDialog` / `ConfirmAlertDialog` / form
`isPending` submit state is mutation feedback rather than destination readiness and is untouched
(CR-RG-06), and `modules/home/route.spec.tsx:228`'s read of TanStack's own `router.state.isLoading`
is a router-owned field, not a contract this request narrows (CR-AC-09).

## 4. Impact analysis

| Area                         | State     | Evidence and consequence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ---------------------------- | --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Domain invariants            | unchanged | No business rule is restated. This request moves _when_ data is awaited, never _what_ the data means or who may see it.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| Permissions                  | affected  | CH-03/CH-04's loaders must reproduce the **exact** skip sets the hooks apply at `baseline_revision`, which are ANY-of sets, not single watch Permissions: `useAccessRoles.ts:15-24` (8 Permissions, including `USERS:WATCH` and `USERS:CREATE`, because the Members list needs Role names), `useAccessMembers.ts:15-23` (7, including `ROLES:ASSIGN`), `useAccessPermissions.ts:12-16` (3), `useWorkspaceRoles.ts:40-43` and `useWorkspacePermissionCatalogue.ts:37-40` (`WORKSPACE_ROLES:WATCH`), `WarehousesTab.tsx:63-66` (`WORKSPACE_MEMBERS:WATCH`). A loader written against a narrower set would **withhold** data an entitled actor gets today; a wider one would leak. Pinned by CR-RG-02, whose table in `spec.md` is now the canonical enumeration — it supersedes the six sets listed here, adding the two datasets this row omits (`useListWorkspaceWarehousesQuery`, which is ungated and whose real gate is the tab descriptor's `WAREHOUSES:WATCH`; and `useWorkspaceMembers`) and recording the one deliberate widening of `useAccessPermissions`'s skip set. Gates, descriptors and ADR `19-08-2026-declarative-permission-gates.md` are untouched. |
| Workflows and state          | affected  | Navigation into `/workspace`, `/warehouses/$id` and `/warehouses/$id/access` becomes a blocking transition painting `RoutePendingState`. Tab switching inside a destination becomes instant. CH-13 also removes the `null` return that `WorkspacePage` could previously receive.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| API and events               | unchanged | No endpoint, request shape, response shape or `packages/contracts` type changes. The same _endpoints_ are called; only the point at which they are issued moves. Request **count** per destination is **not** unchanged — the loader awaits every admitted tab's dataset, where an unopened tab fetched nothing at `baseline_revision`. The bound is `spec.md` CR-RG-02 and §6 row 3, not CR-RG-08, which is the shell-affordance boundary.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| Persisted data               | N/A       | Nothing is persisted or reinterpreted. No migration.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| UI behavior                  | affected  | This is the whole request. Seven waiting affordances collapse into one. `/workspace` and `/access` paint later but paint complete.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| Cross-feature behavior       | affected  | `warehouseRoute` is the parent of every Warehouse-scoped surface, so CH-02 applies to modules this request does not otherwise touch, including `modules/warehouse`. Intended — it is what makes the approach universal. CH-14 supersedes an anti-flash clause added by an earlier review (`refactor-warehouse-components` CH-W5, `WarehousesTab.spec.tsx:80-83,241-247`), which is a deliberate reversal, not an oversight.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| Security and privacy         | unchanged | Route guards are advisory UI behavior; the server independently authorizes every request. CH-16 exists so the move cannot widen what is fetched around a refusal, and CR-RG-02 so it cannot widen what is fetched per Permission.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| Operations and observability | N/A       | No telemetry is added (AGENTS.md). No logging, metric or alert changes.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| Tests                        | affected  | 14 spec files carry ~45 assertions naming a loading label or skeleton. Four require structural edits: `test/module-boundaries/module-surface.ts:103` and `test/warehouse-administration-split/warehouse-administration-split.spec.ts:40,108,139` assert `WarehouseListSkeleton.tsx` exists; `test/warehouses-tab-case-inventory/warehouses-tab-case-inventory.spec.ts:137` enumerates the case string `'holds the loading skeleton until the people counts arrive…'` in an inventory that fails on any unnamed case; `shared/layouts/Sidebar.spec.tsx:227,404` asserts the shell renders **no** skeleton during the loading window, which must still hold now that `RoutePendingState` paints inside that shell.                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| Canonical documentation      | affected  | Four passages break, not two. `frontend-architecture.md` §Page states the rule CH-01 amends; `writing-web-components.md:21` (§1) cites `DatasetSkeleton` as an example of a private helper; `:104-106` (§4) instructs "callers just read `.items` and `.isReady`"; §3's tab/panel shape and §6's `!members.isReady` early-return example both stop compiling against the CH-09 contract. All four are in §8.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |

## 5. Compatibility and transition

- **Compatibility:** backward-compatible at every boundary that leaves the web app. No API, no
  contract, no URL, no persisted data. Breaking only for in-repo callers of `DatasetCard` and of the
  five hook contracts CH-09 narrows — every one of them is updated by CH-14 inside this request.
- **Affected consumers:** `apps/web` only. `apps/server` and `packages/*` are untouched.
- **Transition window and exit condition:** **no coexistence window at merge.** CH-02 through CH-16
  land together in one merge; a shipped codebase never has both readiness models. The §6 ordering is
  an _intra-branch_ sequence, and steps 1–2 do briefly hold both models on the branch — deliberately,
  so that no commit in the branch's history leaves a window painted by neither. CH-01 is the single
  exception and lands later by design: `SKILL.md` reconciles canonical documentation only after
  review PASSes, so §6 step 6 is at ship. Exit condition: CH-01 applied and the branch merged.
- **Existing-data treatment:** N/A.

## 6. Rollout

Ordered so that no commit on the branch leaves a window painted by neither the route nor the
component:

1. **CH-02, CH-02a, CH-15, CH-16** — routes declare `pendingComponent`/`errorComponent` and the
   loader failure and refusal rules are fixed. Additive; both models now cover the window.
2. **CH-03, CH-04** — loaders await their datasets. Still additive.
3. **CH-05, CH-06, CH-13, CH-07, CH-08, CH-10, CH-11, CH-14** — component-level readiness is
   removed, now that the routes demonstrably cover it. CH-14 lands with the rows it serves so no
   commit leaves a call site referencing a removed prop.
4. **CH-09** — the five hook contracts, once nothing reads them.
5. **CH-12** — the fourteen orphaned translation keys.
6. **CH-01** — the `docs/system` rules are reconciled at **ship**, after review PASSes (§8).

No feature flag. Flagging this would mean shipping both readiness models at once, which is the
condition the request exists to end.

**Monitoring signals:** none automated — the repository adds no telemetry. The gate is the test suite
plus `/run` verification of the four destinations against a throttled network. The regressions to
watch for: a destination that paints `RoutePendingState` and never leaves it, and a mutation that
causes the pending state to replace a live destination (CH-10).

**Abort threshold:** any destination that can reach a permanent pending state; any case where
CR-RG-01, CR-RG-02 or CR-RG-04 cannot be pinned by a test.

## 7. Rollback

`git revert` of the change-request commits restores the previous behavior completely. There is no
data, no migration, no external consumer and no coexistence window at merge, so rollback is total and
carries no residue. Two asymmetries: reverting restores the dead branches §2 identifies, since they
are part of the baseline; and if CH-01 has already shipped, the documentation revert is a separate
commit against `docs/system`.

## 8. Canonical reconciliation after PASS

| Canonical owner                                           | Required edit                                                                                                                                                  | Backlink                                       |
| --------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| `docs/system/frontend-architecture.md` §Page              | Amend the narrowest-owner sentence per CH-01: route owns loading; component owns error, empty, success.                                                        | `docs/change-requests/global-loader/change.md` |
| `docs/system/frontend-architecture.md` §Route             | Extend the "route-specific search validation or loader wiring when needed" bullet to state that a route awaits the data its destination paints.                | `docs/change-requests/global-loader/change.md` |
| `docs/system/guides/writing-web-components.md:21` §1      | `DatasetSkeleton` no longer exists (CH-07). Replace it with `DatasetMessage` alone as the private-helper example.                                              | `docs/change-requests/global-loader/change.md` |
| `docs/system/guides/writing-web-components.md:104-106` §4 | "callers just read `.items` and `.isReady`" — `.isReady` is removed by CH-09. Restate as `.items` only.                                                        | `docs/change-requests/global-loader/change.md` |
| `docs/system/guides/writing-web-components.md` §3         | Amend the "Tab / panel container" shape: it resolves capabilities and renders datasets its route already awaited, rather than resolving datasets itself.       | `docs/change-requests/global-loader/change.md` |
| `docs/system/guides/writing-web-components.md` §6         | Replace the `!members.isReady` early-return example, which no longer compiles against the CH-09 contract, with one that branches on permission and empty only. | `docs/change-requests/global-loader/change.md` |
| `docs/system/web-index.md`                                | No new document, so no new entry — confirm the amended guide descriptions still match their entries.                                                           | `docs/change-requests/global-loader/change.md` |

No feature specification under `docs/features/` states a loading rule, so none is edited. No roadmap
item is created: this is an internal consistency change, not a portfolio outcome.

## 9. Open questions

- [ ] What `pendingMs` do the four routes use? TanStack's default is 1000 ms, so a fast load shows
      nothing and the actor waits on the _previous_ page for up to a second. Default now:
      `pendingMs: 0` / `pendingMinMs: 0` on all four, matching `homeRoute:29-30`. — owner: Tech Lead,
      due: `clarify`
- [ ] How does CR-AC-13 ("exactly one pending state per navigation") get implemented for
      `accessRoute` under `warehouseRoute`? The decision is recorded; the mechanism — coordinating
      the access loader with the Warehouse boundary versus suppressing the inner pending — is not.
      Default now: leave the mechanism to `design`, and hold CR-AC-13 as the observable it must
      satisfy. — owner: Tech Lead, due: `design`
- [ ] Do the loaders dispatch with `subscribe: false`, as `guards/workspace.guard.ts:19-25` and
      `guards/warehouse-entry.guard.ts:19-25` already do, relying on RTK Query's 60 s default
      `keepUnusedDataFor` to keep the cache warm for the components' own hooks? Default now: yes,
      mirror the guards, and keep the components calling their query hooks. — owner: Tech Lead, due:
      `design`
- [ ] `warehouseRoute.beforeLoad:44-54` is `async` unconditionally and awaits `requireAuth` before
      its `lastVerdictByStore` cache lookup, so even a cached verdict resolves through a microtask.
      Whether that paints pending at `pendingMs: 0` is a router-internals question that must be
      answered **before** `pendingMs` is fixed, not after. Default now: assume it can paint, and
      decide the guard alongside the first open question. — owner: Tech Lead, due: `clarify`
- [ ] `WarehousesTab.tsx:47-51` comments that it declares its Warehouse list query _before_ the
      context read so that it is the first network call. Once CH-03's loader issues both, does that
      ordering intent still have an owner? Default now: the loader's parallel dispatch supersedes it
      and the comment is removed with CH-14. — owner: Tech Lead, due: `design`
