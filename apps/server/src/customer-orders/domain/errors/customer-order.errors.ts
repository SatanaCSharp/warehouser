import { ErrorCode } from '@warehouser/shared-types/enums';
import { ApplicationError } from '@warehouser/shared-types/errors';

// AC-02/AC-19a — the response names the value it will not accept and nothing else. It never echoes
// the value itself: `customerName` is the first personal data the product holds (spec.md §6.1) and
// "appears in no log line, no error detail and no denial payload". openapi.yaml
// `InvalidCustomerOrderInput` `invalidQuantityOrName` and `cancellationReasonMissing` examples:
// `details: { field, rule }`.
export const customerOrderInvalidInputError = (
  field: 'quantity' | 'customerName' | 'neededBy' | 'cancellationReason',
  rule: string,
): ApplicationError =>
  new ApplicationError(ErrorCode.CUSTOMER_ORDERS_INVALID_INPUT, {
    field,
    rule,
  });

// AC-02a/AC-19 — a customer cannot be recorded as waiting for a date in the past, and an amendment
// cannot move the date to one. openapi.yaml `neededByInPast` example: `details: { field }`.
export const customerOrderNeededByInPastError = (): ApplicationError =>
  new ApplicationError(ErrorCode.CUSTOMER_ORDERS_NEEDED_BY_IN_PAST, {
    field: 'neededBy',
  });

// AC-03 — one non-enumerating outcome for an Item of another Warehouse, a missing Item and an
// Inactive one, so recording demand never discloses that an Item exists elsewhere. It carries the
// contract's `ItemUnavailable` code because that is the response the member sees; the code lives in
// `@warehouser/shared-types`, so naming it here creates no dependency on the `items` module
// (server-architecture.md §Dependency direction).
export const customerOrderItemUnavailableError = (): ApplicationError =>
  new ApplicationError(ErrorCode.ITEMS_TARGET_UNAVAILABLE);

// openapi.yaml `CustomerOrderUnavailable` — one non-enumerating outcome for a Customer Order of
// another Warehouse and for one that does not exist.
export const customerOrderTargetUnavailableError = (): ApplicationError =>
  new ApplicationError(ErrorCode.CUSTOMER_ORDERS_TARGET_UNAVAILABLE);

// AC-19b — the change is blocked and the order is left exactly as it was. Both figures belong to
// the member's own Warehouse, so naming them discloses nothing, and naming them is what makes the
// refusal actionable. openapi.yaml `belowAllocated` example:
// `details: { allocatedQuantity, submittedQuantity }`.
export const customerOrderQuantityBelowAllocatedError = (
  allocatedQuantity: number,
  submittedQuantity: number,
): ApplicationError =>
  new ApplicationError(ErrorCode.CUSTOMER_ORDERS_QUANTITY_BELOW_ALLOCATED, {
    allocatedQuantity,
    submittedQuantity,
  });

// openapi.yaml `invalidState` — a cancelled order is not amended or cancelled again. Carries no
// `details`.
export const customerOrderInvalidStateError = (): ApplicationError =>
  new ApplicationError(ErrorCode.CUSTOMER_ORDERS_INVALID_STATE);

// `chk_customer_orders_customer_identity` as a payload refusal — "an order names a Customer with
// one of its Delivery Addresses, or a typed customer name with no address; never both and never
// neither" (data-model.md §`customer_orders`). openapi.yaml `InvalidCustomerOrderInput` carries the
// rule and **no field**, because the refusal is about the combination rather than about one value —
// and because naming the value would echo the typed customer name, which appears in no error detail
// (spec.md §6.1).
export type CustomerOrderIdentityRule =
  | 'customer_identity_exclusive'
  | 'customer_identity_required'
  | 'delivery_address_requires_customer';

export const customerOrderCustomerIdentityError = (
  rule: CustomerOrderIdentityRule,
): ApplicationError =>
  new ApplicationError(ErrorCode.CUSTOMER_ORDERS_INVALID_INPUT, { rule });

// AC-12 — a Customer that does not exist and one that exists only in another Warehouse are **one**
// non-enumerating outcome, so recording demand never discloses that a Customer exists elsewhere
// (openapi.yaml `CustomerOrderTargetUnavailable`, `customerElsewhere`). It carries no details for
// exactly that reason. The code lives in `@warehouser/shared-types`, so naming it here creates no
// dependency on the `customers` module (server-architecture.md §Dependency direction).
export const customerOrderCustomerUnavailableError = (): ApplicationError =>
  new ApplicationError(ErrorCode.CUSTOMERS_TARGET_UNAVAILABLE);

// AC-11/AC-11c — the destination a Customer Order may be given: an **active** Delivery Address of
// the Customer it names. An Inactive address, an address of another Customer, one that does not
// exist, an Inactive Customer, and an order recorded by typed name that names no Customer at all
// are one outcome (openapi.yaml `CustomerOrderDestinationConflict`,
// `CustomerOrderRedirectConflict`). It carries no details: the address text and its access notes
// are confidential and appear in no denial payload (sad.md §8).
export const customerOrderInvalidDeliveryAddressError = (): ApplicationError =>
  new ApplicationError(ErrorCode.CUSTOMER_ORDERS_INVALID_DELIVERY_ADDRESS);
