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
