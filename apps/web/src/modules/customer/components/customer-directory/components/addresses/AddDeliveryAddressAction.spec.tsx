import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Customer } from '@warehouser/contracts/customers';
import { PermissionId } from '@warehouser/shared-types/enums';
import { AddDeliveryAddressAction } from 'modules/customer/components/customer-directory/components/addresses/AddDeliveryAddressAction';
import { accessPermissionsApi } from 'shared/api/access/access-permissions-api';
import {
  accessIds,
  authenticatedStore,
  stubAccessServer,
} from 'test/access-fixtures';
import { renderInEnteredWarehouse } from 'test/render';
import { afterEach, describe, expect, it, vi } from 'vitest';

// AC-05 — adding a Delivery Address to a Customer. `AddDeliveryAddressDialog.spec.tsx` covers the
// dialog against a double, so nothing in the suite pressed "Add delivery address" and watched a
// request leave: the seam between the dialog and the mutation had no coverage at all. It is the
// seam that addresses the write at both the entered Warehouse *and* the Customer the pane is open
// for — get either wrong and the address lands on the wrong record while the dialog still closes
// on success.
//
// Modelled on `CreatePurchaseDraftAction.spec.tsx`, which pins the same seam for the draft action.

const customerId = '00000000-0000-4000-8000-000000000701';
const addressesUrl = `/api/v1/warehouses/${accessIds.warehouse}/customers/${customerId}/delivery-addresses`;

const customer: Customer = {
  id: customerId,
  name: 'Nordwind Logistik',
  deactivatedAt: null,
  mainDeliveryAddressId: '00000000-0000-4000-8000-000000000703',
  deliveryAddresses: [],
  recordedByUserId: accessIds.actingUser,
  createdAt: '2026-08-01T09:00:00.000Z',
  updatedAt: '2026-08-01T09:00:00.000Z',
};

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

  renderInEnteredWarehouse(
    <AddDeliveryAddressAction customer={customer} />,
    store,
  );

  return recorded;
};

describe('AddDeliveryAddressAction', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('addresses a new Delivery Address at the entered Warehouse and its Customer (AC-05)', async () => {
    const user = userEvent.setup();
    const recorded = renderAction();

    await user.click(
      await screen.findByRole('button', { name: 'Add delivery address' }),
    );
    const dialog = await screen.findByRole('dialog', {
      name: 'Add a delivery address',
    });
    await user.type(
      within(dialog).getByLabelText('Delivery address'),
      'Speicherweg 4, 21107 Hamburg',
    );
    await user.click(
      within(dialog).getByRole('button', { name: 'Add address' }),
    );

    await waitFor(() => {
      const posted = recorded.filter(
        ({ url, init }) => url === addressesUrl && init?.method === 'POST',
      );
      expect(posted).toHaveLength(1);
      expect(bodyOf(posted[0]?.init)).toMatchObject({
        addressText: 'Speicherweg 4, 21107 Hamburg',
      });
    });
  });

  it('offers nothing to an actor whose Role does not carry CUSTOMERS:UPDATE', async () => {
    renderAction([PermissionId.CUSTOMERS_WATCH]);

    await waitFor(() =>
      expect(
        screen.queryByRole('button', { name: 'Add delivery address' }),
      ).not.toBeInTheDocument(),
    );
  });
});
