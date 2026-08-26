import { z } from 'zod';

// openapi.yaml `UnitOfMeasure` — free text bounded by `items.unit_of_measure varchar(32)`,
// deliberately not an enum (the model enumerates no set).
export const unitOfMeasureSchema = z.string().min(1).max(32);

export const itemLatestAdjustmentSchema = z.strictObject({
  countedQuantity: z.number().int().nonnegative(),
  reason: z.string().min(1),
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
