import type { CustomerOrder } from '@warehouser/contracts/customer-orders';
import type { CustomerOrderDestination } from '@warehouser/contracts/customers';

/**
 * Which of the three ways a Customer Order's identity reads on this surface.
 *
 * There are **three**, not two, and that is the whole resolution of the pull
 * between AC-24 and AC-09a. AC-24 makes an absent Delivery Address meaningful:
 * an order naming a Customer shows that Customer with the address its goods
 * are going to, an order recorded by typed name shows the name and no address
 * at all, and the absence is what tells the member which kind of row they are
 * looking at. AC-09a needs the same absence to be **uninformative**: a member
 * without `CUSTOMERS:WATCH` must not be able to read a row as "a
 * Customer-naming order with the name hidden".
 *
 * Both hold at once only if the redacted arm is its own presentation rather
 * than one of the other two with a value missing. `withheld` therefore says
 * exactly one thing — that identity is withheld — and never carries the
 * typed-name sentence, the pin, an address, or a name slot left blank. The
 * absent address is meaningful only inside the two arms where identity is
 * readable in the first place, which is precisely where AC-24 speaks.
 */
export type CustomerOrderIdentityKind =
  'namedCustomer' | 'typedName' | 'withheld';

export type CustomerOrderIdentity = {
  kind: CustomerOrderIdentityKind;
  /**
   * The Customer this order names, or `null` when it names none — a typed-name
   * order — or when the actor may not read who it names.
   */
  customerId: string | null;
  /**
   * The customer as recorded, or `null` when identity is withheld — never the
   * empty string, so a redacted row can never read as an order with a blank
   * customer.
   */
  name: string | null;
  /**
   * Where the goods are going, or `null` when there is nowhere to state: a
   * typed-name order names no address, and a withheld one states nothing at
   * all.
   */
  destination: CustomerOrderDestination | null;
};

/**
 * Reads a Customer Order as the identity a surface may display.
 *
 * `CustomerOrder` is a union: an actor without `CUSTOMERS:WATCH` reads a
 * redacted form from which `customer`, `customerName` and `destination` are
 * **absent as properties**, not null — the contract's `additionalProperties:
 * false` makes their presence a validation failure, so the absence is what
 * proves the redaction rather than a nulled field (T13, AC-09a).
 *
 * An order that names a Customer carries no typed name of its own — it reads
 * the name live, which is what makes AC-03b true by construction — and
 * `chk_customer_orders_customer_identity` makes the two mutually exclusive, so
 * exactly one of the two identified arms holds for any valid order.
 *
 * The final return is the fail-safe rather than a fallback: an object matching
 * neither identified shape is one the contract refuses, and reading it as
 * `withheld` withholds where it cannot be sure instead of inventing a name.
 */
// The two identified arms, each read once as the whole shape it needs. `customer` and `destination`
// travel together because a named-Customer order always has somewhere to go; reading them as a pair
// is what keeps the reader below free of the narrowing.
const namedCustomerOf = (
  order: CustomerOrder,
):
  | {
      customer: { id: string; name: string };
      destination: CustomerOrderDestination;
    }
  | undefined =>
  'customer' in order && order.customer && order.destination
    ? { customer: order.customer, destination: order.destination }
    : undefined;

const typedCustomerNameOf = (order: CustomerOrder): string | undefined =>
  'customerName' in order && order.customerName
    ? order.customerName
    : undefined;

export const customerOrderIdentity = (
  order: CustomerOrder,
): CustomerOrderIdentity => {
  const named = namedCustomerOf(order);
  if (named !== undefined) {
    return {
      kind: 'namedCustomer',
      customerId: named.customer.id,
      name: named.customer.name,
      destination: named.destination,
    };
  }

  const typedName = typedCustomerNameOf(order);
  if (typedName !== undefined) {
    return {
      kind: 'typedName',
      customerId: null,
      name: typedName,
      destination: null,
    };
  }

  return {
    kind: 'withheld',
    customerId: null,
    name: null,
    destination: null,
  };
};
