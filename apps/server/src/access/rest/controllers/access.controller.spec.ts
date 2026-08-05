import 'reflect-metadata';

import { GUARDS_METADATA, HTTP_CODE_METADATA } from '@nestjs/common/constants';
import { PermissionId } from '@warehouser/shared-types/enums';
import { AccessController } from 'access/rest/controllers/access.controller';
import type { AssignMemberRoleCommand } from 'access/usecases/commands/assign-member-role.command';
import type { CreateRoleCommand } from 'access/usecases/commands/create-role.command';
import type { DeleteRoleCommand } from 'access/usecases/commands/delete-role.command';
import type { TransferWarehouseManagerCommand } from 'access/usecases/commands/transfer-warehouse-manager.command';
import type { UpdateRoleCommand } from 'access/usecases/commands/update-role.command';
import type { ListAccessMembersQuery } from 'access/usecases/queries/list-access-members.query';
import type { ListAccessPermissionsQuery } from 'access/usecases/queries/list-access-permissions.query';
import type { ListAccessRolesQuery } from 'access/usecases/queries/list-access-roles.query';
import type { ReadCurrentAccessQuery } from 'access/usecases/queries/read-current-access.query';
import type { WarehouseAccessRequest } from 'shared/access/access-request';
import { REQUIRED_PERMISSION_KEY } from 'shared/decorators/required-permission.decorator';
import { SessionAuthGuard } from 'shared/guards/session-auth.guard';
import { WarehouseAccessGuard } from 'shared/guards/warehouse-access.guard';

const id = (suffix: number): string =>
  `00000000-0000-4000-8000-${suffix.toString().padStart(12, '0')}`;
const request = (permissionId: PermissionId): WarehouseAccessRequest => ({
  headers: {},
  user: { userId: id(1) },
  access: {
    userId: id(1),
    warehouseId: id(2),
    roleId: id(3),
    roleKind: 'warehouse_manager',
    permissionId,
  },
});
const method = (name: keyof AccessController): object =>
  Object.getOwnPropertyDescriptor(AccessController.prototype, name)
    ?.value as object;

describe('AccessController', () => {
  const current = { execute: jest.fn() } as unknown as ReadCurrentAccessQuery;
  const roles = { execute: jest.fn() } as unknown as ListAccessRolesQuery;
  const permissions = {
    execute: jest.fn(),
  } as unknown as ListAccessPermissionsQuery;
  const members = { execute: jest.fn() } as unknown as ListAccessMembersQuery;
  const create = { execute: jest.fn() } as unknown as CreateRoleCommand;
  const update = { execute: jest.fn() } as unknown as UpdateRoleCommand;
  const assign = { execute: jest.fn() } as unknown as AssignMemberRoleCommand;
  const remove = { execute: jest.fn() } as unknown as DeleteRoleCommand;
  const transfer = {
    execute: jest.fn(),
  } as unknown as TransferWarehouseManagerCommand;
  const controller = new AccessController(
    current,
    roles,
    permissions,
    members,
    create,
    update,
    assign,
    remove,
    transfer,
  );

  beforeEach(() => jest.clearAllMocks());

  it('groups access reads and mutations on one controller', () => {
    expect(AccessController.prototype.readCurrent).toBeDefined();
    expect(AccessController.prototype.createRole).toBeDefined();
  });

  it('delegates Role create and update with safe complete projections', async () => {
    jest
      .mocked(create.execute)
      .mockResolvedValue({ id: id(4), name: 'Picker' });
    jest.mocked(update.execute).mockResolvedValue({ id: id(4), name: 'Lead' });

    await expect(
      controller.createRole(request(PermissionId.ROLES_CREATE), {
        name: 'Picker',
        permissionIds: [PermissionId.USERS_WATCH],
      }),
    ).resolves.toMatchObject({ id: id(4), name: 'Picker', kind: 'custom' });
    await expect(
      controller.updateRole(id(4), request(PermissionId.ROLES_UPDATE), {
        name: 'Lead',
        permissionIds: [],
      }),
    ).resolves.toMatchObject({ id: id(4), name: 'Lead', kind: 'custom' });
  });

  it.each([
    ['listRoles', roles, PermissionId.ROLES_WATCH],
    ['listPermissions', permissions, PermissionId.ROLES_WATCH],
    ['listMembers', members, PermissionId.USERS_WATCH],
  ] as const)(
    '%s scopes its query to the guard-derived Warehouse',
    async (handlerName, query, permission) => {
      jest.mocked(query.execute).mockResolvedValue({
        items: [],
        hasNext: false,
        hasPrev: false,
        nextCursor: null,
      });

      await controller[handlerName](request(permission), { limit: 20 });

      expect(query.execute).toHaveBeenCalledWith(
        expect.objectContaining({ warehouseId: id(2) }),
        { limit: 20 },
      );
      expect(
        Reflect.getMetadata(REQUIRED_PERMISSION_KEY, method(handlerName)),
      ).toEqual([permission]);
      expect(Reflect.getMetadata(GUARDS_METADATA, method(handlerName))).toEqual(
        [SessionAuthGuard, WarehouseAccessGuard],
      );
    },
  );

  it('uses the specified mutation success statuses', () => {
    expect(Reflect.getMetadata(HTTP_CODE_METADATA, method('createRole'))).toBe(
      201,
    );
    expect(Reflect.getMetadata(HTTP_CODE_METADATA, method('deleteRole'))).toBe(
      204,
    );
  });
});
