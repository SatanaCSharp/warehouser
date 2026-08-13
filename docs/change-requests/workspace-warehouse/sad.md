---
status: Draft
owner: 'YuriiH'
reviewers: ['Product Owner', 'Tech Lead', 'Security Lead']
updated_at: '2026-08-13'
feature_size: 'L'
target_surfaces: ['web-frontend']
change_record: './change.md'
---

# Software Architecture Description — change-request: workspace-warehouse

## 1. Context and quality goals

### Current behavior

`apps/web` today has one undifferentiated authenticated surface. `router.ts` registers five flat
routes under one root (`/`, `/access`, `/login`, `/sign-up`, `/workspace`), and none of them names a
Warehouse. `shared/layouts/Sidebar.tsx` renders one nav list mixing both authority levels —
Dashboard, Access (gated on `ROLES_WATCH ∪ USERS_WATCH` through `PermissionGate`), Workspace (gated
on `workspaceAdministrationPermissionIds` through `WorkspaceGate`, which renders `null` when the
actor holds none). `shared/layouts/WarehouseSwitcher.tsx` is a flat `Select` over the actor's
memberships whose selection writes `PUT /workspace/active-warehouse`; three of its states
(`p2NiLo` nothing chosen, `pUVt0` selection ended, and the unavailable state) `return` **instead of**
the control. Above all of it, `shared/hooks/usePermissions.ts` resolves the Warehouse every
Warehouse-scoped screen operates on from `context.effectiveWarehouseId`, so `/access` means a
different Warehouse for the same address depending on state the actor cannot see, link to, or hold
two of at once.

The server surface is already the shape this change wants: every Warehouse-scoped endpoint is built
by `shared/api/warehouse-path.ts` as `/api/v1/warehouses/:warehouseId/…`, and `GET /workspace/context`
already returns the Workspace, `workspacePermissionIds`, the actor's memberships with archived state,
and the derived `effectiveWarehouseId`. Only the web's own addressing disagrees with it.

### Target behavior

