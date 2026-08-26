import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PermissionId } from '@warehouser/shared-types/enums';
import i18n from 'i18next';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';

import { customerOrderApi } from 'modules/customer-order/api/customer-order-api';
import { DemandDirectory } from 'modules/customer-order/components/demand-directory/DemandDirectory';
import { accessPermissionsApi } from 'shared/api/access/access-permissions-api';
import {
  accessIds,
  authenticatedStore,
  stubAccessServer,
} from 'test/access-fixtures';
import { renderInEnteredWarehouse } from 'test/render';

import type {
  CustomerOrder,
  DemandLine,
} from '@warehouser/contracts/customer-orders';
import type { AppStore } from 'store';

// T19 — the Demand destination's list owner, composing `Ordering/Demand Row`
// (`prm7R`, desktop `G6jhw`) and `Ordering/Demand Card Mobile` (`XYIfs`,
// mobile `SjdPo`). DoD: "a component test proves all six demand cells and the
// coverage chips render", "a Fulfilled or cancelled Customer Order is never
// rendered as a sub-row", "remaining demand under a Closed draft renders as
// covered by no draft". Colocated with the component it covers
// (`placing-web-tests.md` §1).

const demandLines = (): DemandLine[] => [
  {
    itemId: '00000000-0000-4000-8000-000000000240',
    sku: 'SKU-100',
    description: 'Corrugated box',
    unitOfMeasure: 'each',
    totalOutstandingQuantity: 1500,
    earliestNeededBy: '2026-09-01',
    onHandQuantity: 42,
    unfulfilledCustomerOrderCount: 2,
    coverage: [
      {
        purchaseDraftId: '00000000-0000-4000-8000-000000000401',
        purchaseDraftLineId: '00000000-0000-4000-8000-000000000501',
        purchaseDraftState: 'draft',
        statedQuantity: 500,
      },
    ],
  },
  {
    itemId: '00000000-0000-4000-8000-000000000241',
    sku: 'SKU-200',
    description: 'Pallet wrap',
    unitOfMeasure: 'roll',
    totalOutstandingQuantity: 300,
    earliestNeededBy: '2026-09-15',
    onHandQuantity: 10,
    unfulfilledCustomerOrderCount: 1,
    // AC-21a — remaining demand under a Closed draft is never presented as
    // Coverage: `readConsolidatedDemand` omits it server-side, so an empty
    // array is the honest fixture for a line a Closed draft used to cover.
    coverage: [],
  },
];

const customerOrdersFor = (itemId: string): CustomerOrder[] => [
  {
    id: '00000000-0000-4000-8000-000000000301',
    itemId,
    customerName: 'Nordwind Logistik',
    quantity: 1000,
    outstandingQuantity: 1000,
    neededBy: '2026-09-01',
    state: 'unfulfilled',
    cancellationReason: null,
    recordedByUserId: accessIds.actingUser,
    cancelledByUserId: null,
    cancelledAt: null,
    createdAt: '2026-08-01T09:00:00.000Z',
    updatedAt: '2026-08-01T09:00:00.000Z',
  },
  {
    id: '00000000-0000-4000-8000-000000000302',
    itemId,
    customerName: 'Baltic Freight',
    quantity: 500,
    outstandingQuantity: 500,
    neededBy: '2026-09-05',
    state: 'unfulfilled',
    cancellationReason: null,
    recordedByUserId: accessIds.actingUser,
    cancelledByUserId: null,
    cancelledAt: null,
    createdAt: '2026-08-01T09:00:00.000Z',
    updatedAt: '2026-08-01T09:00:00.000Z',
  },
  // AC-04 / AC-17a — a Fulfilled order and a cancelled one, mixed into the
  // same server response the sub-row's own query returns, so `useDemand`'s
  // client-side `state === 'unfulfilled'` filter is what this suite proves
  // rather than trusting the query string alone.
  {
    id: '00000000-0000-4000-8000-000000000303',
    itemId,
    customerName: 'Fulfilled Customer',
    quantity: 200,
    outstandingQuantity: 0,
    neededBy: '2026-08-20',
    state: 'fulfilled',
    cancellationReason: null,
    recordedByUserId: accessIds.actingUser,
    cancelledByUserId: null,
    cancelledAt: null,
    createdAt: '2026-08-01T09:00:00.000Z',
    updatedAt: '2026-08-01T09:00:00.000Z',
  },
  {
    id: '00000000-0000-4000-8000-000000000304',
    itemId,
    customerName: 'Cancelled Customer',
    quantity: 100,
    outstandingQuantity: 100,
    neededBy: '2026-08-20',
    state: 'cancelled',
    cancellationReason: 'No longer needed',
    recordedByUserId: accessIds.actingUser,
    cancelledByUserId: accessIds.actingUser,
    cancelledAt: '2026-08-15T09:00:00.000Z',
    createdAt: '2026-08-01T09:00:00.000Z',
    updatedAt: '2026-08-15T09:00:00.000Z',
  },
];

