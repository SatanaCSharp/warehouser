import { isNull } from '@warehouser/utils/predicates';

// The condition `usecases/commands/deactivate-customer-delivery-address.command.ts` asserts once the
// promotion it decided and the read it returns have to agree (server-error-handling.md §1).

// AC-06b — the promotion decided in this transaction and the Main address the read reports are the
// same address. A deactivation that promoted nothing asserts nothing.
export const reportsThePromotedMain = (
  promotedDeliveryAddressId: string | null,
  reportedMainDeliveryAddressId: string | null,
): boolean =>
  isNull(promotedDeliveryAddressId) ||
  reportedMainDeliveryAddressId === promotedDeliveryAddressId;

// AC-06a — whether the member asked for the new address to become the Customer's main one. Absent
// means no: adding an address promotes nothing unless the payload says so.
export const requestsMainDeliveryAddress = (input: {
  readonly main?: boolean;
}): boolean => input.main === true;
