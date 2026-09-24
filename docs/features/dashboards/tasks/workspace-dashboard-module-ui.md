---
id: T19
title: 'Add the modules/workspace-dashboard flat module, its gated rail entry and the Administration relabel'
layer: 'ui'
deps: [T3, T14, T15]
acs: ['AC-14', 'AC-15', 'AC-22', 'AC-26']
files_hint:
  - 'apps/web/src/modules/workspace-dashboard/'
  - 'apps/web/src/shared/constants/routes.ts'
  - 'apps/web/src/shared/layouts/sidebar/components/WorkspaceNavEntries.tsx'
  - 'apps/web/public/locales/en/common.json'
  - 'apps/web/public/locales/uk/common.json'
owner: 'Frontend Lead'
estimate: 'M'
status: 'todo'
---

# T19 — Add the modules/workspace-dashboard flat module, its gated rail entry and the Administration relabel

> **Blocked by:** [T3](./dashboards-contracts-subpath.md) · [T14](./workspace-dashboard-rest-surface.md) · [T15](./chart-primitives-and-tokens.md)
> **Satisfies:** AC-14, AC-15, AC-22, AC-26 — see [spec.md §5](../spec.md)
> **Owner:** Frontend Lead · **Estimate:** M · **Layer:** `ui`

## Why

`/workspace` is a flat root child owned by `modules/workspace` and already occupied by
administration, and a module has exactly one `route.tsx` and one `page.tsx` — so the Workspace
Dashboard needs a module of its own. That is ADR 14-08's promotion rule applied as written
([sad.md §5](../sad.md), [design-handoff.md § Addresses and navigation](../design-handoff.md)).

## What

A new flat sibling module `modules/workspace-dashboard/` — `route.tsx`, `page.tsx`,
`loaders/workspace-dashboard.loader.ts`, `api/workspace-dashboard-api.ts`, plus:

- `shared/constants/routes.ts` — `WORKSPACE_DASHBOARD` at `/workspace/dashboard`;
- `shared/layouts/sidebar/components/WorkspaceNavEntries.tsx` — the new gated **Dashboard** entry
  first in the rail, and the existing entry relabelled through a new `nav.administration` key in
  `common`.

**`route.tsx` declares `requireAuth` only.** It must **not** copy `requireWorkspaceCapability`:
AC-15 and frame `ujNPP` tile 1 require a **denial rendered at the address**, not a redirect.

## Definition of Done

- [ ] The route declares authentication only and performs **no** capability redirect
- [ ] The loader dispatches nothing when `WAREHOUSE_PERFORMANCE:WATCH` is absent, and the page
      renders the shipped denial pattern naming no Warehouse, quantity, count or share and revealing
      nothing about how many Warehouses the Workspace holds (AC-15)
- [ ] A Warehouse Member holding every watch Permission and no Workspace Role reaches the same
      denial (AC-22)
- [ ] With the Permission, all four reads are dispatched in parallel and awaited, and **no read is
      issued after paint**
- [ ] The rail entry is **absent** without the Permission; `/workspace` is still the administration
      destination and its address is unchanged
- [ ] The existing rail entry reads **Administration** in both locales
- [ ] The four endpoints refetch on entry; no tag invalidation (AC-26)
- [ ] `pnpm --filter @warehouser/web build` clean
- [ ] `oxlint --type-aware --max-warnings=0` clean over every staged file, and the
      commit passes the repository's Git hooks without `--no-verify`

## Notes

The rail entry is gated on the same Permission, so in practice the address is reached only by an
actor who already holds it; the denial is what a **stale link, a bookmark or a revoked grant** meets.

The `nav.workspace` → `nav.administration` copy change is owned by `workspaces` but ships here,
because with a second Workspace destination present "Workspace" no longer names anything the entry
does.

The route's `pendingComponent` is the only waiting affordance — no per-Panel skeleton.
