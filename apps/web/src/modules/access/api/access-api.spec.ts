import { afterEach, describe, expect, it, vi } from 'vitest';

import { accessApi } from 'modules/access/api/access-api';
import { accessPermissionsApi } from 'shared/api/access/access-permissions-api';
import { makeStore } from 'store';
import { accessIds, accessPath, usersPath } from 'test/access-fixtures';

const warehouseId = accessIds.warehouse;
const otherWarehouseId = accessIds.otherWarehouse;

const member = {
  userId: '00000000-0000-4000-8000-000000000001',
  email: 'member@example.test',
  roleId: '00000000-0000-4000-8000-000000000002',
};

const emptyPage = {
  items: [],
  hasNext: false,
  hasPrev: false,
  nextCursor: null,
};

/** `Request`'s default `toString` is not its URL; read it explicitly. */
const requestUrl = (input: RequestInfo | URL): string =>
  input instanceof Request ? input.url : String(input);

describe('accessApi Warehouse-scoped paths (AC-05)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('reads Roles from the named Warehouse', async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json(emptyPage));
    vi.stubGlobal('fetch', fetchMock);
    const store = makeStore();

    await store
      .dispatch(accessApi.endpoints.listAccessRoles.initiate(warehouseId))
      .unwrap();

    expect(fetchMock).toHaveBeenCalledWith(
      accessPath(warehouseId, 'roles'),
      expect.objectContaining({ credentials: 'include' }),
    );
  });

  it('reads Members from the named Warehouse', async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json(emptyPage));
    vi.stubGlobal('fetch', fetchMock);
    const store = makeStore();

    await store
      .dispatch(accessApi.endpoints.listAccessMembers.initiate(warehouseId))
      .unwrap();

    expect(fetchMock).toHaveBeenCalledWith(
      accessPath(warehouseId, 'members'),
      expect.anything(),
    );
  });

  it('reads the Permission catalogue from the named Warehouse', async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json(emptyPage));
    vi.stubGlobal('fetch', fetchMock);
    const store = makeStore();

    await store
      .dispatch(accessApi.endpoints.listAccessPermissions.initiate(warehouseId))
      .unwrap();

    expect(fetchMock).toHaveBeenCalledWith(
      accessPath(warehouseId, 'permissions'),
      expect.anything(),
    );
  });

  it('transfers the Warehouse Manager within the named Warehouse (AC-36)', async () => {
    const result = {
      managerUserId: member.userId,
      formerManagerUserId: accessIds.manager,
      formerManagerRoleId: accessIds.pickerRole,
    };
    const fetchMock = vi.fn().mockResolvedValue(Response.json(result));
    vi.stubGlobal('fetch', fetchMock);
    const store = makeStore();

    await store
      .dispatch(
        accessApi.endpoints.transferWarehouseManager.initiate({
          warehouseId,
          input: {
            recipientUserId: member.userId,
            formerManagerRoleId: accessIds.pickerRole,
          },
        }),
      )
      .unwrap();

    expect(fetchMock).toHaveBeenCalledWith(
      accessPath(warehouseId, 'manager-transfer'),
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('creates a member under the named Warehouse', async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json(member));
    vi.stubGlobal('fetch', fetchMock);
    const store = makeStore();

    await expect(
      store
        .dispatch(
          accessApi.endpoints.createMember.initiate({
            warehouseId,
            input: {
              email: 'member@example.test',
              password: 'password123',
              roleId: '00000000-0000-4000-8000-000000000002',
            },
          }),
        )
        .unwrap(),
    ).resolves.toEqual(member);
    expect(fetchMock).toHaveBeenCalledWith(
      usersPath(warehouseId),
      expect.objectContaining({ method: 'POST', credentials: 'include' }),
    );
  });

  it('changes a member email under the named Warehouse', async () => {
    const emailResult = { userId: member.userId, email: 'new@example.test' };
    const fetchMock = vi.fn().mockResolvedValue(Response.json(emailResult));
    vi.stubGlobal('fetch', fetchMock);
    const store = makeStore();

    await expect(
      store
        .dispatch(
          accessApi.endpoints.changeMemberEmail.initiate({
            warehouseId,
            userId: member.userId,
            input: { email: 'new@example.test' },
          }),
        )
        .unwrap(),
    ).resolves.toEqual(emailResult);
    expect(fetchMock).toHaveBeenCalledWith(
      `${usersPath(warehouseId, member.userId)}/email`,
      expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({ email: 'new@example.test' }),
      }),
    );
  });

  it('changes a member password under the named Warehouse', async () => {
    const confirmation = { userId: member.userId };
    const fetchMock = vi.fn().mockResolvedValue(Response.json(confirmation));
    vi.stubGlobal('fetch', fetchMock);
    const store = makeStore();

    await expect(
      store
        .dispatch(
          accessApi.endpoints.changeMemberPassword.initiate({
            warehouseId,
            userId: member.userId,
            input: { password: 'newpassword123' },
          }),
        )
        .unwrap(),
    ).resolves.toEqual(confirmation);
    expect(fetchMock).toHaveBeenCalledWith(
      `${usersPath(warehouseId, member.userId)}/password`,
      expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({ password: 'newpassword123' }),
      }),
    );
  });

  it('deletes a member under the named Warehouse', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetchMock);
    const store = makeStore();

    await expect(
      store
        .dispatch(
          accessApi.endpoints.deleteMember.initiate({
            warehouseId,
            userId: member.userId,
          }),
        )
        .unwrap(),
    ).resolves.toBeNull();
    expect(fetchMock).toHaveBeenCalledWith(
      usersPath(warehouseId, member.userId),
      expect.objectContaining({ method: 'DELETE', credentials: 'include' }),
    );
  });

  it('exposes generated mutation hooks for members', async () => {
    const accessApiModule = await import('modules/access/api/access-api');

    expect(accessApiModule.useCreateMemberMutation).toBeTypeOf('function');
    expect(accessApiModule.useChangeMemberEmailMutation).toBeTypeOf('function');
    expect(accessApiModule.useChangeMemberPasswordMutation).toBeTypeOf(
      'function',
    );
    expect(accessApiModule.useDeleteMemberMutation).toBeTypeOf('function');
  });
});

