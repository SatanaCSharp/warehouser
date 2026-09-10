import { assert } from '@warehouser/utils/asserts';
import { customerInvalidInputError } from 'customers/domain/errors/customer.errors.js';
import { isCustomerName } from 'customers/domain/predicates/customer.predicates.js';

/**
 * A Customer's name: unique within its Warehouse across active and Inactive Customers alike, and
 * correctable at any time to a name unused there (CONTEXT.md "Customer").
 *
 * Case-sensitive and non-normalising, following the `items.sku` precedent — `"Acme Ltd"` and
 * `"ACME LTD"` are two Customers, which data-model.md settles as its seventh open question. The
 * value carried is the trimmed one, matching `chk_customers_name_stored_trimmed`.
 *
 * Unlike {@link AccessName}, a blank name is an **expected business rejection** rather than a
 * defect: AC-02 requires the member be told which value will not be accepted, so this refuses with
 * `customers.invalid_input` and never with an `AssertionError` the global filter would report as an
 * internal error (server-error-handling.md §2).
 */
export class CustomerName {
  private constructor(readonly value: string) {}

  static create(input: string): CustomerName {
    assert(
      isCustomerName(input),
      customerInvalidInputError('name', 'trimmed_non_empty'),
    );

    return new CustomerName(input.trim());
  }
}
