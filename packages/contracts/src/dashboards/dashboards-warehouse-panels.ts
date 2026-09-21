import {
  ageBandSchema,
  arrivalTimingBucketKindSchema,
  ianaTimeZoneSchema,
} from 'dashboards/dashboards-vocabulary';
import { rejectionReasonIdSchema } from 'purchase-drafts/purchase-drafts-projections';
import { z } from 'zod';

// ---- Coverage Gap (openapi.yaml `CoverageGapPanel`, `CoverageGapRow`, `CoverageGapRemainder`) ----
// AC-03, AC-04, AC-05, AC-06, AC-06a, AC-08, AC-11, AC-25

export const coverageGapRowSchema = z.strictObject({
  itemId: z.uuid(),
  sku: z.string().min(1),
  totalOutstandingQuantity: z.number().int().nonnegative(),
  onHandQuantity: z.number().int().nonnegative(),
  inboundQuantity: z.number().int().nonnegative(),
  // Never negative: an Item covered beyond its demand reports `0` rather than a surplus (AC-05).
  uncoveredQuantity: z.number().int().nonnegative(),
});

export const coverageGapRemainderSchema = z.strictObject({
  itemCount: z.number().int().min(1),
  totalOutstandingQuantity: z.number().int().nonnegative(),
  onHandQuantity: z.number().int().nonnegative(),
  inboundQuantity: z.number().int().nonnegative(),
  uncoveredQuantity: z.number().int().nonnegative(),
});

// Bounded by the server at ten named rows plus at most one Remainder Row (spec.md §6 "Row
// bounding"), so the client neither pages nor truncates (AC-03). `remainder` is `null` while ten or
// fewer Items qualify — not a row of zeros.
export const coverageGapPanelSchema = z.strictObject({
  rows: z.array(coverageGapRowSchema).max(10),
  remainder: coverageGapRemainderSchema.nullable(),
});

// ---- Arrival Timing (openapi.yaml `ArrivalTimingPanel`, `ArrivalTimingBucket`,
// `ArrivalTimingExclusions`) — AC-07, AC-08, AC-08a --------------------------------------------

export const arrivalTimingBucketSchema = z.strictObject({
  kind: arrivalTimingBucketKindSchema,
  // The Monday the week begins on, in `timezone`. `null` on the `overdue` bucket, which is not a
  // week.
  weekStart: z.iso.date().nullable(),
  owedQuantity: z.number().int().nonnegative(),
  // Never netted against `owedQuantity` — no record links a week's arrivals to that week's demand.
  expectedQuantity: z.number().int().nonnegative(),
});

// The four things this Panel leaves out, each with its own stated count, computed by the same
// statement (AC-07, AC-08a, spec.md §6 "Exclusion accounting" at 100%). Every count below is
// required, never optional — they are fields rather than a second read because a client that
// subtracts cannot hold that target.
export const arrivalTimingExclusionsSchema = z.strictObject({
  beyondHorizon: z.strictObject({
    owedQuantity: z.number().int().nonnegative(),
    customerOrderCount: z.number().int().nonnegative(),
  }),
  undatedReadyDrafts: z.strictObject({
    draftCount: z.number().int().nonnegative(),
    orderedQuantity: z.number().int().nonnegative(),
  }),
  datedDraftsStillInDraft: z.strictObject({
    draftCount: z.number().int().nonnegative(),
    orderedQuantity: z.number().int().nonnegative(),
  }),
  // Count only — no criterion asks for this exclusion's quantity (AC-07).
  draftsSinceClosedOrDiscarded: z.strictObject({
    draftCount: z.number().int().nonnegative(),
  }),
});

// Exactly nine buckets, in order: the `overdue` bucket, then the eight weeks beginning with the
// week in progress (AC-07). A bucket with nothing in it is present and reports `0`.
export const arrivalTimingPanelSchema = z.strictObject({
  timezone: ianaTimeZoneSchema,
  buckets: z.array(arrivalTimingBucketSchema).length(9),
  exclusions: arrivalTimingExclusionsSchema,
});

