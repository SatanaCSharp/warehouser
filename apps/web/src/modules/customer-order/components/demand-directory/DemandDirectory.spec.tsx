import { getLocalTimeZone, today } from '@internationalized/date';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PermissionId } from '@warehouser/shared-types/enums';
import i18n from 'i18next';
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

import { customerOrderApi } from 'modules/customer-order/api/customer-order-api';
import { DemandDirectory } from 'modules/customer-order/components/demand-directory/DemandDirectory';
import { accessPermissionsApi } from 'shared/api/access/access-permissions-api';
import {
  ARCHIVED_WAREHOUSE_REASON_ID,
  useArchivedWarehouse,
} from 'shared/hooks/projections/useArchivedWarehouse';
import { QUANTITY_GROUP_SEPARATOR } from 'shared/utils/number-format';
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
//
// The desktop surface is a HeroUI `Table` whose rows expand
// (`docs/system/adr/27-08-2026-heroui-table-for-web-data-tables.md`), so it is
// found by its ARIA role `treegrid` rather than `table`, its first cell is a
// `rowheader`, and the remaining five are `gridcell`s. That is what React Aria
// exposes for an expandable table, and asserting it is what proves the
// hierarchy is announced rather than merely drawn.
//
// The archived-Warehouse projection is stubbed as `ArchivedWarehouseChip.spec`
// stubs it: the verdict read itself is covered by `useArchivedWarehouse.spec`,
// and what matters here is only what the destination does with the answer.

vi.mock('shared/hooks/projections/useArchivedWarehouse', async () => {
  const actual = await vi.importActual<
    typeof import('shared/hooks/projections/useArchivedWarehouse')
  >('shared/hooks/projections/useArchivedWarehouse');
  return { ...actual, useArchivedWarehouse: vi.fn() };
});

const inArchivedWarehouse = (isArchived: boolean): void => {
  vi.mocked(useArchivedWarehouse).mockReturnValue({
    isArchived,
    reasonId: isArchived ? ARCHIVED_WAREHOUSE_REASON_ID : undefined,
  });
};

/**
 * The sentence `ArchivedWarehouseNotice` renders under
 * `ARCHIVED_WAREHOUSE_REASON_ID`. Matching the description rather than the
 * heading is what proves a reference resolves to the element carrying the id.
 */
const ARCHIVED_REASON =
  /nothing that changes what it holds is authorized any more/iu;

/**
 * The frames group thousands with a no-break space, so an expectation written
 * with an ordinary space would never match what is rendered
 * (`shared/utils/number-format.ts`).
 */
const grouped = (text: string): string =>
  text.replaceAll(' ', QUANTITY_GROUP_SEPARATOR);

/** A calendar date the given number of days from the day the test runs. */
const daysFromToday = (days: number): string =>
  today(getLocalTimeZone()).add({ days }).toString();

