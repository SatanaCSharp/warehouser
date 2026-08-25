---
kind: change-request
status: Draft
owner: 'YuriiH'
reviewers: ['Tech Lead']
updated_at: '2026-08-21'
feature_size: 'L'
change_record: './change.md'
---

# Test plan — change-request: global-loader

Every destination must declare `RoutePendingState` as its route's pending affordance and await its
data in a loader, so that no component branches on readiness and no hook publishes it — while the
request set each actor causes, the six component-owned error/empty messages, and the self-row guard
that `SignOutButton` exercises all survive unchanged.

This plan maps all 16 `CR-AC-*` criteria and all 8 `CR-RG-*` regression boundaries in
[`spec.md` §5 / §5.1](./spec.md) to at least one named test each, and expands
[`sad.md` §10](./sad.md) into the per-criterion table it defers here.

## Levels

`sad.md` frontmatter declares `target_surfaces: ['web-frontend']`, so the frontend tiers apply. Four
levels are used and four are explicitly not.

| Level              | Scope in this change                                                                                                                                                                                                     | Strategy (generic — no tool names)                                                                                                                                     |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Unit**           | Structural gates: a named file holds no readiness branch, a contract declares no removed field, a locale carries no removed key, a route file declares an exact option value, a document states a rule. Pure predicates. | Read the repository tree or the parsed source in memory. No store, no render, no network.                                                                              |
| **Integration**    | A loader function or a hook against the real dependency `apps/web` owns — the Redux store and the RTK Query cache — with the HTTP transport stubbed at the contract-declared REST paths.                                 | Fresh store per test; the real API slices and the real cache; requests routed on the exact paths, never intercepted at the hook or the slice. See **Test data** below. |
| **Component**      | One component or tab guard rendered in isolation over a real store: which arm it takes, which control it offers, which message it renders.                                                                               | Render in the repository's existing harness with a fresh store; assert output and interaction. No route tree.                                                          |
| **E2E-through-UI** | The **production** route tree driven over an in-memory history: what paints, in what order, how many times, and which requests the navigation caused.                                                                    | Import the real route objects — not a re-declared copy — so the shipped `pendingComponent` / `pendingMs` / `wrapInSuspense` values are the ones under test.            |
| Contract           | <!-- N/A: `sad.md` §7 — no endpoint, path, request shape or response shape changes and `packages/contracts` is unchanged. The same endpoints are called from a different place. -->                                      | —                                                                                                                                                                      |
| E2E                | <!-- N/A: a web-frontend change with no server, worker or CLI entry point. The full-flow tier is E2E-through-UI. -->                                                                                                     | —                                                                                                                                                                      |
| Load               | <!-- N/A: no numeric NFR — see "NFR validation" below. -->                                                                                                                                                               | —                                                                                                                                                                      |
| Visual-regression  | <!-- N/A: the repository holds no approved baseline images; `spec.md` §3 redesigns no state; layout shift is measured structurally and confirmed at `/run`. -->                                                          | —                                                                                                                                                                      |

**Why E2E-through-UI imports the production routes.** `src/test/render.tsx` deliberately composes a
test router "without importing the production `warehouseRoute` singleton", which is right for a
component that merely needs an `entered` verdict. It is wrong for CR-AC-13 and CR-AC-16: those
criteria are properties of the declarations themselves, and a re-declared copy would stay green
after the shipped `wrapInSuspense: false` line was deleted — the exact failure `sad.md` §11 lists as
a risk. The route-readiness suite therefore drives the real objects, and a unit row asserts the four
route files declare the exact option values as a second, cheaper net.

## AC coverage

Every criterion in `spec.md` §5 has at least one row. Levels use only the vocabulary above.

