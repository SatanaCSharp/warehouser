import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Item } from '@warehouser/contracts/items';
import { PermissionId } from '@warehouser/shared-types/enums';
import { RecordDemandAction } from 'modules/customer-order/components/demand-directory/components/RecordDemandAction';
import { itemApi } from 'modules/item/api/item-api';
import { accessPermissionsApi } from 'shared/api/access/access-permissions-api';
import {
  accessIds,
  authenticatedStore,
  stubAccessServer,
} from 'test/access-fixtures';
import { selectHeroOption } from 'test/hero-select';
import { renderInEnteredWarehouse } from 'test/render';
import { afterEach, describe, expect, it, vi } from 'vitest';

// AC-01 — `RecordCustomerOrderDialog.spec.tsx` drives the dialog against a double, so nothing in
// the suite pressed "Record demand" and watched a request leave. The seam this pins is the one the
// dialog cannot: which Warehouse the order is addressed at. A write aimed at the wrong one records
// demand somewhere the member cannot see, and the dialog would still close on success.
//
// Modelled on `AddPurchaseDraftLineAction.spec.tsx`, which pins the same seam for the draft action.

const customerOrdersUrl = `/api/v1/warehouses/${accessIds.warehouse}/customer-orders`;

const item: Item = {
  id: '00000000-0000-4000-8000-000000000101',
  sku: 'WH-100420',
  description: 'Pallet wrap, 500mm',
  unitOfMeasure: 'pieces',
  onHandQuantity: 0,
  deactivatedAt: null,
  namingCustomerOrderCount: 0,
  namingPurchaseDraftLineCount: 0,
  latestAdjustment: null,
  createdAt: '2026-08-01T09:00:00.000Z',
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
  void store.dispatch(
    itemApi.util.upsertQueryData('listItems', accessIds.warehouse, [item]),
  );

  renderInEnteredWarehouse(<RecordDemandAction />, store);

  return recorded;
};

/**
 * The calendar cell for the current day. HeroUI's popover stays `aria-hidden` while it is entering
 * and jsdom never resolves that transition, so the open calendar is only reachable with
 * `{ hidden: true }` — the same reason `test/hero-select.ts` gives. Today is picked rather than a
 * fixed date so the suite does not expire.
 */
const todayCell = (): Promise<HTMLElement> =>
  screen.findByRole('button', { hidden: true, name: /today/iu });

describe('RecordDemandAction', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('addresses recorded demand at the entered Warehouse (AC-01)', async () => {
    const user = userEvent.setup();
    const recorded = renderAction();

    await user.click(
      await screen.findByRole('button', { name: 'Record demand' }),
    );

    const dialog = await screen.findByRole('dialog', {
      name: 'Record what a customer is waiting for',
    });
    // All three pickers in this dialog — Item, Customer, Delivery address —
    // show the same unselected placeholder, so their accessible names share the
    // prefix and differ only by the label they end with. Anchoring on the label
    // is what `RecordCustomerOrderDialog.spec.tsx` already does for `/customer$/`.
    await selectHeroOption(
      user,
      within(dialog).getByRole('button', { name: /item$/iu }),
      'WH-100420 · Pallet wrap, 500mm',
    );
    await user.type(
      within(dialog).getByLabelText('Customer name'),
      'Nordwind Logistik GmbH',
    );
    const quantity = within(dialog).getByLabelText(/quantity/iu);
    await user.clear(quantity);
    await user.type(quantity, '800');
    await user.click(
      within(dialog).getByRole('button', { name: /open calendar/iu }),
    );
    await user.click(await todayCell());
    await user.click(
      within(dialog).getByRole('button', { name: /record demand/iu }),
    );

    await waitFor(() => {
      const posted = recorded.filter(
        ({ url, init }) => url === customerOrdersUrl && init?.method === 'POST',
      );
      expect(posted).toHaveLength(1);
      expect(bodyOf(posted[0]?.init)).toMatchObject({
        itemId: item.id,
        customerName: 'Nordwind Logistik GmbH',
        quantity: 800,
      });
    });
  });

  it('offers nothing to an actor whose Role does not carry CUSTOMER_ORDERS:CREATE', async () => {
    renderAction([PermissionId.CUSTOMER_ORDERS_WATCH]);

    await waitFor(() =>
      expect(
        screen.queryByRole('button', { name: 'Record demand' }),
      ).not.toBeInTheDocument(),
    );
  });
});
