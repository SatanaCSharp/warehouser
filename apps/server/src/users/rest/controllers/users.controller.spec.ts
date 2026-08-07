import 'reflect-metadata';

import { GUARDS_METADATA, HTTP_CODE_METADATA } from '@nestjs/common/constants';
import { ErrorCode, PermissionId } from '@warehouser/shared-types/enums';
import { ApplicationError } from '@warehouser/shared-types/errors';
import type { WarehouseAccessRequest } from 'shared/access/access-request';
import { REQUIRED_PERMISSION_KEY } from 'shared/decorators/required-permission.decorator';
import { SessionAuthGuard } from 'shared/guards/session-auth.guard';
import { WarehouseAccessGuard } from 'shared/guards/warehouse-access.guard';
import { UsersController } from 'users/rest/controllers/users.controller';
import type { ChangeMemberEmailCommand } from 'users/usecases/commands/change-member-email.command';
import type { ChangeMemberPasswordCommand } from 'users/usecases/commands/change-member-password.command';
import type { CreateMemberCommand } from 'users/usecases/commands/create-member.command';
import type { DeleteMemberCommand } from 'users/usecases/commands/delete-member.command';

// This spec is the authorization-coverage architecture scan for `users`,
// extending `access.controller.spec.ts`'s per-handler
// `REQUIRED_PERMISSION_KEY`/`GUARDS_METADATA` assertion pattern to
// `UsersController` (T13 DoD: "the existing authorization-coverage
// architecture scan is extended to UsersController").

const id = (suffix: number): string =>
  `00000000-0000-4000-8000-${suffix.toString().padStart(12, '0')}`;

const request = (permissionId: PermissionId): WarehouseAccessRequest => ({
  headers: {},
  user: { userId: id(1) },
  access: {
    userId: id(1),
    warehouseId: id(2),
    roleId: id(3),
    roleKind: 'custom',
    permissionId,
  },
});

const method = (name: keyof UsersController): object =>
  Object.getOwnPropertyDescriptor(UsersController.prototype, name)
    ?.value as object;

