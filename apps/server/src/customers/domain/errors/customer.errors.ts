import { ErrorCode } from '@warehouser/shared-types/enums';
import { ApplicationError } from '@warehouser/shared-types/errors';

// The value a submission was refused for. Named rather than free text because the web application
// maps it onto the field it highlights (openapi.yaml `InvalidCustomerInput`). The create-Customer
// submission carries its first address nested, the address-book endpoints carry it on its own, so
// both spellings of the address field are legal.
export type CustomerInputField =
  'name' | 'addressText' | 'deliveryAddress.addressText' | 'accessNotes';

// AC-02 — the refusal names the value it will not accept and **nothing else**. It never echoes the
// submitted address text or access notes: those are confidential data of the same classification as
// the Customer carrying them and appear in no error detail (spec.md §6.1, sad.md §8).
export const customerInvalidInputError = (
  field: CustomerInputField,
  rule: string,
): ApplicationError =>
  new ApplicationError(ErrorCode.CUSTOMERS_INVALID_INPUT, { field, rule });

// AC-03/AC-03c/AC-06 — a customer name identifies at most one Customer within a Warehouse, active
// or Inactive alike, and the refusal names the Customer that already holds it. The holder is a
// record of the actor's own Warehouse, so naming it discloses nothing across the boundary
// (openapi.yaml `CustomerWriteConflict` `nameTaken`).
export const customerNameTakenError = (
  customerId: string,
  name: string,
): ApplicationError =>
  new ApplicationError(ErrorCode.CUSTOMERS_NAME_TAKEN, { customerId, name });

// AC-12/AC-23 — a Customer or Delivery Address that does not exist, one of another Warehouse and
// one of another Customer are **one** non-enumerating outcome, so a denial never discloses that the
// target exists elsewhere (spec.md §6.1, openapi.yaml `CustomerUnavailable`). It carries no details
// for exactly that reason.
export const customerTargetUnavailableError = (): ApplicationError =>
  new ApplicationError(ErrorCode.CUSTOMERS_TARGET_UNAVAILABLE);

// AC-07 — the Customer's only remaining active Delivery Address is the one being deactivated. The
// guidance the member acts on (add the replacement first) is the message the web application holds
// for this code, not a detail the server composes (openapi.yaml `CustomerDeliveryAddressConflict`
// `lastActiveAddress`).
export const customerLastActiveDeliveryAddressError = (): ApplicationError =>
  new ApplicationError(ErrorCode.CUSTOMERS_LAST_ACTIVE_DELIVERY_ADDRESS);

// AC-06a/AC-06b / `chk_customer_delivery_addresses_main_is_active` — an Inactive Delivery Address
// is never the Main one and is not offered where an address is chosen (openapi.yaml
// `CustomerDeliveryAddressConflict` `inactiveAddressAsMain`).
export const customerInvalidDeliveryAddressError = (): ApplicationError =>
  new ApplicationError(ErrorCode.CUSTOMERS_INVALID_DELIVERY_ADDRESS);
