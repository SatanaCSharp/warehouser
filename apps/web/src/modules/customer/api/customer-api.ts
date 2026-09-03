import {
  customerDetailSchema,
  customerSchema,
} from '@warehouser/contracts/customers';
import { ErrorCode } from '@warehouser/shared-types/enums';
import { z } from 'zod';

import { api } from 'shared/api/client/api-client';

import type {
  Customer,
  CustomerCreate,
  CustomerDeliveryAddressCreate,
  CustomerDeliveryAddressUpdate,
  CustomerDetail,
  CustomerUpdate,
} from '@warehouser/contracts/customers';
import type { ApiFailure } from 'shared/api/client/api-client';

const customersPath = (warehouseId: string): string =>
  `/api/v1/warehouses/${warehouseId}/customers`;

const customerPath = (warehouseId: string, customerId: string): string =>
  `${customersPath(warehouseId)}/${customerId}`;

const addressesPath = (warehouseId: string, customerId: string): string =>
  `${customerPath(warehouseId, customerId)}/delivery-addresses`;

const addressPath = (
  warehouseId: string,
  customerId: string,
  deliveryAddressId: string,
): string => `${addressesPath(warehouseId, customerId)}/${deliveryAddressId}`;

const customerListSchema = z.array(customerSchema);

/**
 * What every write below names the Customer by in the toast it raises. The
 * feedback registry sees a settled mutation's **arguments only**
 * (`shared/alerts/mutation-actions.ts`), so what the toast names has to arrive
 * in them — the same reason `item-api.ts` carries `sku`/`description`.
 *
 * The address text is deliberately **not** carried: it is confidential data of
 * the same classification as the Customer holding it (spec.md §6.1), and a
 * toast is the one surface that outlives the dialog that showed it.
 */
type CustomerNaming = { customerName: string };

export type CustomerId = { warehouseId: string; customerId: string };
export type DeliveryAddressId = CustomerId & { deliveryAddressId: string };

type RecordCustomerArgs = { warehouseId: string; input: CustomerCreate };
type CorrectCustomerArgs = CustomerId &
  CustomerNaming & { input: CustomerUpdate };
type CustomerActivationArgs = CustomerId & CustomerNaming;
type AddDeliveryAddressArgs = CustomerId &
  CustomerNaming & { input: CustomerDeliveryAddressCreate };
type CorrectDeliveryAddressArgs = DeliveryAddressId &
  CustomerNaming & { input: CustomerDeliveryAddressUpdate };
type DeliveryAddressActionArgs = DeliveryAddressId & CustomerNaming;

/**
 * AC-03 / AC-03c — a customer name identifies at most one Customer within a
 * Warehouse, and the refusal belongs on the name field, which is where both
 * dialogs draw it (`ee6Ez` "Record a customer", "Correct a customer's name").
 * The server names no field for `customers.name_taken`, so the endpoint does
 * (web-error-handling.md §3).
 */
const customerNameFieldErrors = (failure: ApiFailure): ApiFailure =>
  failure.code === ErrorCode.CUSTOMERS_NAME_TAKEN
    ? { ...failure, fieldErrors: { name: 'nameTaken' } }
    : failure;

/**
 * `customers.invalid_input` carries `details: { field, rule }`, which
 * `api-client.ts` has already lifted into `fieldErrors` by the time this runs.
 * Two of the server's field names are not the form's: the create submission
 * nests its first address, so the server says `deliveryAddress.addressText`
 * where the form's field is `addressText`. This renames the field rather than
 * asking every dialog to know the server's spelling, exactly as
 * `item-api.ts`'s `validationKeysByRule` renames a rule.
 */
const FORM_FIELDS_BY_SERVER_FIELD: Record<string, string> = {
  'deliveryAddress.addressText': 'addressText',
};

const formFieldNames = (failure: ApiFailure): ApiFailure => {
  const entries = Object.entries(failure.fieldErrors ?? {});
  if (entries.length === 0) {
    return failure;
  }

  return {
    ...failure,
    fieldErrors: Object.fromEntries(
      entries.map(([field, rule]) => [
        FORM_FIELDS_BY_SERVER_FIELD[field] ?? field,
        rule,
      ]),
    ),
  };
};

const customerWriteErrors = (failure: ApiFailure): ApiFailure =>
  customerNameFieldErrors(formFieldNames(failure));

/**
 * The Warehouse's Customers, their address books and everything each is
 * waiting for (sad.md §5 Web, T21). Eleven operations over seven paths, all
 * through the one shared API slice — never a Redux slice
 * (`docs/system/adr/02-08-2026-rtk-query-for-web-api-calls.md`).
 *
 * **Every entry is keyed by the Warehouse it was read in**, list and detail
 * alike, so switching Warehouse refetches rather than reusing another
 * Warehouse's answer and a Customer never crosses that boundary in cache
 * (design-handoff.md §Implementation constraints, AC-03a).
 *
 * Every write invalidates the one `Customers` tag: an address-book change
 * alters the Customer the list draws as much as the detail does, and the
 * collection is read whole at this feature's stated scale, so a targeted cache
 * patch buys nothing a refetch of one small list does not already give.
 */
