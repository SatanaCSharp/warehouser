---
id: T9
title: "Remove DatasetCard's loading contract and update its three callers"
layer: 'ui'
deps: ['T7']
acs: ['CR-AC-07', 'CR-RG-05']
source_refs:
  - 'change.md#3-override-map CH-07'
  - 'change.md#3-override-map CH-14'
  - 'sad.md#56-contracts-after-ch-09'
files_hint:
  - 'apps/web/src/shared/components/DatasetCard.tsx'
  - 'apps/web/src/modules/access/components/access-workspace/components/members/MembersDatasetCard.tsx'
  - 'apps/web/src/modules/access/components/access-workspace/components/roles/RolesDatasetCard.tsx'
  - 'apps/web/src/modules/access/components/access-workspace/components/permissions/PermissionsTab.tsx'
owner: 'YuriiH'
estimate: 'M'
status: 'todo'
---

# T9 — Remove `DatasetCard`'s loading contract and update its three callers

## Why

Rollout step 3 of [`change.md` §6](../change.md#6-rollout) — component readiness comes out now that
T7 has proven the routes cover the window. `DatasetCard` takes `loading` + `loadingLabel` and renders
a private `DatasetSkeleton`; that is one of the seven affordances CH-07 removes.

The contract and its three implementers land **together**: splitting them would leave a commit where
a call site references a removed prop and the web build cannot compile.

## What

- `DatasetCardProps` declares neither `loading` nor `loadingLabel`; the private `DatasetSkeleton`
  helper is deleted. `children`, `empty`, `emptyLabel`, `error`, `errorLabel` and `title` remain
  ([`sad.md` §5.6](../sad.md#56-contracts-after-ch-09)).
- Update the three callers — `MembersDatasetCard.tsx:23`, `RolesDatasetCard.tsx:24`,
  `PermissionsTab.tsx:21` — to pass only the surviving props, with `empty` computed as
  `items.length === 0`.

`error` / `errorLabel` are **retained**: they are how CR-AC-15's error promise stays reachable after
the tab guards collapse in T15, and `AccessDataset.isError` survives CH-09 for the same reason.

## Definition of Done

- [ ] `DatasetCardProps` declares no `loading` / `loadingLabel`; `DatasetSkeleton` no longer exists.
- [ ] All three callers pass only the surviving props and compute `empty` as `items.length === 0`.
- [ ] `error` and `errorLabel` still work: a spec renders each caller's error case and asserts its
      existing message (CR-RG-05).
- [ ] Each caller's existing empty case still renders its own copy — `permissions.empty` in
      particular (CR-RG-05).
- [ ] `pnpm --filter @warehouser/web lint`, `test` and `build` clean.

## Notes

- **`PermissionsTab` must not gain a Permission read.** It reads none today, and adding a capability
  boolean would work against CR-RG-07 and `spec.md` §3. It is admitted by `ROLES:WATCH`
  (`AccessWorkspace.tsx:67`), which after T2 is inside `useAccessPermissions`'s set — so the
  _not-permitted_ arm is unreachable and needs no branch
  ([CR-RG-05's reachability argument](../spec.md#cr-rg-05--error-empty-and-search-empty-states-are-unchanged)).
- `writing-web-components.md` §1 names `DatasetSkeleton` as its private-helper example; T19
  reconciles that passage.
