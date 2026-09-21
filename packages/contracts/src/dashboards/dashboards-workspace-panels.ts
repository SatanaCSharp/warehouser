import {
  archivedWarehouseCountSchema,
  ianaTimeZoneSchema,
} from 'dashboards/dashboards-vocabulary';
import { purchaseDraftStateSchema } from 'purchase-drafts/purchase-drafts-projections';
import { z } from 'zod';

// ---- Demand Pressure (openapi.yaml `DemandPressurePanel`, `DemandPressureWarehouse`) — AC-14 ----

export const demandPressureWarehouseSchema = z.strictObject({
  warehouseId: z.uuid(),
  warehouseName: z.string().min(1).max(100),
  overdueQuantity: z.number().int().nonnegative(),
  dueSoonQuantity: z.number().int().nonnegative(),
  laterQuantity: z.number().int().nonnegative(),
  // The three bands summed: they partition the demand, so this always equals
  // overdueQuantity + dueSoonQuantity + laterQuantity (AC-14).
  totalOutstandingQuantity: z.number().int().nonnegative(),
});

// Every active Warehouse of the Workspace, including one with nothing outstanding — the population
// is bounded at 20 by spec.md §1, so this Panel pages nothing and carries no Remainder Row.
export const demandPressurePanelSchema = z.strictObject({
  archivedWarehouseCount: archivedWarehouseCountSchema,
  warehouses: z.array(demandPressureWarehouseSchema),
});

// ---- Order Flow (openapi.yaml `OrderFlowPanel`, `OrderFlowWeek`) — AC-04, AC-16, AC-17, AC-17a --

export const orderFlowWeekSchema = z.strictObject({
  weekStart: z.iso.date(),
  // The week's whole, every state, cancelled ones included — the one place on either surface a
  // cancelled order contributes (AC-04, AC-16). Read as it stands, not as it stood (AC-17a).
  recordedQuantity: z.number().int().nonnegative(),
  // Added against the week the order was recorded rather than the week the goods arrived (AC-17).
  assignedQuantity: z.number().int().nonnegative(),
  // The cancelled orders' retained outstanding quantity, withdrawn from the week's whole rather
  // than demand the Workspace still carries.
  cancelledQuantity: z.number().int().nonnegative(),
  // recordedQuantity - assignedQuantity - cancelledQuantity, carried as a field so the client
  // subtracts nothing.
  stillAwaitedQuantity: z.number().int().nonnegative(),
});

// Exactly twelve weeks, oldest first, the last being the week in progress. A week with nothing
// recorded in it is present and reports `0` — the axis is fixed, not a client-truncated tail.
export const orderFlowPanelSchema = z.strictObject({
  timezone: ianaTimeZoneSchema,
  archivedWarehouseCount: archivedWarehouseCountSchema,
  weeks: z.array(orderFlowWeekSchema).length(12),
});

// ---- Purchasing Spread (openapi.yaml `PurchasingSpreadPanel`, `PurchasingSpreadWarehouse`,
// `PurchasingSpreadCell`) — AC-18 -------------------------------------------------------------

export const purchasingSpreadCellSchema = z.strictObject({
  // All four states, `closed` and `discarded` included — the one Panel on either surface that
  // counts a draft the open-state rule excludes everywhere else (AC-18).
  state: purchaseDraftStateSchema,
  draftCount: z.number().int().nonnegative(),
});

export const purchasingSpreadWarehouseSchema = z.strictObject({
  warehouseId: z.uuid(),
  warehouseName: z.string().min(1).max(100),
  // All four Purchase Draft states, in order, a pairing with no draft reporting `0` (AC-18).
  counts: z.array(purchasingSpreadCellSchema).length(4),
});

export const purchasingSpreadPanelSchema = z.strictObject({
  archivedWarehouseCount: archivedWarehouseCountSchema,
  warehouses: z.array(purchasingSpreadWarehouseSchema),
});

// ---- Receipt Reliability (openapi.yaml `ReceiptReliabilityPanel`, `ReceiptReliabilityWarehouse`,
// `ReceiptReliabilityExclusions`) — AC-19, AC-20, AC-20a, AC-20b --------------------------------

// How much of this Warehouse's record each exclusion covers (AC-20). The six are not disjoint and
// nothing here should be summed. Every count is required, never optional.
export const receiptReliabilityExclusionsSchema = z.strictObject({
  undatedLineCount: z.number().int().nonnegative(),
  noEndingRecordedLineCount: z.number().int().nonnegative(),
  nothingReceivedLineCount: z.number().int().nonnegative(),
  directToCustomerLineCount: z.number().int().nonnegative(),
  unrecordedConformanceLineCount: z.number().int().nonnegative(),
  notApplicableConformanceLineCount: z.number().int().nonnegative(),
});

export const receiptReliabilityWarehouseSchema = z.strictObject({
  warehouseId: z.uuid(),
  warehouseName: z.string().min(1).max(100),
  // `null`, never `0`, when no line qualifies (AC-20a) — a Warehouse with no record is never read
  // as the worst or the best performer. Independently nullable from conformanceRatePercent.
  onTimeArrivalRatePercent: z.number().min(0).max(100).nullable(),
  conformanceRatePercent: z.number().min(0).max(100).nullable(),
  receivedQuantity: z.number().int().nonnegative(),
  exclusions: receiptReliabilityExclusionsSchema,
});

// Every active Warehouse, including one with no rate to report (AC-20a) — it is returned with both
// rates `null` and its exclusion counts intact.
export const receiptReliabilityPanelSchema = z.strictObject({
  archivedWarehouseCount: archivedWarehouseCountSchema,
  warehouses: z.array(receiptReliabilityWarehouseSchema),
});

export type DemandPressureWarehouse = z.infer<
  typeof demandPressureWarehouseSchema
>;
export type DemandPressurePanel = z.infer<typeof demandPressurePanelSchema>;
export type OrderFlowWeek = z.infer<typeof orderFlowWeekSchema>;
export type OrderFlowPanel = z.infer<typeof orderFlowPanelSchema>;
export type PurchasingSpreadCell = z.infer<typeof purchasingSpreadCellSchema>;
export type PurchasingSpreadWarehouse = z.infer<
  typeof purchasingSpreadWarehouseSchema
>;
export type PurchasingSpreadPanel = z.infer<typeof purchasingSpreadPanelSchema>;
export type ReceiptReliabilityExclusions = z.infer<
  typeof receiptReliabilityExclusionsSchema
>;
export type ReceiptReliabilityWarehouse = z.infer<
  typeof receiptReliabilityWarehouseSchema
>;
export type ReceiptReliabilityPanel = z.infer<
  typeof receiptReliabilityPanelSchema
>;
