import { accessPermissionsApi } from 'shared/api/access/access-permissions-api';
import { makeStore } from 'store';
import { accessIds, accessPath } from 'test/access-fixtures';
import { afterEach, describe, expect, it, vi } from 'vitest';

// The Warehouse capability projection is read per Warehouse, never per
// Workspace: AC-05 makes a member's authority that of the membership held in
// the Warehouse being acted on, so the projection is requested — and cached —
// against the Warehouse it describes.
const projectionFor = (warehouseId: string): Record<string, unknown> => ({
  warehouseId,
  roleId: accessIds.managerRole,
  roleKind: 'warehouse_manager',
  permissionIds: ['ROLES:WATCH'],
  archivedAt: null,
});

/** `Request`'s default `toString` is not its URL; read it explicitly. */
const requestUrl = (input: RequestInfo | URL): string =>
  input instanceof Request ? input.url : String(input);

describe('accessPermissionsApi', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('reads the projection of the named Warehouse', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(Response.json(projectionFor(accessIds.warehouse)));
    vi.stubGlobal('fetch', fetchMock);
    const store = makeStore();

    await expect(
      store
        .dispatch(
          accessPermissionsApi.endpoints.getCurrentAccess.initiate(
            accessIds.warehouse,
          ),
        )
        .unwrap(),
    ).resolves.toMatchObject({ warehouseId: accessIds.warehouse });

    expect(fetchMock).toHaveBeenCalledWith(
      accessPath(accessIds.warehouse, 'current'),
      expect.objectContaining({ credentials: 'include' }),
    );
  });

  it('keeps one cache entry per Warehouse, so a switch never serves the other Warehouse (AC-05)', async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL) =>
      Promise.resolve(
        Response.json(
          projectionFor(
            requestUrl(input) ===
              accessPath(accessIds.otherWarehouse, 'current')
              ? accessIds.otherWarehouse
              : accessIds.warehouse,
          ),
        ),
      ),
    );
    vi.stubGlobal('fetch', fetchMock);
    const store = makeStore();

    await store
      .dispatch(
        accessPermissionsApi.endpoints.getCurrentAccess.initiate(
          accessIds.warehouse,
        ),
      )
      .unwrap();

    await expect(
      store
        .dispatch(
          accessPermissionsApi.endpoints.getCurrentAccess.initiate(
            accessIds.otherWarehouse,
          ),
        )
        .unwrap(),
    ).resolves.toMatchObject({ warehouseId: accessIds.otherWarehouse });

    expect(fetchMock.mock.calls.map(([url]) => requestUrl(url))).toEqual([
      accessPath(accessIds.warehouse, 'current'),
      accessPath(accessIds.otherWarehouse, 'current'),
    ]);
  });
});
