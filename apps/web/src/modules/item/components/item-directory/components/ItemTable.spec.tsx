import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PermissionId } from '@warehouser/shared-types/enums';
import { describe, expect, it, vi } from 'vitest';

import { ItemTable } from 'modules/item/components/item-directory/components/ItemTable';
import { QUANTITY_GROUP_SEPARATOR } from 'shared/utils/number-format';
import {
  accessIds,
  authenticatedStore,
  stubAccessServer,
} from 'test/access-fixtures';
import { renderInEnteredWarehouse } from 'test/render';

import type { Item } from '@warehouser/contracts/items';

// T18 — the Items destination's desktop surface (design-handoff.md
// `Ordering/Item Row` `xEIH0`, frame `XIvAZ`). DoD: "A component test proves
// the on-hand cell renders the counted figure AND its reason line — the reason
// is part of the contract, not decoration", plus the description cell's naming
// line (AC-06c), the footer row, and AC-06d's chip-and-still-readable case.
// Colocated with the table it covers (`placing-web-tests.md` §1); it inherits
// the cases `ItemRow.spec.tsx` held before the row became a collection renderer
// with no component of its own
// (`docs/system/adr/27-08-2026-heroui-table-for-web-data-tables.md`).
//
// The table reads the actor's Item actions from the cached current-access
// projection (`docs/system/adr/19-08-2026-declarative-permission-gates.md`),
// so it is rendered as a descendant of an entered Warehouse match —
// `renderInEnteredWarehouse`, exactly as `WarehousePermissionGate.spec.tsx`
// renders the components that read the same projection.
//
// React Aria makes a keyboard-navigable table a `grid`, so its rows carry
// `role="row"` and its first cell is a `rowheader`.
//
// The Permission cases below deliberately do NOT seed the projection into the
// cache: they let the request resolve after first paint, which is what the
// browser does. That is the regression guard for the collection's row cache —
// resolving the actions above the renderer and closing over the result passes
// every seeded test and offers a real actor no menu at all
// (`docs/system/adr/27-08-2026-heroui-table-for-web-data-tables.md`).

const OTHER_USER = '00000000-0000-4000-8000-0000000000ff';

const activeItem = (overrides: Partial<Item> = {}): Item => ({
  id: '00000000-0000-4000-8000-000000000200',
  sku: 'SKU-100',
  description: 'Corrugated box, 12x12x12',
  unitOfMeasure: 'each',
  onHandQuantity: 42,
  deactivatedAt: null,
  namingCustomerOrderCount: 0,
  namingPurchaseDraftLineCount: 0,
  latestAdjustment: {
    countedQuantity: 42,
    reason: 'Cycle count',
    adjustedByUserId: accessIds.actingUser,
    adjustedAt: '2026-08-20T09:00:00.000Z',
  },
  createdAt: '2026-08-01T09:00:00.000Z',
  ...overrides,
});

const renderTable = (
  items: Item[],
  permissionIds: readonly PermissionId[] = Object.values(PermissionId),
): void => {
  stubAccessServer({ permissionIds });
  const store = authenticatedStore();
  renderInEnteredWarehouse(
    <ItemTable
      items={items}
      label="Items"
      onAdjustOnHand={vi.fn()}
      onCorrect={vi.fn()}
      onDeactivate={vi.fn()}
    />,
    store,
    accessIds.warehouse,
  );
};

const row = async (): Promise<HTMLElement> =>
  screen.findByRole('row', { name: /sku-100/iu });