export const customerApi = api.injectEndpoints({
  endpoints: (build) => ({
    listCustomers: build.query<Customer[], string>({
      query: (warehouseId) => customersPath(warehouseId),
      extraOptions: { schema: customerListSchema },
      providesTags: ['Customers'],
    }),
    readCustomer: build.query<CustomerDetail, CustomerId>({
      query: ({ warehouseId, customerId }) =>
        customerPath(warehouseId, customerId),
      extraOptions: { schema: customerDetailSchema },
      providesTags: ['Customers'],
    }),
    recordCustomer: build.mutation<Customer, RecordCustomerArgs>({
      query: ({ warehouseId, input }) => ({
        url: customersPath(warehouseId),
        method: 'POST',
        body: input,
      }),
      extraOptions: { schema: customerSchema },
      invalidatesTags: ['Customers'],
      transformErrorResponse: customerWriteErrors,
    }),
    correctCustomerName: build.mutation<Customer, CorrectCustomerArgs>({
      query: ({ warehouseId, customerId, input }) => ({
        url: customerPath(warehouseId, customerId),
        method: 'PATCH',
        body: input,
      }),
      extraOptions: { schema: customerSchema },
      invalidatesTags: ['Customers'],
      transformErrorResponse: customerWriteErrors,
    }),
    deactivateCustomer: build.mutation<Customer, CustomerActivationArgs>({
      query: ({ warehouseId, customerId }) => ({
        url: `${customerPath(warehouseId, customerId)}/deactivation`,
        method: 'POST',
      }),
      extraOptions: { schema: customerSchema },
      invalidatesTags: ['Customers'],
    }),
    reactivateCustomer: build.mutation<Customer, CustomerActivationArgs>({
      query: ({ warehouseId, customerId }) => ({
        url: `${customerPath(warehouseId, customerId)}/deactivation`,
        method: 'DELETE',
      }),
      extraOptions: { schema: customerSchema },
      invalidatesTags: ['Customers'],
    }),
    addCustomerDeliveryAddress: build.mutation<
      Customer,
      AddDeliveryAddressArgs
    >({
      query: ({ warehouseId, customerId, input }) => ({
        url: addressesPath(warehouseId, customerId),
        method: 'POST',
        body: input,
      }),
      extraOptions: { schema: customerSchema },
      invalidatesTags: ['Customers'],
      transformErrorResponse: formFieldNames,
    }),
    correctCustomerDeliveryAddress: build.mutation<
      Customer,
      CorrectDeliveryAddressArgs
    >({
      query: ({ warehouseId, customerId, deliveryAddressId, input }) => ({
        url: addressPath(warehouseId, customerId, deliveryAddressId),
        method: 'PATCH',
        body: input,
      }),
      extraOptions: { schema: customerSchema },
      invalidatesTags: ['Customers'],
      transformErrorResponse: formFieldNames,
    }),
    setMainCustomerDeliveryAddress: build.mutation<
      Customer,
      DeliveryAddressActionArgs
    >({
      query: ({ warehouseId, customerId, deliveryAddressId }) => ({
        url: `${addressPath(warehouseId, customerId, deliveryAddressId)}/main`,
        method: 'PUT',
      }),
      extraOptions: { schema: customerSchema },
      invalidatesTags: ['Customers'],
    }),
    deactivateCustomerDeliveryAddress: build.mutation<
      Customer,
      DeliveryAddressActionArgs
    >({
      query: ({ warehouseId, customerId, deliveryAddressId }) => ({
        url: `${addressPath(
          warehouseId,
          customerId,
          deliveryAddressId,
        )}/deactivation`,
        method: 'POST',
      }),
      extraOptions: { schema: customerSchema },
      invalidatesTags: ['Customers'],
    }),
    reactivateCustomerDeliveryAddress: build.mutation<
      Customer,
      DeliveryAddressActionArgs
    >({
      query: ({ warehouseId, customerId, deliveryAddressId }) => ({
        url: `${addressPath(
          warehouseId,
          customerId,
          deliveryAddressId,
        )}/deactivation`,
        method: 'DELETE',
      }),
      extraOptions: { schema: customerSchema },
      invalidatesTags: ['Customers'],
    }),
  }),
  overrideExisting: false,
});

export const {
  useAddCustomerDeliveryAddressMutation,
  useCorrectCustomerDeliveryAddressMutation,
  useCorrectCustomerNameMutation,
  useDeactivateCustomerDeliveryAddressMutation,
  useDeactivateCustomerMutation,
  useListCustomersQuery,
  useReactivateCustomerDeliveryAddressMutation,
  useReactivateCustomerMutation,
  useReadCustomerQuery,
  useRecordCustomerMutation,
  useSetMainCustomerDeliveryAddressMutation,
} = customerApi;
