---
id: T3
title: 'Add the two new shared persistence entities and give PurchaseDraftLineEntity its two conformance columns'
layer: 'infra'
deps: [T1]
acs: ['AC-05', 'AC-13', 'AC-15', 'AC-18', 'AC-24']
files_hint:
  - 'apps/server/src/shared/domain/entities/'
  - 'apps/server/src/shared/domain/domain.module.ts'
owner: 'Backend Lead'
estimate: 'S'
status: 'todo'
---

# T3 — Add the two new shared persistence entities

## Why

Three repositories (T4, T5, T6) and every command downstream read and write these rows; nothing can be
built against the migrated relations until the entities map them. Derives from
[sad.md §5](../sad.md) § "Server and shared boundary" and
[data-model.md §Repository boundaries](../data-model.md).

## What

Add `RejectionReasonEntity` (identifier, label, `requiresDescription`, timestamps — the
`PackagingTypeEntity` shape plus one flag) and `PurchaseDraftLineRejectionEntity` (line, Warehouse,
delivery mode, quantity, Reason reference, Source, description, Disposition, raising member and time,
amending member and time) to `apps/server/src/shared/domain/entities/`. Extend
`PurchaseDraftLineEntity` with `preReceiptConformance` and `preReceiptConformanceNote`. Register all
of them on `DomainModule`.

Entities carry **column names and types only** — every `CHECK`, `DEFAULT` and collation lives in the
migration, per the repo's convention. `deliveryMode` and `source` are typed as string unions declared
beside their columns, as `PurchaseDraftLineDeliveryMode` and `CustomerOrderState` already are, so
both `shared/domain/repositories/` and `purchase-drafts` read them without either depending on the
other.

## Definition of Done

- [ ] `RejectionReasonEntity` and `PurchaseDraftLineRejectionEntity` map to the relations T1 created,
      column for column, with no column the migration did not create.
- [ ] `PurchaseDraftLineRejectionEntity` carries `warehouseId` and `deliveryMode` — the two columns its
      composite reference needs (AC-24, AC-25) — and does **not** carry `purchaseDraftId`, which
      [data-model.md](../data-model.md) records as deliberately absent.
- [ ] `PurchaseDraftLineEntity` carries both conformance columns as nullable.
- [ ] `DomainModule` resolves all three; a DI spec proves it.
- [ ] An integration test round-trips a row of each new entity and of the changed one, asserting the
      amendment attribution pair (`amendedByUserId` + `amendedAt`) is written together or not at all.
- [ ] No entity declares a `CHECK`, a `DEFAULT` or a collation.
- [ ] `pnpm --filter @warehouser/server test`, `test:integration`, `lint` and `build` are green.

## Notes

`createdAt` **is** the raising time and there is no `raisedAt` — this follows
`arrival_allocations.allocated_by_user_id`/`created_at` and
`item_stock_adjustments.adjusted_by_user_id`/`created_at`, the repo's two existing attributed rows.
`amendedAt` is not `updatedAt` and both are kept ([data-model.md](../data-model.md)
§ `purchase_draft_line_rejections`).

Mapping to feature domain objects belongs in `purchase-drafts/domain/mappers/`, not here.
