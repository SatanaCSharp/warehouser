---
kind: change-request
status: Draft
owner: 'YuriiH'
reviewers: ['Tech Lead']
updated_at: '2026-08-21'
feature_size: 'L'
change_record: './change.md'
---

# Change-request specification — global-loader

## 1. Context

`apps/web` currently answers "what does the actor see while this data is on its way?" seven
different ways across three modules ([`change.md` §1.1](./change.md#11-the-baseline-enumeration)),
one of those answers is unreachable dead code, and the window that is genuinely unpainted — a route
guard awaiting the network — is handled on only one of four routes.

This request makes **the route** the owner of destination readiness. Every destination declares the
one shared `RoutePendingState` as its `pendingComponent` and awaits its data in a loader; no
component branches on a loading flag, and no readiness value is published from a hook.

Actors affected: every authenticated actor, on `/workspace`, `/warehouses/$warehouseId` and
`/warehouses/$warehouseId/access`. `/` is **unchanged** by this request: `homeRoute` already declares
`pendingComponent` and `errorComponent` and is the pattern the other three generalize, which is why
§7 counts three unpainted routes of four rather than four. The override rows are in
[`change.md` §3](./change.md#3-override-map) — CH-01 through CH-16.

## 2. Goals

- One waiting affordance in the application, rendered from one component, decided in one place.
- A destination paints complete or paints `RoutePendingState`; it never paints partially and fills in.
- The window during which a route guard awaits the network is visibly handled on every route.
- Removing readiness from component contracts makes the wrong thing hard to write: there is no
  `isLoading` to branch on.
- Moving the fetch to the route changes **when** data is requested and nothing about **who may
  receive it**. It does change the **count**: the loader awaits every dataset the actor's admitted
  tabs would fetch, where at `baseline_revision` an unopened tab fetched nothing — React Aria mounts
  only the selected `Tabs.Panel` (`WorkspaceAdministration.tsx:143`, `AccessWorkspace.tsx:108`), so
  a cold access visit issues `getCurrentAccess` + Roles + the catalogue and never Members unless the
  actor opens that tab. The bound is therefore **"never more than the actor's admitted tabs would
  fetch, and never a dataset a Permission withholds"** (CR-RG-02) — not "the same number of
  requests".

## 3. Non-goals

- **Tabs do not become routes.** `/workspace` and the access surface keep their addresses and their
  client-side tab state; only the datasets move to the route loader.
- **Mutation and submit feedback is untouched** (CR-RG-06).
- **No Suspense migration.** RTK Query has no suspense integration; the router's pending contract is
  the mechanism, not `<Suspense>`.
- **No new global state.** No slice counts in-flight requests and no overlay is mounted in
  `RootLayout`.
- **Authorization is not touched**, with one enumerated exception. No gate, descriptor or
  Permission read changes semantics (CR-RG-07). The exception is `useAccessPermissions`'s skip set,
  widened deliberately so that tab admission implies the dataset arrives — bounded and justified in
  CR-RG-02, and the only Permission-condition change in this request.
- **Error, empty and search-empty states are not redesigned** (CR-RG-05). This request moves loading
  only.

## 4. Changed user stories

### CR-US-01: One consistent answer while a destination loads

**As an** authenticated actor
**I want** every destination to show me the same thing while it is preparing
**So that** waiting looks like one application rather than seven, and I can tell "still loading" from
"loaded and empty" without learning a different affordance per page.

### CR-US-02: Never see a page assemble itself in pieces

**As an** authenticated actor
**I want** a destination to appear complete rather than filling in around me
**So that** a control does not move under my pointer and a count does not flash in a heartbeat after
the list it belongs to.

### CR-US-03: Never look at an unpainted screen

**As an** authenticated actor
**I want** the application to tell me it is working while a route resolves my access
**So that** slow navigation reads as progress rather than as a frozen page.

### CR-US-04: Read a list without it being pulled out from under me

**As an** actor reading a member list
**I want** a background refresh to leave the rows on screen
**So that** the list I am scanning is not replaced by a skeleton, or by a route pending state,
because something else invalidated its cache.

### CR-US-05: Lose one tab's data without losing the destination

**As an** actor on a multi-tab destination
**I want** one dataset failing to cost me only that tab
**So that** a broken Roles read does not take away the three tabs that work.

### CR-US-06: Write a component without deciding how to wait

**As a** contributor
**I want** readiness to be absent from component and hook contracts
**So that** there is no per-component decision to get wrong and no eighth waiting affordance to add.

## 5. Acceptance criteria

### CR-AC-01 (CR-US-06, CH-01) — documentation rule

**Given** `docs/system/frontend-architecture.md` §Page assigns loading, error, empty and success
behavior to "the narrowest owner that can coordinate" them
**When** the reconciliation in [`change.md` §8](./change.md#8-canonical-reconciliation-after-pass)
is applied at ship
**Then** the document states that first-paint readiness of a destination is owned by its route, and
that the narrowest-owner rule continues to govern error, empty and success behavior only; and the
four `writing-web-components.md` passages §8 names no longer reference a removed symbol.

### CR-AC-02 (CR-US-03, CH-02, CH-02a) — behavioral

**Given** an authenticated actor navigating to `/workspace`, `/warehouses/$warehouseId` or
`/warehouses/$warehouseId/access`
**When** the route's `beforeLoad` or `loader` has not yet settled
**Then** `RoutePendingState` is on screen, and when the route settles it is replaced by the
destination — or, if the destination's **primary** read failed (CH-15), by `RouteErrorState`.

### CR-AC-03 (CR-US-02, CH-03) — behavioral

**Given** an actor holding any subset of `WAREHOUSES:WATCH`, `WORKSPACE_ROLES:WATCH` and
`WORKSPACE_MEMBERS:WATCH` — the three distinct Permissions that admit a tab; `WORKSPACE:RENAME` is
the fourth member of `workspaceAdministrationPermissionIds` and admits the header control but no tab
**When** `/workspace` resolves
**Then** every tab dataset that subset admits has already arrived, each admitted tab renders its
content on first paint, and switching between admitted tabs issues no request and shows no waiting
affordance.

**And** for an actor holding only `WORKSPACE:RENAME`, who is admitted to the destination and to no
tab: the loader awaits no tab dataset, the destination paints the header alone, and the tab shell is
absent — unchanged from `baseline_revision` (`WorkspaceAdministration.tsx:113-117`).

**And** every admitted tab's panel is **force-mounted**, so each admitted tab's own query hook mounts
and subscribes on first paint. This is what makes "already arrived" hold for the destination's whole
lifetime rather than for RTK Query's 60 s `keepUnusedDataFor` window. The loaders dispatch with
`subscribe: false` (§8), so a loader-fetched entry has no subscriber of its own; without a mounted
hook holding it, an unopened tab's entry would be evicted after a minute's dwell and that tab would
then paint its **empty** message — `workspaceRoles.empty`, `members.empty` — for a dataset merely in
flight, since CH-09 leaves no readiness term to distinguish the two. The falsifier: dwell past the
retention window on `/workspace`, switch to an admitted tab, and assert no request is issued and no
empty message appears.

### CR-AC-04 (CR-US-02, CH-04) — behavioral

**Given** an actor entering `/warehouses/$warehouseId/access` on an `entered` verdict
**When** the route resolves
**Then** `getCurrentAccess` has resolved first, and every access dataset whose skip set that
projection admits — `useAccessRoles`'s 8-Permission set, `useAccessMembers`'s 7, and
`useAccessPermissions`'s 3, exactly as enumerated in [`change.md` §4](./change.md#4-impact-analysis)
— has settled before the destination paints.

**And** the loader issues `getCurrentAccess` with the same argument `useEnteredWarehouse()` supplies
to the component's own hook, so `AccessPage` reads the entry the loader filled rather than opening a
second one. `access` is therefore always defined when `AccessPage` mounts on an `entered` verdict —
the invariant CR-AC-06's surviving denial branch now rests on, once CH-06 removes the readiness arm
above it.

### CR-AC-05 (CR-US-06, CH-05, CH-13) — structural

**Given** `modules/workspace/components/WorkspaceAdministration.tsx`
**When** the file is read after this change
**Then** it contains no loading branch and no `if (!workspaceContext) return null`, imports no
`Spinner`, destructures no readiness field from `useCurrentWorkspaceContext()`, and its return type
is `ReactElement` rather than `ReactElement | null`.

**And** `CurrentWorkspaceContext.workspaceContext` is narrowed to **non-optional**, so that return
type is honest at the type level rather than asserted at the call site. `requireWorkspaceCapability`
already awaits and unwraps `getWorkspaceContext` in `beforeLoad`, so the guard guarantees the value
the type now promises. This extends CH-09 beyond removing `isLoading`; `WarehousesTab.tsx:94`'s
`workspaceContext?.warehouses` and every other optional read are amended with it under CH-14.

### CR-AC-06 (CR-US-06, CH-06) — structural

**Given** `modules/access/page.tsx`
**When** the file is read after this change
**Then** it contains no loading branch, imports no `Spinner`, and destructures no readiness field
from `useCurrentPermissions()`. Its `!access || permissionIds.length === 0` denial branch is
unchanged.

### CR-AC-07 (CR-US-06, CH-07, CH-14) — structural

**Given** `shared/components/DatasetCard.tsx`
**When** the file is read after this change
**Then** `DatasetCardProps` declares neither `loading` nor `loadingLabel`, the private
`DatasetSkeleton` helper is gone, and each of its three callers — `MembersDatasetCard.tsx:23`,
`RolesDatasetCard.tsx:24`, `PermissionsTab.tsx:21` — passes only the props that remain, with `empty`
computed as `items.length === 0`.

### CR-AC-08 (CR-US-06, CH-08, CH-14) — structural

**Given** the four skeleton surfaces CH-08 removes and the five call-site branches CH-14 amends
**When** the change is applied
**Then** `WorkspaceListSkeleton.tsx` and `WarehouseListSkeleton.tsx` no longer exist;
`MemberListStatus` is `'empty' | 'ready' | 'searchEmpty'`; `WorkspacePermissionsTab` renders no
`Skeleton`; none of `WorkspaceRolesTab.tsx:31`, `WorkspaceMembersTab.tsx:27`,
`WorkspaceMemberList.tsx:27`, `WarehouseList.tsx:53` retains a readiness branch; and
`module-surface.ts`, `warehouse-administration-split.spec.ts`,
`warehouses-tab-case-inventory.spec.ts` and `Sidebar.spec.tsx` no longer name a deleted file or a
deleted case.

### CR-AC-09 (CR-US-06, CH-09) — structural

**Given** the five contract files CH-09 names
**When** the change is applied
**Then** `AccessDataset` declares no `isLoading`, `isFetching` or `isReady`; `CurrentPermissions` and
`CurrentWorkspaceContext` declare no `isLoading`; and `useWorkspaceRoles` and
`useWorkspacePermissionCatalogue` return no `isReady`.

**Scope bound.** This criterion is satisfied by those five files plus the call sites CH-14 names. It
does **not** forbid the identifiers `isLoading`/`isFetching`/`isReady` elsewhere: RTK Query's own
query results, TanStack Router's `router.state.isLoading` (`modules/home/route.spec.tsx:228`),
`mutation-feedback.middleware.ts`, and the CR-RG-06 components legitimately keep them.

**And** `AccessDataset.isError` is **not** removed. CH-09 narrows `isLoading`, `isFetching` and
`isReady` only; `isError` is what keeps CR-AC-15's error promise reachable after the tab guards
collapse, and `DatasetCard` keeps its `error` / `errorLabel` props under CH-07.

### CR-AC-10 (CR-US-04, CH-10) — behavioral

**Given** a member list already painted with rows
**When** a mutation invalidates its cache tag and the query refetches in the background
**Then** the previously painted rows remain on screen until the new data arrives; no skeleton or
spinner replaces them; **and the route loader does not re-run**, so `RoutePendingState` does not
replace the live destination. The falsifier: a test that invalidates the members tag on a painted
access destination and asserts both that the rows persist and that `RoutePendingState` never mounts.

### CR-AC-11 (CR-US-06, CH-11) — structural

**Given** `MemberDirectory.tsx`
**When** the file is read after this change
**Then** it passes no readiness prop to `MemberList`, `MemberListProps` declares no `isLoading`, and
`actorUserId` is not defaulted with `?? ''` — an unresolved actor must not be expressible as "no row
is self". Constrained by CR-RG-01.

**And** the mechanism that replaces the deleted guard is the **type**: `MemberListProps.actorUserId`
is widened to `string | undefined`, and `MemberRow` suppresses every destructive control when it is
undefined. Without this, `MemberList.tsx:114`'s `isSelf={member.userId === actorUserId}` still
type-checks against a `string` prop while evaluating `false` for every row — the exact outcome
CR-RG-01 forbids, reached silently. `MemberListStatus` gains no state for an unresolved actor
(CR-AC-08 narrows it to three); the guarantee is carried by the prop type and the row, not by a
list-level branch.

### CR-AC-12 (CR-US-01, CH-12) — structural

**Given** the locale namespaces
**When** the change is applied
**Then** these **seven keys per language, fourteen total**, are absent from both `en` and `uk`:
`access.json` → `loading`, `members.loading`, `workspaceRoles.loading`, `workspaceMembers.loading`,
`workspacePermissions.loading`; `warehouse.json` → `warehouses.loading`; `workspace.json` →
`loading`. Both languages carry the identical key set afterwards, and `common.json`'s
`shell.landing.pendingLabel` is the only waiting copy the application renders.

### CR-AC-13 (CR-US-02, CH-02) — behavioral

**Given** a cold navigation to `/warehouses/$warehouseId/access`, whose route is a child of
`warehouseRoute`
**When** the navigation resolves
**Then** `RoutePendingState` mounts **exactly once** and is replaced directly by the finished
destination. The actor never sees a pending state, then partial chrome, then a second pending state.

### CR-AC-14 (CR-US-06, CH-04, CH-16) — behavioral

**Given** an actor requesting `/warehouses/$warehouseId/access` for a Warehouse whose verdict is
`refused` — for either reason
**When** `accessRoute`'s loader runs, as it does today because `warehouseRoute.beforeLoad` returns
rather than throws
**Then** the loader issues **no** request: not `getCurrentAccess`, not any access dataset. Request
count around a refusal equals `baseline_revision`, which is zero.

### CR-AC-15 (CR-US-05, CH-15) — behavioral

**Given** a destination whose primary read succeeded but one secondary dataset request failed
**When** the route resolves
**Then** the destination paints, the tabs whose datasets arrived render their content, and the failed
dataset renders its existing component-owned error message (`roles.error`, `permissions.error`,
`members` error). `RouteErrorState` does **not** appear.

**And** each collapsed tab guard keeps an explicit **error arm**, so that message stays reachable:
the surviving condition is _not-permitted **or** errored_, never the permission term alone.
`RolesTab.tsx:46` and `MembersTab.tsx:26` reach `RolesDatasetCard` / `MembersDatasetCard` — the only
renderers of `roles.error` and the Members error — through their `!isReady` term today. Dropping
that term without replacing it would send a permitted actor whose read **failed** into
`RoleDirectory` / `MemberDirectory` with `items: []`, telling them "no roles are available" for a
failed read and making this criterion unsatisfiable by any code path.

**And** when the destination's primary read itself fails, `RouteErrorState` replaces the destination.
The primary read is `getWorkspaceContext` for `/workspace`, `getCurrentAccess` for the access
surface, and `resolveWarehouseEntry`'s verdict for `/warehouses/$warehouseId` — noting that a
`refused` verdict is a **resolved outcome** rendered in place by `WarehouseEntryRefusal` (CR-RG-04),
not a failure. `warehouseDashboardRoute` (`modules/warehouse/route.tsx`) gains no loader of its own
because its destination reads no dataset — `WarehousePage` renders `DesignSystemExample` — so the
parent's `pendingComponent` is the whole of its readiness.

### CR-AC-16 (CR-US-02, CH-02) — behavioral

**Given** an actor already inside a Warehouse, navigating between that Warehouse's surfaces — the
dashboard and the access surface — so `warehouseRoute` matches with `cause === 'stay'`
**When** the navigation resolves
**Then** `RoutePendingState` does **not** replace the live destination.

`warehouse.route.tsx:44-54` is `async` unconditionally and awaits `requireAuth` before its
`lastVerdictByStore` lookup, so even the cached-verdict path resolves through a microtask on every
navigation inside a Warehouse. `warehouseRoute` therefore carries a non-zero `pendingMs` — `150`,
unless `design` finds a shorter value that still suppresses the microtask paint — which is what keeps
that microtask from painting. `homeRoute`, `workspaceRoute` and `accessRoute` keep `pendingMs: 0` /
`pendingMinMs: 0`, where the awaited window is a real network round trip and CR-US-03 wants it
painted immediately. This resolves both §8 questions that were due at `clarify`: the guard holds
whether or not the cached path would otherwise paint, so the router-internals question no longer
gates the value.

## 5.1 Regression boundaries

### CR-RG-01 — self-row gating never evaluates against an unresolved actor

**Given** a member list containing the acting user's own row
**When** the actor signs out — `SignOutButton.tsx:26-27` dispatches `authBecameAnonymous()` before
awaiting `navigate`, so `selectCurrentUser` becomes `null` while the list is still mounted
**Then** the acting user's own row is never rendered as not-self, and no destructive control is
offered against an unresolved actor id (AC-11 / AC-18).

CH-11 removes the branch that guaranteed this, and §2's correction establishes that the branch is
**live**, not dead. **This is the one override in this request that is unsafe if unproven**, and it
needs a test driving the sign-out window specifically — `requireAuth` covers route entry, not this
teardown.

### CR-RG-02 — the loaders fetch exactly what the actor's admitted surfaces fetch

**Given** an actor and the datasets each loader awaits
**When** the corresponding route loader runs
**Then** it issues a request for exactly the datasets below, under exactly the gate named beside
each — no dataset a Permission withholds, and none an unadmitted tab would have fetched.

A dataset's gate is **not** always a hook `skip`. Three kinds appear, and conflating them is the
mistake this boundary exists to catch:

| Dataset (endpoint or hook)        | Loader           | Gate at `baseline_revision`                                                                                                                             | Gate kind      |
| --------------------------------- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------- |
| `getWorkspaceContext`             | `workspaceRoute` | none — `workspace.guard.ts:19-25` already awaits it                                                                                                     | unconditional  |
| `useListWorkspaceWarehousesQuery` | `workspaceRoute` | **no hook skip** — `WarehousesTab.tsx:51-52` is ungated; its real gate is the tab descriptor's `WAREHOUSES:WATCH` (`WorkspaceAdministration.tsx:56-58`) | tab descriptor |
| `useListWorkspaceUsersQuery`      | `workspaceRoute` | `WORKSPACE_MEMBERS:WATCH` — one entry serving both `WarehousesTab.tsx:62-65`'s people counts and `useWorkspaceUsers`'s candidate list                   | hook skip      |
| `useWorkspaceMembers`             | `workspaceRoute` | `WORKSPACE_MEMBERS:WATCH`, inside the hook                                                                                                              | hook skip      |
| `useWorkspaceRoles`               | `workspaceRoute` | `useWorkspaceRoles.ts:40-45` — `WORKSPACE_ROLES:WATCH`                                                                                                  | hook skip      |
| `useWorkspacePermissionCatalogue` | `workspaceRoute` | `useWorkspacePermissionCatalogue.ts:38-43` — `WORKSPACE_ROLES:WATCH`                                                                                    | hook skip      |
| `getCurrentAccess`                | `accessRoute`    | the parent verdict is `entered` (CH-16, CR-AC-14)                                                                                                       | verdict        |
| `useAccessRoles`                  | `accessRoute`    | `useAccessRoles.ts:15-24` — 8 Permissions                                                                                                               | hook skip      |
| `useAccessMembers`                | `accessRoute`    | `useAccessMembers.ts:15-23` — 7 Permissions                                                                                                             | hook skip      |
| `useAccessPermissions`            | `accessRoute`    | `useAccessPermissions.ts:12-16` — 3 Permissions, **widened below**                                                                                      | hook skip      |

`useListWorkspaceUsersQuery(undefined, …)` is called both directly by `WarehousesTab.tsx:66` and
through `useWorkspaceUsers`; same endpoint, same argument, one cache entry, one request. It is one
row here, not two.

Both directions are regressions. **Widening** leaks a dataset the actor may not read. **Narrowing**
is the likelier mistake here: an actor holding `ROLES:ASSIGN` but not `ROLES:WATCH` receives Roles
and Members today, and a loader written against the single watch Permissions would silently take
them away — breaking the Members list's Role-name lookup (`MemberList.tsx:116`).

**The one intended widening.** `useAccessPermissions`'s skip set gains the Roles tab's remaining
admitting Permissions, so every actor admitted to the Roles tab receives the Permission catalogue.
The Roles tab admits 6 Permissions (`AccessWorkspace.tsx:27-34`) while the catalogue admits 3
(`useAccessPermissions.ts:12-16`), so a `ROLES:ASSIGN`-only actor is admitted to the tab while the
catalogue is skipped — reaching the read-only card today only via `!permissions.isReady`, the term
CH-14 removes. Widening the set restores **tab admission implies the dataset arrives** as an
invariant that holds at every call site, which is what CR-RG-05's reachability argument rests on.
This is the only Permission-condition change in this request, and §3 and §6.1 are bounded by it.

### CR-RG-03 — the cross-Warehouse authority leak stays closed

**Given** an actor navigating from Warehouse W1 to Warehouse W2
**When** W2's projection is in flight
**Then** no W1 authority is reported for W2. `useCurrentPermissions` continues to read RTK Query's
`currentData`, never `data` (the earlier CR-AC-19).

**Falsifier.** The route loader narrows the window in which this is observable through the UI, so the
boundary is pinned at the hook: `usePermissions.spec.tsx` must retain a case that renders
`useCurrentPermissions` across an argument change and fails if `currentData` is replaced by `data`.
Removing `isLoading` from that contract is not licence to simplify the read.

### CR-RG-04 — a refused Warehouse entry is still refused in place

**Given** an actor requesting a Warehouse they may not enter, or an archived one
**When** `warehouseRoute` resolves with CH-02's `pendingComponent` declared
**Then** `WarehouseEntryRefusal` renders at the requested address with the same non-disclosing reason
as at `baseline_revision` (the earlier CR-AC-07, CR-AC-17). A refusal is a resolved outcome: it must
never present as pending and never become a redirect. Paired with CR-AC-14, which covers what the
child loader must not fetch.

### CR-RG-05 — error, empty and search-empty states are unchanged

**Given** a dataset that fails, arrives empty, or is filtered to nothing by a search term
**When** the destination renders
**Then** the existing component-owned message renders as at `baseline_revision` — `roles.error`,
`members.empty`, `members.searchEmpty`, `warehouses.empty`, `warehouses.noMatches`,
`permissions.empty`.

**The one permitted difference, and its bound.** Today `empty` is computed as
`dataset.isReady && items.length === 0`, so an actor who fails a dataset's skip gate sees **no
message at all**. CH-09 removes `isReady`, collapsing the predicate to `items.length === 0`. That
actor must **not** thereby be told "no members" for a dataset they merely may not read.

**How that is guaranteed: by reachability, not by a branch at every site.** Where a tab's admitting
Permission is inside its dataset's skip set, an actor who reaches the mounted tab is necessarily
inside the skip set, so the _not-permitted_ arm is unreachable and needs no branch. That holds at:

- `PermissionsTab` — admitted by `ROLES:WATCH` (`AccessWorkspace.tsx:67`), which is in
  `useAccessPermissions`'s set. The component reads no Permission at all today and must not gain
  one; adding a capability boolean to a file that has none would work against CR-RG-07 and §3.
- `MembersTab.tsx:26` — `canReadMembers` is `USERS:WATCH`, the same Permission that admits the tab.
- `WorkspaceMembersTab.tsx:27` and `WorkspaceRolesTab.tsx:31` — both hooks gate on the Permission
  that admits their tab, so their `undefined` / `!isReady` arms are unreachable once the loader has
  awaited them. Neither hook is among CH-09's five contract files, so `undefined` survives the
  change in the type; defaulting it with `?? []` instead of relying on reachability would render
  `workspaceMembers.empty` as a false statement after a failed or evicted read.
- `WorkspaceMemberList.tsx:27` — same argument, same tab.

`RolesTab.tsx:46` is the one site where admission is **wider** than the dataset's gate; CR-RG-02's
enumerated widening closes that gap rather than a branch here. What survives at `RolesTab.tsx:46` is
the genuine alternative-surface arm — a `ROLES:WATCH`-only actor is admitted and gets the read-only
card — which is a permission distinction, not a readiness one.

The error arm is separate and always explicit (CR-AC-15): CH-15's settle semantics is what keeps it
reachable at all, and `AccessDataset.isError` survives CH-09 to express it.

### CR-RG-06 — action feedback is not destination readiness

**Given** any dialog or form that runs a mutation
**When** the actor submits it
**Then** `FormModalDialog`, `ConfirmAlertDialog`, `LoginForm`, `SignUpForm`, `RoleEditor`,
`WorkspaceRoleEditor`, `WarehouseNameForm` and `SignOutButton` show their `isPending` submit state
exactly as at `baseline_revision`, and `mutationFeedbackMiddleware` is unchanged. No route pending
state appears for a mutation.

### CR-RG-07 — declarative permission gating is unchanged

**Given** any control gated by `WarehousePermissionGate`, `WorkspacePermissionGate`, or a
`usePermittedItems` / `useWorkspacePermittedItems` descriptor
**When** the change is applied
**Then** every gate and descriptor behaves as at `baseline_revision`, no capability boolean is
introduced, and ADR `19-08-2026-declarative-permission-gates.md` needs no amendment. The tab sets on
`/workspace` and the access surface keep their order, count and admission rules.

### CR-RG-08 — the shell renders no waiting affordance of its own

**Given** `RootLayout`'s header, `Sidebar` and `WarehouseSwitcher`, which surround the routed outlet
**When** `RoutePendingState` paints inside that outlet
**Then** the shell itself still renders no skeleton or spinner, and `Sidebar.spec.tsx:227,404` —
which asserts the navigation entries are hidden during the loading window **without** a skeleton —
continues to pass.

## 6. Non-functional requirements

| Aspect                                        | Previous target                                                 | New target                                                                                                                                                                                                                                    | Measurement                                                                                                                                                                            |
| --------------------------------------------- | --------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Time to first paint, `/workspace`             | Shell paints immediately; tabs fill in over 2–4 requests        | Bounded by the **slowest** admitted tab dataset, not their sum — the loader dispatches them together                                                                                                                                          | Structural: a test asserting the admitted datasets are dispatched in **one** round, not sequentially. Confirmed at `/run` on Chrome DevTools' _Fast 3G_ profile; no telemetry is added |
| Time to first paint, `/warehouses/$id/access` | Shell paints immediately; tabs fill in                          | `getCurrentAccess` **plus** the slowest admitted dataset — necessarily two sequential rounds, because every access skip set is derived from that projection (CH-04)                                                                           | As above — two rounds expected here, and a third would fail the row                                                                                                                    |
| Requests issued per destination               | Baseline                                                        | Never more than the actor's admitted tabs would fetch, and never a dataset a Permission withholds (CR-RG-02). **Higher** than baseline for an actor who would not have opened every admitted tab. Around a refused Warehouse: zero (CR-AC-14) | Network panel request set equals CR-RG-02's enumeration for that actor                                                                                                                 |
| Waiting affordances in the application        | 7 ([`change.md` §1.1](./change.md#11-the-baseline-enumeration)) | 1 (`RoutePendingState`)                                                                                                                                                                                                                       | CR-AC-08, CR-AC-12                                                                                                                                                                     |
| Layout shift after first paint                | Present — panes and counts fill in after the surface            | Zero for destination data; a destination paints complete                                                                                                                                                                                      | Structural: no destination component renders before its route-awaited data. Confirmed visually at `/run` on the same profile                                                           |

The second row is the deliberate trade this request accepts. The access surface cannot be one
parallel batch: the tab skip sets are computed from `getCurrentAccess`
(`useAccessRoles.ts:35` → `useHasPermission` → `usePermissions.ts:48-59`), and CR-RG-02 forbids
fetching unconditionally to flatten the sequence. `Promise` fan-out (Vercel `async-parallel`) keeps
the second round bounded by its slowest member rather than the sum.

## 6.1 Security / privacy

- **Data classification:** unchanged. No new data is read, stored or transmitted.
- **Personal data impact:** none. The same member and user datasets are fetched, for the same actors,
  under the same Permission conditions (CR-RG-02), and none at all around a refusal (CR-AC-14).
- **Authorization impact:** one enumerated change, and otherwise none. `useAccessPermissions`'s skip
  set is widened to every Permission that admits the Roles tab, so the Permission catalogue reaches
  an actor who is already admitted to the surface that grants from it — a catalogue of Permission
  _names_, carrying no Workspace or member data. CR-RG-02 bounds it; CR-AC-14 and CR-RG-07 prove
  nothing else moves. Route guards remain advisory UI behavior; the server independently authorizes
  every request, so the widening cannot admit an actor the server would refuse.
- **Security review:** N/A — no authorization boundary, credential path or data classification
  changes. CR-RG-01 is a correctness boundary rather than a security one: the actor id it protects is
  already client-side state.

## 7. Metrics / KPIs

An internal consistency change with no product metric and no telemetry (AGENTS.md forbids adding
any). Measured structurally, against the enumeration in
[`change.md` §1.1](./change.md#11-the-baseline-enumeration):

- **Waiting affordances** — baseline: 7; target: 1, at merge.
- **Readiness fields in the five hook contracts** — baseline: 7; target: 0, at merge.
- **Readiness values in component contracts** — baseline: 6; target: 0, at merge.
- **Routes with an unpainted guard/loader window** — baseline: 3 of 4 (`workspaceRoute`,
  `warehouseRoute`, `accessRoute`); target: 0, at merge.
- **Unreachable readiness branches** — baseline: 2 (`WorkspaceAdministration.tsx:78` and `:87`);
  target: 0, at merge.

## 8. Open questions

Carried from [`change.md` §9](./change.md#9-open-questions); each has a stated default, so none
blocks the next stage.

- [ ] The mechanism by which CR-AC-13 is achieved for a child route. Default now: leave to `design`;
      CR-AC-13 holds as the observable, now paired with CR-AC-16 for the `cause === 'stay'` case.
      — owner: Tech Lead, due: `design`
- [ ] Whether the loaders dispatch with `subscribe: false`, mirroring the two existing guards.
      Default now: yes — and CR-AC-03's force-mounted panels are what make that safe, since the
      components' own hooks then hold the entries the loader filled. — owner: Tech Lead, due:
      `design`
- [ ] Whether `WarehousesTab`'s deliberate query-ordering comment still has an owner. Default now:
      superseded by the loader; removed with CH-14. — owner: Tech Lead, due: `design`
- [ ] Where the `docs/system` documentation gate belongs. Deferred from
      `_review/code-review-front-end-2026-08-21.md` (advisory A2):
      `apps/web/src/test/readiness-documentation/readiness-documentation.spec.ts` resolves
      `REPOSITORY_ROOT` two levels above `apps/web` and reads only `docs/system`, so a `docs/system`
      copy-edit fails `pnpm --filter @warehouser/web test`. `tests/refactor/placement-decision.spec.mjs`
      is the repository-root precedent for this shape. Default now: leave it where it is; move it to
      `tests/global-loader/` at ship, when CH-01 reconciles `docs/system` anyway. — owner: Tech Lead,
      due: `ship`

**Closed at `clarify`.** Both questions that were due at this stage are resolved in place and are no
longer open:

- `pendingMs` / `pendingMinMs` → CR-AC-16. `0` / `0` on `homeRoute`, `workspaceRoute` and
  `accessRoute`; non-zero (`150`) on `warehouseRoute`.
- Whether `warehouseRoute`'s cached-verdict path can paint pending → made moot by CR-AC-16, which
  states the observable directly rather than depending on the router-internals answer.
