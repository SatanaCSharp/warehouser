import { hasOutstandingDemand } from 'customer-orders/domain/predicates/demand-allocation.predicates';
import type { CustomerOrderState } from 'shared/domain/entities/customer-order.entity';

/** How an amendment resolves the two things it may change and what the result means for demand.
 *
 * Both answers are the module's, not one command's: a second write that amends an order has to
 * carry a field forward and re-derive the state the same way, and a copy per command is how the
 * two come to disagree about the same rule. */
// A field the amendment left out keeps the value the locked row already holds — never `null`, and
// never the value the member composed against.
export const amendedValue = <T>(stated: T | undefined, current: T): T =>
  stated ?? current;

// AC-19 — a Fulfilled order whose quantity was raised counts as Unfulfilled again, so it returns to
// the consolidated demand.
export const demandStateOf = (
  outstandingQuantity: number,
): CustomerOrderState =>
  hasOutstandingDemand(outstandingQuantity) ? 'unfulfilled' : 'fulfilled';
