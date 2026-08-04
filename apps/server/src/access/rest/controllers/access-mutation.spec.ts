import 'reflect-metadata';

import { GUARDS_METADATA, HTTP_CODE_METADATA } from '@nestjs/common/constants';
import { PermissionId } from '@warehouser/shared-types/enums';
import { AccessMutationController } from 'access/rest/controllers/access-mutation.controller';
import type { AssignMemberRoleCommand } from 'access/usecases/commands/assign-member-role.command';
import type { CreateRoleCommand } from 'access/usecases/commands/create-role.command';
import type { DeleteRoleCommand } from 'access/usecases/commands/delete-role.command';
import type { TransferWarehouseManagerCommand } from 'access/usecases/commands/transfer-warehouse-manager.command';
import type { UpdateRoleCommand } from 'access/usecases/commands/update-role.command';
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
const method = (name: keyof AccessMutationController): object =>
  Object.getOwnPropertyDescriptor(AccessMutationController.prototype, name)
    ?.value as object;

describe('AccessMutationController', () => {
  const create = { execute: jest.fn() } as unknown as CreateRoleCommand;
  const update = { execute: jest.fn() } as unknown as UpdateRoleCommand;
  const assign = { execute: jest.fn() } as unknown as AssignMemberRoleCommand;
  const remove = { execute: jest.fn() } as unknown as DeleteRoleCommand;
  const transfer = {
    execute: jest.fn(),
  } as unknown as TransferWarehouseManagerCommand;
  const controller = new AccessMutationController(
    create,
    update,
    assign,
    remove,
    transfer,
  );

  beforeEach(() => jest.clearAllMocks());

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
    ).resolves.toEqual({
      id: id(4),
      name: 'Picker',
      kind: 'custom',
      permissionIds: [PermissionId.USERS_WATCH],
      assignedMemberCount: 0,
    });
    await expect(
      controller.updateRole(id(4), request(PermissionId.ROLES_UPDATE), {
        name: 'Lead',
        permissionIds: [],
      }),
    ).resolves.toMatchObject({ id: id(4), name: 'Lead', kind: 'custom' });
    expect(update.execute).toHaveBeenCalledWith(
      expect.objectContaining({ warehouseId: id(2) }),
      { roleId: id(4), name: 'Lead', permissionIds: [] },
    );
  });

  it('maps assignment, deletion, and transfer without accepting Warehouse scope', async () => {
    jest
      .mocked(assign.execute)
      .mockResolvedValue({ memberId: id(5), roleId: id(4) });
    jest.mocked(remove.execute).mockResolvedValue({ id: id(4) });
    jest.mocked(transfer.execute).mockResolvedValue({ managerId: id(5) });

    await expect(
      controller.assignMemberRole(id(5), request(PermissionId.ROLES_ASSIGN), {
        roleId: id(4),
      }),
    ).resolves.toEqual({ userId: id(5), roleId: id(4), roleKind: 'custom' });
    await expect(
      controller.deleteRole(id(4), request(PermissionId.ROLES_DELETE), {
        replacementRoleId: id(6),
      }),
    ).resolves.toBeUndefined();
    await expect(
      controller.transferManager(
        request(PermissionId.WAREHOUSE_MANAGER_ROLE_REASSIGN),
        { recipientUserId: id(5), formerManagerRoleId: id(6) },
      ),
    ).resolves.toEqual({
      managerUserId: id(5),
      formerManagerUserId: id(1),
      formerManagerRoleId: id(6),
    });
  });

  it.each([
    ['createRole', PermissionId.ROLES_CREATE],
    ['updateRole', PermissionId.ROLES_UPDATE],
    ['deleteRole', PermissionId.ROLES_DELETE],
    ['assignMemberRole', PermissionId.ROLES_ASSIGN],
    ['transferManager', PermissionId.WAREHOUSE_MANAGER_ROLE_REASSIGN],
  ] as const)(
    '%s declares both guards and its exact Permission',
    (name, permission) => {
      expect(
        Reflect.getMetadata(REQUIRED_PERMISSION_KEY, method(name)),
      ).toEqual([permission]);
      expect(Reflect.getMetadata(GUARDS_METADATA, method(name))).toEqual([
        SessionAuthGuard,
        WarehouseAccessGuard,
      ]);
    },
  );

  it('uses the specified success statuses', () => {
    expect(Reflect.getMetadata(HTTP_CODE_METADATA, method('createRole'))).toBe(
      201,
    );
    expect(Reflect.getMetadata(HTTP_CODE_METADATA, method('deleteRole'))).toBe(
      204,
    );
  });
});
