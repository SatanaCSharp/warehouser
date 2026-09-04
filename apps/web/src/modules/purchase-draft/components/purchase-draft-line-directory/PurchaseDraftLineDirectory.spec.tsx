import { screen, waitFor, within } from '@testing-library/react';
import { PermissionId } from '@warehouser/shared-types/enums';
import omit from 'lodash/omit';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { PurchaseDraftLineDirectory } from 'modules/purchase-draft/components/purchase-draft-line-directory/PurchaseDraftLineDirectory';
import { accessPermissionsApi } from 'shared/api/access/access-permissions-api';
import {
  accessIds,
  authenticatedStore,
  stubAccessServer,
} from 'test/access-fixtures';
import { renderInEnteredWarehouse } from 'test/render';

import type {
  PurchaseDraftLineIdentified,
  PurchaseDraftLineListEntry,
  PurchaseDraftLineRedacted,
} from '@warehouser/contracts/purchase-drafts';

// T23 / AC-22 — "the system separates the lines landing at that Warehouse's own
// Delivery Address from the lines shipping Direct to Customer, listing each
// line of a draft that holds both modes in whichever of the two its own
// delivery mode places it, so that a member preparing the dock sees only the
// goods they will physically handle".
//
// The two halves are read from **one** request, so a draft holding both modes
// cannot appear whole in either.

const linesUrl = `/api/v1/warehouses/${accessIds.warehouse}/purchase-draft-lines`;

const WAREHOUSE_ADDRESS = 'Hafenstraße 14, 20457 Hamburg';
const CUSTOMER_ADDRESS = 'Nordkai 8, 21079 Hamburg';

const dockLine: PurchaseDraftLineIdentified = {
  id: '00000000-0000-4000-8000-000000000611',
  itemId: '00000000-0000-4000-8000-000000000101',
  itemSku: 'WH-100420',
  itemDescription: 'Pallet wrap, 500mm',
  unitOfMeasure: 'pieces',
  orderedQuantity: 140,
  packagingTypeId: null,
  valueAddingNote: null,
  receivedQuantity: null,
  ending: null,
  deliveryMode: 'via_warehouse',
  warehouseDestination: {
    addressText: WAREHOUSE_ADDRESS,
    accessNotes: 'Dock 3; deliveries 07:00-15:00',
    frozen: true,
  },
  customerDestination: null,
  links: [],
};

const directLine: PurchaseDraftLineIdentified = {
  ...dockLine,
  id: '00000000-0000-4000-8000-000000000612',
  itemSku: 'WH-100733',
  itemDescription: 'Carton 600x400x300',
  orderedQuantity: 60,
  deliveryMode: 'direct_to_customer',
  warehouseDestination: null,
  customerDestination: {
    customerDeliveryAddressId: '00000000-0000-4000-8000-000000000301',
    customerId: '00000000-0000-4000-8000-000000000201',
    customerName: 'Nordwind Logistik GmbH',
    addressText: CUSTOMER_ADDRESS,
    accessNotes: null,
    frozen: true,
  },
  links: [],
};

/** The redacted arm: `customerDestination` is absent as a property (AC-09a). */
const redactedDirectLine = (): PurchaseDraftLineRedacted => {
  return {
    ...omit(directLine, ['customerDestination', 'links']),
    links: [],
  };
};

// The two lines above belong to **one** draft, which is what AC-22 measures:
// a mixed draft must be split, not filed whole under one heading.
const entryFor = (
  line: PurchaseDraftLineIdentified | PurchaseDraftLineRedacted,
): PurchaseDraftLineListEntry => ({
  purchaseDraftId: '00000000-0000-4000-8000-000000000501',
  purchaseDraftReference: 'PD-0143',
  purchaseDraftState: 'ready_for_ordering',
  expectedArrivalDate: '2026-09-18',
  line,
});

const renderDirectory = (
  entries: PurchaseDraftLineListEntry[],
  permissionIds: readonly PermissionId[] = Object.values(PermissionId),
): void => {
  stubAccessServer({ permissionIds });
  const served = globalThis.fetch;
  vi.stubGlobal(
    'fetch',
    vi.fn((input: Request | string | URL, init?: RequestInit) => {
      const url = String(input instanceof Request ? input.url : input);
      return url.startsWith(linesUrl)
        ? Promise.resolve(Response.json(entries))
        : served(input, init);
    }),
  );

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
    <PurchaseDraftLineDirectory state="ready_for_ordering" />,
    store,
  );
};

describe('PurchaseDraftLineDirectory', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('files each line of one mixed draft under its own delivery mode', async () => {
    renderDirectory([entryFor(dockLine), entryFor(directLine)]);

    const dock = await screen.findByRole('grid', {
      name: 'Lines landing at this warehouse',
    });
    const direct = await screen.findByRole('grid', {
      name: 'Lines shipping direct to customer',
    });

    expect(within(dock).getByText('WH-100420')).toBeInTheDocument();
    expect(within(dock).queryByText('WH-100733')).not.toBeInTheDocument();
    expect(within(direct).getByText('WH-100733')).toBeInTheDocument();
    expect(within(direct).queryByText('WH-100420')).not.toBeInTheDocument();
  });

  it('names the draft each line belongs to, so the split reads without a second request', async () => {
    renderDirectory([entryFor(dockLine), entryFor(directLine)]);

    await waitFor(() => expect(screen.getAllByText('PD-0143')).toHaveLength(2));
  });

  // AC-10 — the Warehouse's own premises data is never withheld, and is what
  // the dock half of this view exists to state.
  it('states the warehouse destination to a member holding no CUSTOMERS:WATCH', async () => {
    renderDirectory([entryFor(dockLine)], [PermissionId.PURCHASE_DRAFTS_WATCH]);

    expect(await screen.findByText(WAREHOUSE_ADDRESS)).toBeInTheDocument();
  });

  // AC-09a — the direct half still lists the line, because the quantities, the
  // Item and the delivery mode are not customer identity; only who and where
  // is withheld.
  it('withholds the customer destination while still listing the line', async () => {
    renderDirectory(
      [entryFor(redactedDirectLine())],
      [PermissionId.PURCHASE_DRAFTS_WATCH],
    );

    const direct = await screen.findByRole('grid', {
      name: 'Lines shipping direct to customer',
    });

    expect(within(direct).getByText('WH-100733')).toBeInTheDocument();
    expect(
      within(direct).getByText('Customer identity is withheld from you.'),
    ).toBeInTheDocument();
    expect(screen.queryByText(CUSTOMER_ADDRESS)).not.toBeInTheDocument();
    expect(
      screen.queryByText('Nordwind Logistik GmbH'),
    ).not.toBeInTheDocument();
  });

  // Neither half is hidden when it is empty: "no lines are coming to the dock"
  // is the answer a member preparing it needs, and an absent table would read
  // as a failed load.
  //
  // The message belongs to the table itself — `renderEmptyState` on
  // `Table.Body` (`adr/27-08-2026-heroui-table-for-web-data-tables.md`
  // §Decision rule 3), not a paragraph beside it, so a member reading the
  // table's own region is told the answer rather than having to leave it.
  it('says a half is empty inside the table for that half rather than dropping it', async () => {
    renderDirectory([entryFor(directLine)]);

    const dock = await screen.findByRole('grid', {
      name: 'Lines landing at this warehouse',
    });

    expect(
      within(dock).getByText('No lines are coming to this warehouse.'),
    ).toBeInTheDocument();
  });
});
