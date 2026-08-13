import { isRedirect } from '@tanstack/react-router';
import { WorkspacePermissionId } from '@warehouser/shared-types/enums';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { resolveLandingContext } from 'guards/landing.guard';
import { ROUTES } from 'shared/constants/routes';
import { makeStore } from 'store';

import type { WorkspaceContext } from '@warehouser/contracts/workspaces';
import type { AppStore } from 'store';

const WAREHOUSE_A = '00000000-0000-4000-8000-000000000010';
const WAREHOUSE_B = '00000000-0000-4000-8000-000000000011';

type ContextOverrides = {
  effectiveWarehouseId?: string | null;
  warehouseIds?: readonly string[];
  workspacePermissionIds?: readonly WorkspacePermissionId[];
};

const workspaceContext = ({
  effectiveWarehouseId = null,
  warehouseIds = [],
  workspacePermissionIds = [],
}: ContextOverrides = {}): WorkspaceContext => ({
  workspace: {
    id: '00000000-0000-4000-8000-000000000001',
    name: 'Test Workspace',
  },
  workspacePermissionIds: [...workspacePermissionIds],
  warehouses: warehouseIds.map((warehouseId, index) => ({
    warehouseId,
    name: `Warehouse ${index + 1}`,
    archivedAt: null,
    roleId: '00000000-0000-4000-8000-000000000020',
    roleKind: 'custom' as const,
  })),
  effectiveWarehouseId,
});

const makeContextForTest = (overrides: ContextOverrides = {}): AppStore => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(Response.json(workspaceContext(overrides))),
  );
  return makeStore();
};

/**
 * The guard signals a landing destination by throwing TanStack's redirect
 * descriptor — a `Response` carrying the navigation options on `.options`, not
 * a plain object — so a case that expects one has to catch it and read through
 * `isRedirect`. Returns those options, or `undefined` when the guard returned
 * normally, which is rule (3), "remain at the root".
 */
const landingRedirect = async (
  store: AppStore,
): Promise<Record<string, unknown> | undefined> => {
  try {
    await resolveLandingContext({ store });
    return undefined;
  } catch (thrown) {
    expect(isRedirect(thrown)).toBe(true);
    return (thrown as { options: Record<string, unknown> }).options;
  }
};

describe('resolveLandingContext', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  // CR-AC-08 rule (1) — each of the four administration Permissions
  // independently opens the Workspace destination, so holding any one of them
  // decides landing. This is the same set `workspace.guard.ts` admits on, which
  // is what makes CR-RG-05 hold: an actor this rule sends to /workspace can
  // never be bounced straight back.
  it.each([
    ['WAREHOUSES:WATCH', WorkspacePermissionId.WAREHOUSES_WATCH],
    ['WORKSPACE_ROLES:WATCH', WorkspacePermissionId.WORKSPACE_ROLES_WATCH],
    ['WORKSPACE_MEMBERS:WATCH', WorkspacePermissionId.WORKSPACE_MEMBERS_WATCH],
    ['WORKSPACE:RENAME', WorkspacePermissionId.WORKSPACE_RENAME],
  ])(
    'resolves the Workspace view for an actor holding %s (rule 1)',
    async (_label, permission) => {
      const store = makeContextForTest({
        workspacePermissionIds: [permission],
        // A live effective Warehouse is present precisely so the case proves
        // rule (1) is evaluated FIRST rather than falling through to rule (2).
        effectiveWarehouseId: WAREHOUSE_A,
        warehouseIds: [WAREHOUSE_A],
      });

      expect(await landingRedirect(store)).toMatchObject({
        to: ROUTES.WORKSPACE,
      });
    },
  );

  // CR-AC-08 rule (2) / CR-RG-04 — the derivation is consumed exactly as the
  // server reports it. The web never inspects `warehouses` to pick one.
  it('resolves the Warehouse the derivation names, unchanged (rule 2)', async () => {
    const store = makeContextForTest({
      effectiveWarehouseId: WAREHOUSE_B,
      warehouseIds: [WAREHOUSE_A, WAREHOUSE_B],
    });

    expect(await landingRedirect(store)).toMatchObject({
      to: ROUTES.WAREHOUSE,
      params: { warehouseId: WAREHOUSE_B },
    });
  });

  // CR-RG-04 — two live memberships and no stored selection is exactly the
  // shape a membership-picking heuristic would resolve. Nothing may.
  it('reaches rule 3 for several live memberships with no stored selection (CR-RG-04)', async () => {
    const store = makeContextForTest({
      effectiveWarehouseId: null,
      warehouseIds: [WAREHOUSE_A, WAREHOUSE_B],
    });

    expect(await landingRedirect(store)).toBeUndefined();
  });

  it('reaches rule 3 for an actor holding no membership at all', async () => {
    const store = makeContextForTest();

    expect(await landingRedirect(store)).toBeUndefined();
  });

  // CR-AC-08 — "throwing at most one redirect": the first matching rule decides
  // and no later rule runs, so an actor is never moved twice.
  it('throws at most one redirect, deciding on the first matching rule', async () => {
    const store = makeContextForTest({
      workspacePermissionIds: [WorkspacePermissionId.WAREHOUSES_WATCH],
      effectiveWarehouseId: WAREHOUSE_A,
      warehouseIds: [WAREHOUSE_A],
    });

    const redirectDescriptor = await landingRedirect(store);

    expect(redirectDescriptor).toMatchObject({ to: ROUTES.WORKSPACE });
    expect(redirectDescriptor).not.toMatchObject({ to: ROUTES.WAREHOUSE });
  });

  // A failed read means the actor's access is UNKNOWN, not that they have none:
  // the guard must let the failure surface so the route renders its error state
  // rather than the no-context state (CR-AC-08 final paragraph).
  it('propagates a failed context read instead of resolving rule 3', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(Response.json({}, { status: 500 })),
    );

    await expect(
      resolveLandingContext({ store: makeStore() }),
    ).rejects.toBeDefined();
  });
});
