import { ErrorCode } from '@warehouser/shared-types/enums';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { customerApi } from 'modules/customer/api/customer-api';
import { customerOrderApi } from 'modules/customer-order/api/customer-order-api';
import { purchaseDraftApi } from 'modules/purchase-draft/api/purchase-draft-api';
import { makeStore } from 'store';
import { accessIds } from 'test/access-fixtures';

import type { Customer } from '@warehouser/contracts/customers';
import type { AppStore } from 'store';

// Every address-book write invalidated `Customers` and nothing else, so two
// destinations went stale behind a member's back. A Customer Order's
// `customer.name` and its whole `destination` are **read live** rather than
// copied onto the order (`customerRefSchema`,
// `customerOrderDestinationSchema`), and a Purchase Draft's links carry the
// same two live: `link.customer` and `link.current.deliveryAddress`. Both reads
// are cached under `Demand` and `PurchaseDrafts`. A mutation declares
// invalidation tags whenever it can make cached query results stale
// (ADR 02-08-2026 §Decision).
//
// This pins the set **per mutation**, negatives included: the three writes that
// change nothing an order or a draft reads must not refetch either
// destination. The assertion is a live subscriber refetching, as
// `customer-order-api.spec` makes it, rather than an introspection of the
// endpoint's config.

const warehouseId = accessIds.warehouse;
const customerId = '00000000-0000-4000-8000-000000000701';
const deliveryAddressId = '00000000-0000-4000-8000-000000000703';

const demandUrl = `/api/v1/warehouses/${warehouseId}/demand`;
const draftsUrl = `/api/v1/warehouses/${warehouseId}/purchase-drafts`;
const customersUrl = `/api/v1/warehouses/${warehouseId}/customers`;

const customer: Customer = {
  id: customerId,
  name: 'Nordwind Logistik',
  deactivatedAt: null,
  mainDeliveryAddressId: deliveryAddressId,
  deliveryAddresses: [
    {
      id: deliveryAddressId,
      customerId,
      addressText: 'Dockweg 3, 20457 Hamburg',
      accessNotes: null,
      isMain: true,
      deactivatedAt: null,
      createdAt: '2026-08-01T09:00:00.000Z',
      updatedAt: '2026-08-01T09:00:00.000Z',
    },
  ],
  recordedByUserId: accessIds.actingUser,
  createdAt: '2026-08-01T09:00:00.000Z',
  updatedAt: '2026-08-01T09:00:00.000Z',
};

/** Which of the other two destinations each write actually moves. */
type AffectedReads = { demand: boolean; drafts: boolean };

type MutationName =
  | 'addCustomerDeliveryAddress'
  | 'correctCustomerDeliveryAddress'
  | 'correctCustomerName'
  | 'deactivateCustomer'
  | 'deactivateCustomerDeliveryAddress'
  | 'reactivateCustomer'
  | 'reactivateCustomerDeliveryAddress'
  | 'recordCustomer'
  | 'setMainCustomerDeliveryAddress';

const customerIdArgs = { warehouseId, customerId };
const naming = { customerName: customer.name };
const addressIdArgs = { ...customerIdArgs, ...naming, deliveryAddressId };

