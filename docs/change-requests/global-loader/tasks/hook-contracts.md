---
id: T16
title: 'Remove the seven readiness fields from the five hook contracts'
layer: 'ui'
deps: ['T9', 'T10', 'T11', 'T12', 'T13', 'T14', 'T15']
acs: ['CR-AC-09', 'CR-RG-03']
source_refs:
  - 'change.md#3-override-map CH-09'
  - 'sad.md#56-contracts-after-ch-09'
  - 'spec.md#cr-rg-03--the-cross-warehouse-authority-leak-stays-closed'
files_hint:
  - 'apps/web/src/modules/access/utils/access-dataset.ts'
  - 'apps/web/src/shared/hooks/queries/usePermissions.ts'
  - 'apps/web/src/shared/hooks/queries/usePermissions.spec.tsx'
  - 'apps/web/src/shared/hooks/queries/useWorkspacePermissions.ts'
  - 'apps/web/src/modules/access/hooks/queries/useWorkspaceRoles.ts'
  - 'apps/web/src/modules/access/hooks/queries/useWorkspacePermissionCatalogue.ts'
owner: 'YuriiH'
estimate: 'M'
status: 'todo'
---

# T16 — Remove the seven readiness fields from the five hook contracts

## Why

Rollout step 4 of [`change.md` §6](../change.md#6-rollout): the contracts come out **once nothing
reads them**. That is why this task depends on all seven call-site tasks — landing it earlier would
break every implementer at compile time and leave no commit green.

This is what makes the wrong thing hard to write: after it, there is no `isLoading` to branch on
(CR-US-06).

## What

Per [`sad.md` §5.6](../sad.md#56-contracts-after-ch-09):

| Contract                                                 | Removed                              | Retained                                                        |
| -------------------------------------------------------- | ------------------------------------ | --------------------------------------------------------------- |
| `AccessDataset<TItem>` (`access-dataset.ts`)             | `isFetching`, `isLoading`, `isReady` | `items`, **`isError`**                                          |
| `CurrentPermissions` (`usePermissions.ts`)               | `isLoading`                          | `access`, `permissionIds`; the `currentData` read unchanged     |
| `CurrentWorkspaceContext` (`useWorkspacePermissions.ts`) | `isLoading`                          | `workspaceContext` **stays optional**, `workspacePermissionIds` |
| `WorkspaceRoleChoices` (`useWorkspaceRoles.ts`)          | `isReady`                            | `roles`, `customRoles`                                          |
| `WorkspacePermissionCatalogue`                           | `isReady`                            | `permissions`                                                   |

## Definition of Done

- [ ] The five contracts declare exactly the fields above — seven readiness fields gone.
- [ ] **`AccessDataset.isError` is still present.** It is what keeps CR-AC-15's error promise
      reachable after T15's guards collapse.
- [ ] **`CurrentWorkspaceContext.workspaceContext` is still optional.** Only `isLoading` is removed —
      the non-optional type is delivered by T12's route-scoped projection
      ([`sad.md` §4.6](../sad.md#46-the-non-optional-workspace-context-is-route-scoped-not-contract-wide)).
- [ ] `usePermissions` still reads RTK Query's `currentData`, never `data`, and
      `usePermissions.spec.tsx` retains a case that renders `useCurrentPermissions` across an
      argument change and **fails if `currentData` is replaced by `data`** (CR-RG-03).
- [ ] `pnpm --filter @warehouser/web build` type-checks with no call site left reading a removed
      field; `lint` and `test` clean.

## Notes

- **CR-AC-09's scope bound.** This does not forbid the identifiers `isLoading` / `isFetching` /
  `isReady` elsewhere. RTK Query's own query results, TanStack Router's `router.state.isLoading`
  (`modules/home/route.spec.tsx:228`), `mutation-feedback.middleware.ts` and the CR-RG-06 components
  legitimately keep them. T18's scan asserts they stay legal at exactly those sites.
- Removing `isLoading` from `CurrentPermissions` is **not licence to simplify the `currentData`
  read** — that read is the whole of CR-RG-03's cross-Warehouse authority guarantee, and the route
  loader narrows the window in which a regression would be observable through the UI, which is why
  the boundary is pinned at the hook.
- `useWorkspaceRoles` and `useWorkspacePermissionCatalogue` keep returning `undefined` where they do
  today; T11 already established that no `?? []` default may paper over it.