| Criterion    | Test name (intent-based)                                                        | Level          | Expected outcome                                                                                                                                                                                                                                                                                     |
| ------------ | ------------------------------------------------------------------------------- | -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **CR-AC-01** | `the system documents route-owned first-paint readiness`                        | unit           | `frontend-architecture.md` §Page states the route owns a destination's first-paint readiness and scopes the narrowest-owner rule to error, empty and success only; no `writing-web-components.md` passage names a removed symbol. **Red until the rollout's final commit** — see _Sequencing_ below. |
| **CR-AC-02** | `each route paints the pending state before it settles`                         | e2e-through-UI | On `/workspace`, `/warehouses/$warehouseId` and `/warehouses/$warehouseId/access`: `RoutePendingState` is on screen while `beforeLoad`/`loader` is outstanding, and is replaced by the destination when the route settles.                                                                           |
| **CR-AC-02** | `a failed primary read paints the route error state`                            | e2e-through-UI | The destination's primary read rejects → `RouteErrorState` replaces the destination, not a partially-painted surface.                                                                                                                                                                                |
| **CR-AC-03** | `every admitted tab renders its content on first paint`                         | e2e-through-UI | For each subset of `WAREHOUSES:WATCH` / `WORKSPACE_ROLES:WATCH` / `WORKSPACE_MEMBERS:WATCH`, every admitted tab shows content immediately after `/workspace` resolves.                                                                                                                               |
| **CR-AC-03** | `switching between admitted tabs issues no request`                             | e2e-through-UI | Selecting another admitted tab causes no request and shows no waiting affordance.                                                                                                                                                                                                                    |
| **CR-AC-03** | `an admitted tab still holds its data after the retention window`               | e2e-through-UI | Dwell on `/workspace` past `keepUnusedDataFor`, then select an unopened admitted tab: no request is issued and no empty message appears. This is the falsifier for the force-mounted panels.                                                                                                         |
| **CR-AC-03** | `every admitted panel is force-mounted`                                         | component      | Each admitted tab's panel is committed on first paint — so its own query hook mounts and subscribes — while an unselected panel remains unreachable to keyboard and assistive technology.                                                                                                            |
| **CR-AC-03** | `a rename-only actor is admitted to the destination and to no tab`              | integration    | An actor holding only `WORKSPACE:RENAME` causes the loader to await no secondary dataset.                                                                                                                                                                                                            |
| **CR-AC-03** | `a rename-only actor sees the header without a tab shell`                       | e2e-through-UI | The destination paints the header alone and the tab shell is absent — unchanged from `baseline_revision`.                                                                                                                                                                                            |
| **CR-AC-04** | `the access primary read resolves before any tab dataset is dispatched`         | integration    | On an `entered` verdict, `getCurrentAccess` settles first; only then are the three tab datasets dispatched, each under its own skip set (8 / 7 / 6 Permissions).                                                                                                                                     |
| **CR-AC-04** | `the access page reads the entry the loader filled`                             | integration    | The loader issues `getCurrentAccess` with the identical argument `useEnteredWarehouse()` supplies, so exactly one cache entry exists and `access` is defined when `AccessPage` mounts.                                                                                                               |
| **CR-AC-05** | `the workspace administration surface holds no readiness branch`                | unit           | `WorkspaceAdministration.tsx` contains no loading branch and no `if (!workspaceContext) return null`, imports no `Spinner`, destructures no readiness field, and returns `ReactElement`.                                                                                                             |
| **CR-AC-05** | `the guarded route projection returns a workspace context that is never absent` | integration    | Inside the guarded route, the projection returns a non-optional `WorkspaceContext`, so the surface's return type is honest at the type level. **Tested in `sad.md` §11's amended form** — see _Amendments_ below.                                                                                    |
| **CR-AC-06** | `the access page holds no readiness branch`                                     | unit           | `modules/access/page.tsx` contains no loading branch, imports no `Spinner`, and destructures no readiness field from `useCurrentPermissions()`.                                                                                                                                                      |
| **CR-AC-06** | `the access page still denies an actor with no permissions`                     | component      | The `!access \|\| permissionIds.length === 0` denial branch renders exactly as at `baseline_revision`.                                                                                                                                                                                               |
| **CR-AC-07** | `the dataset card declares no readiness props`                                  | unit           | `DatasetCardProps` declares neither `loading` nor `loadingLabel`, the private `DatasetSkeleton` helper is gone, and each of the three call sites passes only the props that remain.                                                                                                                  |
| **CR-AC-07** | `the dataset card is empty when it has no items`                                | component      | `empty` follows `items.length === 0` alone, and the card's `error` / `errorLabel` behaviour is unchanged.                                                                                                                                                                                            |
| **CR-AC-08** | `the removed waiting surfaces no longer exist`                                  | unit           | `WorkspaceListSkeleton.tsx` and `WarehouseListSkeleton.tsx` are absent; `WorkspacePermissionsTab` renders no skeleton; none of the four named call sites retains a readiness branch.                                                                                                                 |
| **CR-AC-08** | `the file and case inventories name nothing that was deleted`                   | unit           | `module-surface.ts`, `warehouse-administration-split.spec.ts`, `warehouses-tab-case-inventory.spec.ts` and `Sidebar.spec.tsx` name no deleted file and no deleted case; the workspace manifest gains the new loader and projection files and loses the deleted skeleton.                             |
| **CR-AC-08** | `a member list reaches only three states`                                       | component      | `MemberListStatus` resolves to `'empty'`, `'ready'` or `'searchEmpty'` and to nothing else.                                                                                                                                                                                                          |
| **CR-AC-09** | `the five contracts publish no readiness`                                       | unit           | `AccessDataset` declares no `isLoading`, `isFetching` or `isReady`; `CurrentPermissions` and `CurrentWorkspaceContext` declare no `isLoading`; `useWorkspaceRoles` and `useWorkspacePermissionCatalogue` return no `isReady`.                                                                        |
| **CR-AC-09** | `the retained readiness identifiers stay legal`                                 | unit           | `AccessDataset.isError` is still declared, and the identifiers survive at the four allowed sites — RTK Query's own results, `router.state.isLoading`, `mutation-feedback.middleware.ts`, and the CR-RG-06 components. A scan that forbids them repository-wide fails this row.                       |
| **CR-AC-10** | `a background refetch leaves the painted rows on screen`                        | e2e-through-UI | Invalidating the members tag on a painted access destination leaves the previously painted rows visible until the new data arrives; no skeleton or spinner replaces them.                                                                                                                            |
| **CR-AC-10** | `a cache invalidation does not re-run the route loader`                         | e2e-through-UI | `RoutePendingState` never mounts during that refetch, and the loader does not run a second time.                                                                                                                                                                                                     |
| **CR-AC-11** | `the member list carries no readiness prop and no defaulted actor`              | unit           | `MemberDirectory.tsx` passes no readiness prop, `MemberListProps` declares no `isLoading`, `actorUserId` is not defaulted with `?? ''`, and its type is `string \| undefined`.                                                                                                                       |
| **CR-AC-11** | `an unresolved actor is offered no destructive control`                         | component      | With `actorUserId` undefined, `MemberRow` suppresses every destructive control on every row, and no list-level state is added for the case.                                                                                                                                                          |
| **CR-AC-12** | `neither language carries a removed waiting key`                                | unit           | The seven keys per language — fourteen total — are absent from `en` and `uk`, both languages carry the identical key set, and `common.json`'s `shell.landing.pendingLabel` is the only waiting copy the application renders.                                                                         |
| **CR-AC-13** | `a cold access navigation mounts one pending state`                             | e2e-through-UI | Over the production route tree: `RoutePendingState` mounts **exactly once** and is replaced directly by the finished destination; `WarehouseLayout` never commits beside a pending state.                                                                                                            |
| **CR-AC-13** | `the four routes declare the pending options they were given`                   | unit           | The route files declare the exact `pendingComponent`, `errorComponent`, `pendingMs`, `pendingMinMs` and `wrapInSuspense` values in `sad.md` §5.1 — including `wrapInSuspense: false` on `accessRoute` and explicit `pendingMinMs: 0` on all four.                                                    |
| **CR-AC-14** | `a refused warehouse causes no access request`                                  | integration    | For both refusal reasons, `accessRoute`'s loader issues no request — not `getCurrentAccess`, not any tab dataset. The count equals `baseline_revision`, which is zero.                                                                                                                               |
| **CR-AC-15** | `a failed secondary dataset costs only its own tab`                             | e2e-through-UI | Primary succeeded, one secondary rejected: the destination paints, the arrived tabs render their content, the failed dataset renders its own component-owned error message, and `RouteErrorState` is absent.                                                                                         |
| **CR-AC-15** | `a loader settles its secondaries and rejects on its primary`                   | integration    | A rejected secondary does not reject the loader; a rejected primary does.                                                                                                                                                                                                                            |
| **CR-AC-15** | `each collapsed tab guard keeps an explicit error arm`                          | component      | `RolesTab` and `MembersTab` route an errored dataset to `RolesDatasetCard` / `MembersDatasetCard` rather than into a directory with `items: []`. The surviving condition is _not-permitted **or** errored_, never the permission term alone.                                                         |
| **CR-AC-15** | `the warehouse dashboard needs no loader of its own`                            | unit           | `warehouseDashboardRoute` declares no loader and no `pendingComponent`; the parent's declaration is the whole of its readiness.                                                                                                                                                                      |
| **CR-AC-16** | `staying inside a warehouse does not repaint the pending state`                 | e2e-through-UI | Navigating between a Warehouse's surfaces with a warm cache — `cause === 'stay'` — does not paint `RoutePendingState` over the live destination for a wait shorter than 150 ms. **`sad.md` §11's amended form** — see _Amendments_.                                                                  |

