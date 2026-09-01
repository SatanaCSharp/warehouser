import {
  customerOrderSchema,
  demandLineSchema,
} from '@warehouser/contracts/customer-orders';
import { ErrorCode } from '@warehouser/shared-types/enums';
import { z } from 'zod';

import { api } from 'shared/api/client/api-client';
import { fieldErrorsForCode } from 'shared/utils/field-errors';

import type {
  CustomerOrder,
  CustomerOrderAmend,
  CustomerOrderCancellation,
  CustomerOrderCreate,
  CustomerOrderListQuery,
  DemandLine,
} from '@warehouser/contracts/customer-orders';

const demandPath = (warehouseId: string): string =>
  `/api/v1/warehouses/${warehouseId}/demand`;

const customerOrdersPath = (warehouseId: string): string =>
  `/api/v1/warehouses/${warehouseId}/customer-orders`;

const customerOrderPath = (
  warehouseId: string,
  customerOrderId: string,
): string => `${customerOrdersPath(warehouseId)}/${customerOrderId}`;

const demandLineListSchema = z.array(demandLineSchema);
const customerOrderListSchema = z.array(customerOrderSchema);

type ListCustomerOrdersArgs = {
  warehouseId: string;
  query?: CustomerOrderListQuery;
};
type RecordCustomerOrderArgs = {
  warehouseId: string;
  input: CustomerOrderCreate;
};
/**
 * Both commands against an existing order name it twice: `customerOrderId`
 * addresses it, and `customerName` is what the outcome's toast states the
 * change about. The frame `hWFRW` tile "Success · what actually committed"
 * requires the success copy to name the outcome in the vocabulary of the page,
 * and the feedback registry sees a settled mutation's **arguments only**
 * (`shared/alerts/mutation-actions.ts`), so the name has to arrive in them —
 * exactly as `warehouseName` does on the Warehouse membership commands. Each
 * `query` below names the body field by field, so the server is told the
 * identifier and never the caller's copy of the customer's name.
 */
type AmendCustomerOrderArgs = {
  customerName: string;
  warehouseId: string;
  customerOrderId: string;
  input: CustomerOrderAmend;
};
type CancelCustomerOrderArgs = {
  customerName: string;
  warehouseId: string;
  customerOrderId: string;
  input: CustomerOrderCancellation;
};

/**
 * `customerOrdersPath` with `itemId`/`state` appended as query parameters,
 * built by hand rather than through `URLSearchParams` so undefined values are
 * omitted entirely instead of serialized as the literal string `"undefined"`.
 */
const listCustomerOrdersUrl = (
  warehouseId: string,
  query?: CustomerOrderListQuery,
): string => {
  const params = new URLSearchParams();
  if (query?.itemId !== undefined) {
    params.set('itemId', query.itemId);
  }
  if (query?.state !== undefined) {
    params.set('state', query.state);
  }
  const search = params.toString();
  return search
    ? `${customerOrdersPath(warehouseId)}?${search}`
    : customerOrdersPath(warehouseId);
};

/**
 * Which field explains a refusal the server named no field for.
 *
 * A Zod request-validation failure already names its fields — the server lifts
 * every issue into `details.fields` and `api-client.ts` turns that into
 * `fieldErrors` — and so does a domain refusal carrying `details: { field, rule }`.
 * What is left are the **domain** refusals that name only a rule, and binding
 * those to a field is the endpoint's declaration rather than any caller's
 * (web-error-handling.md §3). AC-02, AC-02a, AC-09a and AC-19b all require the
 * system to name the value it will not accept, and a dialog cannot name one
 * unless the refusal reaches it attached to a field.
 *
 * `customer_orders.needed_by_in_past` is the case worth naming: it is an
 * `ApplicationError` decided against the server's own clock, not a Zod issue, so
 * it never appears in `details.fields` and is bound here instead (AC-02a).
 */
