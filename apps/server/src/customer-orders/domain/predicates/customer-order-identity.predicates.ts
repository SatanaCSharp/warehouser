import { isDefined, isUndefined } from '@warehouser/utils/predicates';
import { isCustomerName } from 'customer-orders/domain/predicates/customer-order.predicates';

// The identity conditions `usecases/commands/record-customer-order.command.ts` decides before it
// records demand (server-error-handling.md §1).

// A Delivery Address belongs to a Customer, so one stated beside a typed customer name names an
// address of nobody.
export const deliveryAddressHasCustomer = (
  customerDeliveryAddressId: string | undefined,
  customerId: string | undefined,
): boolean => isUndefined(customerDeliveryAddressId) || isDefined(customerId);

// AC-02 — a typed customer name, when stated at all, is a trimmed non-empty one.
export const customerNameStatedWellOrNotAtAll = (
  customerName: string | undefined,
): boolean => isUndefined(customerName) || isCustomerName(customerName);
