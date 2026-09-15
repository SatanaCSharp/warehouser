import { screen } from '@testing-library/react';
import type { Customer } from '@warehouser/contracts/customers';
import { PermissionId } from '@warehouser/shared-types/enums';
import { customerApi } from 'modules/customer/api/customer-api';
import { CustomerPage } from 'modules/customer/page';
import { accessPermissionsApi } from 'shared/api/access/access-permissions-api';
import type { AppStore } from 'store';
import { accessIds, authenticatedStore } from 'test/access-fixtures';
import { renderInEnteredWarehouse } from 'test/render';
import { afterEach, describe, expect, it, vi } from 'vitest';

// AC-09 — the Customers destination and its denial, colocated with the page it covers
// (`placing-web-tests.md` §1). `ItemPage` has carried this spec since T18; this page had none, so
// the Permission gate that decides between the directory and the denial was never exercised — and
// it is the gate that decides whether a member without `CUSTOMERS:WATCH` can read who this
// Warehouse delivers to.
//
// The denial "names no customer, no address, no quantity and no Item, and presents no count", so
// the directory read below is seeded as a *successful, non-empty* response: with an unseeded read,
// dropping the Permission check entirely would still render an empty surface and the denial case
// would pass for the wrong reason.

const secretCustomer: Customer = {
  id: '00000000-0000-4000-8000-000000000701',
  name: 'Nordwind Logistik',
  deactivatedAt: null,
  mainDeliveryAddressId: '00000000-0000-4000-8000-000000000703',
  deliveryAddresses: [
    {
      id: '00000000-0000-4000-8000-000000000703',
      customerId: '00000000-0000-4000-8000-000000000701',
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

const seedAccess = (permissionIds: readonly PermissionId[]): AppStore => {
  const store = authenticatedStore();
  void store.dispatch(
    accessPermissionsApi.util.upsertQueryData(
      'getCurrentAccess',
      accessIds.warehouse,
      {
        warehouseId: accessIds.warehouse,
        roleId: accessIds.managerRole,
        roleKind: 'warehouse_manager',
        permissionIds: [...permissionIds],
        archivedAt: null,
      },
    ),
  );
  void store.dispatch(
    customerApi.util.upsertQueryData('listCustomers', accessIds.warehouse, [
      secretCustomer,
    ]),
  );

  return store;
};

describe('CustomerPage', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('states what the destination holds under its heading', async () => {
    const store = seedAccess([PermissionId.CUSTOMERS_WATCH]);
    renderInEnteredWarehouse(<CustomerPage />, store, accessIds.warehouse);

    expect(
      await screen.findByRole('heading', { name: 'Customers', level: 1 }),
    ).toBeVisible();
    expect(
      screen.getByText(
        /every customer this warehouse delivers to, the addresses their goods are sent to/iu,
      ),
    ).toBeVisible();
  });

  it('denies an actor without CUSTOMERS:WATCH, leaking no customer or address', async () => {
    const store = seedAccess([]);
    renderInEnteredWarehouse(<CustomerPage />, store, accessIds.warehouse);

    expect(
      await screen.findByText(
        'You do not have access to the customers of this warehouse.',
      ),
    ).toBeVisible();
    expect(screen.queryByText('Nordwind Logistik')).not.toBeInTheDocument();
    expect(
      screen.queryByText('Dockweg 3, 20457 Hamburg'),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole('grid')).not.toBeInTheDocument();
  });

  // The other half of the guard, and a different failure from "holds no Permission": no Warehouse
  // access projection resolved at all. That is the first paint of every entry — and the state a
  // failed access read settles in — so the page must deny while it is unknown rather than fall
  // through to the directory and let the read decide.
  it('denies while no Warehouse access projection has resolved', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve(
          Response.json(
            { code: 'access.denied', message: 'Denied.' },
            { status: 403 },
          ),
        ),
      ),
    );
    const store = authenticatedStore();
    renderInEnteredWarehouse(<CustomerPage />, store, accessIds.warehouse);

    expect(
      await screen.findByText(
        'You do not have access to the customers of this warehouse.',
      ),
    ).toBeVisible();
  });
});
