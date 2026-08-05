# Frontend Architecture

This document defines durable structure and ownership rules for `apps/web`. It describes the code
that exists now and the conventions new modules must follow.

## Runtime foundation

The bootstrap chain is:

```text
main.tsx
  StrictMode
    Redux Provider
      HeroUIProvider
        App
          TanStack RouterProvider
            root route
              RootLayout
                matched module page
```

Provider order is intentional. Components rendered by the router must have access to Redux and
HeroUI. Router guards do not use React hooks; the router receives the same RTK store in its context
and reads it through selectors.

Routes are registered manually in `src/router.ts`. Do not introduce file-route generation without
an accepted system decision and migration plan.

## Source structure

```text
apps/web/src/
├── main.tsx                 # browser mount and application providers
├── App.tsx                  # router provider only
├── router.ts                # route-tree assembly and router factory
├── routes/
│   └── __root.route.tsx     # typed root route and application shell
├── modules/
│   └── <module>/            # route-owned feature slice
│       ├── route.tsx
│       ├── page.tsx
│       ├── components/
│       ├── alerts/          # module-specific user feedback adapters
│       ├── hooks/           # create only when the module needs them
│       ├── schemas/         # browser-only validation
│       ├── api/             # module-owned server calls/query adapters
│       └── store/           # module-owned RTK state
│           ├── <module>.actions.ts   # case-reducer function declarations
│           ├── <module>.slice.ts     # createSlice, action creators, reducer export
│           └── <module>.selectors.ts # typed reads from RootState
├── guards/                  # plain route access functions
├── shared/
│   ├── alerts/              # generic alerts reused across modules
│   ├── components/          # reused by at least two modules
│   ├── constants/
│   └── layouts/
├── store/
│   ├── index.ts             # root reducer, store factory, production store, types
│   ├── hooks.ts             # typed dispatch and selector hooks
│   └── middleware/          # generic application-wide Redux middleware
├── hooks/                   # reusable app-level non-data hooks
├── styles/                  # global styles and HeroUI tokens
└── test/                    # provider renderer and global test setup
```

Keep logic inside one module until another module genuinely needs it. Promote it to `shared/` or
root `hooks/` only when reuse exists. Stable platform boundaries—root layout, route constants,
store creation, and an eventual shared API client—may start outside a feature.

Alerts follow the same ownership rule. Put feedback for a feature-owned action in
`modules/<module>/alerts/`, even when it uses a shared toast library or translation namespace.
For example, sign-up and sign-out success alerts belong to `modules/auth/alerts/`. Use
`shared/alerts/` only for presentation behavior that applies across feature modules, such as the
generic normalized API-failure alert. Colocate each alert adapter's test with the adapter.

Use Lodash for collection, object, and other data-structure operations when it provides the
operation. Import the needed function directly so the web bundle includes only what it uses, and
prefer it to a hand-written imperative loop or custom equivalent.

## Layer responsibilities

### Route

`modules/<module>/route.tsx` owns only routing concerns:

- parent and path;
- lazy page import;
- route access guard;
- route-specific search validation or loader wiring when needed.

It contains no feature JSX, form handling, RTK dispatch, or direct API calls.

### Page

`page.tsx` is the feature orchestrator. It composes module components and owns workflows spanning
multiple concerns, such as submit → request → update RTK state → navigate. A page may own data when
several children share it or the state is route-level. Data used by one component stays with that
component or a module-local hook.

Avoid absolute rules that all queries must be in pages or must be in leaf components. Use the
narrowest owner that can coordinate the complete loading, error, empty, and success behavior.

### Components

Module components own rendering, accessible interaction, and local UI state. A self-contained form
component owns React Hook Form field registration, client validation, and submission state, then
passes validated values to its page through `onSubmit`. The page owns server side effects, RTK
updates, navigation, and server-error mapping.

Use HeroUI from `@heroui/react` and semantic tokens from `styles/hero.ts`. There is no Warehouser UI
wrapper package today, so do not invent imports from one. Promote a wrapper to `shared/components`
only when it standardizes behavior used by multiple modules.

## Redux Toolkit infrastructure

Redux Toolkit is the single source of truth for cross-module browser state. Do not add a parallel
React context for state already in RTK.

- `store/index.ts` owns the root reducer, `makeStore()`, the production `store`, and the
  `RootState`, `AppStore`, and `AppDispatch` types.
