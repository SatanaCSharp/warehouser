---
id: T7
title: 'Implement the landing resolver on / and the root not-found redirect'
layer: 'app'
deps: ['T4', 'T5']
acs: ['CR-AC-08', 'CR-AC-10', 'CR-AC-16', 'CR-AC-18', 'CR-RG-04', 'CR-RG-05']
source_refs: ['change.md#CH-06', 'change.md#CH-10']
files_hint:
  [
    'apps/web/src/guards/landing.guard.ts',
    'apps/web/src/guards/landing.guard.spec.ts',
    'apps/web/src/modules/home/route.tsx',
    'apps/web/src/routes/catch-all.route.tsx',
    'apps/web/src/router.ts',
    'apps/web/src/router.spec.tsx',
  ]
owner: 'Frontend Lead'
estimate: 'M'
status: 'todo'
---

# T7 — Implement the landing resolver on / and the root not-found redirect

## Why

`/` stops being a destination and becomes the one sanctioned resolver, so every entry point —
sign-in, the brand link, `requireAnonymous`, and an unmatched address — lands where the actor's
access actually puts them. Derives from [spec §CR-AC-08](../spec.md#5-acceptance-criteria),
[§CR-AC-16](../spec.md#5-acceptance-criteria), [§CR-RG-04](../spec.md#51-regression-boundaries),
[sad §4.5–4.6](../sad.md#4-solution-strategy) and
[sad §6.1](../sad.md#61-landing-after-sign-in-brand-link-or-an-unmatched-address-cr-ac-08-cr-ac-16-cr-ac-18).

## What

- `guards/landing.guard.ts` — `resolveLandingContext(context)` in the canonical guard shape: reads
  the Workspace context through the store (the `workspace.guard.ts` pattern, verbatim) and evaluates
  CR-AC-08's rules in order, first match deciding:
  1. `hasWorkspacePermission(workspacePermissionIds, workspaceAdministrationPermissionIds)` →
     `throw redirect({ to: ROUTES.WORKSPACE })`
  2. `effectiveWarehouseId !== null` →
     `throw redirect({ to: ROUTES.WAREHOUSE, params: { warehouseId: effectiveWarehouseId } })`
  3. otherwise return normally
- `modules/home/route.tsx` — `beforeLoad` runs `requireAuth` then `resolveLandingContext`;
  `errorComponent` is `RouteErrorState`. TanStack's own pending state covers the unresolved read, so
  no rule is evaluated while it is pending and no hand-rolled state machine is added.
- `routes/catch-all.route.tsx` — add the **root-level** splat, a three-line `beforeLoad` throwing
  `redirect({ to: ROUTES.HOME })`. No authentication branch of its own: an unauthenticated actor is
  sent to sign-in by the existing `requireAuth` on `/`.
- `router.ts` — register the root splat as the last root child.

## Definition of Done

- [ ] Guard unit test: rule (1) fires for an actor holding **any one** of the four administration
      Permissions
- [ ] Guard unit test: rule (2) consumes the server's derivation unchanged — no membership-picking
      logic exists in the web (CR-RG-04)
- [ ] Guard unit test: several live memberships with no valid stored selection reaches rule (3)
- [ ] Route-integration test: `/` resolves to `/workspace`, to a Warehouse view, or renders the
      no-context state, in exactly **one** navigation
- [ ] Route-integration test: no rule is evaluated while the context read is unresolved — the actor
      stays at `/` in the pending state and is never shown a context they are then moved out of
- [ ] Route-integration test: a failed context read renders `RouteErrorState`, **not** the no-context
      state
- [ ] Route-integration test: a registrant holding the Workspace Owner Role lands in `/workspace`
      (CR-AC-10)
- [ ] Route-integration test: no actor is redirected twice between `/` and `/workspace` (CR-RG-05)
- [ ] Route-integration test: an unmatched address — including a bookmarked `/access` — lands at `/`
      and resolves; an unauthenticated actor reaches sign-in unchanged
- [ ] lint + vet clean

## Notes

- `guards/workspace.guard.ts` is **not** modified: it keeps refusing `/workspace` and redirecting to
  `ROUTES.HOME` against the identical `workspaceAdministrationPermissionIds` set. Because rule (1)
  reads that same set, an actor it bounces can never be sent straight back at it — that is what makes
  CR-RG-05 hold, and it is a property of reusing the set, not of new logic.
- This is one of the three allowlisted `effectiveWarehouseId` call sites (T13). Do not read the value
  anywhere else in this task.
- **Shared file with T4** — `routes/catch-all.route.tsx`. T4 added the Warehouse-level splat; this
  task appends the root one.
