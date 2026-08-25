# Adding a Web Module

Use this guide for a new route-owned feature in `apps/web`. Read
[Frontend architecture](../frontend-architecture.md) first. UI-changing work also requires the
approved Pencil handoff described in the root README.

## 1. Choose the owner

Name the module for the domain entity that owns the behavior — `inventory`, `warehouse`, `access`.
Ownership follows the entity whose invariants the code enforces, not the entity that contains it and
not the screen or URL that consumes it.

Extend an existing owner instead of adding a second module for the same entity. A capability
exercised at several scopes lives in one module and carries the views for every scope; the scope
appears in file and component names (`WorkspaceRolesTab`, `WarehouseRolesTab`), never in a second
module.

**One carve-out, and it is narrow.** Where a slice's **sole** consumer exercises the slice's
capabilities at a different scope than the entity whose invariants the slice enforces, placement
follows the scope of exercise instead. Enumerate the slice, count the importers outside it, then
read the **scope of the entity whose invariants the slice enforces** — not the location of the
consumer. The glossary states that scope for you: a Warehouse is the operational boundary, so a
slice enforcing Warehouse invariants is Warehouse-scoped; a Workspace Role is "a named,
Workspace-scoped aggregation", and Workspace membership is Workspace-scoped on the same terms. Two
importers, or the two scopes agreeing, and the rule above applies unchanged.

The worked pair: the Warehouses tab enforces a Warehouse's invariants (Warehouse-scoped) while being
exercised at the Workspace scope, so it moved to `modules/workspace`; the access tabs enforce
Workspace Role and Workspace membership invariants (Workspace-scoped) and are exercised at that same
Workspace scope, so they stay in `modules/access` — even though both are sole-consumer slices of the
same shell. Do not reach for this because a slice currently has one consumer and the arrangement
would read better, and do not reach for it because the consumer sits in another module — run the
scan, then compare the two scopes.

Modules are flat. The module list is exactly the directories directly under `modules/`; only those
have a name and a public surface. A module may organize material for _its own entity_ into
sub-directories — `modules/auth/` holds `login/`, `sign-up/` and `sign-out/` sub-trees and is still
one module — but a second domain entity never acquires a home inside another module's tree. A module
that seems to need a submodule is a module that should be promoted to its own top-level sibling.

What makes a directory a **home** is module identity, not its name: an entry in the module list, an
entry in the surface declaration, and its own `route.tsx`/`page.tsx`. A directory named for an
entity but holding none of those is a **component grouping**, which
[Placing web components](placing-web-components.md) § "Grouping owned components by domain"
prescribes — `modules/access/components/workspace-administration/members/` is one, and a directory
named for another entity is one on identical terms. So read the directory's identity, not the
entity its name mentions.

The decision behind these rules, and its consequences, are recorded in
[Scope-of-exercise tiebreak for sole-consumer slices](../adr/18-08-2026-scope-of-exercise-placement-tiebreak.md),
which narrows and supersedes
[Domain-owned flat modules](../adr/14-08-2026-domain-owned-flat-modules.md). Read the first before
adding a module or deciding which module a file belongs to; read the second for the reasoning it
preserves.

## 2. Import other modules through their declared surface

A module may import another module only through that module's **declared public surface** — an
enumerated per-module export list, not whatever its directory tree happens to contain. Page-level
views (a page, a route component, a tab) are the usual entries. An undeclared hook, API slice,
schema, type or sub-component is not reachable from another module, and adding a consumer is not by
itself a reason to declare it.

The composition layer — `router.ts`, `store/index.ts`, `guards/`, `shared/layouts/` and `test/`
fixtures — is bound by the same rule. It differs in **reach**, not in **exemption**: it may address
any module's surface where a module may reach only a sibling's, but it may not reach past a surface
into a module's internals.

## 3. Declare the path

Add the path to `apps/web/src/shared/constants/routes.ts`:

```ts
export const ROUTES = {
  HOME: '/',
  LOGIN: '/login',
  INVENTORY: '/inventory',
} as const;
```

Do not repeat `/inventory` in routes, links, guards, or navigation calls.

## 4. Create the feature slice

