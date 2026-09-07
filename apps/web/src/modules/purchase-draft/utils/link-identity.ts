import type { PurchaseDraftLineLink } from '@warehouser/contracts/purchase-drafts';

/**
 * Which of the three ways a Purchase Draft Line link's customer reads on this
 * surface.
 *
 * There are **three**, not two, and that is the whole resolution of the pull
 * between AC-09a and everything the link row otherwise says. A link naming a
 * Customer shows that Customer, read live so correcting a name changes every
 * link that names it; a link to an order recorded by typed name shows the name
 * that was typed; and a member without `CUSTOMERS:WATCH` must not be able to
 * read a row as "a Customer-naming link with the name hidden".
 *
 * Both hold at once only if the redacted arm is its own presentation rather
 * than one of the other two with a value missing. `withheld` therefore says
 * exactly one thing — that identity is withheld — and never carries a name
 * slot left blank, a destination, or the typed-name sentence. It is the same
 * shape `modules/customer-order/utils/customer-order-identity.ts` settled for
 * the demand surface; the reader is rebuilt here rather than imported, because
 * a link is not a Customer Order and the two modules share no type.
 */
export type PurchaseDraftLinkIdentityKind =
  'namedCustomer' | 'typedName' | 'withheld';

export type PurchaseDraftLinkIdentity = {
  kind: PurchaseDraftLinkIdentityKind;
  /**
   * The Customer the linked order names, or `null` when it names none — a
   * typed-name order — or when the actor may not read who it names.
   */
  customerId: string | null;
  /**
   * The customer as recorded, or `null` when identity is withheld — never the
   * empty string, so a redacted row can never read as a link with a blank
   * customer.
   */
  name: string | null;
};

/**
 * Reads a link as the customer identity a surface may display.
 *
 * `PurchaseDraftLineLink` is a union: an actor without `CUSTOMERS:WATCH` reads
 * a redacted arm from which `customer` and `customerName` are **absent as
 * properties**, not null — the contract's strict object makes their presence a
 * validation failure, so the absence is what proves the redaction rather than
 * a nulled field (T19, AC-09a).
 *
 * A linked order naming a Customer carries no typed name of its own, and
 * `chk_customer_orders_customer_identity` — carried into the contract as the
 * identified arm's refinement — makes the two mutually exclusive, so exactly
 * one of the two identified arms holds for any valid link.
 *
 * The final return is the fail-safe rather than a fallback: an object matching
 * neither identified shape is one the contract refuses, and reading it as
 * `withheld` withholds where it cannot be sure instead of inventing a name.
 */
export const purchaseDraftLinkIdentity = (
  link: PurchaseDraftLineLink,
): PurchaseDraftLinkIdentity => {
  if ('customer' in link && link.customer) {
    return {
      kind: 'namedCustomer',
      customerId: link.customer.id,
      name: link.customer.name,
    };
  }

  if ('customerName' in link && link.customerName) {
    return { kind: 'typedName', customerId: null, name: link.customerName };
  }

  return { kind: 'withheld', customerId: null, name: null };
};

/**
 * The two halves of the Address Drift comparison, as text (AC-18, AC-18a): the
 * address frozen for this link at Ready for Ordering, and the address the
 * demand behind it now expects.
 *
 * Both are customer identity, so both are absent from a redacted link — and
 * the comparison then answers `null` rather than a pair of blanks, which is
 * what lets the drift copy state the disagreement without naming an address a
 * member may not read (AC-09a). `driftSignals` itself is not withheld: *that*
 * an address drift exists is a fact about the draft.
 *
 * A frozen link whose captured pair is `null` — a linked order recorded by
 * typed name, which names no address at all — also answers `null`, because
 * there is no address to state on either side.
 */
export type LinkAddressComparison = { captured: string; current: string };

export const linkAddressComparison = (
  link: PurchaseDraftLineLink,
): LinkAddressComparison | null => {
  // `customer` is declared on the identified arm alone, so this is the same
  // narrowing the identity reader above performs — and it is the arm that also
  // carries both captured and current addresses.
  if (!('customer' in link)) {
    return null;
  }

  const captured = link.snapshot?.capturedDeliveryAddressText ?? null;
  const current = link.current.deliveryAddress?.addressText ?? null;

  if (captured === null || current === null) {
    return null;
  }

  return { captured, current };
};
