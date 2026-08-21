---
status: Accepted
owner: 'YuriiH'
reviewers: ['Tech Lead']
updated_at: '2026-08-21'
feature_size: 'L'
ticket: 'change-request:global-loader'
---

# 0001 — Route data loading lives in module-owned loader functions

## Context

CH-03 and CH-04 give `workspaceRoute` and `accessRoute` a `loader` that awaits every dataset the
actor's admitted surfaces would fetch. Two `docs/system` rules bound where that code may live, and
they point in different directions.

[`frontend-architecture.md`](../../../system/frontend-architecture.md) §Route permits a route to own
"route-specific search validation or **loader wiring** when needed" and in the same breath forbids
it to contain "RTK dispatch, or direct API calls". So the `loader:` option belongs in `route.tsx`
and the dispatches do not.

The documented `src/` tree has no home for the function that holds them. `guards/` is described as
"plain route access functions"; `modules/<module>/utils/` is "module-owned pure helpers"; `hooks/`
is for hooks; `api/` is "module-owned server calls/query adapters". A route loader is a plain async
function that dispatches several endpoints and applies permission gates — not pure, not a hook, not
an endpoint adapter, and not access control.

The composition problem is the harder half. `/workspace` is assembled from two modules: the
destination and the Warehouses tab belong to `modules/workspace`, and the Roles, Members and
Permissions tabs are imported from `modules/access` through `MODULE_SURFACE.access`. Its loader must
await all six datasets. CR-RG-02 requires each dispatch to reproduce **exactly** the skip set its
hook applies today — `useAccessRoles`'s 8 Permissions, `useAccessMembers`'s 7, and the
`WORKSPACE_ROLES:WATCH` / `WORKSPACE_MEMBERS:WATCH` gates that live inside `modules/access` hooks —
so whatever holds the loader must reach those sets without copying them.

## Decision drivers

- `route.tsx` must stay free of dispatch (`frontend-architecture.md` §Route).
- A loader's Permission conditions must be the same values its hooks apply, not a second copy
  (CR-RG-02; both widening and narrowing are regressions).
- No module may reach past another's declared surface, and the composition layer may address a
  surface but not internals (`MODULE_SURFACE`, ADR 14-08-2026 §"Public surface").
- Placement follows the domain that owns the behavior, narrowed by scope of exercise
  (ADR 18-08-2026).
- `route.tsx` sits in the router chunk. Whatever it imports is eagerly loaded, so a loader must not
  drag a lazily imported page in with it.
- Every future route that awaits data will copy whatever this change does.

## Considered options

1. **Inline the dispatches in `route.tsx`.** Shortest diff. Directly violates §Route's "no RTK
   dispatch, no direct API calls", and puts a permission-gated fan-out in the file whose stated job
   is parent, path, lazy import and guard.
2. **Put the loaders in `guards/`.** There is real precedent: `guards/landing.guard.ts` and
   `guards/workspace.guard.ts` are plain route functions that dispatch `initiate` and `unwrap`. But
   `guards/` is the composition layer, so reaching `modules/access`'s Permission sets from there
   means exporting three module-private constants through `MODULE_SURFACE` for the composition layer
   to recombine — the composition layer would then own the answer to "what does the Roles tab
   fetch?", which is the access module's invariant. It also conflates access control with data
   loading in one directory, where a reader currently knows every file throws a redirect or returns.
3. **Put the loaders in `modules/<module>/api/`.** Closest existing directory by description. But an
   `api/` file today is an `injectEndpoints` slice; a loader orchestrates several slices across two
   modules and applies Permission gates, so filing it there makes "what is in `api/`?" a question
   with two answers.
4. **Add `modules/<module>/loaders/`, and let a module contribute its own datasets through its
   declared surface.** A new directory in the documented tree, named for what it holds, mirroring
   `guards/` at module scope. `modules/workspace` owns the `/workspace` loader and calls one
   exported contribution from `modules/access` for the three datasets that module owns.

## Decision outcome