describe('UsersController', () => {
  const createMember = { execute: jest.fn() } as unknown as CreateMemberCommand;
  const changeMemberEmail = {
    execute: jest.fn(),
  } as unknown as ChangeMemberEmailCommand;
  const changeMemberPassword = {
    execute: jest.fn(),
  } as unknown as ChangeMemberPasswordCommand;
  const deleteMember = { execute: jest.fn() } as unknown as DeleteMemberCommand;

  const controller = new UsersController(
    createMember,
    changeMemberEmail,
    changeMemberPassword,
    deleteMember,
  );

  beforeEach(() => jest.clearAllMocks());

  it.each([
    ['createMember', createMember, PermissionId.USERS_CREATE],
    ['changeMemberEmail', changeMemberEmail, PermissionId.USERS_EMAIL_UPDATE],
    [
      'changeMemberPassword',
      changeMemberPassword,
      PermissionId.USERS_PASSWORD_CHANGE,
    ],
    ['deleteMember', deleteMember, PermissionId.USERS_DELETE],
  ] as const)(
    '%s is Permission-gated and Warehouse-scoped (AC-03, AC-10)',
    (handlerName, _command, permission) => {
      expect(
        Reflect.getMetadata(REQUIRED_PERMISSION_KEY, method(handlerName)),
      ).toEqual([permission]);
      expect(Reflect.getMetadata(GUARDS_METADATA, method(handlerName))).toEqual(
        [SessionAuthGuard, WarehouseAccessGuard],
      );
    },
  );

  it('uses the specified mutation success statuses', () => {
    expect(
      Reflect.getMetadata(HTTP_CODE_METADATA, method('createMember')),
    ).toBe(201);
    expect(
      Reflect.getMetadata(HTTP_CODE_METADATA, method('deleteMember')),
    ).toBe(204);
  });

  it('delegates member creation to CreateMemberCommand scoped to the guard-derived Warehouse', async () => {
    jest.mocked(createMember.execute).mockResolvedValue({
      id: id(10),
      email: 'test.member@example.test',
      roleId: id(3),
    });

    await expect(
      controller.createMember(request(PermissionId.USERS_CREATE), {
        email: 'test.member@example.test',
        password: 'Test password 123',
        roleId: id(3),
      }),
    ).resolves.toEqual({
      userId: id(10),
      email: 'test.member@example.test',
      roleId: id(3),
    });

    expect(createMember.execute).toHaveBeenCalledWith(
      expect.objectContaining({ warehouseId: id(2) }),
      expect.objectContaining({
        email: 'test.member@example.test',
        password: 'Test password 123',
        roleId: id(3),
      }),
    );
  });

  it('delegates email change to ChangeMemberEmailCommand with the path userId as target', async () => {
    jest.mocked(changeMemberEmail.execute).mockResolvedValue({
      userId: id(10),
      email: 'corrected.member@example.test',
    });

    await expect(
      controller.changeMemberEmail(
        id(10),
        request(PermissionId.USERS_EMAIL_UPDATE),
        { email: 'corrected.member@example.test' },
      ),
    ).resolves.toEqual({
      userId: id(10),
      email: 'corrected.member@example.test',
    });

    expect(changeMemberEmail.execute).toHaveBeenCalledWith(
      expect.objectContaining({ warehouseId: id(2) }),
      expect.objectContaining({
        targetUserId: id(10),
        email: 'corrected.member@example.test',
      }),
    );
  });

  it('delegates password change to ChangeMemberPasswordCommand with the path userId as target', async () => {
    jest.mocked(changeMemberPassword.execute).mockResolvedValue(undefined);

    await expect(
      controller.changeMemberPassword(
        id(10),
        request(PermissionId.USERS_PASSWORD_CHANGE),
        { password: 'Another test password 456' },
      ),
    ).resolves.toEqual({ userId: id(10) });

    expect(changeMemberPassword.execute).toHaveBeenCalledWith(
      expect.objectContaining({ warehouseId: id(2) }),
      expect.objectContaining({
        targetUserId: id(10),
        newPassword: 'Another test password 456',
      }),
    );
  });

  it('delegates deletion to DeleteMemberCommand with the path userId as target', async () => {
    jest.mocked(deleteMember.execute).mockResolvedValue({ id: id(10) });

    await expect(
      controller.deleteMember(id(10), request(PermissionId.USERS_DELETE)),
    ).resolves.toBeUndefined();

    expect(deleteMember.execute).toHaveBeenCalledWith(
      expect.objectContaining({ warehouseId: id(2) }),
      expect.objectContaining({ targetUserId: id(10) }),
    );
  });

  it.each([
    ['changeMemberEmail', changeMemberEmail, 'changeMemberEmail'],
    ['changeMemberPassword', changeMemberPassword, 'changeMemberPassword'],
    ['deleteMember', deleteMember, 'deleteMember'],
  ] as const)(
    '%s propagates a cross-Warehouse/missing-target denial without disclosing existence (AC-09)',
    async (_label, command) => {
      jest
        .mocked(command.execute)
        .mockRejectedValue(
          new ApplicationError(ErrorCode.ACCESS_TARGET_UNAVAILABLE),
        );

      const args: [string, WarehouseAccessRequest, ...unknown[]] =
        _label === 'changeMemberEmail'
          ? [
              id(99),
              request(PermissionId.USERS_EMAIL_UPDATE),
              { email: 'x@example.test' },
            ]
          : _label === 'changeMemberPassword'
            ? [
                id(99),
                request(PermissionId.USERS_PASSWORD_CHANGE),
                { password: 'A different password 789' },
              ]
            : [id(99), request(PermissionId.USERS_DELETE)];

      const [userId, req, ...rest] = args;
      const invocation = (
        controller as unknown as Record<
          string,
          (...callArgs: unknown[]) => Promise<unknown>
        >
      )[_label](userId, req, ...rest);

      await expect(invocation).rejects.toMatchObject({
        code: ErrorCode.ACCESS_TARGET_UNAVAILABLE,
      });
    },
  );
});
