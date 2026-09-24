import { z } from 'zod';

// openapi.yaml `AgeBand` — which of four spans one Purchase Draft's Draft Age falls into
// (CONTEXT.md "Age Band", AC-10). The age is measured from the moment the draft entered the state
// it stands in and the band is a case over that derived age, computed in the statement. Not a
// deadline, an escalation or an expiry — nothing happens to a draft because of the band it is in.
export const ageBandSchema = z.enum([
  'up_to_7_days',
  'from_8_to_14_days',
  'from_15_to_30_days',
  'over_30_days',
]);

// openapi.yaml `UrgencyBand` — which of three bands one Customer Order's Outstanding Quantity falls
// into, read from its `needed_by` against the day it is read (CONTEXT.md "Urgency Band", AC-14). The
// three partition the demand, so every quantity reported under this vocabulary sums to the
// Warehouse's `totalOutstandingQuantity`.
export const urgencyBandSchema = z.enum(['overdue', 'due_soon', 'later']);

// openapi.yaml `ArrivalTimingBucketKind` — which kind of bucket one position on the Arrival Timing
// axis is: exactly one `overdue` bucket, first, then eight `week` buckets (AC-07). `overdue` is not
// a week and carries no `weekStart`.
export const arrivalTimingBucketKindSchema = z.enum(['overdue', 'week']);

// openapi.yaml `ArchivedWarehouseCount` — how many of the Workspace's Warehouses are archived and
// therefore absent from a Workspace Panel (spec.md §8 default, the exclusion accounting spec.md §6
// sets at 100%). Required on every Workspace Panel, never optional.
export const archivedWarehouseCountSchema = z.number().int().nonnegative();

// openapi.yaml `IanaTimeZone` — the one deployment timezone every week boundary and date comparison
// in this feature is computed in (`APP_TIMEZONE`, default `UTC`). Carried on the two Panels that
// label a week. Not a column, not a per-Warehouse or per-user setting.
export const ianaTimeZoneSchema = z.string().max(64);

export type AgeBand = z.infer<typeof ageBandSchema>;
export type UrgencyBand = z.infer<typeof urgencyBandSchema>;
export type ArrivalTimingBucketKind = z.infer<
  typeof arrivalTimingBucketKindSchema
>;
export type ArchivedWarehouseCount = z.infer<
  typeof archivedWarehouseCountSchema
>;
export type IanaTimeZone = z.infer<typeof ianaTimeZoneSchema>;