const MUTATIONS: Record<MutationName, (store: AppStore) => Promise<unknown>> = {
  recordCustomer: (store) =>
    store
      .dispatch(
        customerApi.endpoints.recordCustomer.initiate({
          warehouseId,
          input: {
            name: 'Sudhafen Handel KG',
            deliveryAddress: {
              addressText: 'Kaiweg 8, 24103 Kiel',
              accessNotes: null,
            },
          },
        }),
      )
      .unwrap(),
  correctCustomerName: (store) =>
    store
      .dispatch(
        customerApi.endpoints.correctCustomerName.initiate({
          ...customerIdArgs,
          ...naming,
          input: { name: 'Nordwind Logistik GmbH' },
        }),
      )
      .unwrap(),
  deactivateCustomer: (store) =>
    store
      .dispatch(
        customerApi.endpoints.deactivateCustomer.initiate({
          ...customerIdArgs,
          ...naming,
        }),
      )
      .unwrap(),
  reactivateCustomer: (store) =>
    store
      .dispatch(
        customerApi.endpoints.reactivateCustomer.initiate({
          ...customerIdArgs,
          ...naming,
        }),
      )
      .unwrap(),
  addCustomerDeliveryAddress: (store) =>
    store
      .dispatch(
        customerApi.endpoints.addCustomerDeliveryAddress.initiate({
          ...customerIdArgs,
          ...naming,
          input: {
            addressText: 'Speicherweg 11, 20457 Hamburg',
            accessNotes: null,
            main: false,
          },
        }),
      )
      .unwrap(),
  correctCustomerDeliveryAddress: (store) =>
    store
      .dispatch(
        customerApi.endpoints.correctCustomerDeliveryAddress.initiate({
          ...addressIdArgs,
          input: { addressText: 'Dockweg 5, 20457 Hamburg' },
        }),
      )
      .unwrap(),
  setMainCustomerDeliveryAddress: (store) =>
    store
      .dispatch(
        customerApi.endpoints.setMainCustomerDeliveryAddress.initiate(
          addressIdArgs,
        ),
      )
      .unwrap(),
  deactivateCustomerDeliveryAddress: (store) =>
    store
      .dispatch(
        customerApi.endpoints.deactivateCustomerDeliveryAddress.initiate(
          addressIdArgs,
        ),
      )
      .unwrap(),
  reactivateCustomerDeliveryAddress: (store) =>
    store
      .dispatch(
        customerApi.endpoints.reactivateCustomerDeliveryAddress.initiate(
          addressIdArgs,
        ),
      )
      .unwrap(),
};

const AFFECTED_READS: Record<MutationName, AffectedReads> = {
  // A newly recorded Customer is named by no order and linked from no draft.
  recordCustomer: { demand: false, drafts: false },
  // AC-03b — the name is read live, so correcting it renames every order that
  // names it and every draft link that names it.
  correctCustomerName: { demand: true, drafts: true },
  // Deactivation writes the customer row alone; `deactivatedAt` of a Customer
  // is carried by neither `customerRefSchema` nor any destination.
  deactivateCustomer: { demand: false, drafts: false },
  reactivateCustomer: { demand: false, drafts: false },
  // A new address is not yet named by any order, and does not become Main.
  addCustomerDeliveryAddress: { demand: false, drafts: false },
  // The text and the access notes are dereferenced live by every order going
  // there and by every draft link's `current.deliveryAddress`.
  correctCustomerDeliveryAddress: { demand: true, drafts: true },
  // `isMain` is part of both destinations and is read live: it is what says
  // *why* an order is going where it is going.
  setMainCustomerDeliveryAddress: { demand: true, drafts: true },
  // `deactivatedAt` is likewise read live on both, and AC-06b's promotion moves
  // `isMain` with it.
  deactivateCustomerDeliveryAddress: { demand: true, drafts: true },
  reactivateCustomerDeliveryAddress: { demand: true, drafts: true },
};

/** Counts **reads** only: the writes are addressed under the list's own path. */
const stubServer = (): ((url: string) => number) => {
  const fetchMock = vi.fn(
    (input: Request | string | URL, init?: RequestInit) => {
      const url = String(input instanceof Request ? input.url : input);
      const isRead = (init?.method ?? 'GET') === 'GET';
      // Recording a Customer is a POST to the list's own path, so the method is
      // what separates the two answers rather than the URL.
      if (
        isRead &&
        (url === demandUrl || url === draftsUrl || url === customersUrl)
      ) {
        return Promise.resolve(Response.json([]));
      }
      if (url.startsWith(customersUrl)) {
        return Promise.resolve(Response.json(customer));
      }
      return Promise.resolve(Response.json({}, { status: 404 }));
    },
  );
  vi.stubGlobal('fetch', fetchMock);

  return (url) =>
    fetchMock.mock.calls.filter(([input, init]) => {
      const requested = String(input instanceof Request ? input.url : input);
      return requested === url && (init?.method ?? 'GET') === 'GET';
    }).length;
};