## Regression-boundary coverage

`spec.md` §5.1's boundaries are what proves the removals took nothing with them. Every boundary has
its own row, and CR-RG-01 is a merge blocker per `change.md` §6's abort threshold.

| Boundary     | Test name (intent-based)                                                  | Level          | Expected outcome                                                                                                                                                                                                                                                                                      |
| ------------ | ------------------------------------------------------------------------- | -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **CR-RG-01** | `signing out never renders the acting user's own row as not-self`         | component      | With a member list mounted, dispatch `authBecameAnonymous()` — the state `SignOutButton` reaches before awaiting navigation. No row renders as not-self and no destructive control is offered against an unresolved actor id. **Merge blocker**: `requireAuth` covers route entry, not this teardown. |
| **CR-RG-02** | `each loader dispatch condition matches the gate it reproduces`           | unit           | Every loader condition is compared against the hook `skip` or tab descriptor it reproduces, **in both directions** — a widened condition and a narrowed one each fail. Covers the `WAREHOUSES:WATCH` tab-descriptor gate that has no shared constant.                                                 |
| **CR-RG-02** | `a loader requests exactly the actor's admitted datasets`                 | integration    | For each enumerated actor, the dispatched request set equals `spec.md` §5.1's table exactly — no dataset a Permission withholds, none an unadmitted tab would have fetched.                                                                                                                           |
| **CR-RG-02** | `an assign-only actor still receives roles and members`                   | integration    | An actor holding `ROLES:ASSIGN` without `ROLES:WATCH` still receives Roles and Members, so the Members list's Role-name lookup keeps working. This is the narrowing direction, the likelier mistake.                                                                                                  |
| **CR-RG-02** | `the workspace users endpoint is dispatched once`                         | integration    | `listWorkspaceUsers` produces one request and one cache entry serving both the people counts and the candidate list.                                                                                                                                                                                  |
| **CR-RG-02** | `every actor admitted to the roles tab receives the permission catalogue` | integration    | The one intended widening: the catalogue's skip set covers all six Permissions that admit the Roles tab, so tab admission implies the dataset arrives. Nothing else in the Permission conditions moves.                                                                                               |
| **CR-RG-03** | `no prior warehouse authority is reported for the next one`               | integration    | `usePermissions.spec.tsx` retains its argument-change case: rendering `useCurrentPermissions` across a Warehouse change reports no W1 authority for W2, and the case fails if `currentData` is replaced by `data`.                                                                                    |
| **CR-RG-04** | `a refused warehouse entry is refused in place`                           | e2e-through-UI | `WarehouseEntryRefusal` renders at the requested address with the same non-disclosing reason as at `baseline_revision`; the refusal never presents as pending and never becomes a redirect.                                                                                                           |
| **CR-RG-05** | `each existing dataset message still renders`                             | component      | `roles.error`, `members.empty`, `members.searchEmpty`, `warehouses.empty`, `warehouses.noMatches` and `permissions.empty` each render in their own case, unchanged from `baseline_revision`.                                                                                                          |
| **CR-RG-05** | `a not-permitted actor is never told a dataset is empty`                  | component      | At each of the five collapsed sites, an actor outside the dataset's skip set cannot reach the mounted tab — so the collapsed `items.length === 0` predicate is never evaluated for a withheld dataset, and no capability boolean is added to reach that.                                              |
| **CR-RG-06** | `submit feedback is unchanged`                                            | component      | The eight named dialogs and forms show their `isPending` submit state exactly as at `baseline_revision`, and `mutationFeedbackMiddleware` is unchanged.                                                                                                                                               |
| **CR-RG-06** | `a mutation never paints the route pending state`                         | e2e-through-UI | Submitting a mutation on a painted destination mounts no `RoutePendingState`.                                                                                                                                                                                                                         |
| **CR-RG-07** | `declarative permission gating is untouched`                              | unit           | No capability boolean is introduced at any collapsed site, and the tab sets on `/workspace` and the access surface keep their order, count and admission rules.                                                                                                                                       |
| **CR-RG-07** | `every gate and descriptor behaves as before`                             | component      | Existing `WarehousePermissionGate` / `WorkspacePermissionGate` / `usePermittedItems` / `useWorkspacePermittedItems` cases pass unchanged; ADR `19-08-2026-declarative-permission-gates.md` needs no amendment.                                                                                        |
| **CR-RG-08** | `the shell renders no waiting affordance of its own`                      | e2e-through-UI | While `RoutePendingState` paints inside the routed outlet, the header, `Sidebar` and `WarehouseSwitcher` render no skeleton and no spinner.                                                                                                                                                           |
| **CR-RG-08** | `the sidebar loading-window cases pass unchanged`                         | component      | `Sidebar.spec.tsx:227,404` — the navigation entries hidden during the loading window, without a skeleton — continue to pass with no edit.                                                                                                                                                             |

