import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PermissionId } from '@warehouser/shared-types/enums';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { PurchaseDraftLineLinks } from 'modules/purchase-draft/components/purchase-draft-line-links/PurchaseDraftLineLinks';
import { accessPermissionsApi } from 'shared/api/access/access-permissions-api';
import {
  accessIds,
  authenticatedStore,
  stubAccessServer,
} from 'test/access-fixtures';
import { renderInEnteredWarehouse } from 'test/render';

import type { PurchaseDraftLineIdentified } from '@warehouser/contracts/purchase-drafts';

// AC-10 / AC-10a / AC-11a — the `SERVES` section (frame `yGhkK`) and its frozen
// counterpart `SERVED, AS FROZEN` (frame `F0SpRx`): who a line is for, how much
// of it is intended for each of them, and the note stating that those two
// figures never have to agree.
//
// Both mutations this section owns — restating the intended quantity and
// removing a link — are asserted through the **request** they issue, because a
// handler that is called and a request that is made are not the same fact, and
// neither had a test at all.

const DRAFT_ID = '00000000-0000-4000-8000-000000000501';
const LINE_ID = '00000000-0000-4000-8000-000000000201';
const FIRST_LINK_ID = '00000000-0000-4000-8000-000000000301';

const linkUrl = (linkId: string): string =>
  `/api/v1/warehouses/${accessIds.warehouse}/purchase-drafts/${DRAFT_ID}/lines/${LINE_ID}/links/${linkId}`;

const UNPERMITTED_REASON =
  'Your role does not allow purchase drafts to be changed in this warehouse, so this is shown as it stands.';

const line = (
  overrides: Partial<PurchaseDraftLineIdentified> = {},
): PurchaseDraftLineIdentified => ({
  id: LINE_ID,
  itemId: '00000000-0000-4000-8000-000000000101',
  itemSku: 'WH-100420',
  itemDescription: 'Pallet wrap, 500mm',
  unitOfMeasure: 'pieces',
  orderedQuantity: 1200,
  packagingTypeId: null,
  valueAddingNote: null,
  receivedQuantity: null,
  ending: null,
  deliveryMode: 'via_warehouse',
  warehouseDestination: {
    addressText: 'Test Warehouse North, Test Industrial Estate',
    accessNotes: null,
    frozen: false,
  },
  customerDestination: null,
  links: [
    {
      id: FIRST_LINK_ID,
      customerOrderId: '00000000-0000-4000-8000-000000000401',
      customer: null,
      customerName: 'Nordwind Logistik GmbH',
      statedQuantity: 800,
      snapshot: null,
      current: {
        quantity: 800,
        neededBy: '2026-09-02',
        state: 'unfulfilled',
        outstandingQuantity: 800,
        lastChangedAt: null,
        deliveryAddress: null,
      },
      driftSignals: [],
      allocation: null,
    },
    {
      id: '00000000-0000-4000-8000-000000000302',
      customerOrderId: '00000000-0000-4000-8000-000000000402',
      customer: null,
      customerName: 'Baltic Freight OÜ',
      statedQuantity: 400,
      snapshot: null,
      current: {
        quantity: 440,
        neededBy: '2026-09-09',
        state: 'unfulfilled',
        outstandingQuantity: 440,
        lastChangedAt: null,
        deliveryAddress: null,
      },
      driftSignals: [],
      allocation: null,
    },
  ],
  ...overrides,
});

type Recorded = { url: string; init?: RequestInit };

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

const bodiesFor = (
  recorded: Recorded[],
  url: string,
  method: string,
): unknown[] =>
  callsTo(recorded, url, method).map(({ init }) => {
    const body = init?.body;
    return JSON.parse(typeof body === 'string' ? body : '{}') as unknown;
  });

const renderLinks = (
  isFrozen: boolean,
  subject = line(),
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
    <PurchaseDraftLineLinks
      index={1}
      isFrozen={isFrozen}
      line={subject}
      purchaseDraftId={DRAFT_ID}
    />,
    store,
  );

  return recorded;
};