const demandLines = (): DemandLine[] => [
  {
    itemId: '00000000-0000-4000-8000-000000000240',
    sku: 'SKU-100',
    description: 'Corrugated box',
    unitOfMeasure: 'pieces',
    totalOutstandingQuantity: 1500,
    earliestNeededBy: '2026-09-01',
    onHandQuantity: 42,
    unfulfilledCustomerOrderCount: 2,
    coverage: [
      {
        purchaseDraftId: '00000000-0000-4000-8000-000000000401',
        purchaseDraftLineId: '00000000-0000-4000-8000-000000000501',
        purchaseDraftReference: 'PD-0142',
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

/** The six cells a Demand row presents, in column order. */
const cellsOf = (row: HTMLElement): HTMLElement[] => [
  ...within(row).getAllByRole('rowheader'),
  ...within(row).getAllByRole('gridcell'),
];

const rowFor = (table: HTMLElement, description: string): HTMLElement =>
  within(table).getByText(description).closest('tr') as HTMLElement;

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
  // One warehouse-wide read backs every expandable row, so the fixture is
  // seeded under that one cache key rather than one per Item.
  void store.dispatch(
    customerOrderApi.util.upsertQueryData(
      'listCustomerOrders',
      { warehouseId: accessIds.warehouse, query: { state: 'unfulfilled' } },
      lines.flatMap((line) => customerOrdersFor(line.itemId)),
    ),
  );
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

  beforeEach(() => {
    inArchivedWarehouse(false);
  });

  afterEach(async () => {
    await i18n.changeLanguage('en');
  });

  it('renders all six demand cells and the coverage chips for a two-draft Demand Line (AC-04, AC-20)', async () => {
    renderDirectory();

    const table = await screen.findByRole('treegrid', { name: /demand/iu });
    const row = rowFor(table, 'Corrugated box');
    // item, outstanding, needed by, on hand, covered by, actions.
    expect(cellsOf(row)).toHaveLength(6);
    // AC-20 / design frame `G6jhw` — every quantity is group-separated and
    // every date is rendered, never a raw ISO string.
    // `toHaveTextContent` normalizes whitespace, which would collapse the
    // no-break group separator away — so the raw text is what proves the
    // quantity is grouped as the frames draw it.
    expect(row.textContent).toContain(grouped('1 500'));
    expect(row).toHaveTextContent('1 Sep 2026');
    expect(row).not.toHaveTextContent('2026-09-01');
    expect(row).toHaveTextContent('42');
    expect(row).toHaveTextContent('SKU-100 · counted in pieces');
  });

  // AC-20 — the member is shown *which* drafts link to the demand, so the chip
  // names the draft and its quantity (`PD-0142 · 800` on frame `G6jhw`). A bare
  // quantity says how much without saying whose, and cannot be acted on.
  it('names the covering draft on its coverage chip, not just the quantity (AC-20)', async () => {
    renderDirectory();

    const table = await screen.findByRole('treegrid', { name: /demand/iu });
    expect(
      within(rowFor(table, 'Corrugated box')).getByText('PD-0142 · 500'),
    ).toBeInTheDocument();
  });

  it('renders remaining demand under a Closed draft as covered by no draft (AC-21a)', async () => {
    renderDirectory();

    const table = await screen.findByRole('treegrid', { name: /demand/iu });
    expect(rowFor(table, 'Pallet wrap')).toHaveTextContent(
      'No draft claims this demand',
    );
  });

  // The single most decision-bearing signal on the row: how long is left, or
  // how long the date has been past (design frame `G6jhw`).
  it('states how urgent each line is, in danger terms once the date has passed', async () => {
    renderDirectory([
      { ...demandLines()[0], earliestNeededBy: daysFromToday(8) },
      {
        ...demandLines()[1],
        earliestNeededBy: daysFromToday(-4),
      },
    ]);

    const table = await screen.findByRole('treegrid', { name: /demand/iu });
    expect(rowFor(table, 'Corrugated box')).toHaveTextContent('in 8 days');
    expect(rowFor(table, 'Pallet wrap')).toHaveTextContent('overdue by 4 days');
  });

  it('expands a Demand Line to its Unfulfilled Customer Orders and never renders a Fulfilled or cancelled one (AC-04, AC-17a)', async () => {
    const user = userEvent.setup();
    renderDirectory();

    const table = await screen.findByRole('treegrid', { name: /demand/iu });
    const disclosure = within(table).getByRole('button', {
      name: /2 customer orders/iu,
    });
    await user.click(disclosure);

    expect(
      await within(table).findByText('Nordwind Logistik'),
    ).toBeInTheDocument();
    expect(within(table).getByText('Baltic Freight')).toBeInTheDocument();
    expect(
      within(table).getByText('1 000 of 1 000 outstanding'),
    ).toBeInTheDocument();
    expect(within(table).getByText('by 1 Sep 2026')).toBeInTheDocument();
    expect(
      within(table).queryByText('Fulfilled Customer'),
    ).not.toBeInTheDocument();
    expect(
      within(table).queryByText('Cancelled Customer'),
    ).not.toBeInTheDocument();
  });

  // design frame `G6jhw` footer row, on `design-handoff.md`'s must-preserve
  // list: what the table counts, and what it deliberately leaves out.
  it('summarizes what the table counts and states what it leaves out', async () => {
    renderDirectory();

    const table = await screen.findByRole('treegrid', { name: /demand/iu });
    const footer = table.closest('[data-slot="table"]') ?? document.body;
    expect(
      within(footer as HTMLElement).getByText(
        '2 items · 3 unfulfilled customer orders',
      ),
    ).toBeInTheDocument();
    expect(
      within(footer as HTMLElement).getByText(
        'Fulfilled and cancelled customer orders are not counted here.',
      ),
    ).toBeInTheDocument();
  });

  // AC-20 — coverage looks like a reservation and is not one, which is exactly
  // what the note under the table exists to say.
  it('states that coverage claims nothing', async () => {
    renderDirectory();

    expect(
      await screen.findByText(
        'Covered by is what someone already ordered — not a reservation',
      ),
    ).toBeInTheDocument();
  });

  it('filters the loaded demand by item or SKU, and says so when nothing matches', async () => {
    const user = userEvent.setup();
    renderDirectory();

    const search = await screen.findByRole('searchbox', {
      name: /search items or skus/iu,
    });
    await user.type(search, 'pallet');

    const table = await screen.findByRole('treegrid', { name: /demand/iu });
    expect(within(table).getByText('Pallet wrap')).toBeInTheDocument();
    expect(within(table).queryByText('Corrugated box')).not.toBeInTheDocument();

    await user.clear(search);
    await user.type(search, 'nothing here');

    expect(await screen.findByRole('status')).toHaveTextContent(
      'No item matches “nothing here”.',
    );
  });

  it('offers no "Record demand" trigger to an actor lacking CUSTOMER_ORDERS:CREATE', async () => {
    renderDirectory(demandLines(), []);

    await screen.findByRole('heading', { name: /demand/iu });
    expect(
      screen.queryByRole('button', { name: /record demand/iu }),
    ).not.toBeInTheDocument();
  });

  // AC-23 — an archived Warehouse is entered read-only, so every mutating
  // control stays visible and disabled with its reason exposed, rather than
  // vanishing and leaving a member to guess.
  it('keeps the record-demand trigger visible, disabled and explained in an archived Warehouse (AC-23)', async () => {
    inArchivedWarehouse(true);
    renderDirectory();

    const trigger = await screen.findByRole('button', {
      name: /record demand/iu,
    });
    expect(trigger).toBeDisabled();
    expect(trigger).toHaveAttribute(
      'aria-describedby',
      ARCHIVED_WAREHOUSE_REASON_ID,
    );
    expect(
      screen.getByText('This warehouse has been archived'),
    ).toBeInTheDocument();
  });

  it('names the empty destination and offers the one action that fills it (AC-04 empty state)', async () => {
    renderDirectory([]);

    expect(
      await screen.findByText('No customer is waiting for anything yet'),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /record demand/iu }),
    ).toBeInTheDocument();
  });

  // The mobile card has no column headers above it, so a bare `1 500`,
  // `1 Sep 2026` and `42` stacked together say nothing about which is which
  // (design frame `SjdPo`). Every value carries its own label.
  it('labels every value on the mobile demand card', async () => {
    renderDirectory();

    const cards = await screen.findByRole('list', { name: /demand/iu });
    const card = within(cards).getByText('Corrugated box').closest('li');
    expect(card).not.toBeNull();
    const labelled = within(card as HTMLElement);
    expect(labelled.getByText('Outstanding')).toBeInTheDocument();
    expect(labelled.getByText('On hand')).toBeInTheDocument();
    expect(labelled.getByText('Earliest needed by')).toBeInTheDocument();
    expect(labelled.getByText('Covered by')).toBeInTheDocument();
    expect(
      labelled.getByText('pieces in the transit zone'),
    ).toBeInTheDocument();
    expect(labelled.getByText('PD-0142 · 500')).toBeInTheDocument();
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
      name: /record what a customer is waiting for/iu,
    });

    await user.keyboard('{Escape}');
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    );
    await waitFor(() => expect(trigger).toHaveFocus());
    expect(dialog).not.toBeInTheDocument();
  });
});

