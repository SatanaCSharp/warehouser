import { screen } from '@testing-library/react';
import { PermissionId } from '@warehouser/shared-types/enums';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { customerOrderApi } from 'modules/customer-order/api/customer-order-api';
import { CustomerOrderPage } from 'modules/customer-order/page';
import { accessPermissionsApi } from 'shared/api/access/access-permissions-api';
import { accessIds, authenticatedStore } from 'test/access-fixtures';
import { renderInEnteredWarehouse } from 'test/render';

// T19 — DoD: "the destination ... the denial surfaces no customer name,
// quantity or Item" (AC-05) and "a permitted actor whose read failed reaches
// an error state rather than an empty surface". Colocated with the page it
// covers (`placing-web-tests.md` §1).

const seedAccess = (
  permissionIds: readonly PermissionId[],
): ReturnType<typeof authenticatedStore> => {
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
  return store;
};

describe('CustomerOrderPage', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('denies an actor without CUSTOMER_ORDERS:WATCH, naming no customer, quantity or Item (AC-05)', async () => {
    const store = seedAccess([]);
    // The demand read is seeded as a *successful*, non-empty response rather
    // than left to fail or stay unseeded: if the permission check were ever
    // dropped, an unseeded/failing read would still show this same denial
    // through `isError`, and the test would stay green for the wrong reason
    // (a false pass caught by mutation testing this dialog's page arm). A
    // resolved read that names a real Item is what forces the denial to come
    // from the Permission branch alone, and proves AC-05's stronger claim:
    // no customer name, quantity or Item leaks even though the data exists.
    void store.dispatch(
      customerOrderApi.util.upsertQueryData('readDemand', accessIds.warehouse, [
        {
          itemId: '00000000-0000-4000-8000-000000000240',
          sku: 'SKU-SECRET',
          description: 'Should never render',
          unitOfMeasure: 'each',
          totalOutstandingQuantity: 999,
          earliestNeededBy: '2026-09-01',
          onHandQuantity: 1,
          unfulfilledCustomerOrderCount: 1,
          coverage: [],
        },
      ]),
    );

    renderInEnteredWarehouse(<CustomerOrderPage />, store, accessIds.warehouse);

    const denial = await screen.findByRole('alert');
    expect(denial).toHaveTextContent('Demand could not be loaded.');
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(screen.queryByText('SKU-SECRET')).not.toBeInTheDocument();
    expect(screen.queryByText('999')).not.toBeInTheDocument();
  });

  it('reaches an error state, not an empty surface, for a permitted actor whose read failed', async () => {
    const store = seedAccess([PermissionId.CUSTOMER_ORDERS_WATCH]);
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve(
          Response.json(
            { code: 'api.unexpected', message: 'The read failed.' },
            { status: 500 },
          ),
        ),
      ),
    );

    renderInEnteredWarehouse(<CustomerOrderPage />, store, accessIds.warehouse);

    const errorState = await screen.findByRole('alert');
    expect(errorState).toHaveTextContent('Demand could not be loaded.');
    expect(screen.queryByText('No demand yet.')).not.toBeInTheDocument();
  });
});
