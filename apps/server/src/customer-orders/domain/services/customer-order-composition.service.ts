import { isUndefined } from '@warehouser/utils/predicates';

/** How a submitted Customer Order is read into the three columns that carry the customer's identity
 * and destination. Each reading is the module's, not the recording command's: the shapes are what
 * `chk_customer_orders_customer_identity` and `chk_customer_orders_customer_name_stored_trimmed`
 * enforce, and a copy per command is a copy that can drift from the constraint. */

// Which half of `chk_customer_orders_customer_identity` the payload broke: it named neither identity,
// or it named both.
export const customerIdentityRefusal = (
  customerId: string | undefined,
): 'customer_identity_exclusive' | 'customer_identity_required' =>
  isUndefined(customerId)
    ? 'customer_identity_required'
    : 'customer_identity_exclusive';

// AC-11a — stored trimmed, as `chk_customer_orders_customer_name_stored_trimmed` requires; absent
// where the order names a Customer instead.
export const typedCustomerName = (
  customerName: string | undefined,
): string | null => customerName?.trim() ?? null;

// AC-11 — the stated address, or nothing stated, which the destination service reads as "the
// Customer's Main one".
export const statedDeliveryAddressId = (
  customerDeliveryAddressId: string | undefined,
): string | null => customerDeliveryAddressId ?? null;
