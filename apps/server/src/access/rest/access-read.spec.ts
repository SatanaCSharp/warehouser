import 'reflect-metadata';

import { GUARDS_METADATA } from '@nestjs/common/constants';
import { PermissionId } from '@warehouser/shared-types/enums';
import { AccessReadController } from 'access/rest/access-read.controller';
import type { ListAccessMembersQuery } from 'access/usecases/queries/list-access-members.query';
import type { ListAccessPermissionsQuery } from 'access/usecases/queries/list-access-permissions.query';
import type { ListAccessRolesQuery } from 'access/usecases/queries/list-access-roles.query';
import type { ReadCurrentAccessQuery } from 'access/usecases/queries/read-current-access.query';
import type { WarehouseAccessRequest } from 'shared/access/access-request';
import { REQUIRED_PERMISSION_KEY } from 'shared/decorators/required-permission.decorator';
import { SessionAuthGuard } from 'shared/guards/session-auth.guard';
import { WarehouseAccessGuard } from 'shared/guards/warehouse-access.guard';

const userId = '00000000-0000-4000-8000-000000000001';
const warehouseId = '00000000-0000-4000-8000-000000000002';
const roleId = '00000000-0000-4000-8000-000000000003';

const method = (name: keyof AccessReadController): object =>
  Object.getOwnPropertyDescriptor(AccessReadController.prototype, name)
    ?.value as object;

describe('AccessReadController', () => {
  const current = { execute: jest.fn() } as unknown as ReadCurrentAccessQuery;
  const roles = { execute: jest.fn() } as unknown as ListAccessRolesQuery;
  const permissions = {
    execute: jest.fn(),
  } as unknown as ListAccessPermissionsQuery;
  const members = { execute: jest.fn() } as unknown as ListAccessMembersQuery;
  const controller = new AccessReadController(
    current,
    roles,
    permissions,
    members,
  );
  const request: WarehouseAccessRequest = {
    headers: {},
    user: { userId },
    access: {
      userId,
      warehouseId,
      roleId,
      roleKind: 'custom',
      permissionId: PermissionId.ROLES_WATCH,
    },
  };

  beforeEach(() => jest.clearAllMocks());

  it('returns current access from only the authenticated user identity', async () => {
    const projection = {
      warehouseId,
      roleId,
      roleKind: 'custom' as const,
      permissionIds: [PermissionId.ROLES_WATCH],
    };
    jest.mocked(current.execute).mockResolvedValue(projection);

    await expect(controller.readCurrent(request)).resolves.toEqual(projection);
    expect(current.execute).toHaveBeenCalledWith(userId);
    expect(Reflect.getMetadata(GUARDS_METADATA, method('readCurrent'))).toEqual(
      [SessionAuthGuard],
    );
  });

  it.each([
    ['listRoles', roles, PermissionId.ROLES_WATCH],
    ['listPermissions', permissions, PermissionId.ROLES_WATCH],
    ['listMembers', members, PermissionId.USERS_WATCH],
  ] as const)(
    'scopes %s to the guard-derived Warehouse and declares its Permission',
    async (handlerName, query, requiredPermission) => {
      jest.mocked(query.execute).mockResolvedValue({
        items: [],
        hasNext: false,
        hasPrev: false,
        nextCursor: null,
      });

      await controller[handlerName](request, { limit: 20 });

      expect(query.execute).toHaveBeenCalledWith(request.access, { limit: 20 });
      expect(
        Reflect.getMetadata(REQUIRED_PERMISSION_KEY, method(handlerName)),
      ).toBe(requiredPermission);
      expect(Reflect.getMetadata(GUARDS_METADATA, method(handlerName))).toEqual(
        [SessionAuthGuard, WarehouseAccessGuard],
      );
    },
  );

  it('never accepts Warehouse scope as read input', () => {
    expect(AccessReadController.prototype.listRoles).toHaveLength(2);
    expect(AccessReadController.prototype.listPermissions).toHaveLength(2);
    expect(AccessReadController.prototype.listMembers).toHaveLength(2);
  });
});