## Edge cases / error paths

Each of these is its own row above, never folded into a happy path. Restated here as the failure and
authorization surface this change has to hold:

- **Primary read fails** (`getWorkspaceContext`, `getCurrentAccess`, or the Warehouse verdict) →
  `RouteErrorState` replaces the destination (CR-AC-02, CR-AC-15).
- **One secondary read fails, primary succeeded** → the destination paints; only that tab shows its
  own error; `RouteErrorState` is absent (CR-AC-15).
- **Warehouse verdict is `refused`, either reason** → a resolved outcome, not a failure and not a
  pending state: `WarehouseEntryRefusal` in place, and zero requests from the child loader
  (CR-AC-14, CR-RG-04).
- **Actor admitted to the destination and to no tab** (`WORKSPACE:RENAME` only) → header alone, no
  tab shell, no secondary dataset awaited (CR-AC-03).
- **Actor outside a dataset's skip set** → never told "no members"/"no roles" for a dataset they may
  not read; the not-permitted arm stays unreachable rather than being branched on (CR-RG-05).
- **Actor admitted more widely than a dataset's gate** (`ROLES:ASSIGN` without `ROLES:WATCH`) →
  still receives Roles, Members and the Permission catalogue (CR-RG-02).
- **Actor becomes anonymous while a list is mounted** → no row is treated as not-self and no
  destructive control is offered (CR-RG-01).
