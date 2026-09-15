import type { CustomerOrderState } from 'shared/domain/entities/customer-order.entity';

// AC-18's three bounds (server-error-handling.md §1 — pure, domain-named predicates), asked by
// `domain/services/demand-allocation.service.ts` when it collects the violations of an allocation.

export const exceedsAssignableQuantity = (
  allocatedQuantity: number,
  assignableQuantity: number,
): boolean => allocatedQuantity > assignableQuantity;

export const exceedsOutstandingQuantity = (
  allocatedQuantity: number,
  outstandingQuantity: number,
): boolean => allocatedQuantity > outstandingQuantity;

export const isUnfulfilled = (state: CustomerOrderState): boolean =>
  state === 'unfulfilled';

// AC-19 — whether an order still wants goods. The figure decides the demand state at two sites, the
// allocation service and the amendment command, so it is one question rather than two comparisons
// that could disagree about whether zero is outstanding.
export const hasOutstandingDemand = (outstandingQuantity: number): boolean =>
  outstandingQuantity > 0;

// Whether an order has been changed since it was recorded. A row written once carries an
// `updatedAt` equal to (or, across clock granularity, not later than) its `createdAt`, and that is
// not a change — reporting it as one would give every untouched order a "last changed" moment.
export const wasChangedAfterCreation = (
  createdAt: Date,
  updatedAt: Date,
): boolean => updatedAt.getTime() > createdAt.getTime();
