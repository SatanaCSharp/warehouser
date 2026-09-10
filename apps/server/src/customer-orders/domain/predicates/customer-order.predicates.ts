import type { CustomerOrderState } from 'shared/domain/entities/customer-order.entity.js';

// Pure predicates for the Customer Order lifecycle (server-error-handling.md §1). No NestJS, HTTP
// or TypeORM import here — see `customer-orders/domain/errors/customer-order.errors.ts` for the
// named error factories that pair with these conditions and `domain/services/` for their
// enforcement via `assert`.

// AC-02 / data-model.md `customer_orders.quantity` INTEGER NOT NULL `> 0` — a customer waits for a
// positive whole number of an Item. `Number.isInteger` also rejects `NaN` and both infinities.
export const isDemandQuantity = (quantity: number): boolean =>
  Number.isInteger(quantity) && quantity > 0;

// AC-02 / `chk_customer_orders_customer_name_stored_trimmed` — a name of nothing but whitespace
// names no customer.
export const isCustomerName = (customerName: string): boolean =>
  customerName.trim().length > 0;

// AC-19a / `chk_customer_orders_cancellation_reason_stored_trimmed` — a cancellation always states
// why.
export const isCancellationReason = (reason: string): boolean =>
  reason.trim().length > 0;

const CALENDAR_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/u;

// data-model.md `customer_orders.needed_by DATE` — "a calendar date, not an instant". Only the one
// shape that compares correctly is accepted, and the round trip through `Date` rejects the dates
// that look well-formed but do not exist: `2026-02-30` parses and rolls forward to March, while
// `2026-13-01` does not parse at all. A predicate never throws (server-error-handling.md §1), so
// the unparseable case is checked before `toISOString` is reached.
export const isCalendarDate = (value: string): boolean => {
  if (!CALENDAR_DATE_PATTERN.test(value)) {
    return false;
  }

  const parsed = new Date(`${value}T00:00:00.000Z`);

  return (
    !Number.isNaN(parsed.getTime()) && parsed.toISOString().startsWith(value)
  );
};

// AC-02a / AC-19 — a customer cannot be recorded as waiting for a date that has already passed,
// and an amendment cannot move the date to one. Today itself is still ahead: a customer waiting for
// goods today is an ordinary state, not a refusal. Both operands are calendar dates in the one
// shape `isCalendarDate` accepts, which orders correctly under a plain string comparison.
export const isNeededByStillAhead = (
  neededBy: string,
  today: string,
): boolean => neededBy >= today;

// AC-19b — a customer's order is never reduced below the goods already attributed to them, because
// those goods sit in the Transit Zone under that customer's name. Equality is allowed: reducing the
// order to exactly what has arrived for it leaves nothing unaccounted for.
export const isQuantityAtOrAboveAllocated = (
  quantity: number,
  allocatedQuantity: number,
): boolean => quantity >= allocatedQuantity;

// openapi.yaml `CustomerOrderWriteConflict` `invalidState` — "a cancelled order is not amended or
// cancelled again". A Fulfilled one still may be: AC-19 requires raising its quantity to return it
// to the consolidated demand.
export const canAmendCustomerOrder = (state: CustomerOrderState): boolean =>
  state !== 'cancelled';

export const canCancelCustomerOrder = (state: CustomerOrderState): boolean =>
  state !== 'cancelled';

// The persistence-shaped facts a destination decision needs. Only what the rules below read: the
// address text and the access notes are confidential and no condition consults them (sad.md §8).
export interface DeactivatableRecord {
  readonly deactivatedAt: Date | null;
}

export interface WarehouseOwnedRecord {
  readonly warehouseId: string;
}

// AC-06a/AC-11 — "active" is the absence of a deactivation instant, the same way `warehouses.
// archived_at` and `items.deactivated_at` say it. One condition for the Customer and for the
// Delivery Address alike, and it answers `false` for a record that resolved to nothing, because a
// destination that is not there is not one demand may be recorded against.
export const isAvailableDestinationRecord = (
  record: DeactivatableRecord | null | undefined,
): boolean =>
  record !== null && record !== undefined && record.deactivatedAt === null;

// AC-12 — the record resolves in the acting Warehouse or it does not resolve at all, so one of
// another Warehouse and one that does not exist are indistinguishable (spec.md §6.1).
export const isRecordOfWarehouse = (
  record: WarehouseOwnedRecord | null | undefined,
  warehouseId: string,
): boolean =>
  record !== null && record !== undefined && record.warehouseId === warehouseId;

// `chk_customer_orders_customer_identity` — an order names a Customer, or a typed customer name;
// never both and never neither. Absence is `undefined` at the application boundary and `null` in
// the row, and neither counts as naming anything.
export const namesExactlyOneCustomerIdentity = (
  customerId: string | null | undefined,
  customerName: string | null | undefined,
): boolean =>
  (customerId === null || customerId === undefined) !==
  (customerName === null || customerName === undefined);

// AC-11c / openapi.yaml `CustomerOrderRedirectConflict` `orderNotOutstanding` — "Only an
// outstanding Customer Order is redirected". Narrower than `canAmendCustomerOrder`: a Fulfilled
// order may still be amended back into the demand, but it is not redirected.
export const isRedirectableCustomerOrder = (
  state: CustomerOrderState,
): boolean => state === 'unfulfilled';
