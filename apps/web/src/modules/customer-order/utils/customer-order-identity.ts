import type { CustomerOrder } from '@warehouser/contracts/customer-orders';

/**
 * The customer a Customer Order names, as a surface may display it.
 *
 * `CustomerOrder` became a union when AC-09a landed: an actor without
 * `CUSTOMERS:WATCH` reads a redacted form from which `customer`, `customerName`
 * and `destination` are **absent as properties**, not null — the contract's
 * `additionalProperties: false` makes their presence a validation failure, so
 * the absence is what proves the redaction rather than a nulled field. Reading
 * `order.customerName` therefore no longer type-checks, and this is the one
 * place that narrows the union.
 *
 * The empty string is deliberate for the redacted arm: a member who may not see
 * customer identity is shown none, and no placeholder copy is invented here.
 *
 * An order that names a Customer carries no typed name of its own — it reads
 * the name live, which is what makes AC-03b true by construction — so the
 * Customer's name is preferred and the typed name is the fallback.
 *
 * **T22 owns the full AC-24 presentation** of this surface: the destination
 * beside the customer, and how a redacted row reads. This accessor exists to
 * keep the existing surface truthful under the new union, not to settle that.
 */
export const customerOrderDisplayName = (order: CustomerOrder): string => {
  if (!('customerName' in order)) {
    return '';
  }

  return order.customer?.name ?? order.customerName ?? '';
};