- Tests use `makeStore()` so state never leaks between cases.
- Components use `useAppDispatch` and `useAppSelector` from `store/hooks.ts`, not repeatedly typed
  raw React Redux hooks.
- Feature-owned slices live in `modules/<module>/store/` beside the workflows that define their
  state transitions. The root `store/` composes those reducers; it does not own feature slices.
- `<module>.actions.ts` declares the case-reducer functions supplied to the slice's `reducers`
  option. It does not import the created slice or export Redux action creators.
- `<module>.slice.ts` owns the state types and initial state, calls `createSlice`, and exports the
  generated action creators and `<module>Reducer`. The root store imports that reducer directly
  from the slice file; do not add a separate reducer-export file.
- `<module>.selectors.ts` exports named, typed selectors. Components and guards import selectors
  instead of duplicating state traversal such as `state.auth.status`.
- Dependencies flow from the slice to its case-reducer declarations. Action consumers import the
  generated action creators from the slice; selector consumers import from the selectors file.
- Add a slice only for state used across modules or needed globally across routes. Server-owned
  resource data belongs to an RTK Query API slice rather than an ordinary state slice.
- Define one shared RTK Query API slice for the Warehouser server and register its reducer and
  middleware in `store/index.ts`. Owning feature modules add endpoints with `injectEndpoints`.
  React workflows use generated hooks; guards and other non-React workflows dispatch the same
  endpoint's `initiate` thunk and await `unwrap()`.
- Route requests through the shared RTK Query base query so cookie credentials, contract validation,
  and normalized serializable API failures remain consistent. Mutations declare tags for cached
  queries they invalidate.

The router context contains `{ store: AppStore }`. Guards call selectors against
`store.getState()`, which always reads current state and avoids hook or closure constraints.

Authentication is currently in-memory and mocked. Do not add local-storage token persistence by
default. A production feature must decide cookie/token transport, expiry, refresh, restoration, and
logout behavior with security consequences documented.

See the accepted [RTK Query ADR](adr/02-08-2026-rtk-query-for-web-api-calls.md).

## Guards and paths

Access control lives at route level in plain functions under `guards/`. A guard accepts
`RouterContext`, returns normally when access is allowed, and throws TanStack Router's redirect
descriptor otherwise. Guards have no React imports or component rendering.

All application paths are declared in `shared/constants/routes.ts`. Route definitions, guards,
navigation calls, and links reference `ROUTES`; they do not repeat path literals.

## Validation and server contracts

Use Zod and the accepted repository ownership rule:

- Data crossing the web/server boundary belongs in `packages/contracts` and is imported through a
  module subpath.
- Browser-only form state or display validation stays in
  `modules/<module>/schemas/`.
- Do not duplicate a server request schema locally just to customize error copy. Compose or refine
  it when necessary, or map Zod issues at the UI boundary.

See [Adding and using contracts](guides/adding-and-using-contracts.md).

For API error normalization, HeroUI form errors, React-Toastify alerts, successful-action
feedback, and i18next ownership, follow
[Web error handling and action feedback](guides/web-error-handling.md).

All user-visible copy is configured by the centralized boundary at `src/i18n.ts`. Translation
resources are served from `public/locales/<language>/<namespace>.json`; module copy remains in a
module-named namespace rather than being moved into the module source tree. Follow
[Adding and maintaining web localization](guides/adding-and-maintaining-web-localization.md).

## Testing

Colocate component, page, hook, schema, and slice tests with their owner. Keep cross-cutting test
setup in `src/test`.

- Use a fresh RTK store and memory-history router per test.
- Prefer accessible Testing Library queries by role, label, and name.
- Add `data-testid` only when there is no stable semantic query; do not require it on every node.
- Test guards through navigation behavior and feature stores as pure state behavior where useful.
- Test submission orchestration at the page or route level; keep form tests focused on validation
  and emitted values.

Before completing web work, run:

```sh
pnpm --filter @warehouser/web lint
pnpm --filter @warehouser/web test
pnpm --filter @warehouser/web build
```

## UI design boundary

Any feature changing a user-visible web interface must follow the Pencil workflow in the root
README and `ai/skills/design-ui/`. The approved design controls visual and behavioral intent; this
document controls production code ownership and architecture. A design handoff does not authorize
bypassing modules, HeroUI tokens, RTK boundaries, contracts, tests, or accessibility conventions.
