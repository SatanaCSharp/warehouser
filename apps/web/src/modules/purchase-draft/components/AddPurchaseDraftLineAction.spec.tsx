import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Item } from '@warehouser/contracts/items';
import { PermissionId } from '@warehouser/shared-types/enums';
import { itemApi } from 'modules/item/api/item-api';
import { AddPurchaseDraftLineAction } from 'modules/purchase-draft/components/AddPurchaseDraftLineAction';
import { accessPermissionsApi } from 'shared/api/access/access-permissions-api';
import {
  accessIds,
  authenticatedStore,
  stubAccessServer,
} from 'test/access-fixtures';
import { selectHeroOption } from 'test/hero-select';
import { renderInEnteredWarehouse } from 'test/render';
import { afterEach, describe, expect, it, vi } from 'vitest';

// AC-10 / AC-22 — adding a line is the step that turns an empty draft into one
// that says what is being ordered, and the whole workflow had no test anywhere
// in the suite: nothing rendered the trigger, opened the dialog or proved the
// POST was made. This file pins the request end to end.

const DRAFT_ID = '00000000-0000-4000-8000-000000000501';
const linesUrl = `/api/v1/warehouses/${accessIds.warehouse}/purchase-drafts/${DRAFT_ID}/lines`;

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

  renderInEnteredWarehouse(
    <AddPurchaseDraftLineAction
      purchaseDraftId={DRAFT_ID}
      reference="PD-0143"
    />,
    store,
  );

  return recorded;
};

describe('AddPurchaseDraftLineAction', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('adds the item and quantity the member states, as a request (AC-10)', async () => {
    const user = userEvent.setup();
    const recorded = renderAction();

    await user.click(await screen.findByRole('button', { name: 'Add a line' }));

    const dialog = await screen.findByRole('dialog', {
      name: 'Add a line to PD-0143',
    });
    await selectHeroOption(
      user,
      within(dialog).getByRole('button', { name: /item/iu }),
      'WH-100420 · Pallet wrap, 500mm',
    );
    const quantity = within(dialog).getByLabelText('Quantity');
    await user.clear(quantity);
    await user.type(quantity, '1200');
    await user.click(within(dialog).getByRole('button', { name: 'Add line' }));

    await waitFor(() => {
      const posted = recorded.filter(
        ({ url, init }) => url === linesUrl && init?.method === 'POST',
      );
      expect(posted).toHaveLength(1);
      expect(bodyOf(posted[0]?.init)).toStrictEqual({
        itemId: item.id,
        orderedQuantity: 1200,
      });
    });
  });

  it('offers nothing to an actor whose Role does not carry the Permission (AC-22)', async () => {
    renderAction([PermissionId.PURCHASE_DRAFTS_WATCH]);

    await waitFor(() =>
      expect(
        screen.queryByRole('button', { name: 'Add a line' }),
      ).not.toBeInTheDocument(),
    );
  });
});
