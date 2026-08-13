import { RouterProvider } from '@tanstack/react-router';
import { act, render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createAppRouter } from 'router';
import { ROUTES } from 'shared/constants/routes';
import { makeStore } from 'store';

import type { AppRouter } from 'router';
import type { AppStore } from 'store';

const readableAccess = {
  warehouseId: '00000000-0000-4000-8000-000000000002',
  roleId: '00000000-0000-4000-8000-000000000003',
} as const;

// T6 / CH-03 — the access surface is a child of the Warehouse layout, so every
// case that opens it names the Warehouse it is opening in the address.
const accessAddress = (warehouseId: string): string =>
  `/warehouses/${warehouseId}/access`;

// T6 / CR-AC-07 — reaching a Warehouse address at all requires a membership in
// the addressed Warehouse, which the actor context is the sole source of.
const membershipsIn = (
  ...warehouseIds: readonly string[]
): Record<string, unknown>[] =>
  warehouseIds.map((warehouseId, index) => ({
    warehouseId,
    name: `Warehouse ${index + 1}`,
    archivedAt: null,
    roleId: readableAccess.roleId,
    roleKind: 'custom',
  }));

const renderRoute = (
  initialEntry: string,
): { router: AppRouter; store: AppStore } => {
  const store = makeStore();
  const router = createAppRouter({
    appStore: store,
    initialEntries: [initialEntry],
  });

  render(
    <Provider store={store}>
      <RouterProvider router={router} />
    </Provider>,
  );

  return { router, store };
};