- **Cache entry evicted after the retention window** → an admitted tab still has its data; the empty
  message never stands in for a dataset in flight (CR-AC-03).
- **Cache invalidated by a mutation on a live destination** → rows persist, the loader does not
  re-run, and no pending state paints (CR-AC-10, CR-RG-06).

## Test data

`apps/web` owns no datastore — `sad.md` §7 records no entity, column, index or migration, and
`apps/server` is not touched. The default throwaway-container strategy therefore has nothing to
stand up. What replaces it, and the boundary that is deliberately **not** crossed:

- **The real dependency is kept real.** The Redux store, the RTK Query cache, the API slices and the
  route tree are the production ones, constructed fresh per test via `makeStore()`. None of them is
  mocked, stubbed or substituted — a mocked cache would make CR-AC-03's retention case and
  CR-AC-10's no-reload clause unfalsifiable.
- **Only the network transport is stubbed**, at the contract-declared REST paths the existing
  `test/access-fixtures.ts` builds (`accessPath`, `usersPath`), never at a hook and never at an API
  slice. A suffix match is forbidden: the fixtures' own comment records that a suffix match is what
  let stale paths keep passing.
- **Seed strategy:** the existing `test/access-fixtures.ts` and `test/workspace-fixtures.ts`
  in-memory backends, extended with the Permission subsets CR-RG-02's table enumerates — one named
  actor per row of that table, so the parity rows read as data rather than as ad-hoc setup.
