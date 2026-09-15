import type {
  CustomerOrderProjection,
  IdentifiedCustomerOrder,
} from 'customer-orders/domain/mappers/customer-order-projection.mapper';

// The discriminator for the two projection forms. The types it reads are imported type-only from
// the mapper, which imports this back as a value — the edge that exists at runtime runs one way
// only, from the mapper to here.

/** Whether this projection carries customer identity — the one discriminator, so no caller tests
 * for a property name of its own. */
export const identifiesCustomer = (
  projection: CustomerOrderProjection,
): projection is IdentifiedCustomerOrder => 'customer' in projection;