```text
modules/inventory/
├── route.tsx
├── page.tsx
├── components/
├── alerts/      # only for inventory-specific feedback
├── hooks/       # only if needed; queries/ mutations/ forms/ projections/ effects/
├── loaders/     # only when the route awaits data; plain route data functions
├── utils/       # only for pure helpers the module owns; never hooks
├── schemas/     # only for browser-local validation
├── api/         # only when the feature calls the server
└── store/       # only when the feature owns RTK state
    ├── inventory.actions.ts
    ├── inventory.slice.ts
    └── inventory.selectors.ts
```

Do not create empty optional directories. Inside `hooks/`, file each hook by what it does rather
than by which screen calls it — see [Placing web hooks](placing-web-hooks.md).

## 5. Define a lazy route

```ts
import { createRoute, lazyRouteComponent } from '@tanstack/react-router';

import { requireAuth } from 'guards/auth.guard';
import { rootRoute } from 'routes/__root.route';
import { ROUTES } from 'shared/constants/routes';

export const inventoryRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: ROUTES.INVENTORY,
  component: lazyRouteComponent(() => import('./page'), 'InventoryPage'),
  beforeLoad: ({ context }) => requireAuth(context),
});
```

Use `requireAuth` for authenticated routes, `requireAnonymous` for guest-only routes, and omit
`beforeLoad` for public routes. Do not add a no-op guard.

### When the route declares a loader

**Declare a `loader` when the destination paints server data.** First-paint readiness belongs to the
route ([Frontend architecture](../frontend-architecture.md) §Page), so the route awaits every
dataset the destination shows — including the datasets of panels the actor's Permissions admit —
and the page mounts with them present. A destination that paints no server data declares no loader;
do not add an empty one, for the same reason you do not add a no-op guard. Declare
`pendingComponent` and `errorComponent` alongside it, so the awaited window and a failed primary
read both paint.

**The loader function goes in `modules/<module>/loaders/`**, named for the destination it fills
(`workspace-administration.loader.ts`), with its spec beside it. `route.tsx` imports it and wires it
to the `loader:` option and holds no dispatch of its own — §5's file is routing concerns only:

```ts
import { loadInventory } from 'modules/inventory/loaders/inventory.loader';

export const inventoryRoute = createRoute({
  // …
  loader: loadInventory,
  errorComponent: RouteErrorState,
  pendingComponent: RoutePendingState,
});
```

The module that owns the datasets owns the loader. Where a destination is composed from more than
one module, the composing module's loader calls a **contribution function the other module exports
on its declared public surface** (§2) and never reaches past it. A loader dispatches; it does not
decide access — a redirect or an entry verdict stays in `guards/` and a loader reads the verdict the
guard already published. A loader imports no page and no component: it is reachable from the router
chunk, so an import of the page would defeat the lazy `import('./page')` above. See
[Module-owned route loaders](../../change-requests/global-loader/adr/0001-module-owned-route-loaders.md).

## 6. Add the page and components

Keep the page focused on composition and cross-component workflow:

```tsx
import { InventoryList } from 'modules/inventory/components/InventoryList';

import type { ReactElement } from 'react';

export const InventoryPage = (): ReactElement => <InventoryList />;
```

Place rendering and local interaction in `components/`. Keep logic in the module until a second
module needs it.

Place action-specific alert adapters in `modules/<module>/alerts/` and colocate their tests there.
Do not put a feature alert in `shared/alerts/` merely because it wraps the shared toast library.
Reserve `shared/alerts/` for generic alert behavior used across feature modules.

For a form, the component normally owns React Hook Form registration and browser validation and
accepts an `onSubmit` callback. The page owns the server call, follow-up RTK action, navigation, and
server-error mapping.

## 7. Choose schema ownership

If the value is a server request or response, add its Zod schema to `packages/contracts` and follow
[Adding and using contracts](adding-and-using-contracts.md). Import it from a module subpath.

If it validates browser-only state, put it in `modules/<module>/schemas`. Do not duplicate a shared
contract in the web app.

## 8. Use Redux Toolkit deliberately

Use local component state for local interaction. Add RTK state only when it is shared across
modules or must survive navigation.

When RTK is appropriate:

1. Declare case-reducer functions in `<module>.actions.ts` and export the keyed object passed to
   `createSlice({ reducers })`. Type payload-bearing functions with `PayloadAction`.
2. Define state types, initial state, and `createSlice` in `<module>.slice.ts`. Export the generated
   action creators and `<module>Reducer` from this file.
