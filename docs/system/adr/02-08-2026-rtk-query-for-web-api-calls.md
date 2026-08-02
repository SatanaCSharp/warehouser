# Use RTK Query for Web API Calls

Status: Accepted

Date: 2026-08-02

## Context

The web application used a custom promise-based `fetch` wrapper and module functions for server
calls while Redux Toolkit separately owned cross-module browser state. Each feature workflow had to
manage request state and invocation conventions itself, and the existing approach provided no
shared query cache, request deduplication, or tag-based invalidation mechanism.

Server responses still require contract validation through the Zod schemas in
`packages/contracts`, and API failures must remain normalized at one shared boundary before they
reach presentation code.

## Decision

Use RTK Query as the web application's standard server-state and API-call mechanism. Define one
shared API slice for the Warehouser server base URL and register its reducer and middleware in
`apps/web/src/store/index.ts`. Feature modules own their endpoint definitions and add them to the
shared slice with `injectEndpoints`.

React workflows use generated RTK Query hooks. Non-React workflows, including router guards, invoke
the same endpoints by dispatching their `initiate` thunk and awaiting `unwrap()`. Do not create a
parallel promise-based API function for those callers.

Use a shared custom RTK Query base query to apply cookie credentials, normalize network and server
failures, and validate successful responses with contract-owned Zod schemas supplied by endpoints.
Keep normalized errors and cached data serializable. Mutations declare invalidation tags whenever
they can make cached query results stale.

Client-owned workflow and identity state remains in ordinary Redux Toolkit slices. RTK Query owns
server request lifecycle and cached server responses; it does not replace all Redux state.

## Alternatives

- Keep the custom `fetch` wrapper and module-level promise functions: rejected because every
  feature would continue rebuilding request lifecycle and cache behavior around a second data
  access convention.
- Use Redux thunks around the custom client: rejected because thunks would centralize dispatch but
  still require custom cache keys, deduplication, loading state, and invalidation.
- Introduce a separate server-state library: rejected because Redux Toolkit is already the web
  application's cross-module state foundation and RTK Query integrates with its existing store and
  typed hooks.

## Consequences

- Queries, mutations, loading state, caching, deduplication, and invalidation follow one convention.
- React components receive generated typed hooks, while guards and other non-React callers reuse the
  exact same endpoint definitions through store dispatch.
- API response validation and failure normalization remain centralized and contract-driven.
- The shared API slice adds a reducer and middleware to the store, and endpoint tag design becomes
  part of feature implementation and review.
- Contributors must distinguish server-owned cached data from client-owned workflow state instead
  of copying query results into ordinary slices.
- Migrating an existing API call requires updating its direct consumers and tests; mixing legacy
  request functions with RTK Query is not an accepted steady state.

## Links

- [Frontend architecture](../frontend-architecture.md)
- [Web error handling and action feedback](../guides/web-error-handling.md)
- [System architecture description](../sad.md)
