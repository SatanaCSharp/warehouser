import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PermissionId } from '@warehouser/shared-types/enums';
import { RecordCustomerAction } from 'modules/customer/components/customer-directory/components/customers/RecordCustomerAction';
import { accessPermissionsApi } from 'shared/api/access/access-permissions-api';
import {
  accessIds,
  authenticatedStore,
  stubAccessServer,
} from 'test/access-fixtures';
import { renderInEnteredWarehouse } from 'test/render';
import { afterEach, describe, expect, it, vi } from 'vitest';

// AC-01 — recording a Customer. `RecordCustomerDialog.spec.tsx` covers the dialog against a double,
// so nothing in the suite pressed "Record customer" and watched a request leave: the seam between
// the dialog and the mutation — which is where the Warehouse the write is addressed at comes from —
// had no coverage at all. A write addressed at the wrong Warehouse records the Customer somewhere
// the member cannot see, and the dialog would still close on success.
//
// Modelled on `CreatePurchaseDraftAction.spec.tsx`, which pins the same seam for the draft action.

const customersUrl = `/api/v1/warehouses/${accessIds.warehouse}/customers`;

type Recorded = { url: string; init?: RequestInit };

/** The JSON body a recorded request carried, as the endpoint sent it. */
const bodyOf = (init?: RequestInit): unknown =>
  JSON.parse(typeof init?.body === 'string' ? init.body : '{}') as unknown;

const recordRequests = (): Recorded[] => {
  const served = globalThis.fetch;
  const recorded: Recorded[] = [];

  vi.stubGlobal(
    'fetch',
    vi.fn((input: Request | string | URL, init?: RequestInit) => {
      recorded.push({
        url: String(input instanceof Request ? input.url : input),
        init,
      });

      return served(input, init);
    }),
  );

  return recorded;
};

const renderAction = (
  permissionIds: readonly PermissionId[] = Object.values(PermissionId),
): Recorded[] => {
  stubAccessServer({ permissionIds });
  const recorded = recordRequests();
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

  renderInEnteredWarehouse(<RecordCustomerAction />, store);

  return recorded;
};

describe('RecordCustomerAction', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('addresses a recorded Customer at the entered Warehouse (AC-01)', async () => {
    const user = userEvent.setup();
    const recorded = renderAction();

    await user.click(
      await screen.findByRole('button', { name: 'Record customer' }),
    );
    const dialog = await screen.findByRole('dialog', {
      name: 'Record a customer',
    });
    await user.type(
      within(dialog).getByLabelText('Customer name'),
      'Nordwind Logistik',
    );
    await user.type(
      within(dialog).getByLabelText('Delivery address'),
      'Dockweg 3, 20457 Hamburg',
    );
    await user.click(
      within(dialog).getByRole('button', { name: 'Record customer' }),
    );

    await waitFor(() => {
      const posted = recorded.filter(
        ({ url, init }) => url === customersUrl && init?.method === 'POST',
      );
      expect(posted).toHaveLength(1);
      expect(bodyOf(posted[0]?.init)).toMatchObject({
        name: 'Nordwind Logistik',
        deliveryAddress: { addressText: 'Dockweg 3, 20457 Hamburg' },
      });
    });
  });

  it('offers nothing to an actor whose Role does not carry CUSTOMERS:CREATE', async () => {
    renderAction([PermissionId.CUSTOMERS_WATCH]);

    await waitFor(() =>
      expect(
        screen.queryByRole('button', { name: 'Record customer' }),
      ).not.toBeInTheDocument(),
    );
  });
});