const renderDirectory = (
  lines: DemandLine[] = demandLines(),
  permissionIds: readonly PermissionId[] = Object.values(PermissionId),
): AppStore => {
  stubAccessServer({ permissionIds });
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
  for (const line of lines) {
    void store.dispatch(
      customerOrderApi.util.upsertQueryData(
        'listCustomerOrders',
        {
          warehouseId: accessIds.warehouse,
          query: { itemId: line.itemId, state: 'unfulfilled' },
        },
        customerOrdersFor(line.itemId),
      ),
    );
  }
  renderInEnteredWarehouse(
    <DemandDirectory demandLines={lines} />,
    store,
    accessIds.warehouse,
  );
  return store;
};

describe('DemandDirectory', () => {
  beforeAll(async () => {
    await i18n.changeLanguage('uk');
    await i18n.changeLanguage('en');
  });

  afterEach(async () => {
    await i18n.changeLanguage('en');
  });

  it('renders all six demand cells and the coverage chips for a two-draft Demand Line (AC-04, AC-20)', async () => {
    renderDirectory();

    const table = await screen.findByRole('table', { name: /demand/iu });
    const row = within(table).getByText('SKU-100').closest('tr');
    expect(row).not.toBeNull();
    const cells = within(row as HTMLElement).getAllByRole('cell');
    // item, outstanding, needed by, on hand, covered by, actions.
    expect(cells).toHaveLength(6);
    expect(row).toHaveTextContent('1500');
    expect(row).toHaveTextContent('2026-09-01');
    expect(row).toHaveTextContent('42');
    expect(
      within(row as HTMLElement).getByText('500 on draft'),
    ).toBeInTheDocument();
  });

  it('renders remaining demand under a Closed draft as covered by no draft (AC-21a)', async () => {
    renderDirectory();

    const table = await screen.findByRole('table', { name: /demand/iu });
    const row = within(table).getByText('SKU-200').closest('tr');
    expect(row).toHaveTextContent('Covered by no draft');
  });

  it('expands a Demand Line to its Unfulfilled Customer Orders and never renders a Fulfilled or cancelled one (AC-04, AC-17a)', async () => {
    const user = userEvent.setup();
    renderDirectory();

    const table = await screen.findByRole('table', { name: /demand/iu });
    const disclosure = within(table).getByRole('button', {
      name: /show the 2 customer orders for sku-100/iu,
    });
    await user.click(disclosure);

    expect(
      await within(table).findByText('Nordwind Logistik'),
    ).toBeInTheDocument();
    expect(within(table).getByText('Baltic Freight')).toBeInTheDocument();
    expect(
      within(table).queryByText('Fulfilled Customer'),
    ).not.toBeInTheDocument();
    expect(
      within(table).queryByText('Cancelled Customer'),
    ).not.toBeInTheDocument();
  });

  it('offers no "Record demand" trigger to an actor lacking CUSTOMER_ORDERS:CREATE', async () => {
    renderDirectory(demandLines(), []);

    await screen.findByRole('heading', { name: /demand/iu });
    expect(
      screen.queryByRole('button', { name: /record demand/iu }),
    ).not.toBeInTheDocument();
  });

  it('names the empty list rather than rendering a bare table (AC-04 empty state)', async () => {
    renderDirectory([]);

    expect(await screen.findByText('No demand yet.')).toBeInTheDocument();
  });

  it('renders its heading in both supported languages (en/uk parity)', async () => {
    renderDirectory();
    expect(
      await screen.findByRole('heading', { name: 'Demand' }),
    ).toBeInTheDocument();

    await i18n.changeLanguage('uk');

    expect(
      await screen.findByRole('heading', { name: 'Попит' }),
    ).toBeInTheDocument();
  });

  it('restores focus to the trigger once the record-demand dialog closes', async () => {
    const user = userEvent.setup();
    renderDirectory();

    const trigger = await screen.findByRole('button', {
      name: /record demand/iu,
    });
    await user.click(trigger);
    const dialog = await screen.findByRole('dialog', {
      name: /record demand/iu,
    });

    await user.keyboard('{Escape}');
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    );
    await waitFor(() => expect(trigger).toHaveFocus());
    expect(dialog).not.toBeInTheDocument();
  });
});
