import { ErrorCode } from '@warehouser/shared-types/enums';
import { ApplicationError } from '@warehouser/shared-types/errors';
import type { CustomerOrderState } from 'shared/domain/entities/customer-order.entity';

// AC-18 — the three bounds Arrival Confirmation's demand effect enforces, matched exactly to
// openapi.yaml `ArrivalConfirmationConflict` `boundsFailed`'s `details.violations` shape so the
// member is told which assignment is refused and why.
export interface AllocationsExceedReceivedQuantityViolation {
  readonly purchaseDraftLineId: string;
  readonly rule: 'allocations_exceed_received_quantity';
  readonly receivedQuantity: number;
  readonly allocatedQuantity: number;
}

export interface ExceedsOutstandingQuantityViolation {
  readonly purchaseDraftLineLinkId: string;
  readonly rule: 'exceeds_outstanding_quantity';
  readonly outstandingQuantity: number;
  readonly allocatedQuantity: number;
}

export interface CustomerOrderNotUnfulfilledViolation {
  readonly purchaseDraftLineLinkId: string;
  readonly rule: 'customer_order_not_unfulfilled';
  readonly customerOrderState: CustomerOrderState;
  // AC-18/AC-16 — when that order moved, so the refusal reads "Baltic Freight OÜ — cancelled on
  // 24 Aug, so nothing can be assigned to it" rather than leaving the member to work out which
  // cancellation is meant (design frame `s5EPi.png`). Named for the move rather than for the
  // cancellation because the same bound refuses an order that became Fulfilled. `null` when the
  // link resolved to no Customer Order this transaction could lock — the non-enumerating refusal
  // reports a state of `cancelled` it read from nothing, and there is no moment to report with it.
  readonly customerOrderLastChangedAt: string | null;
}

export type AllocationBoundViolation =
  | AllocationsExceedReceivedQuantityViolation
  | ExceedsOutstandingQuantityViolation
  | CustomerOrderNotUnfulfilledViolation;

// spec.md §6 "Arrival atomicity" — every failing bound is named together, not just the first one
// found, so the whole confirmation is refused and the member corrects it in one pass.
export const demandAllocationOutOfBoundsError = (
  violations: readonly AllocationBoundViolation[],
): ApplicationError =>
  new ApplicationError(ErrorCode.PURCHASE_DRAFTS_ALLOCATION_OUT_OF_BOUNDS, {
    violations,
  });