describe('accessApi per-Warehouse cache keying (AC-05)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('caches each Warehouse separately, so a switch refetches instead of reusing the other Warehouse', async () => {
    // A `Response` body is readable once, so every call needs its own.
    const fetchMock = vi.fn<(input: RequestInfo | URL) => Promise<Response>>(
      () => Promise.resolve(Response.json(emptyPage)),
    );
    vi.stubGlobal('fetch', fetchMock);
    const store = makeStore();

    await store
      .dispatch(accessApi.endpoints.listAccessRoles.initiate(warehouseId))
      .unwrap();
    await store
      .dispatch(accessApi.endpoints.listAccessRoles.initiate(otherWarehouseId))
      .unwrap();

    expect(fetchMock.mock.calls.map(([url]) => requestUrl(url))).toEqual([
      accessPath(warehouseId, 'roles'),
      accessPath(otherWarehouseId, 'roles'),
    ]);

    // Returning to the first Warehouse serves its own entry, and only its own.
    await store
      .dispatch(accessApi.endpoints.listAccessRoles.initiate(warehouseId))
      .unwrap();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('refreshes only the acted-on Warehouse after a mutation', async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL) =>
      Promise.resolve(
        requestUrl(input) === usersPath(warehouseId)
          ? Response.json(member)
          : Response.json(emptyPage),
      ),
    );
    vi.stubGlobal('fetch', fetchMock);
    const store = makeStore();

    await store
      .dispatch(accessApi.endpoints.listAccessMembers.initiate(warehouseId))
      .unwrap();
    await store
      .dispatch(
        accessApi.endpoints.listAccessMembers.initiate(otherWarehouseId),
      )
      .unwrap();
    fetchMock.mockClear();

    await store
      .dispatch(
        accessApi.endpoints.createMember.initiate({
          warehouseId,
          input: {
            email: 'member@example.test',
            password: 'password123',
            roleId: '00000000-0000-4000-8000-000000000002',
          },
        }),
      )
      .unwrap();

    const refetched = fetchMock.mock.calls
      .map(([url]) => requestUrl(url))
      .filter((url) => url.endsWith('/members'));
    expect(refetched).toEqual([accessPath(warehouseId, 'members')]);
  });

  it('refreshes the acted-on Warehouse projection even when the mutation was denied (OD62T)', async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) =>
      Promise.resolve(
        init?.method === 'POST'
          ? Response.json(
              { code: 'access.denied', message: 'Access denied' },
              { status: 403 },
            )
          : Response.json({
              warehouseId,
              roleId: accessIds.managerRole,
              roleKind: 'warehouse_manager',
              permissionIds: [],
              archivedAt: null,
            }),
      ),
    );
    vi.stubGlobal('fetch', fetchMock);
    const store = makeStore();

    await store
      .dispatch(
        accessPermissionsApi.endpoints.getCurrentAccess.initiate(warehouseId),
      )
      .unwrap();
    fetchMock.mockClear();

    await store
      .dispatch(
        accessApi.endpoints.createAccessRole.initiate({
          warehouseId,
          input: { name: 'Auditor', permissionIds: [] },
        }),
      )
      .unwrap()
      .catch(() => undefined);

    await vi.waitFor(() =>
      expect(fetchMock.mock.calls.map(([url]) => requestUrl(url))).toContain(
        accessPath(warehouseId, 'current'),
      ),
    );
  });
});