// The Record-demand trigger the suite above covers is only half of AC-23 on
// this destination. The other half is the row menu, where Amend and Cancel are
// disabled — and a disabled control whose reason is announced nowhere is not
// "disabled with its reason stated". It is a separate suite because the
// destination's own suite is already at its length budget, and because these
// cases share one arrangement rather than the default live-Warehouse one.
// F10 — the disclosure control is its own subject: it is the one leaf both the
// table and the card list render, and it carries copy the frames draw
// verbatim. It is a separate suite because the destination's own suite is at
// its length budget.
describe('DemandDirectory disclosure control', () => {
  // F10 — the desktop control used to be `isIconOnly` with its count only in an
  // `aria-label`, so a sighted member could not see how many orders a row
  // expands into and the two surfaces disagreed about the same control. `G6jhw`
  // draws `5 customer orders` / `hide the 2 customer orders` as visible text
  // beside the chevron, and `SjdPo` draws the card's the same way.
  it('draws the disclosure count as visible text on both surfaces, in both states (G6jhw, SjdPo)', async () => {
    const user = userEvent.setup();
    renderDirectory();

    const table = await screen.findByRole('treegrid', { name: /demand/iu });
    const disclosure = within(table).getByRole('button', {
      name: /2 customer orders/iu,
    });
    // Drawn, not only announced. React Aria labels the chevron by the row it
    // belongs to, so the accessible name carries the Item as well — what
    // matters here is that the count is in both.
    expect(disclosure).toHaveTextContent('2 customer orders');
    // Both surfaces are in the document at every width and draw the same copy
    // through the same projection, so neither can state a different count.
    expect(
      screen.getAllByText('2 customer orders').map((node) => node.tagName),
    ).toStrictEqual(['BUTTON', 'BUTTON']);

    await user.click(disclosure);

    expect(
      within(table).getByRole('button', {
        name: /hide the 2 customer orders/iu,
      }),
    ).toHaveTextContent('hide the 2 customer orders');
  });
});

