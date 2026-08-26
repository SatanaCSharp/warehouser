import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PermissionId } from '@warehouser/shared-types/enums';
import i18n from 'i18next';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';

import { ItemDirectory } from 'modules/item/components/item-directory/ItemDirectory';
import { accessPermissionsApi } from 'shared/api/access/access-permissions-api';
import {
  accessIds,
  authenticatedStore,
  stubAccessServer,
} from 'test/access-fixtures';
import { renderInEnteredWarehouse } from 'test/render';

import type { Item } from '@warehouser/contracts/items';
import type { AppStore } from 'store';

// T18 — the Items destination's list owner, composing `Ordering/Item Row`
// (`xEIH0`, desktop `XIvAZ`) and `Item Card Mobile` (`QSHsy`, mobile `VHU6r`).
// DoD: "Frames XIvAZ (1440) and VHU6r (390) are matched, with focus restored
// on dialog close, en/uk copy at full parity". Colocated with the component
// it covers (`placing-web-tests.md` §1).
//
// `CreateItemAction` gates the "Add item" trigger on `ITEMS:CREATE`, read
// from the cached current-access projection of the Warehouse the address
// names (`docs/system/adr/19-08-2026-declarative-permission-gates.md`), so
// this directory is rendered as a descendant of an entered Warehouse match —
// `renderInEnteredWarehouse`, exactly as `MembersTab.spec.tsx` renders the
// access surfaces that read the same projection.

const items: Item[] = [
  {
    id: '00000000-0000-4000-8000-000000000240',
    sku: 'SKU-100',
    description: 'Corrugated box',
    unitOfMeasure: 'each',
    onHandQuantity: 42,
    deactivatedAt: null,
    latestAdjustment: {
      countedQuantity: 42,
      reason: 'Cycle count',
      adjustedAt: '2026-08-20T09:00:00.000Z',
    },
    createdAt: '2026-08-01T09:00:00.000Z',
  },
];

/**
 * Renders the directory for an actor holding `permissionIds`, with that
 * actor's projection already in the cache `CreateItemAction` and every row
 * read — seeding the cache rather than waiting for a request keeps every
 * case below asserting against resolved markup, exactly as
 * `MemberList.spec.tsx`'s `renderMemberList` does for the same projection.
 */
const renderDirectory = (
  directoryItems: Item[] = items,
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
  renderInEnteredWarehouse(
    <ItemDirectory items={directoryItems} />,
    store,
    accessIds.warehouse,
  );
  return store;
};

describe('ItemDirectory', () => {
  // Every case below stubs `fetch` for the access server, which would 404 a
  // first-ever request for the `uk` `item` namespace. Loading both languages
  // once here, before any test's stub replaces `fetch`, caches them for the
  // rest of this file so the "en/uk parity" case's `changeLanguage('uk')`
  // needs no network at all.
  beforeAll(async () => {
    await i18n.changeLanguage('uk');
    await i18n.changeLanguage('en');
  });

  afterEach(async () => {
    await i18n.changeLanguage('en');
  });

  // jsdom applies no stylesheet, so the breakpoint behaviour is asserted
  // through the responsive utility classes the approved frames translate to,
  // exactly as `WarehousesTab.spec.tsx`'s responsive suite does.
  describe('responsive behaviour (desktop 1440 / mobile 390)', () => {
    it('renders the table from the split-view breakpoint up (XIvAZ, 1440)', async () => {
      renderDirectory();

      const table = await screen.findByRole('table', { name: /items/iu });
      expect(table.className).toContain('lg:table');
    });

    it('renders one card per Item below the breakpoint, carrying the same on-hand-and-reason fact (VHU6r, 390)', async () => {
      renderDirectory();

      const list = await screen.findByRole('list', { name: /items/iu });
      expect(list.className).toContain('lg:hidden');
      const card = within(list).getByText('SKU-100').closest('li');
      expect(card).toHaveTextContent('42');
      expect(card).toHaveTextContent('Cycle count');
    });
  });

  it('restores focus to the trigger once the create-item dialog closes', async () => {
    const user = userEvent.setup();
    renderDirectory();

    const trigger = await screen.findByRole('button', { name: /add item/iu });
    await user.click(trigger);
    const dialog = await screen.findByRole('dialog', { name: /add item/iu });

    await user.keyboard('{Escape}');
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    );
    await waitFor(() => expect(trigger).toHaveFocus());
    expect(dialog).not.toBeInTheDocument();
  });

  it('renders its heading and action in both supported languages (en/uk parity)', async () => {
    renderDirectory();
    expect(
      await screen.findByRole('heading', { name: 'Items' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Add item' }),
    ).toBeInTheDocument();

    await i18n.changeLanguage('uk');

    expect(
      await screen.findByRole('heading', { name: 'Товари' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Додати товар' }),
    ).toBeInTheDocument();
  });

  it('names the empty list rather than rendering a bare table (AC-06 empty state)', async () => {
    renderDirectory([]);

    expect(await screen.findByText('No items yet.')).toBeInTheDocument();
  });

  // The ADR's actual guarantee: an actor without `ITEMS:CREATE` is offered no
  // "Add item" trigger at all — absent, not disabled.
  it('does not offer "Add item" to an actor lacking ITEMS:CREATE', async () => {
    renderDirectory(items, []);

    // The sibling heading proves the subject mounted and the projection
    // resolved, so the absent trigger below is the gate withholding it.
    await screen.findByRole('heading', { name: /items/iu });
    expect(
      screen.queryByRole('button', { name: /add item/iu }),
    ).not.toBeInTheDocument();
  });
});
