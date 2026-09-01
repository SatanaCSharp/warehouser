import { z } from 'zod';

// openapi.yaml `UnitOfMeasure` — free text bounded by `items.unit_of_measure varchar(32)`,
// deliberately not an enum (the model enumerates no set).
export const unitOfMeasureSchema = z.string().min(1).max(32);

export const itemLatestAdjustmentSchema = z.strictObject({
  countedQuantity: z.number().int().nonnegative(),
  reason: z.string().min(1),
  // AC-08 — the adjustment is recorded with "the reason, the acting member, and the time", and the
  // Items table's On hand reason line states all three: `24 Aug · cycle count · by you`
  // (design frame `XIvAZ.png`; design-handoff.md calls that line part of the contract). The id is
  // what `onHandAdjustmentSchema` already discloses on the write path, so this adds no new fact —
  // it puts the fact the read path was missing beside the two it already carried.
  adjustedByUserId: z.string().uuid(),
  adjustedAt: z.string().datetime(),
});

// openapi.yaml `Item` — a distinct good the Warehouse can be asked for, identified by a SKU unique
// within that Warehouse (AC-06, AC-07, AC-07a).
export const itemSchema = z.strictObject({
  id: z.string().uuid(),
  sku: z.string().min(1),
  description: z.string().min(1),
  unitOfMeasure: unitOfMeasureSchema,
  onHandQuantity: z.number().int().nonnegative(),
  deactivatedAt: z.string().datetime().nullable(),
  // AC-06c — what names this Item, and therefore whether its SKU is still correctable. Both counts
  // are taken over **every** Customer Order and **every** Purchase Draft Line carrying the Item's
  // id, whatever state that order or that draft is in: that is the same rule the server enforces
  // the SKU with (`ItemCatalogueRepository.isNamedByDemandOrDraft`), so a member reading
  // `Named by 3 customer orders and 1 draft line` and a member reading
  // `Nothing names it yet — its SKU is still correctable` are being told exactly what a correction
  // attempt would do (design frame `XIvAZ.png`). Both zero ⟺ the SKU may still be corrected.
  namingCustomerOrderCount: z.number().int().nonnegative(),
  namingPurchaseDraftLineCount: z.number().int().nonnegative(),
  latestAdjustment: itemLatestAdjustmentSchema.nullable(),
  createdAt: z.string().datetime(),
});

// openapi.yaml `OnHandAdjustment` — one immutable row of the append-only adjustment history
// (AC-08).
export const onHandAdjustmentSchema = z.strictObject({
  id: z.string().uuid(),
  itemId: z.string().uuid(),
  countedQuantity: z.number().int().nonnegative(),
  reason: z.string().min(1),
  adjustedByUserId: z.string().uuid(),
  createdAt: z.string().datetime(),
});

export type ItemLatestAdjustment = z.infer<typeof itemLatestAdjustmentSchema>;
export type Item = z.infer<typeof itemSchema>;
export type OnHandAdjustment = z.infer<typeof onHandAdjustmentSchema>;