3. Define named `RootState` selectors in `<module>.selectors.ts`.
4. Import and register `<module>Reducer` from the slice file in `store/index.ts`, which remains the
   application composition root. Do not create a separate `<module>.reducer.ts` export wrapper.
5. Import generated action creators from the slice and use them with `useAppDispatch` in React
   workflows.
6. Import selectors from the selectors file and use them with `useAppSelector` or
   `context.store.getState()` in route guards.
7. Colocate store tests under `modules/<module>/store/` and use a fresh `makeStore()` in integration
   tests.

The resulting dependency flow is:

```text
store/index.ts ──imports reducer from──▶ <module>.slice.ts
<module>.slice.ts ──imports case reducers from──▶ <module>.actions.ts
<module>.selectors.ts ──type-imports──▶ RootState
feature consumers ──dispatch──▶ generated actions from <module>.slice.ts
feature consumers ──read──▶ selectors from <module>.selectors.ts
```

Do not create a React context mirroring RTK state. Do not put ordinary server resource responses in
a global slice without a demonstrated cross-module cache or coordination requirement. Do not put a
feature slice in root `store/` merely because several modules consume it: consumption breadth makes
the state application-visible, but the feature that defines its meaning still owns it. Root
`store/` contains only composition, typed hooks, and generic middleware.

## 9. Register the route

Import the route in `src/router.ts` and add it to the root children:

```ts
const routeTree = rootRoute.addChildren([
  homeRoute,
  loginRoute,
  inventoryRoute,
]);
```

The production router and test routers are created from the same route tree. Router tests use
`createAppRouter({ appStore, initialEntries })` with a fresh store.

## 10. Add tests

Before adding visible copy, create or extend the module-named translation namespace under
`apps/web/public/locales/<language>/` for every supported language. Keep stable keys in
logic and translate them at the presentation boundary. Follow
[Adding and maintaining web localization](adding-and-maintaining-web-localization.md); do not
hardcode user-visible strings or move module-specific copy into `common`.

Colocate tests with the code they cover. At minimum, cover:

- client validation and valid form output;
- the empty, error, and success UI required by the feature, and — where the route declares a
  loader — that the destination paints only once the loader has settled;
- submit/API/RTK/navigation orchestration;
- authenticated, anonymous, or public route behavior;
- accessible names, labels, and keyboard interaction.

Prefer semantic queries. Use test IDs only where semantic queries cannot identify the element.

## 11. Verify

From the repository root:

```sh
pnpm --filter @warehouser/web lint
pnpm --filter @warehouser/web test
pnpm --filter @warehouser/web build
```

For a contract change, build `@warehouser/contracts` before verifying the web app. For a visible UI
change, also complete the viewport/state comparison required by the approved design handoff.

## Common failures

- Placing an entity's code in the module of the entity that contains it, on containment alone —
  without running the sole-consumer scan §1 requires. Containment is not a placement argument; a
  slice with two consumers stays with its owning entity however neatly it nests under another.
- Creating a nested submodule inside another module instead of a flat top-level sibling.
- Importing another module's undeclared hook, API slice, schema, type, or sub-component instead of
  its declared public surface.
- Rendering a feature component directly from `router.ts` instead of adding a module route/page.
- Dispatching from `route.tsx`, or filing a route loader in `guards/`, `utils/` or `api/` instead of
  the module's `loaders/`.
- Letting a component wait for data its route should have awaited — a spinner, a skeleton or an
  `isLoading` branch inside the destination.
- Adding a second auth context beside Redux Toolkit.
- Placing a feature slice under root `store/` instead of `modules/<module>/store/`.
- Adding `<module>.reducer.ts` only to re-export `<module>Slice.reducer`.
- Importing the created slice into `<module>.actions.ts`, which creates the wrong dependency
  direction.
- Reading `state.auth` directly in multiple consumers instead of exporting selectors.
- Storing a production bearer token in local storage without an explicit security decision.
- Repeating route path literals.
- Duplicating a Zod request schema already owned by `packages/contracts`.
- Placing a feature-specific alert in `shared/alerts/` instead of the owning module's `alerts/`.
- Moving single-feature code to `shared/` before it has another consumer.
- Importing UI libraries other than the established HeroUI foundation without an architectural
  decision.
- Adding visible copy to only one locale or hardcoding it in a page, component, schema, or toast.