describe('DemandDirectory in an archived Warehouse (AC-23)', () => {
  beforeEach(() => {
    inArchivedWarehouse(true);
  });

  it('states the archived reason on each disabled row action, not only on the trigger', async () => {
    const user = userEvent.setup();
    renderDirectory();

    const table = await screen.findByRole('treegrid', { name: /demand/iu });
    await user.click(
      within(table).getByRole('button', {
        name: /2 customer orders/iu,
      }),
    );
    await within(table).findByText('Nordwind Logistik');
    await user.click(
      within(table).getAllByRole('button', {
        name: /actions for nordwind logistik/iu,
      })[0],
    );

    const menu = screen.getByRole('menu', { name: /actions for nordwind/iu });
    const actions = within(menu).getAllByRole('menuitem');
    expect(actions.map((action) => action.textContent)).toStrictEqual([
      'Amend',
      'Cancel order',
    ]);
    // `toHaveAccessibleDescription` resolves `aria-describedby` the way an
    // assistive technology does, so it fails both when nothing is pointed at
    // and when the id names no element on the page.
    actions.forEach((action) => {
      expect(action).toBeVisible();
      expect(action).toHaveAttribute('aria-disabled', 'true');
      expect(action).toHaveAccessibleDescription(ARCHIVED_REASON);
    });
  });
});