Two contexts, both addressable: a Workspace view at `/workspace` (unchanged content) and a Warehouse
view at `/warehouses/:warehouseId/…`, entered explicitly, chosen through one grouped switcher.
`/` stops being a destination and becomes the landing resolver plus the no-context state. The
Warehouse a screen operates on stops being stored state and becomes the address.
[`change.md` §3](./change.md#3-override-map) (CH-01–CH-10) is the authoritative old-to-new trace;
this document places that trace inside the system architecture and settles the three questions
[`change.md` §6](./change.md#6-rollout) step 2 assigns to `design`: the route shape, where the
landing resolver lives, and how `useCurrentPermissions` reads the route parameter without every
consumer taking a new argument.

### Quality goals, in priority order

1. **The Warehouse under authorization is never ambient.** After this change no non-test source
   outside three named call sites reads `effectiveWarehouseId`, and no Warehouse-scoped screen can
   resolve a Warehouse it was not addressed with (CR-AC-06, spec.md §6 "Warehouse-scope coverage").
   This is the goal the change exists for; every other goal yields to it.
2. **A user-supplied `:warehouseId` is untrusted input handled uniformly.** Non-membership, a
   foreign Workspace, a non-existent id and a malformed id produce one indistinguishable refusal in
   place, which never redirects and never re-runs the landing resolver (CR-AC-07, spec.md §6.1).
3. **Every authorization rule, predicate and server call is preserved verbatim.** No Permission set
   is redefined, no guard predicate is rewritten, no endpoint or contract changes; the same queries
   simply receive their Warehouse from the URL (CR-RG-01, CR-RG-05).
4. **Exactly one navigation resolves landing, and no actor is shown a context they are then moved
   out of** — including no bounce between `/` and `/workspace` (CR-AC-08, CR-RG-05).
5. **Presentation state never becomes authority and never blocks work.** The stored selection
   resolves landing only; its write records entry, cannot fail loudly, and cannot reverse the entry
   it records (CR-AC-09).
6. **Holding an address is not authority, and losing authority does not evict.** Entry is decided
   when the address is entered; afterwards each act is decided when it is authorized (CR-AC-20).
7. **The shell chrome, its breakpoints and its accessibility behavior are unchanged** except for the
   two stated overrides — what the brand link resolves to and what the sidebar lists (CR-RG-06).

Because this change replaces user-visible surfaces, the Pencil `design-ui` gate applies and has
**not** run yet for this work item ([`change.md` §6](./change.md#6-rollout) step 3): it runs after
this SAD and before implementation. No `design-handoff.md` exists at this work-item root; the frames
`docs/features/workspaces/design-handoff.md` declares approved still draw the flat switcher and the
mixed sidebar and are not current guidance for these surfaces.

## 2. Constraints inherited from `docs/system`

- The repository stays a browser SPA plus a NestJS modular monolith
  ([architecture map](../../system/architecture-map.md)). This change touches `apps/web` only — no
  `apps/server`, no `packages/contracts`, no persisted schema (change.md §4: API and events, N/A).
- Routes are **registered manually in `src/router.ts`**; file-route generation requires an accepted
  system decision and migration plan
  ([frontend architecture](../../system/frontend-architecture.md) §"Runtime foundation"). The new
  route tree is assembled by hand in the same file.
- The bootstrap chain `main.tsx → Redux Provider → RouterProvider → root route → RootLayout →
matched module page` is fixed (same section). This change nests one layout route between the root
  route and the Warehouse-scoped pages; it adds no second root layout and no parallel shell.
- **All application paths are declared in `shared/constants/routes.ts`**; route definitions, guards,
  navigation calls and links reference `ROUTES` and do not repeat path literals
  ([frontend architecture](../../system/frontend-architecture.md) §"Guards and paths").
- **Access control lives at route level in plain functions under `guards/`**, with no React imports;
  a guard "returns normally when access is allowed, and throws TanStack Router's redirect descriptor
  otherwise" (same section; echoed by [system SAD](../../system/sad.md) §"Frontend state and
  routing"). §4 records the one narrow deviation this change requires from the second half of that
  sentence, and why the specification forbids the redirect.
- **Redux Toolkit is the only cross-module client-state owner**, and a slice is added only for state
  "used across modules or needed globally across routes"
  ([frontend architecture](../../system/frontend-architecture.md) §"Redux Toolkit infrastructure").
  The entered Warehouse is in the URL and the router owns it; no slice is added, and no React context
  mirrors it ([sharing web state with context](../../system/guides/sharing-web-state-with-context.md)
  is deliberately not invoked).
- **RTK Query owns server state**, endpoints are injected into the one shared API slice, and guards
  dispatch the same endpoints through the store rather than fetching independently (same section;
  accepted [RTK Query ADR](../../system/adr/02-08-2026-rtk-query-for-web-api-calls.md)). Every read
  this change needs — `getWorkspaceContext`, `getCurrentAccess` — already exists and is reused.
- A new route-owned feature follows [adding a web module](../../system/guides/adding-a-web-module.md)
  §§1–3, 7: declare the path, create `modules/<module>/{route,page}`, register in `router.ts`, and do
  **not** add a no-op guard where a parent already guards.
- Component placement follows [placing web components](../../system/guides/placing-web-components.md)
  (nest only under exclusive ownership; a second consumer moves a component up), and component
  contents follow [writing web components](../../system/guides/writing-web-components.md) (one
  exported component per file, one reason to change, a two-hop prop budget, flat branching).
- **HeroUI v3 plus the `@heroui/styles` CSS variables applied by `styles/global.css` are the only
  visual system**; there is no Warehouser UI wrapper package to import from
  ([frontend architecture](../../system/frontend-architecture.md) §"Components"). The grouped
  switcher is composed from HeroUI primitives, not a new control library.
- All user-visible copy goes through `src/i18n.ts` into
  `public/locales/<language>/<namespace>.json` with `en`/`uk` parity
  ([localization guide](../../system/guides/adding-and-maintaining-web-localization.md)); no new
  namespace is introduced (spec.md §6 "Locale completeness").
- API failures are normalized once at the RTK Query boundary and surfaced through the shared alert
  path ([web error handling](../../system/guides/web-error-handling.md)). §5 records the one
  documented exception this change requires for the entry write (CR-AC-09).
- Structured logging is the only diagnostic mechanism; **no telemetry** is added
  (`AGENTS.md`, accepted
  [logging-instead-of-telemetry ADR](../../system/adr/03-08-2026-structured-logging-instead-of-telemetry.md)).
- Every user-visible web change is gated by the Pencil `design-ui` workflow, and an approved handoff
  does not authorize bypassing modules, tokens, RTK boundaries, tests or accessibility conventions
  ([frontend architecture](../../system/frontend-architecture.md) §"UI design boundary").

## 3. Scope and target surfaces

`target_surfaces: ['web-frontend']`. Every affected source in `change.md` frontmatter is under
`apps/web/` or `docs/`; `apps/server` and `packages/*` are untouched, so no `data-model` or `api`
stage applies to this work item.

### In scope

| Area                    | Files                                                                                                                                                                                                                           |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Route tree              | `src/router.ts`, `src/shared/constants/routes.ts`, `src/routes/warehouse.route.tsx` (new), `src/routes/catch-all.route.tsx` (new), `src/modules/access/route.tsx`, `src/modules/home/route.tsx`, `src/modules/warehouse/` (new) |
| Entry and landing rules | `src/guards/warehouse-entry.guard.ts` (new), `src/guards/landing.guard.ts` (new), `src/guards/anonymous-user.guard.ts` (read-only confirmation), `src/guards/workspace.guard.ts` (unchanged)                                    |
| Warehouse resolution    | `src/shared/hooks/useEnteredWarehouse.ts` (new), `src/shared/hooks/usePermissions.ts`                                                                                                                                           |
| Shell                   | `src/shared/layouts/RootLayout.tsx`, `Sidebar.tsx`, `WarehouseSwitcher.tsx`, `src/shared/layouts/WarehouseLayout.tsx` (new)                                                                                                     |
| Refusal / error states  | `src/shared/components/WarehouseEntryRefusal.tsx` (new), `src/shared/components/RouteErrorState.tsx` (new)                                                                                                                      |
| Entry record            | `src/modules/warehouse/hooks/useRecordWarehouseEntry.ts` (new), `src/store/middleware/api-error.middleware.ts`                                                                                                                  |
| Workspace warehouses    | `src/modules/workspace/components/workspace-administration/warehouses/{WarehousesTab,WarehouseList}.tsx`                                                                                                                        |
| Copy                    | `public/locales/{en,uk}/{common,workspace}.json`                                                                                                                                                                                |
| Architecture check      | `apps/web/eslint.config.mjs`                                                                                                                                                                                                    |
| Design source           | `docs/mockups/app.pen` + `design-handoff.md` at this work-item root, produced by the `design-ui` pass that follows this SAD                                                                                                     |

### Out of scope

`apps/server` and `packages/contracts` in full; `PUT /workspace/active-warehouse`, its column and the
server's derivation of `effectiveWarehouseId`; the `/workspace` destination's own content, tabs and
route guard; the access surface's internals (it moves address, not shape);
`shared/components/{PermissionGate,WorkspaceGate}.tsx` (consumed, not modified);
`WarehouseDetailPane.tsx` (see §5); the auth-route and chrome-less `RootLayout` branches; header
chrome, footer, language selector and drawer behavior (CR-RG-06); and the five canonical documents of
[`change.md` §8](./change.md#8-canonical-reconciliation-after-pass), which are reconciled at ship
time and are **not** edited by this design pass.

### Open question closed here

[`spec.md` §8](./spec.md#8-open-questions) assigns one question to this stage: does the Workspace view
need a landing/overview page distinct from `/workspace`? **Closed: no.** `/workspace` remains the
single Workspace destination with today's content and today's guard; the switcher's Workspace row
enters it directly, and the Workspace-context sidebar lists exactly that one destination (CR-AC-12).
Introducing a second Workspace address would add a destination with no content, a second guard
decision, and a new bounce risk against CR-RG-05 — all cost with no criterion asking for it. The
remaining open questions (`design-ui`, and the AC-12a documentation conflict) stay open and are
carried in §11.

## 4. Solution strategy

1. **One layout route establishes the Warehouse context; everything below it inherits.**
   `/warehouses/$warehouseId` is a layout route with no page of its own. Its `beforeLoad` runs
   `requireAuth`, then resolves entry once against the actor's memberships, and returns that verdict
   into the route context of the match. Its children — the Warehouse dashboard (`/`), the access
   surface (`access`), and a splat (`$`) — render only after that resolution. This is the load-bearing
   decision of the change and is recorded in
   [ADR 0001](./adr/0001-warehouse-view-as-a-route-established-context.md).
2. **Entry is resolved at entry, not continuously.** The verdict is computed in `beforeLoad`, which
   runs when the address is entered and not when the RTK Query cache later refetches. Archiving W or
   withdrawing the membership while the actor is inside W therefore does not evict them (CR-AC-20),
   while arriving at an archived or non-member address is refused (CR-AC-07, CR-AC-17). Both
   criteria are satisfied by _where_ the check runs, not by extra logic.
3. **Refusal renders in place; it never redirects.** The verdict has three values (`entered`,
   `refused: not-a-member`, `refused: archived`), and the layout component renders `<Outlet />` or the
   matching refusal. Nothing about a refusal reaches the landing resolver, and the address the actor
   typed stays in the URL bar (CR-AC-07). This is the deviation from the guards convention recorded
   in §5 and in the ADR.
4. **One reader publishes the entered Warehouse to everything that needs it.**
   `shared/hooks/useEnteredWarehouse.ts` reads the layout match non-throwing and returns the
   Warehouse id only for an `entered` verdict — `undefined` in the Workspace view, at the root, and
   around a refusal. `useCurrentPermissions` swaps its `effectiveWarehouseId` read for this hook, so
   **every existing consumer keeps its current signature**: `useAccessCapabilities`, the access
   dataset hooks, `PermissionGate` and the access page all continue to read `warehouseId` from the
   projection they already read it from. That answers `change.md` §6 step 2's third question with
   zero call-site churn outside the hook itself.
5. **The landing resolver is a guard on `/`, in the canonical shape.** `resolveLandingContext` reads
   the Workspace context through the store (the `workspace.guard.ts` pattern, verbatim) and throws
   exactly one redirect, or returns normally so `HomePage` renders the no-context state. TanStack's
   own pending state covers the unresolved read, and a failed read throws to the route's
   `errorComponent` — giving CR-AC-08's three outcomes plus its pending and error states without any
   hand-rolled state machine.
6. **Unmatched addresses are handled by splat routes that redirect to `/`, not by a shim.** One splat
   under the root and one under the Warehouse layout. The Warehouse-level splat exists so that
   `/warehouses/X/anything` _matches_ the layout route and therefore runs the entry check first —
   which is what makes CR-AC-07's precedence over CR-AC-16 structural rather than incidental. Both
   splats redirect to `/`; an unauthenticated actor is then sent to sign-in by the existing
   `requireAuth` on `/`, so the not-found handling needs no authentication branch of its own
   (CR-AC-16).
7. **The switcher becomes navigation, not mutation.** Rows are destinations; choosing one navigates.
   The stored-selection write moves out of the switcher and onto entry itself, so every entry path —
   switcher, Enter action, typed address, restored session — records identically (CR-AC-09) instead
   of only the one path that went through the control.
8. **The sidebar reads the matched route tree, not the pathname.** Warehouse context comes from the
   same `useEnteredWarehouse()` the permissions hook uses, and Workspace context from the
   `/workspace` match. A refused Warehouse address yields neither, so the no-context shell renders
   around a refusal by construction (CR-AC-07's last paragraph, CR-AC-18).
9. **Every gating predicate is moved, never rewritten.** `workspaceAdministrationPermissionIds`,
   `hasWorkspacePermission`, the `ROLES_WATCH ∪ USERS_WATCH` `PermissionGate`, `requireAuth` and
   `requireWorkspaceCapability` are consumed exactly as they exist (CR-RG-01, CR-RG-05, CR-AC-11,
   CR-AC-19).

## 5. Building blocks and ownership

### Retained unchanged

| Building block                                                                                 | What it keeps doing                                                                                                                                                                                                                           |
| ---------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `guards/workspace.guard.ts`                                                                    | Refuses `/workspace` and redirects to `ROUTES.HOME` against `workspaceAdministrationPermissionIds` (CR-RG-05). The redirect target now resolves through the landing rules, which is why an actor it bounces can no longer be sent back at it. |
| `guards/auth.guard.ts`                                                                         | Session initialization plus the sign-in redirect; consumed by the new routes unchanged                                                                                                                                                        |
| `shared/hooks/useWorkspacePermissions.ts`                                                      | `workspaceAdministrationPermissionIds` and `hasWorkspacePermission`, reused verbatim by the switcher row, the landing resolver and the guard (spec.md §2.1)                                                                                   |
| `shared/components/{PermissionGate,WorkspaceGate}.tsx`                                         | Same props, same omission semantics. CH-02's narrowing is implemented at the switcher call site, which deliberately does not use `WorkspaceGate`; the gate itself is not weakened                                                             |
| `shared/api/{workspace-context-api,access-permissions-api,warehouse-path}.ts`                  | Same endpoints, same cache keys, same tags. `getCurrentAccess` keeps taking a Warehouse id — it simply now receives one from the URL                                                                                                          |
| `modules/access/**` except `route.tsx`                                                         | The whole access surface, its hooks, capabilities table and dialogs. It changes address, not shape (CR-AC-06, CR-AC-21)                                                                                                                       |
| `modules/workspace/**` except `WarehousesTab`/`WarehouseList`                                  | `/workspace`, its tabs, its content and its administration actions (spec.md §3)                                                                                                                                                               |
| `RootLayout`'s auth-route and chrome-less branches, header, footer, `LanguageSelector`, drawer | Byte-for-byte behavior at every breakpoint (CR-RG-06)                                                                                                                                                                                         |

### Modified

| Building block                                   | Current → target                                                                                                                                                                                                                                                                                                                                                            |
| ------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `shared/constants/routes.ts`                     | `ACCESS: '/access'` removed; `WAREHOUSE: '/warehouses/$warehouseId'` and `WAREHOUSE_ACCESS: '/warehouses/$warehouseId/access'` added. A sibling `ROUTE_SEGMENTS` const carries the relative segments a child route declares (`'access'`, `'$'`) so the file remains the single owner of every path literal (CH-03)                                                          |
| `router.ts`                                      | Flat five-route tree → root children `[homeRoute, loginRoute, signUpRoute, workspaceRoute, warehouseRoute.addChildren([warehouseDashboardRoute, accessRoute, warehouseCatchAllRoute]), rootCatchAllRoute]` (CH-03, CH-10)                                                                                                                                                   |
| `modules/home/route.tsx` + `page.tsx`            | `/` renders `DesignSystemExample` → `/` runs `requireAuth` then `resolveLandingContext`, carries `RouteErrorState` as its `errorComponent`, and renders the no-context state when no rule matched (CH-06, CR-AC-08, CR-AC-18)                                                                                                                                               |
| `modules/access/route.tsx`                       | Root child at `ROUTES.ACCESS` with its own `requireAuth` → child of `warehouseRoute` at `ROUTE_SEGMENTS.ACCESS`, with **no** `beforeLoad`: the parent already authenticates and resolves entry, and the address deliberately carries no capability gate (CR-AC-21, [adding a web module](../../system/guides/adding-a-web-module.md) §3 "do not add a no-op guard")         |
| `shared/hooks/usePermissions.ts`                 | `useCurrentPermissions` reads `context.effectiveWarehouseId` → reads `useEnteredWarehouse()`. Outside a Warehouse view it yields `permissionIds: []` and skips the projection query, exactly as it does today for a null selection. `hasPermission` and `useHasPermission` are untouched (CH-04)                                                                            |
| `shared/layouts/WarehouseSwitcher.tsx`           | Flat `Select` that mutates and whose three states replace the control → one grouped control that navigates: a Workspace row (inert without administration authority) above a nested group of the actor's Warehouses; the three retained messages render **beside** it; current-row marking comes from the entered context, and no row is marked when none is (CH-01, CH-05) |
| `shared/layouts/Sidebar.tsx`                     | One flat list mixing both levels → context-selected list: Warehouse view = Dashboard + `PermissionGate`d Access, both addressed within the entered Warehouse; Workspace view = the Workspace entry only; no context = no list at all, and no drawer toggle to open an empty one (CH-07, CR-AC-11, CR-AC-12, CR-AC-18)                                                       |
| `shared/layouts/RootLayout.tsx`                  | Brand link and its `requireAnonymous` counterpart keep targeting `ROUTES.HOME`, which now resolves (CH-06). Renders the grouped switcher in the same two places as today. The narrow-viewport drawer toggle renders only when the sidebar has a list to show, so no context can open an empty drawer (CR-AC-18); every other header control is untouched (CR-RG-06)         |
| `store/middleware/api-error.middleware.ts`       | Alerts on every normalized API failure → skips the endpoints on one named silent-failure allowlist, whose only member is `setActiveWarehouse`. Required by CR-AC-09: a failed entry record must raise no error over an otherwise working Warehouse view. Not listed in `change.md` frontmatter — see §11                                                                    |
| `…/warehouses/WarehousesTab.tsx`                 | Passes the actor's own membership ids (from the `GET /workspace/context` read it already performs through `useCurrentWorkspaceContext`) down to the list — the same source the switcher reads, so the two can never disagree (CR-AC-13)                                                                                                                                     |
| `…/warehouses/WarehouseList.tsx`                 | Each row is one `<button>` → a row container holding that selection button plus, for a non-archived Warehouse in the actor's membership list, a trailing **Enter** link to `ROUTES.WAREHOUSE`. Hidden, never disabled, on every other row (CH-08, CR-AC-13, CR-AC-14)                                                                                                       |
| `public/locales/{en,uk}/{common,workspace}.json` | Adds the Workspace row label and its inert explanation, the grouped-switcher group labels, the two refusal states, the no-context state (`common`) and the Enter action (`workspace`); removes nothing. No new namespace (spec.md §6)                                                                                                                                       |
| `apps/web/eslint.config.mjs`                     | Gains the `effectiveWarehouseId` restriction and its three-file allowlist (spec.md §6 "Warehouse-scope coverage")                                                                                                                                                                                                                                                           |

### Added

| Building block                                       | Ownership and responsibility                                                                                                                                                                                                                                                                                                                       |
| ---------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `routes/warehouse.route.tsx`                         | The Warehouse layout route: path, `requireAuth`, `resolveWarehouseEntry`, `WarehouseLayout` as component, `RouteErrorState` as `errorComponent`. Placed beside `__root.route.tsx` because it is application shell, not a feature — see the placement note below                                                                                    |
| `guards/warehouse-entry.guard.ts`                    | `resolveWarehouseEntry(context, warehouseId)` — dispatches `getWorkspaceContext` through the store (no React), and returns `{ status: 'entered' \| 'refused', reason?: 'not-a-member' \| 'archived', warehouseId }`. The `:warehouseId` is **not** shape-validated before the membership lookup (CR-AC-07). This is the documented deviation below |
| `shared/layouts/WarehouseLayout.tsx`                 | The layout route's component: renders `<Outlet />` for an `entered` verdict, `WarehouseEntryRefusal` otherwise, and mounts `useRecordWarehouseEntry` only in the entered branch. Symmetric with `RootLayout` being `__root.route.tsx`'s component                                                                                                  |
| `shared/components/WarehouseEntryRefusal.tsx`        | Both refusals, selected by `reason`: the non-disclosing one (CR-AC-07) and the explicit archived one (CR-AC-17). Renders no Warehouse content, offers the switcher as the way out, and discloses nothing about existence in the `not-a-member` branch                                                                                              |
| `shared/components/RouteErrorState.tsx`              | The application's standard route error state with a retry that re-runs the failed load. Required by CR-AC-08 ("the standard error state with a way to retry ... **not** the no-context state"); no such component exists today, and the router currently falls through to TanStack's built-in default. Two consumers, so it starts in `shared/`    |
| `guards/landing.guard.ts`                            | `resolveLandingContext(context)` — CR-AC-08's three rules in order, throwing at most one redirect and returning normally for rule (3)                                                                                                                                                                                                              |
| `routes/catch-all.route.tsx`                         | The two splat routes (root-level and Warehouse-level), each a three-line `beforeLoad` throwing `redirect({ to: ROUTES.HOME })` (CH-10, CR-AC-16)                                                                                                                                                                                                   |
| `shared/hooks/useEnteredWarehouse.ts`                | The single reader of the entry verdict from the layout match, non-throwing. Returns `string \| undefined`. Consumed by `useCurrentPermissions`, `Sidebar`, `WarehouseSwitcher` and `useRecordWarehouseEntry`                                                                                                                                       |
| `modules/warehouse/{route,page}.tsx`                 | The Warehouse dashboard: the index child of the layout route, rendering `DesignSystemExample` moved unchanged from `modules/home` per spec.md §8's standing default                                                                                                                                                                                |
| `modules/warehouse/hooks/useRecordWarehouseEntry.ts` | CR-AC-09's write: compares the entered Warehouse against `effectiveWarehouseId` and fires `setActiveWarehouse` only when they differ; fire-and-forget, after render, never awaited by any route or gate                                                                                                                                            |
| Grouped-switcher rows                                | Owned by `WarehouseSwitcher` and nested under it only if it grows a second owned component; a single row component stays in the same file per [writing web components](../../system/guides/writing-web-components.md)                                                                                                                              |

**Placement note — `routes/warehouse.route.tsx`.**
[Frontend architecture](../../system/frontend-architecture.md) §"Source structure" describes
`routes/` as "typed root route and application shell" and permits stable platform boundaries to
"start outside a feature". The Warehouse layout route is exactly that: it owns no feature content,
and it is the parent every current and future Warehouse-scoped module attaches to (`access` today;
stock, Locations and movement history next). Putting it in `modules/warehouse/` would make
`modules/access/route.tsx` import from another feature module to name its parent. Its component
lives in `shared/layouts/` beside `RootLayout.tsx`, the same route→layout pairing the root route
already uses.

**Documented deviation — a route function with a third outcome.**
[Frontend architecture](../../system/frontend-architecture.md) §"Guards and paths" and
[system SAD](../../system/sad.md) §"Frontend state and routing" describe a guard as returning
normally or throwing a redirect. `resolveWarehouseEntry` returns an entry verdict instead, because
CR-AC-07 forbids the redirect: a refused actor must remain at the address they requested so the
landing resolver cannot run and enter another context on their behalf. It keeps every other property
the convention exists for — a plain function under `guards/`, no React imports, no component
rendering, reading server state through the store the router already carries. The deviation is scoped
to this one function; `requireAuth`, `requireAnonymous`, `requireWorkspaceCapability` and
`resolveLandingContext` all keep the redirect-or-return shape. Rationale and alternatives are in
[ADR 0001](./adr/0001-warehouse-view-as-a-route-established-context.md); the convention text itself
is not amended by this change request.

**Note on `WarehouseDetailPane.tsx`.** `change.md` CH-08 names it alongside `WarehouseList.tsx`, but
CR-AC-13 attaches the Enter action to _rows_. This design places it on rows only and leaves the
detail pane unchanged. A second Enter affordance in the detail header is a `design-ui` question, not
an architectural one; if it is added there it reads the same membership list and the same criterion.

## 6. Runtime view

Diagram-level detail for these flows is left to `sequences`; the participants below are the building
blocks named in §5.

### 6.1 Landing after sign-in, brand link, or an unmatched address (CR-AC-08, CR-AC-16, CR-AC-18)

1. The actor arrives at `/` — from sign-in, the header brand link, `requireAnonymous`, or a splat
   route's redirect.
2. `homeRoute.beforeLoad` runs `requireAuth` (unchanged: an unauthenticated actor is redirected to
   sign-in with `reason: 'session-ended'`), then `resolveLandingContext`.
3. `resolveLandingContext` dispatches `getWorkspaceContext.initiate(undefined, { subscribe: false })`
   and awaits `unwrap()`. **While that read is unresolved the actor stays at `/` in the router's
   pending state and no rule is evaluated.**
4. Rule (1): `hasWorkspacePermission(workspacePermissionIds, workspaceAdministrationPermissionIds)`
   → `throw redirect({ to: ROUTES.WORKSPACE })`. Because the rule and `requireWorkspaceCapability`
   read the identical set, an actor sent to `/workspace` is never bounced back (CR-RG-05).
5. Rule (2): `effectiveWarehouseId !== null` →
   `throw redirect({ to: ROUTES.WAREHOUSE, params: { warehouseId: effectiveWarehouseId } })`. The web
   adds no membership-picking logic; the server's derivation already applied AC-03b's sole-membership
   rule (CR-RG-04).
6. Rule (3): return normally. `HomePage` renders the no-context state; the shell still renders the
   grouped switcher with its (inert or active) Workspace row, the actor's Warehouses, and the
   retained CR-RG-03 message. `Sidebar` renders no navigation list.
7. If the context read rejects, `beforeLoad` throws and `homeRoute.errorComponent` renders
   `RouteErrorState` with a retry — never the no-context state (CR-AC-08).

### 6.2 Entering a Warehouse by any path (CR-AC-02, CR-AC-05, CR-AC-07, CR-AC-09, CR-AC-14, CR-AC-17)

1. The address `/warehouses/:warehouseId/…` is matched. TanStack ranks it above the root splat, so a
   typed sub-path such as `/warehouses/X/anything` matches the layout route and its `$` child rather
   than the root splat.
2. `warehouseRoute.beforeLoad` runs `requireAuth`, then `resolveWarehouseEntry`, which reads the
   actor's memberships from the cached Workspace context.
3. Verdict `refused: not-a-member` — the id names no membership of theirs, whatever the reason and
   whatever its shape (it is never validated first). `WarehouseLayout` renders the non-disclosing
   refusal at the requested address. No redirect, no landing resolution, no stored-selection write,
   no sidebar, no `getCurrentAccess` request (CR-AC-07).
4. Verdict `refused: archived` — a membership exists but the Warehouse is archived. The same shell
   renders the explicit archived explanation instead (CR-AC-17).
5. Verdict `entered` — the child route renders: the dashboard for the index path, the access surface
   for `access`, and for the splat a redirect to `/`, which only a member can ever reach (CR-AC-16's
   second paragraph).
6. `useEnteredWarehouse()` now returns the id everywhere. `useCurrentPermissions` requests
   `GET /api/v1/warehouses/:id/access/current` for **that** Warehouse; `Sidebar` renders the
   Warehouse list with Access gated by the same `ROLES_WATCH ∪ USERS_WATCH` `PermissionGate`;
   `WarehouseSwitcher` marks that row current.
7. `useRecordWarehouseEntry` compares the entered id with `effectiveWarehouseId` and, only when they
   differ, dispatches `setActiveWarehouse`. It is not awaited by any route, guard or gate; on failure
   nothing is retried, no alert is raised (the middleware's silent-failure allowlist), the actor
   stays in the Warehouse with exactly their membership's capabilities, and only their next landing
   is affected (CR-AC-09).
8. A second browser tab repeats steps 1–7 independently for its own address; neither tab re-points
   the other, because nothing shared decides which Warehouse a tab shows (CR-AC-05).

### 6.3 Moving between contexts through the switcher (CR-AC-01, CR-AC-03, CR-AC-19)

1. `WarehouseSwitcher` reads the Workspace context once (RTK Query cache; the shell already holds
   this query) and renders the grouped control: one Workspace row, then the actor's Warehouses.
2. The Workspace row is a destination when `hasWorkspacePermission(…, workspaceAdministrationPermissionIds)`
   holds, and otherwise renders inert — not a link, not activatable by pointer or keyboard, conveyed
   as disabled to assistive technology, carrying a short explanation and nothing beyond the Workspace
   name (CR-AC-03). Archived Warehouse rows stay listed, dimmed, labelled and not selectable exactly
   as today (CR-RG-02).
3. Current-row marking comes from `useEnteredWarehouse()` and the `/workspace` match — not from
   `effectiveWarehouseId`. At the root and around a refusal, no row is marked (CR-AC-01).
4. Choosing a Warehouse row navigates to `ROUTES.WAREHOUSE`; choosing the Workspace row navigates to
   `ROUTES.WORKSPACE`. No credential is requested at any point (CR-AC-02).
5. Moving W1 → W2 changes the layout match's parameter, so `useEnteredWarehouse()` returns W2 and
   `getCurrentAccess` is keyed on W2. While W2's projection is unresolved, `permissionIds` is `[]`
   and the Access entry is simply absent, then appears — the shipped falsy/loading behavior,
   inherited verbatim, with no skeleton and no W1 value held over (CR-AC-19).

### 6.4 Entering from the Workspace warehouses tab (CR-AC-13, CR-AC-14)

1. `WarehousesTab` already reads both the Workspace's Warehouse list (`WAREHOUSES:WATCH`) and the
   Workspace context. It passes the actor's own membership ids to `WarehouseList` — one prop, one hop.
2. `WarehouseList` renders an Enter link on a row only when that Warehouse is in the membership list
   **and** is not archived. Every other row renders no Enter control at all. Administration actions
   on every row are untouched.
3. Activating Enter navigates to that Warehouse view, which runs §6.2 from step 1 — so entry from the
   tab records the selection and is refused, if it must be, by the same one resolver.

### 6.5 Losing authority while inside a Warehouse (CR-AC-20)

1. The actor is inside W. W is archived, or their membership is withdrawn.
2. Nothing re-runs the entry verdict: it lives in the layout match, and an RTK Query refetch does not
   invalidate the router. The actor is not evicted and the address keeps naming W.
3. Each subsequent act is decided when it is authorized: after archiving, the server's
   archived-tolerant reads still serve W's retained records and the surface marks them archived;
   after withdrawal, every request is refused without disclosing W's contents.
4. On the next Workspace-context read the switcher reflects the change — W's row disappears or turns
   archived, `effectiveWarehouseId` stops naming it, and the retained CR-RG-03 message explains it.

## 7. Data and interface impact

- **API and contracts:** none. No endpoint, request/response shape, status code, cache tag or
  `packages/contracts` schema changes. `GET /workspace/context` and
  `GET /api/v1/warehouses/:id/access/current` are consumed exactly as today; `warehousePath` is
  untouched.
- **Persisted data:** none. No migration; `users.active_warehouse_id`, `PUT /workspace/active-warehouse`
  and the server's derivation of `effectiveWarehouseId` are all retained. What narrows is the web's
  use of the value (CH-05). Every stored row stays valid under the narrowed meaning.
- **Client state shape:** no new Redux slice, no `RootState` field, no React context. The entered
  Warehouse lives in the URL and is published through the router's own match context.
- **Route surface (breaking):** `/access` and `/` as a dashboard stop resolving; `/warehouses/:id`
  and `/warehouses/:id/access` appear; `/workspace`, `/login`, `/sign-up` are unchanged. Every
  unmatched address now redirects to `/`. No shim (`change.md` §5).
- **Query keys:** `getCurrentAccess` is already keyed per Warehouse, so two tabs in two Warehouses
  hold two independent cache entries with no change to the endpoint. This is what makes CR-AC-05 free.
- **Error-alert surface:** one endpoint (`setActiveWarehouse`) stops raising the shared normalized
  failure alert. Every other failure path in the app is unchanged
  ([web error handling](../../system/guides/web-error-handling.md)).
- **Locale resources:** additive keys in `common` and `workspace`, `en`/`uk` parity, no new namespace
  and no key removals.

## 8. Cross-cutting concerns

### Security and privacy

- `:warehouseId` becomes user-controlled input into every web-side Warehouse read. It is refused by
  membership, in one place, before any child route renders — and deliberately **not** shape-validated
  first, so a malformed guess is indistinguishable from a valid non-member id (CR-AC-07, spec.md §6.1
  "Warehouse enumeration by address").
- A refusal never falls back: not to another membership, not to the stored selection, not to the
  landing resolver. Structurally guaranteed by refusing in place rather than redirecting.
- The archived refusal is deliberately distinguishable and is named to every member of W, because the
  switcher already lists W to those same members and labels it archived; it names the archived state
  and nothing else (CR-AC-17).
- Client-side visibility stays advisory. Server authorization is untouched, and every Warehouse-scoped
  request still names its Warehouse explicitly through `warehousePath` (CR-RG-01, `workspaces`
  [ADR 0001](../../features/workspaces/adr/0001-two-level-request-authorization.md)).
- The inert Workspace row discloses only the Workspace's existence and name — already returned to
  every member by `GET /workspace/context` — and no count, capability or membership (CR-AC-03).
- The stored selection is never read by any gate, guard or predicate after this change; the ESLint
  allowlist is what keeps that true over time.

### Accessibility

- The grouped switcher exposes a real group structure (the Workspace row above a labelled Warehouse
  group), not visual indentation alone; the current row is marked by something other than colour
  (CR-AC-01).
- The inert Workspace row is conveyed as disabled to assistive technology and is not reachable as a
  link or activatable by keyboard, while remaining discoverable with its explanation (CR-AC-03).
- Refusals and the no-context state render as page-level content with a heading and a way forward
  (the switcher), inside the existing shell landmarks.
- With no navigation list, the sidebar renders no empty `<nav>` and the header renders no drawer
  toggle that would open an empty drawer (CR-AC-18). The drawer's existing focus trap and
  focus-return behavior is otherwise unchanged (CR-RG-06).

### Responsive layout

The grouped switcher, its Workspace row and its nested group must fit the existing narrow-viewport
context bar at 390px without horizontal overflow, and its popover must not overflow the viewport
(spec.md §6). The 240px persistent sidebar at/above `sm`, the off-canvas drawer below `sm`, and the
header control set are otherwise unchanged.

### Internationalization

Every new string — Workspace row label and inert explanation, group labels, both refusals, the
no-context state, the Enter action — is added to `common`/`workspace` in both `en` and `uk` with
matching key shape, per the [localization guide](../../system/guides/adding-and-maintaining-web-localization.md).
No namespace is added to `i18n.ts`.

### Performance

Landing adds no blocking read beyond the `getWorkspaceContext` the shell already performs — the guard
dispatches the same endpoint and hits the same RTK Query cache. Entry resolution reads that same
cached context, so entering a Warehouse costs one navigation plus the `getCurrentAccess` request the
surface already made. The CR-AC-09 write is issued after render and blocks nothing (spec.md §6).

### Observability

No telemetry is added, per repository policy. Verification is the test suites plus manual runs
(spec.md §6, §7).

## 9. ADR index

| ADR                                                                                                                 | Status   | Scope                                                                                                                            |
| ------------------------------------------------------------------------------------------------------------------- | -------- | -------------------------------------------------------------------------------------------------------------------------------- |
| [0001 — Warehouse view as a route-established context](./adr/0001-warehouse-view-as-a-route-established-context.md) | Accepted | Where the entered Warehouse is decided, how it is published to the shell and every descendant, and how entry is refused in place |

One decision passes the blast-radius gate: it is costly to reverse once stock, Locations and movement
history attach to it (which is the change request's own motivation); it spans the shell, `guards/`,
`shared/hooks/`, and the `access`, `home`, `warehouse` and `workspace` modules; and at least two
legitimate options survive the inherited constraints (per-hook route-parameter reads versus a layout
route that resolves entry once). Everything else in this design is dictated by an existing rule and
is recorded inline: manual route registration, path constants, guard placement, the no-new-slice
conclusion, RTK Query reuse, HeroUI as the only visual system, and localization placement.

## 10. Verification strategy

| Level               | Required evidence                                                                                                                                                                                                                                                                                                 |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Guard unit          | `resolveWarehouseEntry` returns `entered` / `not-a-member` / `archived` for each case, including a malformed id and a foreign-Workspace id, and never throws a redirect (CR-AC-07, CR-AC-17)                                                                                                                      |
| Guard unit          | `resolveLandingContext` evaluates the three rules in order; rule (1) fires for an actor holding any one of the four administration Permissions; rule (2) consumes the derivation unchanged; several memberships with no stored selection reaches rule (3) (CR-AC-08, CR-RG-04)                                    |
| Route integration   | Through `createAppRouter({ appStore, initialEntries })`: `/` resolves to `/workspace`, to a Warehouse view, or renders the no-context state; a failed context read renders `RouteErrorState`, not the no-context state; no actor is redirected twice between `/` and `/workspace` (CR-AC-08, CR-RG-05)            |
| Route integration   | A non-member address renders the non-disclosing refusal **at that address**, writes nothing, requests no access projection, and renders no sidebar; an address beneath it behaves identically; an archived membership address renders the archived refusal (CR-AC-07, CR-AC-16, CR-AC-17)                         |
| Route integration   | Unmatched addresses — including `/access` — land at `/` and resolve; an unauthenticated actor reaches sign-in (CR-AC-16)                                                                                                                                                                                          |
| Hook unit           | `useEnteredWarehouse` returns the id only for an `entered` verdict; `useCurrentPermissions` yields `[]` and issues no projection request outside a Warehouse view, and requests the addressed Warehouse inside one (CR-AC-06, CH-04)                                                                              |
| Hook unit           | `useRecordWarehouseEntry` writes only when the entered Warehouse differs from `effectiveWarehouseId`, writes nothing on refresh or re-entry, and on failure leaves the view working with no alert (CR-AC-09)                                                                                                      |
| Component unit      | `WarehouseSwitcher`: grouped structure; inert Workspace row for an actor without administration authority; archived rows dimmed and unselectable; the three retained messages render beside the control; correct current-row marking, and none when no context is entered (CR-AC-01–CR-AC-04, CR-RG-02, CR-RG-03) |
| Component unit      | `Sidebar`: Warehouse list addressed within the entered Warehouse with the unchanged `ROLES_WATCH ∪ USERS_WATCH` predicate including its unresolved window; Workspace list; no list and no drawer toggle with no context (CR-AC-11, CR-AC-12, CR-AC-18, CR-AC-19)                                                  |
| Component unit      | `WarehouseList`: Enter renders only for a non-archived Warehouse in the actor's membership list, hidden otherwise, with administration actions unchanged (CR-AC-13, CR-AC-14)                                                                                                                                     |
| Regression          | The access surface behaves identically at its new address, including a member without `ROLES:WATCH`/`USERS:WATCH` reaching it and finding it unpopulated rather than being refused or redirected (CR-AC-21); `/workspace`'s guard behavior is unchanged (CR-RG-05); chrome is unchanged (CR-RG-06)                |
| Architecture check  | ESLint fails on any `effectiveWarehouseId` reference in non-test `apps/web/src` sources outside the three allowlisted files (spec.md §6, §7)                                                                                                                                                                      |
| Localization        | `en`/`uk` key-set parity across all namespaces after the additions                                                                                                                                                                                                                                                |
| Manual / responsive | 390px switcher fit and popover containment; five consecutive runs of switcher-row/Enter → rendered Warehouse view with its projection resolved, each ≤ 250 ms (spec.md §6)                                                                                                                                        |

Every check traces to a `CR-AC-*`/`CR-RG-*` during `plan-tests`. Existing web tests that render an
authenticated route through `createAppRouter({ initialEntries })` need their paths updated; the
`WarehouseSwitcher`, `Sidebar` and `RootLayout` suites are rewritten for the grouped control and the
context-specific lists. Run the standard gate after focused suites:
`pnpm --filter @warehouser/web lint`, `… test`, `… build`.

## 11. Risks and open questions

| Risk or question                                                                                                                                                                                                                                                                | Treatment / owner                                                                                                                                                                                                                                                                   |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Two sources outside `change.md`'s affected list must change.** `store/middleware/api-error.middleware.ts` needs the silent-failure allowlist for CR-AC-09, and no standard route error state exists for CR-AC-08 — the router has no `errorComponent` anywhere today.         | Both are recorded in §5 and §3. Add both files to `change.md` frontmatter at the next edit of that document. Tech Lead.                                                                                                                                                             |
| The design depends on three TanStack Router v1 behaviors: a parent `beforeLoad`'s return value reaching the match context, that `beforeLoad` not re-running while navigating between the layout's children, and a `$` splat child ranking below the layout's explicit children. | Pin each with a route-integration test before building on it — `tasks` should sequence the route-shape task first for exactly this reason (`change.md` §6 step 5). If the non-throwing match read differs in the installed version, the verdict shape is unaffected. Frontend Lead. |
| CR-AC-20 (no eviction) and CR-AC-17 (archived address refused) are satisfied only because the verdict is computed at entry and not recomputed from the cache. A later refactor that turns `useEnteredWarehouse` into a cache-derived hook would silently break CR-AC-20.        | ADR 0001 records this as the load-bearing consequence; cover it with a test that refetches the Workspace context while inside a Warehouse and asserts the actor stays. Frontend Lead.                                                                                               |
| The switcher's three retained messages are driven by `effectiveWarehouseId === null`; after this change an actor can be inside W while that value is null (a failed entry write), which would show "nothing chosen" beside a row marked current.                                | Render the retained messages only when no Warehouse context is entered, keeping their existing copy and intent (CR-RG-03, CR-AC-18). Confirm the wording still reads correctly in that placement during `design-ui`. Product Owner + Frontend Lead.                                 |
| `WarehouseList` rows are `<button>` elements today; an Enter link cannot nest inside one, so the row must be restructured into a container holding both controls.                                                                                                               | Draw the restructured row explicitly in `design-ui`, including its focus order and its 390px behavior, before implementation. Frontend Lead.                                                                                                                                        |
| The `design-ui` gate has not run for this work item; `docs/features/workspaces/design-handoff.md` still declares the flat switcher and the mixed sidebar approved.                                                                                                              | Run `design-ui` next (`change.md` §6 step 3) and treat that handoff as non-current for these surfaces until ship-time reconciliation. Do not start implementation on the switcher, sidebars, refusals or no-context state before approval. Product Owner.                           |
| Every authenticated bookmark breaks in one release, with no shim by decision (`change.md` §5).                                                                                                                                                                                  | CR-AC-16's not-found handling is the whole mitigation; spec.md §7 sets the ≤5 support-report target for the first 30 days. Product Owner.                                                                                                                                           |
| Open — does the Warehouse dashboard keep `DesignSystemExample`? Default: yes, moved unchanged.                                                                                                                                                                                  | Design proceeds on the default; due at `design-ui`. Product Owner (spec.md §8).                                                                                                                                                                                                     |
| Open — `workspaces` AC-12a grants an archived read that no surface exposes, and three canonical statements contradict it in wording.                                                                                                                                            | Out of scope here (this change adds no Warehouse-level capability); carried unchanged from spec.md §8, due before the next `workspaces`-owning change ships. Product Owner.                                                                                                         |
