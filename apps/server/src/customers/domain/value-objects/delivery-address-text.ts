import { assert } from '@warehouser/utils/asserts';
import type { CustomerInputField } from 'customers/domain/errors/customer.errors';
import { customerInvalidInputError } from 'customers/domain/errors/customer.errors';
import { isDeliveryAddressText } from 'customers/domain/predicates/customer.predicates';

/**
 * Where goods are sent, as **text a member types** (CONTEXT.md "Delivery Address"). It is never
 * validated, geocoded, normalized or interpreted, so this carries the trimmed value and nothing
 * more — `chk_customer_delivery_addresses_address_text_stored_trimmed` and openapi.yaml
 * `AddressText`, which states no upper bound because the column has none.
 *
 * The refused field is a parameter because the same value reaches the server under two names: the
 * create-Customer submission nests its first address (`deliveryAddress.addressText`), and the
 * address-book endpoints carry it on its own (`addressText`). The refusal names the field the
 * member's submission actually carried and never the text itself (sad.md §8).
 */
export class DeliveryAddressText {
  private constructor(readonly value: string) {}

  static create(
    input: string,
    field: CustomerInputField = 'deliveryAddress.addressText',
  ): DeliveryAddressText {
    assert(
      isDeliveryAddressText(input),
      customerInvalidInputError(field, 'trimmed_non_empty'),
    );

    return new DeliveryAddressText(input.trim());
  }
}