// T6 — the access surface is now a child of the Warehouse layout, so the
// Warehouse it operates on is the one its address names. These cases prove the
// two consequences the relocation exists for: authority follows the addressed
// Warehouse alone (CR-AC-06), and entry follows membership rather than the
// capability the surface happens to need (CR-AC-21).
describe('Warehouse access address (T6)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  const W1 = '00000000-0000-4000-8000-000000000060';
  const W2 = '00000000-0000-4000-8000-000000000061';
  const ROLE_IN_W1 = '00000000-0000-4000-8000-000000000062';
  const ROLE_IN_W2 = '00000000-0000-4000-8000-000000000063';

  const page = (items: unknown[]): Record<string, unknown> => ({
    items,
    hasNext: false,
    hasPrev: false,
    nextCursor: null,
  });

  /**
   * Answers each Warehouse's own access reads at its own exact per-Warehouse
   * URL, with a deliberately different Role, Permission catalogue and member in
   * each. A request that forgets its Warehouse, or names the other one, 404s
   * here — which is how these cases prove the surface read the address.
   */
  const stubTwoWarehouses = (
    permissionsIn: Record<string, string[]>,
  ): ReturnType<typeof vi.fn> => {
    const perWarehouse: Record<string, Record<string, unknown>> = {
      [W1]: {
        current: {
          warehouseId: W1,
          roleId: ROLE_IN_W1,
          roleKind: 'custom',
          permissionIds: permissionsIn[W1],
          archivedAt: null,
        },
        roles: page([
          {
            id: ROLE_IN_W1,
            name: 'North Operators',
            assignedMemberCount: 1,
            kind: 'custom',
            permissionIds: permissionsIn[W1],
          },
        ]),
        permissions: page([
          { id: 'ROLES:WATCH', label: 'View roles', kind: 'assignable' },
        ]),
        members: page([
          {
            userId: '00000000-0000-4000-8000-000000000064',
            roleId: ROLE_IN_W1,
            roleKind: 'custom',
            email: 'north@example.test',
          },
        ]),
      },
      [W2]: {
        current: {
          warehouseId: W2,
          roleId: ROLE_IN_W2,
          roleKind: 'custom',
          permissionIds: permissionsIn[W2],
          archivedAt: null,
        },
        roles: page([
          {
            id: ROLE_IN_W2,
            name: 'South Pickers',
            assignedMemberCount: 1,
            kind: 'custom',
            permissionIds: permissionsIn[W2],
          },
        ]),
        permissions: page([
          { id: 'USERS:WATCH', label: 'View members', kind: 'assignable' },
        ]),
        members: page([
          {
            userId: '00000000-0000-4000-8000-000000000065',
            roleId: ROLE_IN_W2,
            roleKind: 'custom',
            email: 'south@example.test',
          },
        ]),
      },
    };

    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = String(input instanceof Request ? input.url : input);
      if (url.endsWith('/api/v1/auth/session')) {
        return Promise.resolve(
          Response.json({
            user: { id: '00000000-0000-4000-8000-000000000001' },
          }),
        );
      }
      if (url.includes('/api/v1/workspace/context')) {
        return Promise.resolve(
          Response.json({
            workspace: {
              id: '00000000-0000-4000-8000-000000000020',
              name: 'Acme Logistics',
            },
            workspacePermissionIds: [],
            warehouses: membershipsIn(W1, W2),
            effectiveWarehouseId: null,
          }),
        );
      }
      const match =
        /\/api\/v1\/warehouses\/(?<warehouseId>[^/]+)\/access\/(?<read>\w+)$/u.exec(
          url,
        );
      const { warehouseId, read } = match?.groups ?? {};
      const resource =
        warehouseId && read ? perWarehouse[warehouseId]?.[read] : undefined;
      return Promise.resolve(
        resource ? Response.json(resource) : Response.json({}, { status: 404 }),
      );
    });
    vi.stubGlobal('fetch', fetchMock);
    return fetchMock;
  };

  // CR-AC-06 — each address shows that named Warehouse's own Roles, Permission
  // catalogue and members, and gates every control by the Role held in that
  // named Warehouse alone. The Role held in W1 carries ROLES:WATCH and the one
  // held in W2 carries only USERS:WATCH, so the tabs each address offers are
  // themselves proof of which Warehouse's authority was applied.
  it('shows each addressed Warehouse its own access data, gated by the Role held there (CR-AC-06)', async () => {
    stubTwoWarehouses({ [W1]: ['ROLES:WATCH'], [W2]: ['USERS:WATCH'] });

    const { router } = renderRoute(accessAddress(W1));

    expect(await screen.findByText('North Operators')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Roles' })).toBeInTheDocument();
    expect(
      screen.queryByRole('tab', { name: 'Members' }),
    ).not.toBeInTheDocument();

    await act(async () => {
      await router.navigate({
        to: ROUTES.WAREHOUSE_ACCESS,
        params: { warehouseId: W2 },
      });
    });

    expect(await screen.findByRole('tab', { name: 'Members' })).toBeVisible();
    expect(await screen.findByText('south@example.test')).toBeInTheDocument();
    expect(
      screen.queryByRole('tab', { name: 'Roles' }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText('North Operators')).not.toBeInTheDocument();
    expect(screen.queryByText('north@example.test')).not.toBeInTheDocument();
    expect(router.state.location.pathname).toBe(accessAddress(W2));
  });

  // CR-AC-21 — entry follows membership, and the access address carries no
  // capability gate of its own. A member of W holding neither ROLES:WATCH nor
  // USERS:WATCH is therefore admitted to W and finds the surface unpopulated —
  // deliberately distinct from CR-AC-07's refusal, and never a redirect.
  it('admits a member holding neither watch Permission and reports the surface unavailable (CR-AC-21)', async () => {
    stubTwoWarehouses({ [W1]: [], [W2]: ['USERS:WATCH'] });

    const { router } = renderRoute(accessAddress(W1));

    expect(
      await screen.findByRole('heading', { name: 'Access unavailable' }),
    ).toBeInTheDocument();
    expect(router.state.location.pathname).toBe(accessAddress(W1));
    expect(
      screen.queryByText("This address isn't available to you"),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole('tab')).not.toBeInTheDocument();
  });
});