// ---- Purchasing Pipeline (openapi.yaml `PurchasingPipelinePanel`, `PurchasingPipelineStateRow`,
// `PurchasingPipelineBand`) — AC-10, AC-11 -------------------------------------------------------

// openapi.yaml `OpenPurchaseDraftState` — the two states the Purchasing Pipeline counts, a
// narrowing of `purchaseDraftStateSchema` stated separately so the Panel's own bound is in the
// contract rather than in prose (AC-11).
export const openPurchaseDraftStateSchema = z.enum([
  'draft',
  'ready_for_ordering',
]);

export const purchasingPipelineBandSchema = z.strictObject({
  ageBand: ageBandSchema,
  draftCount: z.number().int().nonnegative(),
});

export const purchasingPipelineStateRowSchema = z.strictObject({
  state: openPurchaseDraftStateSchema,
  // All four Age Bands, in order, a band with no draft reporting `0` (AC-10).
  bands: z.array(purchasingPipelineBandSchema).length(4),
});

// Exactly two rows, `draft` then `ready_for_ordering` (AC-11). Counts drafts, never quantities.
export const purchasingPipelinePanelSchema = z.strictObject({
  states: z.array(purchasingPipelineStateRowSchema).length(2),
});

// ---- Reason Concentration (openapi.yaml `ReasonConcentrationPanel`, `ReasonConcentrationRow`,
// `ReasonConcentrationRemainder`) — AC-12 ---------------------------------------------------------

export const reasonConcentrationRowSchema = z.strictObject({
  rejectionReasonId: rejectionReasonIdSchema,
  label: z.string().min(1).max(100),
  refusedQuantity: z.number().int().nonnegative(),
  sharePercent: z.number().min(0).max(100),
  cumulativeSharePercent: z.number().min(0).max(100),
  // Not a segment of the bar: a Rejection can be both undecided and customer-reported, so stacking
  // these would double-count it (AC-12). Either may equal `refusedQuantity`.
  undecidedQuantity: z.number().int().nonnegative(),
  customerReportedQuantity: z.number().int().nonnegative(),
});

export const reasonConcentrationRemainderSchema = z.strictObject({
  reasonCount: z.number().int().min(1),
  refusedQuantity: z.number().int().nonnegative(),
  undecidedQuantity: z.number().int().nonnegative(),
  customerReportedQuantity: z.number().int().nonnegative(),
});

// At most ten Reasons plus one Remainder Row, ordered by refused quantity descending. `remainder`
// is `null`, not a row of zeros, while nothing has been gathered into one (AC-12).
export const reasonConcentrationPanelSchema = z.strictObject({
  totalRefusedQuantity: z.number().int().nonnegative(),
  rows: z.array(reasonConcentrationRowSchema).max(10),
  remainder: reasonConcentrationRemainderSchema.nullable(),
});

export type CoverageGapRow = z.infer<typeof coverageGapRowSchema>;
export type CoverageGapRemainder = z.infer<typeof coverageGapRemainderSchema>;
export type CoverageGapPanel = z.infer<typeof coverageGapPanelSchema>;
export type ArrivalTimingBucket = z.infer<typeof arrivalTimingBucketSchema>;
export type ArrivalTimingExclusions = z.infer<
  typeof arrivalTimingExclusionsSchema
>;
export type ArrivalTimingPanel = z.infer<typeof arrivalTimingPanelSchema>;
export type OpenPurchaseDraftState = z.infer<
  typeof openPurchaseDraftStateSchema
>;
export type PurchasingPipelineBand = z.infer<
  typeof purchasingPipelineBandSchema
>;
export type PurchasingPipelineStateRow = z.infer<
  typeof purchasingPipelineStateRowSchema
>;
export type PurchasingPipelinePanel = z.infer<
  typeof purchasingPipelinePanelSchema
>;
export type ReasonConcentrationRow = z.infer<
  typeof reasonConcentrationRowSchema
>;
export type ReasonConcentrationRemainder = z.infer<
  typeof reasonConcentrationRemainderSchema
>;
export type ReasonConcentrationPanel = z.infer<
  typeof reasonConcentrationPanelSchema
>;
