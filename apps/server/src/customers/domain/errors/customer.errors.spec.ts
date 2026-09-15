import { ErrorCode } from '@warehouser/shared-types/enums';
import { ApplicationError } from '@warehouser/shared-types/errors';
import {
  customerInvalidDeliveryAddressError,
  customerInvalidInputError,
  customerLastActiveDeliveryAddressError,
  customerNameTakenError,
  customerTargetUnavailableError,
} from 'customers/domain/errors/customer.errors';
import { describe, expect, it } from 'vitest';

describe('customers error factories', () => {
  // openapi.yaml `InvalidCustomerInput` — `details: { field, rule }`, and never the submitted
  // address text or access notes (spec.md §6.1, sad.md §8).
  it('names the field and the rule it will not accept', () => {
    const error = customerInvalidInputError('name', 'trimmed_non_empty');

    expect(error).toBeInstanceOf(ApplicationError);
    expect(error.code).toBe(ErrorCode.CUSTOMERS_INVALID_INPUT);
    expect(error.details).toEqual({ field: 'name', rule: 'trimmed_non_empty' });
  });

  // openapi.yaml `CustomerWriteConflict` `nameTaken` — the holder is a record of the actor's own
  // Warehouse, so naming it discloses nothing across the boundary (AC-03, AC-03c).
  it('names the Customer that already holds the name', () => {
    const error = customerNameTakenError(
      '00000000-0000-4000-8000-000000000201',
      'Test Customer North',
    );

    expect(error.code).toBe(ErrorCode.CUSTOMERS_NAME_TAKEN);
    expect(error.details).toEqual({
      customerId: '00000000-0000-4000-8000-000000000201',
      name: 'Test Customer North',
    });
  });

  // openapi.yaml `CustomerUnavailable` — a missing record, one of another Warehouse and one of
  // another Customer fail identically and disclose nothing about what exists elsewhere (AC-12).
  it('discloses nothing about an unavailable target', () => {
    const error = customerTargetUnavailableError();

    expect(error.code).toBe(ErrorCode.CUSTOMERS_TARGET_UNAVAILABLE);
    expect(error.details).toBeUndefined();
  });

  // openapi.yaml `CustomerDeliveryAddressConflict` `lastActiveAddress` (AC-07).
  it('refuses the last active Delivery Address without details', () => {
    const error = customerLastActiveDeliveryAddressError();

    expect(error.code).toBe(ErrorCode.CUSTOMERS_LAST_ACTIVE_DELIVERY_ADDRESS);
    expect(error.details).toBeUndefined();
  });

  // openapi.yaml `CustomerDeliveryAddressConflict` `inactiveAddressAsMain` (AC-06b).
  it('refuses an Inactive Delivery Address without details', () => {
    const error = customerInvalidDeliveryAddressError();

    expect(error.code).toBe(ErrorCode.CUSTOMERS_INVALID_DELIVERY_ADDRESS);
    expect(error.details).toBeUndefined();
  });
});
