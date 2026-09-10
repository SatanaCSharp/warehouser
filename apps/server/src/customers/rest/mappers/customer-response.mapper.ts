import type { Customer, CustomerDetail } from '@warehouser/contracts/customers';
import type {
  Customer as CustomerRead,
  CustomerDeliveryAddress as CustomerDeliveryAddressRead,
} from 'customers/domain/mappers/customer.mapper';
import type { CustomerDetail as CustomerDetailRead } from 'customers/domain/mappers/customer-awaiting-order.mapper';
import { map } from 'lodash';

// The application boundary returns instants as `Date`; openapi.yaml carries them as date-times.
// Both `customers` controllers return the same Customer projection, so the conversion is one
// function module both import rather than a copy in each: it depends on nothing, needs no lifecycle
// and holds no state, so it is a function and not a service.
const toDeliveryAddressResponse = (
  address: CustomerDeliveryAddressRead,
): Customer['deliveryAddresses'][number] => ({
  id: address.id,
  customerId: address.customerId,
  addressText: address.addressText,
  accessNotes: address.accessNotes,
  isMain: address.isMain,
  deactivatedAt: address.deactivatedAt?.toISOString() ?? null,
  createdAt: address.createdAt.toISOString(),
  updatedAt: address.updatedAt.toISOString(),
});

export const toCustomerResponse = (customer: CustomerRead): Customer => ({
  id: customer.id,
  name: customer.name,
  deactivatedAt: customer.deactivatedAt?.toISOString() ?? null,
  mainDeliveryAddressId: customer.mainDeliveryAddressId,
  deliveryAddresses: map(customer.deliveryAddresses, toDeliveryAddressResponse),
  recordedByUserId: customer.recordedByUserId,
  createdAt: customer.createdAt.toISOString(),
  updatedAt: customer.updatedAt.toISOString(),
});

// `neededBy` is already a calendar date and is passed through untouched; the destination's
// `deactivatedAt` is the one instant on an awaiting row (AC-06a, AC-08).
export const toCustomerDetailResponse = (
  detail: CustomerDetailRead,
): CustomerDetail => ({
  ...toCustomerResponse(detail),
  awaitingCustomerOrders: map(detail.awaitingCustomerOrders, (order) => ({
    customerOrderId: order.customerOrderId,
    itemId: order.itemId,
    itemSku: order.itemSku,
    itemDescription: order.itemDescription,
    unitOfMeasure: order.unitOfMeasure,
    outstandingQuantity: order.outstandingQuantity,
    neededBy: order.neededBy,
    destination: {
      deliveryAddressId: order.destination.deliveryAddressId,
      addressText: order.destination.addressText,
      accessNotes: order.destination.accessNotes,
      isMain: order.destination.isMain,
      deactivatedAt: order.destination.deactivatedAt?.toISOString() ?? null,
    },
  })),
});