- **Harness:** `test/render.tsx` for component rows. E2E-through-UI rows build their own tree from
  the production route objects over an in-memory history, per the _Levels_ note above.
- **Cleanup boundary: per-test.** A fresh store and a fresh router per test; the transport stub reset
  between tests; real timers restored after CR-AC-03's retention case, which is the one row that
  advances the clock. Route-level state leaking between tests would make the mount-count assertions
  in CR-AC-13 and CR-AC-16 read each other's results.

## NFR validation

<!-- N/A: no numeric NFR to load-test. -->

`spec.md` §6 carries no rate, duration or throughput threshold, and `AGENTS.md` forbids adding
telemetry, so there is no load scenario to write and none is invented. Its five rows are measured
structurally and confirmed at `/run`:

| `spec.md` §6 row                              | How it is measured                                                                                                                                     |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Time to first paint, `/workspace`             | `the admitted datasets are dispatched in one round` — integration: the secondaries go out together, not sequentially.                                  |
| Time to first paint, `/warehouses/$id/access` | `the access surface takes two rounds and never three` — integration: the primary, then the admitted secondaries together. A third round fails the row. |
| Requests issued per destination               | CR-RG-02's rows above; the request set equals its table for each enumerated actor.                                                                     |
| Waiting affordances in the application        | CR-AC-08 and CR-AC-12 — the surfaces are gone and the keys are gone.                                                                                   |
| Layout shift after first paint                | Structural: no destination component renders before its route-awaited data (CR-AC-03, CR-AC-13). Confirmed visually at `/run`.                         |

**At `/run`**, on the throttled profile `spec.md` §6 names (Chrome DevTools _Fast 3G_): `/workspace`
and the access surface paint `RoutePendingState` and then the complete destination with no
intermediate layout shift; the network panel's request set equals CR-RG-02's enumeration for the
signed-in actor. The two regressions to watch, per `change.md` §6: a destination that reaches a
permanent pending state, and a mutation that paints pending over a live destination. `/run` is also
where `sad.md` §11's open question on the 150 ms threshold is settled.

## Where the rows land

Placement follows [`placing-web-tests.md`](../../system/guides/placing-web-tests.md) — colocated
when one file owns the behaviour, a dedicated `src/test/<subject>/` directory when none does. The
files `sad.md` §5.2 already names, and what this plan adds to them:

| Home                                                                             | Rows                                                                                                                                                                                                  |
| -------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `modules/workspace/loaders/workspace-administration.loader.spec.ts`              | CR-AC-03 (rename-only), CR-AC-15 (settle semantics), CR-RG-02's five `workspaceRoute` rows, §6 row 1                                                                                                  |
| `modules/access/loaders/access-surface.loader.spec.ts`                           | CR-AC-04, CR-AC-14, CR-AC-15 (settle semantics), CR-RG-02's four `accessRoute` rows, §6 row 2                                                                                                         |
| `modules/workspace/hooks/projections/useWorkspaceAdministrationContext.spec.tsx` | CR-AC-05's type guarantee                                                                                                                                                                             |
| `src/test/route-readiness/route-readiness.spec.tsx`                              | CR-AC-02, CR-AC-03 (paint + tab-switch + retention), CR-AC-10, CR-AC-13, CR-AC-16, CR-RG-04, CR-RG-06, CR-RG-08                                                                                       |
| `src/test/loader-permission-parity/loader-permission-parity.spec.ts`             | CR-RG-02's structural drift check, both directions                                                                                                                                                    |
| `src/test/readiness-removal/readiness-removal.spec.ts` _(new)_                   | CR-AC-05–09, CR-AC-11, CR-AC-13's declaration check, CR-AC-15's dashboard row, CR-RG-07's structural row — the repository scan `sad.md` §10 calls for; no single file owns it                         |
| `src/test/readiness-documentation/readiness-documentation.spec.ts` _(new)_       | CR-AC-01 — the document-content gate                                                                                                                                                                  |
| Colocated beside their subjects                                                  | CR-AC-03 (force-mount), CR-AC-06 (denial), CR-AC-07, CR-AC-08 (member states), CR-AC-11 (destructive controls), CR-AC-15 (tab error arms), CR-RG-01, CR-RG-03, CR-RG-05, CR-RG-06, CR-RG-07, CR-RG-08 |
| `src/test/locale-baseline.json` and its owning spec                              | CR-AC-12                                                                                                                                                                                              |