describe('PurchaseDraftLineLinks', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('names every customer the line is for, and what is intended for each', async () => {
    renderLinks(false);

    expect(await screen.findByText('Serves')).toBeInTheDocument();
    expect(screen.getByText('Nordwind Logistik GmbH')).toBeInTheDocument();
    expect(screen.getByText('Baltic Freight OÜ')).toBeInTheDocument();
    expect(screen.getAllByLabelText('Intended for them')).toHaveLength(2);
  });

  // AC-11a — the two figures are stated independently and neither claims the
  // demand, which is exactly what the note beside the button says.
  it('states what was ordered and what is intended, saying they need not agree', async () => {
    renderLinks(false);

    expect(
      await screen.findByText(
        '1 200 ordered · 1 200 intended for customers. These never have to agree, and neither claims the demand.',
      ),
    ).toBeInTheDocument();
  });

  it('says a line nobody is named on is still ordered, and what that means', async () => {
    renderLinks(false, line({ links: [] }));

    expect(
      await screen.findByText(
        'No customer order is linked. This line is still ordered — what arrives on it simply will not be attributed to anyone.',
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        '1 200 ordered · nothing intended for a named customer.',
      ),
    ).toBeInTheDocument();
  });

  // AC-15 — a frozen draft's links are part of the record of what the supplier
  // was told: the section is relabelled in the past tense and offers no way to
  // add another.
  it('renders the frozen treatment without offering a further link (AC-15)', async () => {
    renderLinks(true);

    expect(await screen.findByText('Served, as frozen')).toBeInTheDocument();
    expect(screen.getAllByLabelText('Was intended for')).toHaveLength(2);
    expect(
      screen.queryByRole('button', { name: 'Link a customer order' }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText(
        '1 200 ordered · what was intended for each customer is shown as it stood when the draft was made ready.',
      ),
    ).toBeInTheDocument();
  });

  // AC-10a — the two writes this section owns, asserted through the request
  // each of them issues. Neither had a test at all.
  it('restates what is intended for one customer, as a request (AC-10a)', async () => {
    const user = userEvent.setup();
    const recorded = renderLinks(false);

    const [intended] = await screen.findAllByLabelText('Intended for them');
    await user.clear(intended);
    await user.type(intended, '900');
    await user.tab();

    await waitFor(() =>
      expect(
        bodiesFor(recorded, linkUrl(FIRST_LINK_ID), 'PATCH'),
      ).toContainEqual({ statedQuantity: 900 }),
    );
  });

  it('removes one customer from the line, as a request (AC-10a)', async () => {
    const user = userEvent.setup();
    const recorded = renderLinks(false);

    await user.click(
      await screen.findByRole('button', {
        name: 'Remove Nordwind Logistik GmbH from this line',
      }),
    );

    await waitFor(() =>
      expect(callsTo(recorded, linkUrl(FIRST_LINK_ID), 'DELETE')).toHaveLength(
        1,
      ),
    );
  });

  // AC-22 — the quantity states what the line says and stays, disabled with
  // its reason; the `×` only writes and is withheld with the button that adds
  // a link (`adr/19-08-2026-declarative-permission-gates.md`).
  describe('an actor holding PURCHASE_DRAFTS:WATCH alone (AC-22)', () => {
    it('shows what is intended for each customer, disabled and explained', async () => {
      renderLinks(false, line(), [PermissionId.PURCHASE_DRAFTS_WATCH]);

      const [first, second] =
        await screen.findAllByLabelText('Intended for them');
      expect(first).toBeDisabled();
      expect(first).toHaveAccessibleDescription(UNPERMITTED_REASON);
      expect(second).toBeDisabled();
      expect(second).toHaveAccessibleDescription(UNPERMITTED_REASON);
    });

    it('withholds every control that would write', async () => {
      renderLinks(false, line(), [PermissionId.PURCHASE_DRAFTS_WATCH]);

      await screen.findAllByLabelText('Intended for them');
      expect(
        screen.queryByRole('button', {
          name: 'Remove Nordwind Logistik GmbH from this line',
        }),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole('button', { name: 'Link a customer order' }),
      ).not.toBeInTheDocument();
    });
  });
});