Chosen: **option 4 — `modules/<module>/loaders/`, with cross-module datasets contributed through
the owning module's declared surface.**

A loader belongs to the module whose datasets it awaits. `route.tsx` imports it and wires it to the
`loader:` option, and holds no dispatch. Where a destination is composed from more than one module,
the composing module's loader calls a contribution function the other module exports on its surface,
passing the resolved permission ids and receiving back a settled promise — it never learns which
Permissions gate the other module's datasets.

```text
modules/workspace/route.tsx
  └─ loaders/workspace-administration.loader.ts        (intra-module)
       ├─ getWorkspaceContext            primary, unwrapped
       ├─ listWorkspaceWarehouses        WAREHOUSES:WATCH
       ├─ listWorkspaceUsers             WORKSPACE_MEMBERS:WATCH
       └─ loadWorkspaceAdministrationAccessDatasets     (MODULE_SURFACE.access)
            ├─ listWorkspaceMembers      WORKSPACE_MEMBERS:WATCH
            ├─ listWorkspaceRoles        WORKSPACE_ROLES:WATCH
            └─ listWorkspacePermissions  WORKSPACE_ROLES:WATCH
```

Three rules come with it:

- **A loader dispatches; it does not decide access.** CH-16's `context.status === 'entered'` check
  reads the verdict `resolveWarehouseEntry` already published into the match context. A loader never
  throws a redirect and never re-derives a verdict — that stays in `guards/`.
- **A Permission set is declared once and read by both the hook and the loader.** The access
  module's sets move to `modules/access/utils/access-permission-sets.ts`, a lookup table by
  [`placing-web-hooks.md`](../../../system/guides/placing-web-hooks.md) §3. The gate does not move:
  `useAccessRoles` still applies its own `skip`; it just names the set from one place.
- **A loader imports no page and no component.** It is reachable from the router chunk, so pulling
  in a lazily imported page would defeat the `import('./page')` boundary.

Exactly one new `MODULE_SURFACE` entry is required:
`modules/access/loaders/workspace-administration-datasets.loader`.

## Consequences

### Positive

- `route.tsx` stays what §Route says it is, and the rule needs no exception.
- CR-RG-02's drift risk is structural rather than procedural for every set that has a constant: the
  hook and the loader cannot disagree, because there is one value.
- The dependency direction across `modules/workspace` → `modules/access` matches the one the tab
  components already have, so the boundary spec's shape is unchanged.
- A future route that needs data has one obvious place to put the function, and one obvious way to
  compose across modules.

### Negative

- A new directory that `docs/system` does not yet document, so this change owes
  `frontend-architecture.md` §Source structure and `adding-a-web-module.md` an edit at ship.
- One more indirection between the route and the request. Reading "what does `/workspace` fetch?"
  now means opening two files, not one.
- The contribution function is a second surface entry for `modules/access`, and a second thing to
  keep honest when that module's datasets change.

### Neutral

- `guards/` is unchanged and keeps its precedent for dispatching from a plain route function; this
  decision only declines to file data loading there.
- The loaders dispatch with `subscribe: false`, mirroring the two existing guards. That is a
  consequence of the guards' precedent, not of this decision, and CR-AC-03's force-mounted panels
  are what make it safe.

## Links

- [`sad.md` §4.1, §4.5, §5.2, §5.4](../sad.md)
- [`spec.md` CR-AC-03, CR-AC-04, CR-RG-02, CR-RG-07](../spec.md)
- [`change.md` CH-03, CH-04, CH-16](../change.md#3-override-map)
- [Frontend architecture §Route, §Source structure](../../../system/frontend-architecture.md)
- [Scope-of-exercise placement tiebreak](../../../system/adr/18-08-2026-scope-of-exercise-placement-tiebreak.md)
- [Domain-owned flat modules](../../../system/adr/14-08-2026-domain-owned-flat-modules.md)
- [Declarative permission gates](../../../system/adr/19-08-2026-declarative-permission-gates.md)
- [Placing web hooks §3](../../../system/guides/placing-web-hooks.md)
