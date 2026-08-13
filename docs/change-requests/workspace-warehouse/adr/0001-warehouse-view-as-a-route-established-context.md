---
status: Accepted
owner: 'Tech Lead'
reviewers: ['Frontend Lead', 'Security Lead']
updated_at: '2026-08-13'
feature_size: 'L'
ticket: ''
---

# 0001 — Warehouse view as a route-established context

## Context

`apps/web` resolves the Warehouse every Warehouse-scoped screen operates on from stored state:
`shared/hooks/usePermissions.ts` reads `context.effectiveWarehouseId` and hands it to
`useGetCurrentAccessQuery`, and every access hook downstream takes its `warehouseId` from the
resulting projection. Nothing in a URL names a Warehouse.

[`change.md`](../change.md) CH-03 and CH-04 replace that with `/warehouses/:warehouseId/…`, and
[`spec.md`](../spec.md) constrains the replacement from four directions at once:

- **CR-AC-06** — the address, not stored state, determines the Warehouse; changing the stored
  selection changes nothing about what an open address shows.
- **CR-AC-07** — a `:warehouseId` the actor holds no membership in is refused **in place**: they stay
  at the address they requested, the landing resolver does not run, nothing falls back to another
  membership, the value is not shape-validated before the membership check, and an address _beneath_
  such a Warehouse is refused identically rather than reaching not-found handling. A refusal is not a
  Warehouse view: the Warehouse sidebar is never rendered around one.
- **CR-AC-17** — an archived Warehouse the actor _is_ a member of is refused with an explicit
  archived explanation instead.
- **CR-AC-20** — if W is archived, or the membership withdrawn, **while the actor is inside W**,
  nothing evicts them; the address keeps naming W and each act is decided when it is authorized.

CR-AC-17 and CR-AC-20 are in tension unless the entry decision has a defined moment. The mechanism
must also survive: `access` is the only Warehouse-scoped surface today, but stock, Locations and
movement history attach to whatever this decision establishes — which is the change request's stated
reason for doing this now rather than later.

Inherited constraints ([frontend architecture](../../../system/frontend-architecture.md)): routes are
registered manually in `router.ts`; all paths live in `shared/constants/routes.ts`; access control
lives in plain React-free functions under `guards/`; Redux Toolkit is the only cross-module state
owner and a slice is admitted only for state used across modules or needed globally across routes;
RTK Query owns server state and guards dispatch the same endpoints through the store.

## Decision drivers

- The Warehouse under authorization must be unambiguous and un-derivable from ambient state
  (CR-AC-06, spec.md §6 "Warehouse-scope coverage": zero `effectiveWarehouseId` references outside
  three allowlisted call sites).
- A refusal must not redirect, must not disclose, and must not hand the actor to the landing resolver
  (CR-AC-07).
- Entry must be decided once, at entry, so that a later authority change does not evict a working
  actor (CR-AC-20) while an arrival at an archived address is still refused (CR-AC-17).
- The shell (switcher, sidebar) and every Warehouse-scoped hook must agree on which Warehouse is
  entered, and must agree that a refusal is _not_ an entered context.
- Existing consumers should not each take a new argument; `change.md` §6 step 2 names this
  explicitly as a question for design.
- No new state owner: the URL already carries the value, and duplicating it into Redux would
  recreate the very problem being removed.

## Considered options

1. **Each Warehouse-scoped hook reads the route parameter directly.** `useCurrentPermissions` calls
   `useParams({ strict: false })` and uses `params.warehouseId`; every consumer keeps its signature.
2. **A Redux slice holds the entered Warehouse**, written by a route effect and read by every
   consumer through a selector.
3. **A layout route at `/warehouses/$warehouseId` resolves entry once in `beforeLoad` and publishes
   the verdict through the router's match context.** One shared hook reads that verdict; children
   render only under it; refusal is a render of the layout component, not a redirect.

## Decision outcome

Chosen: **option 3 — a layout route that resolves entry and publishes the verdict**.

- `routes/warehouse.route.tsx` declares the layout route (path `ROUTES.WAREHOUSE`, no page of its
  own). Its `beforeLoad` runs `requireAuth`, then `resolveWarehouseEntry` from
  `guards/warehouse-entry.guard.ts`, and returns the verdict into the match context:
  `{ status: 'entered' | 'refused', reason?: 'not-a-member' | 'archived', warehouseId }`.
- `resolveWarehouseEntry` reads the actor's memberships by dispatching `getWorkspaceContext` through
  the store — the `guards/workspace.guard.ts` pattern — and performs **no shape validation** of
  `warehouseId` ahead of the membership lookup.
- `shared/layouts/WarehouseLayout.tsx` is the layout's component: `<Outlet />` for `entered`, the
  matching `WarehouseEntryRefusal` otherwise.
- `shared/hooks/useEnteredWarehouse.ts` is the single reader of the verdict from that match, read
  non-throwing so it also answers outside the Warehouse branch. It returns the Warehouse id only for
  `entered`, and `undefined` at the root, in the Workspace view, and around a refusal.
