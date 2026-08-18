import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { Provider } from 'react-redux';
import { describe, expect, it } from 'vitest';

import { WarehouseList } from 'modules/workspace/components/workspace-administration/warehouses/WarehouseList';
import { makeStore } from 'store';
import { renderWithProviders } from 'test/render';

import type { Warehouse } from '@warehouser/contracts/workspaces';
import type { ReactElement } from 'react';

/**
 * The seven cases `sad.md` §5.4 assigns to `WarehouseList`: the six of the
 * former "the Warehouse list (AC-33, AC-12a)" block, plus the one accessibility
 * case whose subject is the list itself. Each is carried over from
 * `WarehousesTab.spec.tsx` at
 * `baseline_revision = 42f1205d552f8284f8ec57358ad9022340b5f76e` with every
 * expectation's subject and expected value unchanged; only the mount changed
 * (CR-RG-01 §"Assertion drift, defined").
 *
 * The list is mounted on **plain props with no server stub**: it reads nothing
 * of its own, and a leaf that could not mount without a stub would have
 * acquired a read the split forbids.
 */

const warehouseIds = {
  central: '00000000-0000-4000-8000-000000000110',
  north: '00000000-0000-4000-8000-000000000111',
  oldDepot: '00000000-0000-4000-8000-000000000112',
};

/** The Workspace's Warehouses as the tab passes them down. */
const workspaceWarehouses = (): Warehouse[] => [
  { id: warehouseIds.central, name: 'Central DC', archivedAt: null },
  { id: warehouseIds.north, name: 'North Hub', archivedAt: null },
  {
    id: warehouseIds.oldDepot,
    name: 'Old Depot',
    archivedAt: '2026-08-01T09:00:00.000Z',
  },
];

/** Two people reach Central DC and one reaches North Hub. */
const peopleCounts = {
  [warehouseIds.central]: 2,
  [warehouseIds.north]: 1,
};

type HarnessProps = {
  isLoading?: boolean;
  warehouses?: Warehouse[];
};

/**
 * Owns the selection the tab owns in production, so the list keeps behaving as
 * a controlled component without a store, a query or a router behind it. The
 * first Warehouse starts selected, which is what `WarehousesTab` does when no
 * row has been chosen yet.
 */
const WarehouseListHarness = ({
  isLoading = false,
  warehouses = workspaceWarehouses(),
}: HarnessProps): ReactElement => {
  const [selectedWarehouseId, setSelectedWarehouseId] = useState<
    string | undefined
  >(warehouses[0]?.id);

  return (
    <WarehouseList
      isLoading={isLoading}
      membershipWarehouseIds={[]}
      peopleCounts={peopleCounts}
      selectedWarehouseId={selectedWarehouseId}
      warehouses={warehouses}
      onSelect={setSelectedWarehouseId}
    />
  );
};

/**
 * Returns the one transition a case needs — the list arriving after its
 * skeleton — because `isLoading` is a prop here rather than a query state.
 *
 * The empty query cache asserted below is a **new setup-level assertion**
 * pinning the harness (permitted by CR-RG-01, and required by CR-AC-04's
 * plain-props clause): the list is given a real store and issues no request
 * against it.
 */
const renderList = (
  props: HarnessProps = {},
): { showListArriving: () => void } => {
  const store = makeStore();
  const { rerender } = renderWithProviders(
    <WarehouseListHarness {...props} />,
    store,
  );
  expect(store.getState().api.queries).toEqual({});

  return {
    showListArriving: () => {
      rerender(
        <Provider store={store}>
          <WarehouseListHarness {...props} isLoading={false} />
        </Provider>,
      );
      expect(store.getState().api.queries).toEqual({});
    },
  };
};

const selectWarehouse = async (
  user: ReturnType<typeof userEvent.setup>,
  name: string,
): Promise<void> => {
  await user.click(
    await screen.findByRole('button', { name: new RegExp(name, 'u') }),
  );
};

describe('WarehouseList', () => {
  describe('the Warehouse list (AC-33, AC-12a)', () => {
    it('announces the loading skeleton as "Loading warehouses" before the list arrives', async () => {
      const { showListArriving } = renderList({ isLoading: true });

      expect(
        await screen.findByLabelText('Loading warehouses'),
      ).toBeInTheDocument();

      showListArriving();

      expect(
        await screen.findByRole('button', { name: /central dc/iu }),
      ).toBeInTheDocument();
    });

    it('lists every Warehouse of the Workspace with the number of people who have access', async () => {
      renderList();

      const list = await screen.findByRole('list', { name: 'Warehouses' });
      const entries = within(list).getAllByRole('listitem');
      expect(entries.map((entry) => entry.textContent)).toEqual([
        expect.stringContaining('Central DC'),
        expect.stringContaining('North Hub'),
        expect.stringContaining('Old Depot'),
      ]);
      expect(entries[0]?.textContent).toContain('2 people with access');
    });

    it('marks an archived Warehouse with a chip and meta text rather than colour alone (AC-12a)', async () => {
      renderList();

      const list = await screen.findByRole('list', { name: 'Warehouses' });
      const archived = within(list)
        .getAllByRole('listitem')
        .find((entry) => entry.textContent?.includes('Old Depot'));
      expect(archived?.textContent).toContain('Archived');
      expect(archived?.textContent).toContain('read-only');
    });

    // Being in operation is a Warehouse's default state, so the row says
    // nothing about it — only the departure from that default (archived) is
    // marked (`zubpS`). The chip is what the archived row above asserts.
    it('leaves a non-archived Warehouse row unchipped', async () => {
      renderList();

      const list = await screen.findByRole('list', { name: 'Warehouses' });
      const inOperation = within(list)
        .getAllByRole('listitem')
        .find((entry) => entry.textContent?.includes('Central DC'));
      expect(inOperation?.textContent).not.toContain('In operation');
      expect(inOperation?.textContent).not.toContain('Archived');
    });

    it('filters the list by the local search term', async () => {
      const user = userEvent.setup();

      renderList();

      await screen.findByRole('button', { name: /central dc/iu });
      await user.type(
        screen.getByRole('searchbox', { name: 'Search warehouses' }),
        'North',
      );

      expect(
        screen.getByRole('button', { name: /north hub/iu }),
      ).toBeInTheDocument();
      expect(
        screen.queryByRole('button', { name: /central dc/iu }),
      ).not.toBeInTheDocument();
    });

    it('reports an empty Workspace instead of an empty list', async () => {
      renderList({ warehouses: [] });

      expect(
        await screen.findByText('This workspace has no warehouse yet.'),
      ).toBeInTheDocument();
    });
  });

  describe('accessibility', () => {
    it('exposes the list as a labelled list of buttons that report their selected state', async () => {
      const user = userEvent.setup();

      renderList();

      const list = await screen.findByRole('list', { name: 'Warehouses' });
      expect(
        within(list).getByRole('button', { name: /central dc/iu }),
      ).toHaveAttribute('aria-pressed', 'true');

      await selectWarehouse(user, 'North Hub');

      expect(
        within(list).getByRole('button', { name: /north hub/iu }),
      ).toHaveAttribute('aria-pressed', 'true');
      expect(
        within(list).getByRole('button', { name: /central dc/iu }),
      ).toHaveAttribute('aria-pressed', 'false');
    });
  });
});
