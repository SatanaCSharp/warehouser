---
id: T11
title: "Record the Warehouse's own Delivery Address end to end: Workspace-guarded command, route, contract and detail-pane section"
layer: 'ports'
deps: [T3, T4]
acs: ['AC-10']
files_hint:
  - 'apps/server/src/warehouses/'
  - 'packages/contracts/src/workspaces/'
  - 'apps/web/src/modules/workspace/components/workspace-administration/warehouses/WarehouseDetailPane.tsx'
  - 'apps/web/vite.config.ts'
  - 'apps/web/src/test/locale-baseline.json'
  - 'tests/refactor/route-table.baseline.json'
owner: 'Tech Lead'
estimate: 'M'
status: 'todo'
---

# T11 — Record the Warehouse's own Delivery Address end to end: Workspace-guarded command, route, contract and detail-pane section

## Why

A member cannot give a supplier a delivery point for their own site, which makes the ordinary Via Warehouse case as unrecorded as the new one. Its subject is the **Warehouse record**, which `workspaces` already classifies as a Workspace Capability beside renaming and archiving — so this is one vertical slice under a different guard from everything else here. Derives from [spec.md §5 AC-10](../spec.md), [sad.md §4](../sad.md) and [design-handoff.md § Resolved here](../design-handoff.md).

## What

Add the record-or-correct command to `warehouses/usecases`, serve it at `PUT /api/v1/workspace/warehouses/{warehouseId}/delivery-address` under `WAREHOUSES:ADDRESS_UPDATE` through `WorkspaceAccessGuard`, extend the `workspaces` contracts subpath, and insert the Delivery address section into `WarehouseDetailPane.tsx` between the warehouse-name form and the people list (frame `e12gwk`), gated by `WorkspacePermissionGate`.

## Definition of Done

- [ ] The address and access notes are recorded and corrected in place; **no path deactivates them**.
- [ ] The endpoint is denied without the Workspace Permission and permitted with it.
- [ ] The section is **absent**, not disabled, for a member without `WAREHOUSES:ADDRESS_UPDATE`.
- [ ] The address is readable from the Warehouse-scoped draft and line projections by a member holding no Workspace Role at all.
- [ ] en/uk keys reach parity and the locale baseline is regenerated in its existing key order.
- [ ] `pnpm --filter @warehouser/web build` passes.
- [ ] lint + vet clean.

## Notes

A deliberately accepted consequence ([sad.md §11](../sad.md)): a member who works in the Warehouse but holds no Workspace Role cannot record its gate code. The address is the operator's own premises data and is **not** gated on `CUSTOMERS:WATCH`. Kept as one slice because it is one AC across a thin command, one route and one section.
