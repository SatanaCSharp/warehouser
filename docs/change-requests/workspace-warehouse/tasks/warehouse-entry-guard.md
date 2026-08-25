---
id: T3
title: 'Implement the resolveWarehouseEntry entry-verdict guard'
layer: 'app'
deps: []
acs: ['CR-AC-07', 'CR-AC-17', 'CR-RG-02']
source_refs: ['change.md#CH-04']
files_hint:
  [
    'apps/web/src/guards/warehouse-entry.guard.ts',
    'apps/web/src/guards/warehouse-entry.guard.spec.ts',
  ]
owner: 'Frontend Lead'
estimate: 'M'
status: 'todo'
---

# T3 — Implement the resolveWarehouseEntry entry-verdict guard

## Why

One place decides entry, so CR-AC-07's "same refusal for all four cases", CR-AC-17's archived refusal
and the no-fallback rule are enforced once rather than per surface. Derives from
[ADR 0001 § Decision outcome](../adr/0001-warehouse-view-as-a-route-established-context.md#decision-outcome),
[sad §5 Added](../sad.md#added) and [sad §10](../sad.md#10-verification-strategy) row 1.

## What

Create `guards/warehouse-entry.guard.ts` exporting

```
resolveWarehouseEntry(context: RouterContext, warehouseId: string):
  Promise<{ status: 'entered' | 'refused'; reason?: 'not-a-member' | 'archived'; warehouseId: string }>
```

It reads the actor's memberships by dispatching
`workspaceContextApi.endpoints.getWorkspaceContext.initiate(undefined, { subscribe: false })` through
the store and `unwrap()`-ing it — the `guards/workspace.guard.ts` pattern, verbatim. Plain function,
no React import, no rendering.

`warehouseId` is **not** shape-validated before the membership lookup (CR-AC-07, ADR 0001
§ Neutral): a malformed value must be indistinguishable from a well-formed id the actor holds no
membership in.

## Definition of Done

- [ ] Unit test: `not-a-member` for a non-existent id, a foreign-Workspace id, an own-Workspace id
      with no membership, and a malformed id — all four verdicts identical apart from the echoed
      `warehouseId`
- [ ] Unit test: no shape validation runs before the membership lookup (a malformed id still reaches
      the context read)
- [ ] Unit test: a membership in an archived Warehouse yields `refused` / `archived`
- [ ] Unit test: a live membership yields `entered`
- [ ] Unit test: the function never throws a redirect descriptor, on any path
- [ ] No React import in the module
- [ ] lint + vet clean

## Notes

This is the **documented deviation** from
[frontend architecture](../../../system/frontend-architecture.md) §"Guards and paths": a guard that
returns a verdict rather than returning-or-redirecting, because CR-AC-07 forbids the redirect. It is
scoped to this one function — `requireAuth`, `requireAnonymous`, `requireWorkspaceCapability` and
`resolveLandingContext` (T7) all keep the redirect-or-return shape, and the convention text in
`docs/system` is **not** amended by this change request. See
[sad §5 "Documented deviation"](../sad.md#5-building-blocks-and-ownership) and ADR 0001 § Accepted
deviation.