- `useCurrentPermissions` swaps its `effectiveWarehouseId` read for that hook. Every downstream
  consumer — `useAccessCapabilities`, the access dataset hooks, `PermissionGate`, the access page —
  is unchanged, including its `warehouseId`, because they already read it from the projection.
- Children of the layout: the Warehouse dashboard index route, the relocated `accessRoute` (which
  drops its now-redundant `requireAuth`), and a `$` splat whose `beforeLoad` redirects to `/`.

The splat child is part of the decision, not a detail: it makes `/warehouses/X/anything` _match_ the
layout route, so the entry check runs before any not-found handling. That is what makes CR-AC-07's
precedence over CR-AC-16 structural.

Rejected — **option 1**: it satisfies CR-AC-06 but leaves membership refusal without an owner. Each
consumer would have to refuse independently, or the check would sit in a component that the shell
cannot see; the sidebar would then have to re-derive "is this a real Warehouse view" from the
pathname and would render Warehouse entries around a refusal. Recomputing the verdict from the cache
on every render also breaks CR-AC-20: a refetch after archiving would flip the derived value and
evict an actor the specification says must not be moved.

Rejected — **option 2**: it adds a second source of truth for a value the URL already carries — the
exact failure mode CH-04 removes — and it fails the system's slice-admission rule
([frontend architecture](../../../system/frontend-architecture.md) §"Redux Toolkit infrastructure").
Two tabs sharing one store would also share one entered Warehouse, contradicting CR-AC-05.

### Accepted deviation

`resolveWarehouseEntry` returns a verdict where
[frontend architecture](../../../system/frontend-architecture.md) §"Guards and paths" (and
[system SAD](../../../system/sad.md) §"Frontend state and routing") describes a guard as returning
normally or throwing a redirect. CR-AC-07 forbids the redirect. The function keeps every other
property of the convention — a plain function under `guards/`, no React imports, no rendering, server
state read through the store the router already carries — and the deviation is scoped to it alone:
`requireAuth`, `requireAnonymous`, `requireWorkspaceCapability` and `resolveLandingContext` all keep
the redirect-or-return shape. The convention text in `docs/system` is not amended by this change
request.

## Consequences

### Positive

- One place decides entry, so CR-AC-07's "same refusal for all four cases", CR-AC-17's archived
  refusal and the no-fallback rule are enforced once rather than per surface.
- CR-AC-20 falls out of _where_ the check runs: `beforeLoad` does not re-run because an RTK Query
  cache entry was refetched, so no actor is evicted from a Warehouse they are working in.
- Every future Warehouse-scoped module attaches as a child route and inherits entry, permissions and
  the correct sidebar for free — the migration cost `change.md` §2 exists to avoid.
- Consumer churn is confined to `useCurrentPermissions`; no access hook, gate or component changes
  signature.
- Two tabs are independent for free: the value lives in each tab's URL, and `getCurrentAccess` is
  already keyed per Warehouse (CR-AC-05).
- The shell and the permission hook read the _same_ verdict, so a refusal can never render a
  Warehouse sidebar and no row can be marked current for a context that was refused.

### Negative

- The design depends on three TanStack Router behaviors that must be pinned by tests before anything
  is built on them: a parent `beforeLoad`'s return value reaching the match context, that
  `beforeLoad` not re-running while navigating between the layout's own children, and the `$` splat
  ranking below the layout's explicit children.
- It introduces a second file under `routes/`, extending that directory's documented role from "the
  typed root route and application shell" to "the shell's route boundaries", and a route function
  with a third outcome (above).
- Entry is decided from data read at entry time. An actor who was a member a second ago is admitted
  and then refused per-request by the server — correct per CR-AC-20, but it means client-side entry
  is not, and must never be presented as, an authorization boundary.
- The route tree gains depth: four route files where one existed for the access surface.

### Neutral

- The route parameter is untyped and unvalidated by design; the membership lookup is the only filter
  (CR-AC-07). Adding a shape validator later would be a specification change, not a refactor.
- The stored selection survives untouched at the data and contract level; only its web-side meaning
  narrows to CR-AC-08 rule (2).

## Links

- [`sad.md`](../sad.md) §§4–6 — the design this decision anchors
- [`change.md`](../change.md) CH-03, CH-04, CH-08, CH-10 — the old-to-new trace
- [`spec.md`](../spec.md) CR-AC-05, CR-AC-06, CR-AC-07, CR-AC-16, CR-AC-17, CR-AC-19, CR-AC-20, CR-AC-21
- [Frontend architecture](../../../system/frontend-architecture.md) — routing, guards, path
  constants, slice admission
- [RTK Query for web API calls](../../../system/adr/02-08-2026-rtk-query-for-web-api-calls.md)
- [`workspaces` ADR 0001 — two-level request authorization](../../../features/workspaces/adr/0001-two-level-request-authorization.md)
  — the server-side boundary this decision mirrors on the web
