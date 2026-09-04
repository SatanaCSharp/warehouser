import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PermissionId } from '@warehouser/shared-types/enums';
import { describe, expect, it, vi } from 'vitest';

import { CustomerActionsMenu } from 'modules/customer/components/customer-directory/components/customers/CustomerActionsMenu';
import { accessPermissionsApi } from 'shared/api/access/access-permissions-api';
import {
  accessIds,
  authenticatedStore,
  stubAccessServer,
} from 'test/access-fixtures';
import { renderInEnteredWarehouse } from 'test/render';

import type { Customer } from '@warehouser/contracts/customers';

// delivery-addresses R8 — the reactivation half of AC-06. This is not one of
// the seven dialogs the review named, but reactivation asks nothing
// (`DeactivateCustomerDialog`'s own docblock, `useCustomerActions.ts`), so it
// is a bare request this menu runs itself — it has no dialog to colocate the
// coverage with. Colocated with the file that owns the request
// (`placing-web-tests.md` §1).

const inactiveCustomer: Customer = {
  id: '00000000-0000-4000-8000-000000000202',
  name: 'Südsee Handel AG',
  deactivatedAt: '2026-09-01T08:00:00.000Z',
  mainDeliveryAddressId: null,
  deliveryAddresses: [],
  recordedByUserId: accessIds.actingUser,
  createdAt: '2026-08-01T09:00:00.000Z',
  updatedAt: '2026-09-01T08:00:00.000Z',
};

type FetchArgs = [Request | string | URL, RequestInit | undefined];
type FetchMock = ReturnType<
  typeof vi.fn<(...args: FetchArgs) => Promise<Response>>
>;

/**
 * Wraps `stubAccessServer`'s fetch rather than replacing it — the actor
 * context and the current-access read still have to answer — the same
 * composition `failAccessRead` uses.
 */
const stubReactivation = (): FetchMock => {
  const served = globalThis.fetch;
  const fetchMock = vi.fn<(...args: FetchArgs) => Promise<Response>>(
    (input, init) => {
      const url = String(input instanceof Request ? input.url : input);
      const method = input instanceof Request ? input.method : init?.method;
      if (url.endsWith('/deactivation') && method === 'DELETE') {
        return Promise.resolve(
          Response.json({ ...inactiveCustomer, deactivatedAt: null }),
        );
      }
      return served(input, init);
    },
  );
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
};

const renderMenu = (): void => {
  stubAccessServer({ permissionIds: Object.values(PermissionId) });
  const store = authenticatedStore();
  void store.dispatch(
    accessPermissionsApi.util.upsertQueryData(
      'getCurrentAccess',
      accessIds.warehouse,
      {
        warehouseId: accessIds.warehouse,
        roleId: accessIds.managerRole,
        roleKind: 'warehouse_manager',
        permissionIds: Object.values(PermissionId),
        archivedAt: null,
      },
    ),
  );

  renderInEnteredWarehouse(
    <CustomerActionsMenu
      customer={inactiveCustomer}
      onCorrect={vi.fn()}
      onDeactivate={vi.fn()}
    />,
    store,
    accessIds.warehouse,
  );
};

describe('CustomerActionsMenu', () => {
  // AC-06 — reactivating asks nothing, so it is offered as a bare action
  // rather than a dialog, and choosing it sends the request straight away.
  it('offers Reactivate customer on an Inactive customer, and reactivating requests it (AC-06)', async () => {
    const user = userEvent.setup();
    renderMenu();
    const fetchMock = stubReactivation();

    await user.click(
      await screen.findByRole('button', {
        name: 'Actions for Südsee Handel AG',
      }),
    );
    expect(
      screen.queryByRole('menuitem', { name: 'Deactivate customer' }),
    ).not.toBeInTheDocument();
    await user.click(
      await screen.findByRole('menuitem', { name: 'Reactivate customer' }),
    );

    const deactivationCall = (): [string, string] | undefined => {
      const call = fetchMock.mock.calls.find(([input, init]) => {
        const method = input instanceof Request ? input.method : init?.method;
        return method === 'DELETE';
      });
      if (!call) {
        return undefined;
      }
      const [input, init] = call;
      return [
        String(input instanceof Request ? input.url : input),
        input instanceof Request ? input.method : (init?.method ?? ''),
      ];
    };

    await waitFor(() => expect(deactivationCall()).toBeDefined());
    const [url, method] = deactivationCall() as [string, string];
    expect(method).toBe('DELETE');
    expect(url).toBe(
      `/api/v1/warehouses/${accessIds.warehouse}/customers/${inactiveCustomer.id}/deactivation`,
    );
  });
});
