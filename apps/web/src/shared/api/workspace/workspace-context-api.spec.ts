import { afterEach, describe, expect, it, vi } from 'vitest';

import { workspaceContextApi } from 'shared/api/workspace/workspace-context-api';
import { makeStore } from 'store';

import type { WorkspaceContext } from '@warehouser/contracts/workspaces';

// AC-30 (docs/features/workspaces/spec.md §5): a User who is no Workspace Member —
// including a Warehouse Member who is no Workspace Member at all — must derive no Workspace
// capability from this projection, per the `noWorkspaceCapabilities` example in
// docs/features/workspaces/contracts/openapi.yaml (`GET /api/v1/workspace/context`).
const noMembershipContext: WorkspaceContext = {
  workspace: {
    id: '00000000-0000-4000-8000-000000000001',
    name: 'Test Workspace',
  },
  workspacePermissionIds: [],
  warehouses: [
    {
      warehouseId: '00000000-0000-4000-8000-000000000010',
      name: 'Test Warehouse North',
      archivedAt: null,
      roleId: '00000000-0000-4000-8000-000000000022',
      roleKind: 'custom',
    },
  ],
  effectiveWarehouseId: '00000000-0000-4000-8000-000000000010',
};

describe('workspaceContextApi', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('reads the actor context through GET /api/v1/workspace/context', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(Response.json(noMembershipContext));
    vi.stubGlobal('fetch', fetchMock);
    const store = makeStore();

    await expect(
      store
        .dispatch(workspaceContextApi.endpoints.getWorkspaceContext.initiate())
        .unwrap(),
    ).resolves.toEqual(noMembershipContext);
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/v1/workspace/context',
      expect.objectContaining({ method: 'GET', credentials: 'include' }),
    );
  });

  it('derives no Workspace Permission ids for a User with no Workspace membership (AC-30)', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(Response.json(noMembershipContext));
    vi.stubGlobal('fetch', fetchMock);
    const store = makeStore();

    const result = await store
      .dispatch(workspaceContextApi.endpoints.getWorkspaceContext.initiate())
      .unwrap();

    expect(result.workspacePermissionIds).toEqual([]);
  });

  it('sets the Active Warehouse through PUT /api/v1/workspace/active-warehouse', async () => {
    const selection = {
      effectiveWarehouseId: '00000000-0000-4000-8000-000000000010',
    };
    const fetchMock = vi.fn().mockResolvedValue(Response.json(selection));
    vi.stubGlobal('fetch', fetchMock);
    const store = makeStore();

    await expect(
      store
        .dispatch(
          workspaceContextApi.endpoints.setActiveWarehouse.initiate({
            warehouseId: '00000000-0000-4000-8000-000000000010',
          }),
        )
        .unwrap(),
    ).resolves.toEqual(selection);
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/v1/workspace/active-warehouse',
      expect.objectContaining({
        method: 'PUT',
        body: JSON.stringify({
          warehouseId: '00000000-0000-4000-8000-000000000010',
        }),
      }),
    );
  });

  it('invalidates the actor context after setting the Active Warehouse', async () => {
    const selection = {
      effectiveWarehouseId: '00000000-0000-4000-8000-000000000010',
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(Response.json(noMembershipContext))
      .mockResolvedValueOnce(Response.json(selection))
      .mockResolvedValueOnce(Response.json(noMembershipContext));
    vi.stubGlobal('fetch', fetchMock);
    const store = makeStore();

    void store.dispatch(
      workspaceContextApi.endpoints.getWorkspaceContext.initiate(),
    );
    await Promise.resolve();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await store
      .dispatch(
        workspaceContextApi.endpoints.setActiveWarehouse.initiate({
          warehouseId: '00000000-0000-4000-8000-000000000010',
        }),
      )
      .unwrap();

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      '/api/v1/workspace/context',
      expect.anything(),
    );
  });

  it('exposes generated hooks for the actor context and selection', async () => {
    const module = await import('shared/api/workspace/workspace-context-api');

    expect(module.useGetWorkspaceContextQuery).toBeTypeOf('function');
    expect(module.useSetActiveWarehouseMutation).toBeTypeOf('function');
  });
});