The two new `src/test/` directories are structural gates spanning many files, which `placing-web-tests.md`
§3 files exactly this way; each carries a header comment saying why no single file owns it.

## Sequencing

`change.md` §6 orders the rollout so no commit leaves a window painted by neither model. Two
consequences for this plan:

1. **CR-AC-01's gate is red for the whole implementation.** CH-01 reconciles `docs/system` at
   **ship**, after review passes, so the document-content gate is written now and goes green with
   the rollout's final commit. It must not be weakened or skipped to get an earlier green.
2. **The structural rows go red before the behavioral ones go green.** Rollout steps 1–2 are
   additive — routes declare their pending contract and the loaders await their datasets — so the
   behavioral rows (CR-AC-02, CR-AC-03, CR-AC-04, CR-AC-13, CR-AC-16) can pass before any readiness
   is removed. The structural rows (CR-AC-05–09, CR-AC-11, CR-AC-12) belong to steps 3–5 and stay red
   until then. Landing them in the other order would remove component readiness before the routes
   demonstrably cover the window.

## Amendments this plan tests

`sad.md` §11 records two amendments to `spec.md`, decided with the owner and **not yet applied to
`spec.md`**. The rows above encode the amended form, because that is what the design ships:

1. **CR-AC-05.** The plan tests "a route-scoped projection returns a non-optional `WorkspaceContext`
   inside the guarded route", not "`CurrentWorkspaceContext.workspaceContext` is narrowed to
   non-optional". The shared contract keeps its optional field, because `WarehouseSwitcher.tsx:164`
   and `RetainedContextMessage.tsx:49` read it where no route has awaited the context and CR-RG-08
   requires the shell to keep observing that absence. The criterion's substance is unaffected.
2. **CR-AC-16.** The plan tests "does not paint for a wait shorter than 150 ms", not the literal
   "does not replace the live destination" — holding the literal form would also suppress the paint
   on `/workspace` → `/access` with a warm context, leaving CR-AC-02 unmet on the common path.

**Action:** apply both amendments to `spec.md` §5 at the next spec touch, so the criterion text and
its test agree. Until then, the plan and the SAD agree and the spec is one revision behind.

## CI placement

Every level here runs in the same fast web suite — no browser, no container, no external service —
so the split is by rollout order rather than by cost.

- **On every pull request:** unit, integration, component and E2E-through-UI. All of them. The gate
  from `sad.md` §10:

  ```sh
  pnpm --filter @warehouser/web lint
  pnpm --filter @warehouser/web test
  pnpm --filter @warehouser/web build
  ```

- **Before merge, manually:** the `/run` verification on the throttled profile, which is the only
  check for `spec.md` §6's layout-shift row and the only place the 150 ms threshold is settled.
- **Merge blockers, called out separately** because `change.md` §6's abort threshold names them:
  CR-RG-01's sign-out row, CR-RG-02's parity rows, and CR-RG-04's refusal row. Any of the three
  failing to be pinnable by a test aborts the change rather than shipping it.

## Open items

- [ ] CR-AC-01's gate is red until ship by design (_Sequencing_ 1). Confirm at `tasks` that the
      reconciliation is a task on this branch and not deferred past merge. — owner: Tech Lead
- [ ] `sad.md` §11's two amendments are unapplied in `spec.md` (_Amendments_). — owner: Tech Lead,
      due: next `spec.md` touch
- [ ] `sad.md` §11 leaves the workspace tab-descriptor extraction open. If it lands, half of
      `loader-permission-parity` retires and CR-RG-02's structural row shrinks to the access sets.
      — owner: Tech Lead, due: `tasks`
