---
id: T13
title: "Remove AccessPage's loading branch, keeping its denial branch"
layer: 'ui'
deps: ['T7']
acs: ['CR-AC-06']
source_refs:
  - 'change.md#3-override-map CH-06'
  - 'spec.md#cr-ac-06-cr-us-06-ch-06--structural'
files_hint:
  - 'apps/web/src/modules/access/page.tsx'
owner: 'YuriiH'
estimate: 'S'
status: 'todo'
---

# T13 — Remove `AccessPage`'s loading branch, keeping its denial branch

## Why

Unlike `WorkspaceAdministration`'s, this loading branch is **reachable** today, because no guard
prefetches `getCurrentAccess`. T5's loader now awaits it on every `entered` verdict, so `access` is
always defined when `AccessPage` mounts — the invariant the surviving denial branch rests on once
the readiness arm above it is gone (CR-AC-04, CH-06).

## What

`modules/access/page.tsx`: remove the loading branch, remove the `Spinner` import, and destructure no
readiness field from `useCurrentPermissions()`.

Leave the `!access || permissionIds.length === 0` denial branch **exactly** as it is.

## Definition of Done

- [ ] `page.tsx` contains no loading branch, imports no `Spinner`, and destructures no readiness
      field from `useCurrentPermissions()`.
- [ ] The `!access || permissionIds.length === 0` denial branch is byte-identical, and a spec proves
      it is still reached for an `entered` verdict whose projection denies.
- [ ] `pnpm --filter @warehouser/web lint`, `test` and `build` clean.

## Notes

- The denial branch is not readiness. It is the surface's authorization outcome and CR-RG-07 keeps it
  unchanged.
- `usePermissions` must keep reading RTK Query's `currentData`, never `data` — that is what keeps the
  cross-Warehouse authority leak closed (CR-RG-03). Removing readiness here is not licence to
  simplify that read; T16 owns the contract and its spec.
