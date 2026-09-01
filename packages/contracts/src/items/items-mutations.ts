import { unitOfMeasureSchema } from 'items/items-projections';
import { z } from 'zod';

// openapi.yaml `ItemCreate` — the Item is recorded active with nothing on hand; neither is an
// input (AC-06).
export const itemCreateSchema = z.strictObject({
  sku: z.string().min(1),
  description: z.string().min(1),
  unitOfMeasure: unitOfMeasureSchema,
});

// openapi.yaml `ItemUpdate` — every property is optional; at least one must be present (AC-06b,
// AC-06c).
export const itemUpdateSchema = z
  .strictObject({
    sku: z.string().min(1).optional(),
    description: z.string().min(1).optional(),
    unitOfMeasure: unitOfMeasureSchema.optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one Item field must be present',
  });

// openapi.yaml `OnHandAdjustmentCreate` — the figure is the count itself, never an increase or
// decrease (AC-09); the reason is never optional (AC-09a).
export const onHandAdjustmentCreateSchema = z.strictObject({
  countedQuantity: z.number().int().nonnegative(),
  reason: z.string().min(1),
});

// `GET .../items` `active` query parameter (AC-06a) — `true` narrows to Items that are not
// deactivated; omitted returns every Item, Inactive ones included (AC-06d). Query parameters
// arrive as strings, so `active` is read from the literal `"true"`/`"false"` rather than
// `z.coerce.boolean()`, which treats every non-empty string — `"false"` included — as `true`.
export const itemListQuerySchema = z.strictObject({
  active: z
    .enum(['true', 'false'])
    .optional()
    .transform((value) => (value === undefined ? undefined : value === 'true')),
});

export type ItemCreate = z.infer<typeof itemCreateSchema>;
export type ItemUpdate = z.infer<typeof itemUpdateSchema>;
export type OnHandAdjustmentCreate = z.infer<
  typeof onHandAdjustmentCreateSchema
>;
export type ItemListQuery = z.infer<typeof itemListQuerySchema>;
