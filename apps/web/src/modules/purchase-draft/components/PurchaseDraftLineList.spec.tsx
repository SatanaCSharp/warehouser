import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PermissionId } from '@warehouser/shared-types/enums';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { purchaseDraftApi } from 'modules/purchase-draft/api/purchase-draft-api';
import { PurchaseDraftLineList } from 'modules/purchase-draft/components/PurchaseDraftLineList';
import { accessPermissionsApi } from 'shared/api/access/access-permissions-api';
import {
  accessIds,
  authenticatedStore,
  stubAccessServer,
} from 'test/access-fixtures';
import { renderInEnteredWarehouse } from 'test/render';

import type { PurchaseDraftDetail } from '@warehouser/contracts/purchase-drafts';

// T20 — the `LINES` section owns two of the twelve writes: restating a line and
// removing one. Neither had a test asserting a request was issued; the line
// editor's own spec only proves the controls are enabled, which a no-op handler
// satisfies just as well.

const DRAFT_ID = '00000000-0000-4000-8000-000000000501';
const LINE_ID = '00000000-0000-4000-8000-000000000601';
const lineUrl = `/api/v1/warehouses/${accessIds.warehouse}/purchase-drafts/${DRAFT_ID}/lines/${LINE_ID}`;

const draft: PurchaseDraftDetail = {
  id: DRAFT_ID,
  reference: 'PD-0143',
  state: 'draft',
  expectedArrivalDate: null,
  lineCount: 1,
  hasDriftSignal: false,
  hasDirectToCustomerAddressDrift: false,
  closureReason: null,
  createdByUserId: accessIds.actingUser,
  createdAt: '2026-08-01T09:00:00.000Z',
  readiedByUserId: null,
  readiedAt: null,
  closedByUserId: null,
  closedAt: null,
  arrivalConfirmedByUserId: null,
  arrivalConfirmedAt: null,
  discardedByUserId: null,
  discardedAt: null,
  lines: [
    {
      id: LINE_ID,
      itemId: '00000000-0000-4000-8000-000000000101',
      itemSku: 'WH-100420',
      itemDescription: 'Pallet wrap, 500mm',
      unitOfMeasure: 'pieces',
      orderedQuantity: 400,
      packagingTypeId: null,
      valueAddingNote: null,
      ending: null,
      deliveryMode: 'via_warehouse',
      warehouseDestination: {
        addressText: 'Test Warehouse North, Test Industrial Estate',
        accessNotes: null,
        frozen: false,
      },
      customerDestination: null,
      links: [],
    },
  ],
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

const callsTo = (
  recorded: Recorded[],
  url: string,
  method: string,
): Recorded[] =>
  recorded.filter((call) => call.url === url && call.init?.method === method);

const renderList = (): Recorded[] => {
  const permissionIds = Object.values(PermissionId);
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
    purchaseDraftApi.util.upsertQueryData(
      'listPackagingTypes',
      accessIds.warehouse,
      [{ id: 'cartons', label: 'Cartons' }],
    ),
  );

  renderInEnteredWarehouse(
    <PurchaseDraftLineList draft={draft} isFrozen={false} />,
    store,
  );

  return recorded;
};

describe('PurchaseDraftLineList', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('restates the quantity a line orders, as a request (AC-10a)', async () => {
    const user = userEvent.setup();
    const recorded = renderList();

    const quantity = await screen.findByLabelText('Quantity');
    await user.clear(quantity);
    await user.type(quantity, '900');
    await user.tab();

    await waitFor(() => {
      const patched = callsTo(recorded, lineUrl, 'PATCH');
      expect(patched).toHaveLength(1);
      expect(bodyOf(patched[0]?.init)).toStrictEqual({
        orderedQuantity: 900,
      });
    });
  });

  it('restates the packaging a line requires, as a request (AC-12)', async () => {
    const user = userEvent.setup();
    const recorded = renderList();

    await user.click(
      await screen.findByRole('button', { name: /packaging type/iu }),
    );
    const option = screen
      .getAllByRole('option', { name: 'Cartons', hidden: true })
      .find((candidate) => candidate.tagName !== 'OPTION');
    await user.click(option as HTMLElement);

    await waitFor(() => {
      const patched = callsTo(recorded, lineUrl, 'PATCH');
      expect(patched).toHaveLength(1);
      expect(bodyOf(patched[0]?.init)).toStrictEqual({
        packagingTypeId: 'cartons',
      });
    });
  });

  it('removes a line, as a request (AC-10a)', async () => {
    const user = userEvent.setup();
    const recorded = renderList();

    await user.click(
      await screen.findByRole('button', { name: 'Remove line 1' }),
    );

    await waitFor(() =>
      expect(callsTo(recorded, lineUrl, 'DELETE')).toHaveLength(1),
    );
  });
});
