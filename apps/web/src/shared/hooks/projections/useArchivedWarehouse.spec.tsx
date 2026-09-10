import {
  createMemoryHistory,
  createRootRouteWithContext,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from '@tanstack/react-router';
import { render, screen } from '@testing-library/react';
import type { WarehouseEntryVerdict } from 'guards/warehouse-entry.guard';
import type { ReactElement } from 'react';
import { Provider } from 'react-redux';
import { ROUTES } from 'shared/constants/routes';
import {
  ARCHIVED_WAREHOUSE_REASON_ID,
  useArchivedWarehouse,
} from 'shared/hooks/projections/useArchivedWarehouse';
import type { AppStore } from 'store';
import { makeStore } from 'store';
import { describe, expect, it } from 'vitest';

const WAREHOUSE_ID = '00000000-0000-4000-8000-000000000010';

// The probe renders the hook's answer as text, so the cases assert what a
// control would be given rather than reaching into a hook result object.
const ArchivedProbe = (): ReactElement => {
  const { isArchived, reasonId } = useArchivedWarehouse();

  return (
    <button type="button" disabled={isArchived} aria-describedby={reasonId}>
      Record demand
    </button>
  );
};

// AC-23 — the archived state is a property of the ENTRY VERDICT the Warehouse
// layout route publishes, not of a Permission, so every case renders inside a
// real Warehouse match carrying that verdict.
const renderInVerdict = (verdict: WarehouseEntryVerdict | undefined): void => {
  const store = makeStore();
  const testRootRoute = createRootRouteWithContext<{ store: AppStore }>()({
    component: () => <Outlet />,
  });
  const warehouseTestRoute = createRoute({
    getParentRoute: () => testRootRoute,
    path: ROUTES.WAREHOUSE,
    beforeLoad: (): WarehouseEntryVerdict | undefined => verdict,
    component: () => <Outlet />,
  });
  const destinationRoute = createRoute({
    getParentRoute: () => warehouseTestRoute,
    path: '/',
    component: ArchivedProbe,
  });

  const router = createRouter({
    routeTree: testRootRoute.addChildren([
      warehouseTestRoute.addChildren([destinationRoute]),
    ]),
    context: { store },
    history: createMemoryHistory({
      initialEntries: [`/warehouses/${WAREHOUSE_ID}`],
    }),
  });

  render(
    <Provider store={store}>
      <RouterProvider router={router} />
    </Provider>,
  );
};

describe('useArchivedWarehouse', () => {
  it('disables a mutating control and names the reason it points at, in an archived Warehouse', async () => {
    renderInVerdict({
      status: 'entered-read-only',
      reason: 'archived',
      warehouseId: WAREHOUSE_ID,
    });

    const control = await screen.findByRole('button', {
      name: 'Record demand',
    });
    expect(control).toBeDisabled();
    expect(control).toHaveAttribute(
      'aria-describedby',
      ARCHIVED_WAREHOUSE_REASON_ID,
    );
  });

  // AC-23 — the control stays VISIBLE and disabled rather than being withheld,
  // which is what separates the archived state from a Permission
  // (`docs/system/adr/19-08-2026-declarative-permission-gates.md`).
  it('leaves the control in the document rather than withholding it', async () => {
    renderInVerdict({
      status: 'entered-read-only',
      reason: 'archived',
      warehouseId: WAREHOUSE_ID,
    });

    expect(
      await screen.findByRole('button', { name: 'Record demand' }),
    ).toBeInTheDocument();
  });

  it.each([
    ['a full entry', { status: 'entered', warehouseId: WAREHOUSE_ID }],
    ['no verdict at all', undefined],
  ])('describes and disables nothing under %s', async (_label, verdict) => {
    renderInVerdict(verdict as WarehouseEntryVerdict | undefined);

    const control = await screen.findByRole('button', {
      name: 'Record demand',
    });
    expect(control).toBeEnabled();
    expect(control).not.toHaveAttribute('aria-describedby');
  });
});
