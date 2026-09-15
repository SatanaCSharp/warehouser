import {
  createMemoryHistory,
  createRootRouteWithContext,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from '@tanstack/react-router';
import { render, screen, within } from '@testing-library/react';
import type { Warehouse } from '@warehouser/contracts/workspaces';
import { WarehouseRow } from 'modules/workspace/components/workspace-administration/warehouses/WarehouseRow';
import type { ReactElement } from 'react';
import { useState } from 'react';
import { Provider } from 'react-redux';
import { ROUTES } from 'shared/constants/routes';
import type { AppStore } from 'store';
import { makeStore } from 'store';
import { describe, expect, it } from 'vitest';

/**
 * The four row-scoped Enter cases `sad.md` §5.4 assigns to `WarehouseRow`
 * (CR-RG-02). Each is carried over from `WarehousesTab.spec.tsx` at
 * `baseline_revision = 42f1205d552f8284f8ec57358ad9022340b5f76e` with every
 * expectation's subject and expected value unchanged; only the mount changed
 * (CR-RG-01 §"Assertion drift, defined"). The two Enter cases that assert an
 * orchestration outcome — the navigation, and the rename/archive/grant
 * affordances of the other pane — stay in the tab spec.
 *
 * The rows are mounted on **plain props with no server stub**: the row reads
 * nothing of its own, and a leaf that could not mount without a stub would
 * have acquired a read the split forbids. The memory router below is present
 * only because `WarehouseEnterLink` renders a `Link`, which throws outside a
 * `RouterProvider`.
 */

const warehouseIds = {
  central: '00000000-0000-4000-8000-000000000110',
  north: '00000000-0000-4000-8000-000000000111',
  oldDepot: '00000000-0000-4000-8000-000000000112',
};

const workspaceWarehouses = (): Warehouse[] => [
  { id: warehouseIds.central, name: 'Central DC', archivedAt: null },
  { id: warehouseIds.north, name: 'North Hub', archivedAt: null },
  {
    id: warehouseIds.oldDepot,
    name: 'Old Depot',
    archivedAt: '2026-08-01T09:00:00.000Z',
  },
];

type HarnessProps = {
  membershipWarehouseIds: readonly string[];
  warehouses: Warehouse[];
};

/**
 * Renders one row per Warehouse and owns the selection the tab owns in
 * production, so a row stays the controlled leaf it is without a store, a
 * query or a people count behind it.
 */
const WarehouseRowsHarness = ({
  membershipWarehouseIds,
  warehouses,
}: HarnessProps): ReactElement => {
  const [selectedWarehouseId, setSelectedWarehouseId] = useState<
    string | undefined
  >(warehouses[0]?.id);

  return (
    <>
      {warehouses.map((warehouse) => (
        <WarehouseRow
          key={warehouse.id}
          isSelected={warehouse.id === selectedWarehouseId}
          membershipWarehouseIds={membershipWarehouseIds}
          peopleCount={undefined}
          warehouse={warehouse}
          onSelect={setSelectedWarehouseId}
        />
      ))}
    </>
  );
};

/**
 * A minimal router carrying the rows at `ROUTES.WORKSPACE` and declaring
 * `ROUTES.WAREHOUSE` so the Enter link can resolve an `href`. Built locally
 * rather than importing the production `router.ts` / `warehouseRoute`, for the
 * reason the tab spec gives.
 *
 * The empty query cache asserted below is a **new setup-level assertion**
 * pinning the harness (permitted by CR-RG-01, and required by CR-AC-04's
 * plain-props clause): the rows are given a real store and issue no request
 * against it.
 */
const renderRows = (props: HarnessProps): void => {
  const store: AppStore = makeStore();
  const rootRoute = createRootRouteWithContext<{ store: AppStore }>()({
    component: Outlet,
  });
  const rowsRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: ROUTES.WORKSPACE,
    component: () => <WarehouseRowsHarness {...props} />,
  });
  const enteredWarehouseRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: ROUTES.WAREHOUSE,
    component: Outlet,
  });
  const router = createRouter({
    routeTree: rootRoute.addChildren([rowsRoute, enteredWarehouseRoute]),
    context: { store },
    history: createMemoryHistory({ initialEntries: [ROUTES.WORKSPACE] }),
  });

  render(
    <Provider store={store}>
      <RouterProvider router={router} />
    </Provider>,
  );
  expect(store.getState().api.queries).toEqual({});
};

