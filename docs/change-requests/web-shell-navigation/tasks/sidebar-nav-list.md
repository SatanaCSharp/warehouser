---
id: T2
title: 'Build Sidebar persistent nav list with Dashboard/Access gating'
layer: 'ui'
deps: ['T1']
acs: ['CR-AC-02']
source_refs: ['change.md#CH-02']
files_hint: ['apps/web/src/shared/layouts/Sidebar.tsx']
owner: 'Frontend Lead'
estimate: 'M'
status: 'todo'
---

# T2 — Build Sidebar persistent nav list with Dashboard/Access gating

## Why

[spec §CR-AC-02](../spec.md) and [sad §5](../sad.md) (Added: `Sidebar.tsx`) require the sidebar to
show "Dashboard" always and "Access" only under the exact `ROLES_WATCH ∪ USERS_WATCH` predicate
`RootLayout.tsx` already evaluates, moved (not reimplemented) so the gating logic has one owner.

## What

Create `shared/layouts/Sidebar.tsx`. It links "Dashboard" to `ROUTES.HOME` (always, when reached)
and "Access" to `ROUTES.ACCESS` (only when `currentAccess.data?.permissionIds.some(...)` matches
`ROLES_WATCH` or `USERS_WATCH`), reproducing today's `RootLayout.tsx` predicate and its
falsy/loading-window behavior verbatim — no skeleton state added. This task covers the persistent,
at-or-above-`sm` rendering only; the off-canvas drawer variant is T3.

## Definition of Done

- [ ] Component unit tests cover: "Access" renders when the predicate is true, is absent when false, and is absent during the loading window (no skeleton)
- [ ] "Dashboard" always renders when the component is reached
- [ ] Persistent rendering at or above `sm` per [design-handoff.md](../design-handoff.md) Responsive behavior
- [ ] lint + vet clean

## Notes

Sidebar owns this predicate going forward — do not leave a duplicate copy in `RootLayout.tsx` after
T6 wires it in. Reuses `ROUTES.HOME`/`ROUTES.ACCESS` from `shared/constants/routes.ts` read-only.
