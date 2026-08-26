import {
  customerOrderSchema,
  demandLineSchema,
} from '@warehouser/contracts/customer-orders';
import { z } from 'zod';

import { api } from 'shared/api/client/api-client';

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
type AmendCustomerOrderArgs = {
  warehouseId: string;
  customerOrderId: string;
  input: CustomerOrderAmend;
};
type CancelCustomerOrderArgs = {
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