const warehouseRowFor = async (name: string): Promise<HTMLElement> => {
  const heading = await screen.findByText(name);
  const row = heading.closest('div');
  if (!row) {
    throw new Error(`No warehouse row found for ${name}`);
  }
  return row;
};

describe('WarehouseRow', () => {
  describe('the Enter action (CR-AC-04, CR-AC-13, CR-AC-14, CR-RG-02)', () => {
    it("renders Enter on a row for a non-archived Warehouse in the actor's own membership list", async () => {
      renderRows({
        membershipWarehouseIds: [warehouseIds.central],
        warehouses: workspaceWarehouses(),
      });

      const row = await warehouseRowFor('Central DC');
      expect(
        within(row).getByRole('link', { name: /enter/iu }),
      ).toBeInTheDocument();
    });

    // CR-AC-13 — the visible word is the same on every row, so the accessible
    // name is the only thing that can distinguish them. A screen-reader link
    // list showing several identical "Enter" links names no destination.
    it('gives each Enter action an accessible name naming its own Warehouse', async () => {
      renderRows({
        membershipWarehouseIds: [warehouseIds.central, warehouseIds.north],
        warehouses: workspaceWarehouses(),
      });

      await warehouseRowFor('Central DC');
      const names = screen
        .getAllByRole('link', { name: /enter/iu })
        .map((link) => link.getAttribute('aria-label'));

      expect(names).toEqual(
        expect.arrayContaining(['Enter Central DC', 'Enter North Hub']),
      );
      expect(new Set(names).size).toBe(names.length);
    });

    it('omits Enter — hidden, not disabled — on a non-membership row, an archived membership row, and an archived non-membership row', async () => {
      const farDepotId = '00000000-0000-4000-8000-000000000114';
      renderRows({
        membershipWarehouseIds: [warehouseIds.central, warehouseIds.oldDepot],
        warehouses: [
          ...workspaceWarehouses(),
          {
            id: farDepotId,
            name: 'Far Depot',
            archivedAt: '2026-08-02T09:00:00.000Z',
          },
        ],
      });

      // North Hub: not a membership, not archived.
      const nonMember = await warehouseRowFor('North Hub');
      expect(
        within(nonMember).queryByRole('link', { name: /enter/iu }),
      ).not.toBeInTheDocument();
      expect(
        within(nonMember).queryByRole('button', { name: /enter/iu }),
      ).not.toBeInTheDocument();

      // Old Depot: a membership, but archived.
      const archivedMember = await warehouseRowFor('Old Depot');
      expect(
        within(archivedMember).queryByRole('link', { name: /enter/iu }),
      ).not.toBeInTheDocument();

      // Far Depot: archived and not a membership.
      const archivedNonMember = await warehouseRowFor('Far Depot');
      expect(
        within(archivedNonMember).queryByRole('link', { name: /enter/iu }),
      ).not.toBeInTheDocument();
    });

    it('places the selection button before Enter in focus order and never nests Enter inside it', async () => {
      renderRows({
        membershipWarehouseIds: [warehouseIds.central],
        warehouses: workspaceWarehouses(),
      });

      const row = await warehouseRowFor('Central DC');
      const selectButton = within(row).getByRole('button', {
        name: /central dc/iu,
      });
      const enterLink = within(row).getByRole('link', { name: /enter/iu });

      expect(enterLink.closest('button')).toBeNull();
      const focusable = Array.from(row.querySelectorAll('button, a[href]'));
      expect(focusable).toEqual([selectButton, enterLink]);
    });
  });
});