describe('ItemTable', () => {
  it('renders the six cells of one Item row', async () => {
    renderTable([activeItem()]);

    // SKU, description, unit, on hand, status, actions.
    expect([
      ...within(await row()).getAllByRole('rowheader'),
      ...within(await row()).getAllByRole('gridcell'),
    ]).toHaveLength(6);
  });

  it('renders the on-hand figure together with the whole reason line: when, why and by whom (AC-08)', async () => {
    renderTable([activeItem()]);

    // The reason is part of the contract, not decoration: a row rendering
    // "42" without "Cycle count" anywhere would still pass a figure-only
    // assertion, which is exactly what this test refuses to accept.
    expect(await row()).toHaveTextContent('42');
    expect(await row()).toHaveTextContent('20 Aug · Cycle count · by you');
  });

  it('attributes an adjustment made by somebody else neutrally, never with an invented name', async () => {
    renderTable([
      activeItem({
        latestAdjustment: {
          countedQuantity: 42,
          reason: 'Returned from a cancelled order',
          adjustedByUserId: OTHER_USER,
          adjustedAt: '2026-08-20T09:00:00.000Z',
        },
      }),
    ]);

    expect(await row()).toHaveTextContent(
      '20 Aug · Returned from a cancelled order · by another member',
    );
  });

  it('says nothing is recorded yet when the Item has never been adjusted', async () => {
    renderTable([activeItem({ onHandQuantity: 0, latestAdjustment: null })]);

    expect(await row()).toHaveTextContent('0');
    expect(await row()).toHaveTextContent('nothing recorded yet');
  });

  it('groups an on-hand figure rather than rendering a bare integer', async () => {
    renderTable([activeItem({ onHandQuantity: 1200 })]);

    // The frames group thousands with a NO-BREAK space, so the separator is
    // taken from the formatter's own constant rather than typed as an
    // invisible literal here.
    expect(await row()).not.toHaveTextContent('1200');
    expect((await row()).textContent).toContain(
      `1${QUANTITY_GROUP_SEPARATOR}200`,
    );
  });

  it('names what references the Item under its description (AC-06c)', async () => {
    renderTable([
      activeItem({
        namingCustomerOrderCount: 3,
        namingPurchaseDraftLineCount: 1,
      }),
    ]);

    expect(await row()).toHaveTextContent(
      'Named by 3 customer orders and 1 draft line',
    );
  });

  it('says the SKU is still correctable when nothing names the Item (AC-06c)', async () => {
    renderTable([activeItem()]);

    expect(await row()).toHaveTextContent(
      'Nothing names it yet — its SKU is still correctable',
    );
  });

  it('chips a deactivated Item as Inactive, dims it, and keeps its row readable (AC-06d)', async () => {
    renderTable([
      activeItem({
        deactivatedAt: '2026-08-21T09:00:00.000Z',
        namingCustomerOrderCount: 2,
      }),
    ]);

    expect(await row()).toHaveTextContent('Inactive');
    expect((await row()).className).toContain('opacity-60');
    expect(await row()).toHaveTextContent(
      'Named by 2 customer orders · no longer offered when demand or a draft is assembled',
    );
    // Still readable: the SKU, description and figures remain in the DOM
    // rather than being replaced by the chip.
    expect(await row()).toHaveTextContent('Corrugated box, 12x12x12');
    expect(await row()).toHaveTextContent('42');
  });

  it('chips an active Item as Active rather than stating its status by omission', async () => {
    renderTable([activeItem()]);

    expect(await row()).toHaveTextContent('Active');
    expect(await row()).not.toHaveTextContent('Inactive');
  });

  it('counts the collection in a footer and says what an inactive Item still does', async () => {
    renderTable([
      activeItem(),
      activeItem({
        id: '00000000-0000-4000-8000-000000000201',
        sku: 'SKU-101',
        deactivatedAt: '2026-08-21T09:00:00.000Z',
      }),
    ]);
    await row();

    expect(screen.getByText('2 items · 1 inactive')).toBeVisible();
    expect(
      screen.getByText(
        'An inactive item keeps its SKU and keeps counting on every record that already names it.',
      ),
    ).toBeVisible();
  });

  it('omits the inactive count entirely when every Item is active', async () => {
    renderTable([activeItem()]);
    await row();

    expect(screen.getByText('1 item')).toBeVisible();
  });

  // The ADR's actual guarantee: an actor holding none of the write
  // Permissions is offered no actions menu at all — absent, not disabled.
  it('offers no actions menu to an actor holding none of the write Permissions', async () => {
    renderTable([activeItem()], []);

    await row();
    expect(
      screen.queryByRole('button', { name: /actions for/iu }),
    ).not.toBeInTheDocument();
  });

  it('offers only the correct action to an actor holding ITEMS:UPDATE alone', async () => {
    const user = userEvent.setup();
    renderTable([activeItem()], [PermissionId.ITEMS_UPDATE]);

    const trigger = await screen.findByRole('button', {
      name: /actions for/iu,
    });
    await user.click(trigger);

    const menu = screen.getByRole('menu', { name: /actions for/iu });
    expect(
      within(menu).getByRole('menuitem', { name: /correct item/iu }),
    ).toBeInTheDocument();
    expect(
      within(menu).queryByRole('menuitem', { name: /deactivate/iu }),
    ).not.toBeInTheDocument();
    expect(
      within(menu).queryByRole('menuitem', {
        name: /adjust on-hand quantity/iu,
      }),
    ).not.toBeInTheDocument();
  });

  it('offers only the deactivate action to an actor holding ITEMS:DEACTIVATE alone', async () => {
    const user = userEvent.setup();
    renderTable([activeItem()], [PermissionId.ITEMS_DEACTIVATE]);

    const trigger = await screen.findByRole('button', {
      name: /actions for/iu,
    });
    await user.click(trigger);

    const menu = screen.getByRole('menu', { name: /actions for/iu });
    expect(
      within(menu).getByRole('menuitem', { name: /deactivate/iu }),
    ).toBeInTheDocument();
    expect(
      within(menu).queryByRole('menuitem', { name: /correct item/iu }),
    ).not.toBeInTheDocument();
  });

  it('names the toggle Reactivate for an Item that is already deactivated', async () => {
    const user = userEvent.setup();
    renderTable(
      [activeItem({ deactivatedAt: '2026-08-21T09:00:00.000Z' })],
      [PermissionId.ITEMS_DEACTIVATE],
    );

    const trigger = await screen.findByRole('button', {
      name: /actions for/iu,
    });
    await user.click(trigger);

    const menu = screen.getByRole('menu', { name: /actions for/iu });
    expect(
      within(menu).getByRole('menuitem', { name: /reactivate/iu }),
    ).toBeInTheDocument();
  });

  it('offers only the adjust-on-hand action to an actor holding ITEM_STOCK:ADJUST alone', async () => {
    const user = userEvent.setup();
    renderTable([activeItem()], [PermissionId.ITEM_STOCK_ADJUST]);

    const trigger = await screen.findByRole('button', {
      name: /actions for/iu,
    });
    await user.click(trigger);

    const menu = screen.getByRole('menu', { name: /actions for/iu });
    expect(
      within(menu).getByRole('menuitem', {
        name: /adjust on-hand quantity/iu,
      }),
    ).toBeInTheDocument();
    expect(
      within(menu).queryByRole('menuitem', { name: /correct item/iu }),
    ).not.toBeInTheDocument();
  });
});
