# Adding a Web Module

Use this guide for a new route-owned feature in `apps/web`. Read
[Frontend architecture](../frontend-architecture.md) first. UI-changing work also requires the
approved Pencil handoff described in the root README.

## 1. Declare the path

Add the path to `apps/web/src/shared/constants/routes.ts`:

```ts
export const ROUTES = {
  HOME: '/',
  LOGIN: '/login',
  INVENTORY: '/inventory',
} as const;
```

Do not repeat `/inventory` in routes, links, guards, or navigation calls.

## 2. Create the feature slice

```text
modules/inventory/
├── route.tsx
├── page.tsx
├── components/
├── alerts/      # only for inventory-specific feedback
├── hooks/       # only if needed
├── schemas/     # only for browser-local validation
├── api/         # only when the feature calls the server
└── store/       # only when the feature owns RTK state
    ├── inventory.actions.ts
    ├── inventory.slice.ts
    └── inventory.selectors.ts
```

Do not create empty optional directories.

## 3. Define a lazy route

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

## 4. Add the page and components

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

## 5. Choose schema ownership

If the value is a server request or response, add its Zod schema to `packages/contracts` and follow
[Adding and using contracts](adding-and-using-contracts.md). Import it from a module subpath.

If it validates browser-only state, put it in `modules/<module>/schemas`. Do not duplicate a shared
contract in the web app.

## 6. Use Redux Toolkit deliberately

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

## 7. Register the route

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

## 8. Add tests

Before adding visible copy, create or extend the module-named translation namespace under
`apps/web/public/locales/<language>/` for every supported language. Keep stable keys in
logic and translate them at the presentation boundary. Follow
[Adding and maintaining web localization](adding-and-maintaining-web-localization.md); do not
hardcode user-visible strings or move module-specific copy into `common`.

Colocate tests with the code they cover. At minimum, cover:

- client validation and valid form output;
- loading, empty, error, and success UI required by the feature;
- submit/API/RTK/navigation orchestration;
- authenticated, anonymous, or public route behavior;
- accessible names, labels, and keyboard interaction.

Prefer semantic queries. Use test IDs only where semantic queries cannot identify the element.

## 9. Verify

From the repository root:

```sh
pnpm --filter @warehouser/web lint
pnpm --filter @warehouser/web test
pnpm --filter @warehouser/web build
```

For a contract change, build `@warehouser/contracts` before verifying the web app. For a visible UI
change, also complete the viewport/state comparison required by the approved design handoff.

## Common failures

- Rendering a feature component directly from `router.ts` instead of adding a module route/page.
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