describe('customerApi tag invalidation', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it.each(
    Object.entries(AFFECTED_READS).map(
      ([name, affected]) => [name as MutationName, affected] as const,
    ),
  )(
    '%s refetches the reads it moves and only those',
    async (name, affected) => {
      const countOf = stubServer();
      const store = makeStore();

      const customers = store.dispatch(
        customerApi.endpoints.listCustomers.initiate(warehouseId),
      );
      const demand = store.dispatch(
        customerOrderApi.endpoints.readDemand.initiate(warehouseId),
      );
      const drafts = store.dispatch(
        purchaseDraftApi.endpoints.listPurchaseDrafts.initiate({ warehouseId }),
      );
      await Promise.all([customers, demand, drafts]);

      expect(countOf(customersUrl)).toBe(1);
      expect(countOf(demandUrl)).toBe(1);
      expect(countOf(draftsUrl)).toBe(1);

      await MUTATIONS[name](store);
      // RTK Query's tag invalidation refetches on the next tick.
      await new Promise((resolve) => setTimeout(resolve, 0));

      // Every write moves the Customers destination itself.
      expect(countOf(customersUrl)).toBe(2);
      expect(countOf(demandUrl)).toBe(affected.demand ? 2 : 1);
      expect(countOf(draftsUrl)).toBe(affected.drafts ? 2 : 1);

      customers.unsubscribe();
      demand.unsubscribe();
      drafts.unsubscribe();
    },
  );
});

// Which field explains a refusal the server named none for is the endpoint's
// declaration (web-error-handling.md §3), and it is read from a code→fields
// table — but a failure the server **did** explain on a field keeps that
// explanation (`shared/utils/field-errors.ts`).

const refuse = (body: unknown): void => {
  vi.stubGlobal('fetch', () =>
    Promise.resolve(Response.json(body, { status: 409 })),
  );
};

const recordFailure = async (): Promise<unknown> => {
  const store = makeStore();
  const result = await store.dispatch(
    customerApi.endpoints.recordCustomer.initiate({
      warehouseId,
      input: {
        name: 'Nordwind Logistik',
        deliveryAddress: {
          addressText: 'Kaiweg 8, 24103 Kiel',
          accessNotes: null,
        },
      },
    }),
  );
  return 'error' in result ? result.error : undefined;
};

describe('customerApi field errors', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('binds a taken name to the name field the server named none for', async () => {
    refuse({
      code: ErrorCode.CUSTOMERS_NAME_TAKEN,
      message: 'A customer with that name already exists',
    });

    await expect(recordFailure()).resolves.toMatchObject({
      code: ErrorCode.CUSTOMERS_NAME_TAKEN,
      fieldErrors: { name: 'nameTaken' },
    });
  });

  it('keeps the explanation the server itself put on a field', async () => {
    refuse({
      code: ErrorCode.CUSTOMERS_NAME_TAKEN,
      message: 'A customer with that name already exists',
      details: { field: 'name', rule: 'takenByInactiveCustomer' },
    });

    await expect(recordFailure()).resolves.toMatchObject({
      code: ErrorCode.CUSTOMERS_NAME_TAKEN,
      fieldErrors: { name: 'takenByInactiveCustomer' },
    });
  });

  it('renames the server field the create submission nests', async () => {
    refuse({
      code: ErrorCode.CUSTOMERS_INVALID_INPUT,
      message: 'Invalid input',
      details: { field: 'deliveryAddress.addressText', rule: 'required' },
    });

    await expect(recordFailure()).resolves.toMatchObject({
      fieldErrors: { addressText: 'required' },
    });
  });
});
