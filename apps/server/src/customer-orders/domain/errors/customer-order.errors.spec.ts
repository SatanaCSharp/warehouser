// T8 — `customer-orders/domain/errors/customer-order.errors.ts` does not exist yet. This is the
// legitimate RED for the named error factories server-error-handling.md §3 requires: close to their
// assertion, `Error` suffix, accepting every value required to construct the error. Every code and
// `details` shape below is copied from `openapi.yaml`'s `InvalidCustomerOrderInput`,
// `CustomerOrderUnavailable`, `CustomerOrderWriteConflict` and `ItemUnavailable` examples, which the
// REST surface (T11) will answer with verbatim.
import { ErrorCode } from '@warehouser/shared-types/enums';
import { ApplicationError } from '@warehouser/shared-types/errors';
import {
  customerOrderCustomerIdentityError,
  customerOrderCustomerUnavailableError,
  customerOrderInvalidDeliveryAddressError,
  customerOrderInvalidInputError,
  customerOrderInvalidStateError,
  customerOrderItemUnavailableError,
  customerOrderNeededByInPastError,
  customerOrderQuantityBelowAllocatedError,
  customerOrderTargetUnavailableError,
} from 'customer-orders/domain/errors/customer-order.errors';

describe('customer order domain error factories', () => {
  // AC-02 — openapi.yaml `invalidQuantityOrName` example:
  // `details: { field: "quantity", rule: "positive_integer" }`. The factory names the value it will
  // not accept and nothing else — never the value itself, which for `customerName` is personal data.
  it('builds an ApplicationError naming the field it will not accept', () => {
    const error = customerOrderInvalidInputError(
      'quantity',
      'positive_integer',
    );

    expect(error).toBeInstanceOf(ApplicationError);
    expect(error).toMatchObject({
      code: ErrorCode.CUSTOMER_ORDERS_INVALID_INPUT,
      details: { field: 'quantity', rule: 'positive_integer' },
    });
  });

  // AC-19a — openapi.yaml `cancellationReasonMissing` example:
  // `details: { field: "cancellationReason", rule: "trimmed_non_empty" }`.
  it('names the missing cancellation reason through the same factory', () => {
    expect(
      customerOrderInvalidInputError('cancellationReason', 'trimmed_non_empty'),
    ).toMatchObject({
      code: ErrorCode.CUSTOMER_ORDERS_INVALID_INPUT,
      details: { field: 'cancellationReason', rule: 'trimmed_non_empty' },
    });
  });

  // AC-02a / AC-19 — openapi.yaml `neededByInPast` example: `details: { field: "neededBy" }`.
  it('builds an ApplicationError for a needed-by date that has already passed', () => {
    const error = customerOrderNeededByInPastError();

    expect(error).toBeInstanceOf(ApplicationError);
    expect(error).toMatchObject({
      code: ErrorCode.CUSTOMER_ORDERS_NEEDED_BY_IN_PAST,
      details: { field: 'neededBy' },
    });
  });

  // AC-03 — an Item of another Warehouse is refused **identically** to a missing one, and the
  // refusal carries the Item vocabulary the contract's `ItemUnavailable` response uses, so a member
  // cannot tell the two cases apart, let alone learn that the Item exists elsewhere.
  it('builds a non-enumerating ApplicationError for an unavailable Item target', () => {
    const error = customerOrderItemUnavailableError();

    expect(error).toBeInstanceOf(ApplicationError);
    expect(error).toMatchObject({ code: ErrorCode.ITEMS_TARGET_UNAVAILABLE });
    expect(error.details).toBeUndefined();
  });

  // openapi.yaml `CustomerOrderUnavailable` — one non-enumerating outcome for a Customer Order of
  // another Warehouse and for one that does not exist.
  it('builds a non-enumerating ApplicationError for an unavailable Customer Order', () => {
    const error = customerOrderTargetUnavailableError();

    expect(error).toBeInstanceOf(ApplicationError);
    expect(error).toMatchObject({
      code: ErrorCode.CUSTOMER_ORDERS_TARGET_UNAVAILABLE,
    });
    expect(error.details).toBeUndefined();
  });

  // AC-19b — openapi.yaml `belowAllocated` example:
  // `details: { allocatedQuantity: 80, submittedQuantity: 60 }`. Both figures are the member's own
  // Warehouse's, so naming them discloses nothing, and naming them is what makes the refusal
  // actionable rather than merely a "no".
  it('builds an ApplicationError carrying the allocated floor and the quantity submitted', () => {
    const error = customerOrderQuantityBelowAllocatedError(80, 60);

    expect(error).toBeInstanceOf(ApplicationError);
    expect(error).toMatchObject({
      code: ErrorCode.CUSTOMER_ORDERS_QUANTITY_BELOW_ALLOCATED,
      details: { allocatedQuantity: 80, submittedQuantity: 60 },
    });
  });

  // openapi.yaml `invalidState` example carries no `details`.
  it('builds an ApplicationError for an operation a cancelled order is not legal from', () => {
    const error = customerOrderInvalidStateError();

    expect(error).toBeInstanceOf(ApplicationError);
    expect(error).toMatchObject({
      code: ErrorCode.CUSTOMER_ORDERS_INVALID_STATE,
    });
    expect(error.details).toBeUndefined();
  });

  // openapi.yaml `InvalidCustomerOrderInput` `bothIdentities`/`neitherIdentity` examples:
  // `details: { rule }` and **no field**, because the refusal is about the combination and because
  // naming the value would echo the typed customer name (spec.md §6.1).
  it.each([
    'customer_identity_exclusive',
    'customer_identity_required',
    'delivery_address_requires_customer',
  ] as const)('builds an ApplicationError naming the %s rule alone', (rule) => {
    const error = customerOrderCustomerIdentityError(rule);

    expect(error).toBeInstanceOf(ApplicationError);
    expect(error).toMatchObject({
      code: ErrorCode.CUSTOMER_ORDERS_INVALID_INPUT,
      details: { rule },
    });
    expect(error.details).not.toHaveProperty('customerName');
  });

  // AC-12 — openapi.yaml `CustomerOrderTargetUnavailable` `customerElsewhere` carries no `details`,
  // so a Customer of another Warehouse and a missing one produce the identical value.
  it('builds an identical detail-free ApplicationError for any unavailable Customer', () => {
    const error = customerOrderCustomerUnavailableError();

    expect(error).toBeInstanceOf(ApplicationError);
    expect(error).toMatchObject({
      code: ErrorCode.CUSTOMERS_TARGET_UNAVAILABLE,
    });
    expect(error.details).toBeUndefined();
    expect({ ...error }).toEqual({
      ...customerOrderCustomerUnavailableError(),
    });
  });

  // AC-11c — openapi.yaml `CustomerOrderDestinationConflict` / `CustomerOrderRedirectConflict`
  // carry no `details`: the address text and its access notes are confidential (sad.md §8).
  it('builds a detail-free ApplicationError for a destination the order may not take', () => {
    const error = customerOrderInvalidDeliveryAddressError();

    expect(error).toBeInstanceOf(ApplicationError);
    expect(error).toMatchObject({
      code: ErrorCode.CUSTOMER_ORDERS_INVALID_DELIVERY_ADDRESS,
    });
    expect(error.details).toBeUndefined();
  });
});