const recordCustomerOrderFieldErrors = fieldErrorsForCode({
  [ErrorCode.CUSTOMER_ORDERS_NEEDED_BY_IN_PAST]: { neededBy: 'inPast' },
  // AC-03 — one non-enumerating outcome for an Item of another Warehouse, a
  // missing Item and a deactivated one. The message says nothing about
  // elsewhere, which is why it is the Item field that carries it.
  [ErrorCode.ITEMS_TARGET_UNAVAILABLE]: { itemId: 'unavailable' },
});

const amendCustomerOrderFieldErrors = fieldErrorsForCode({
  [ErrorCode.CUSTOMER_ORDERS_NEEDED_BY_IN_PAST]: { neededBy: 'inPast' },
  // AC-19b — the amendment is refused because goods already assigned to this
  // customer sit under their name in the transit zone. The bound belongs to the
  // quantity, so the quantity field is where the member is told.
  [ErrorCode.CUSTOMER_ORDERS_QUANTITY_BELOW_ALLOCATED]: {
    quantity: 'belowAllocated',
  },
});

const cancelCustomerOrderFieldErrors = fieldErrorsForCode({
  // A cancelled order is not cancelled again (AC-19a). Nothing about the reason
  // the member typed is wrong, so the refusal is explained on the reason field
  // only because that is the dialog's single field; the copy names the order's
  // state rather than the value.
  [ErrorCode.CUSTOMER_ORDERS_INVALID_STATE]: {
    cancellationReason: 'invalidState',
  },
});

/**
 * The Demand destination's endpoints (sad.md §5 `customer-orders/usecases`,
 * T19). `Demand` is the one tag every read here carries and every write
 * invalidates alongside `PurchaseDrafts` and `Items`: recording, amending or
 * cancelling a Customer Order changes what the consolidated demand and every
 * frozen draft's Drift Signal report, so both destinations refetch rather than
 * keep a stale reading (AC-19, AC-19a).
 */
export const customerOrderApi = api.injectEndpoints({
  endpoints: (build) => ({
    readDemand: build.query<DemandLine[], string>({
      query: (warehouseId) => demandPath(warehouseId),
      extraOptions: { schema: demandLineListSchema },
      providesTags: ['Demand'],
    }),
    listCustomerOrders: build.query<CustomerOrder[], ListCustomerOrdersArgs>({
      query: ({ warehouseId, query }) =>
        listCustomerOrdersUrl(warehouseId, query),
      extraOptions: { schema: customerOrderListSchema },
      providesTags: ['Demand'],
    }),
    recordCustomerOrder: build.mutation<CustomerOrder, RecordCustomerOrderArgs>(
      {
        query: ({ warehouseId, input }) => ({
          url: customerOrdersPath(warehouseId),
          method: 'POST',
          body: input,
        }),
        extraOptions: { schema: customerOrderSchema },
        invalidatesTags: ['Demand', 'Items', 'PurchaseDrafts'],
        transformErrorResponse: recordCustomerOrderFieldErrors,
      },
    ),
    amendCustomerOrder: build.mutation<CustomerOrder, AmendCustomerOrderArgs>({
      query: ({ warehouseId, customerOrderId, input }) => ({
        url: `${customerOrderPath(warehouseId, customerOrderId)}`,
        method: 'PATCH',
        body: input,
      }),
      extraOptions: { schema: customerOrderSchema },
      invalidatesTags: ['Demand', 'Items', 'PurchaseDrafts'],
      transformErrorResponse: amendCustomerOrderFieldErrors,
    }),
    cancelCustomerOrder: build.mutation<CustomerOrder, CancelCustomerOrderArgs>(
      {
        query: ({ warehouseId, customerOrderId, input }) => ({
          url: `${customerOrderPath(warehouseId, customerOrderId)}/cancellation`,
          method: 'POST',
          body: input,
        }),
        extraOptions: { schema: customerOrderSchema },
        invalidatesTags: ['Demand', 'Items', 'PurchaseDrafts'],
        transformErrorResponse: cancelCustomerOrderFieldErrors,
      },
    ),
  }),
  overrideExisting: false,
});

export const {
  useAmendCustomerOrderMutation,
  useCancelCustomerOrderMutation,
  useListCustomerOrdersQuery,
  useReadDemandQuery,
  useRecordCustomerOrderMutation,
} = customerOrderApi;
