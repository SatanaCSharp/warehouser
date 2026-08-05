import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ErrorCode, PermissionId } from '@warehouser/shared-types/enums';
import { ApplicationError } from '@warehouser/shared-types/errors';
import { AccessCurrentUserRepository } from 'shared/domain/repositories/access-current-user.repository';
import { WarehouseAccessGuard } from 'shared/guards/warehouse-access.guard';

const userId = '00000000-0000-4000-8000-000000000001';
const warehouseId = '00000000-0000-4000-8000-000000000002';
const roleId = '00000000-0000-4000-8000-000000000003';

const contextFor = (request: Record<string, unknown>): ExecutionContext =>
  ({
    getClass: () => class TestController {},
    getHandler: () => () => undefined,
    switchToHttp: () => ({ getRequest: () => request }),
  }) as unknown as ExecutionContext;

describe('WarehouseAccessGuard', () => {
  const reflector = {
    getAllAndOverride: jest.fn().mockReturnValue([PermissionId.ROLES_WATCH]),
  } as unknown as Reflector;

  it('resolves current authority on every decision and attaches an immutable current user', async () => {
    const resolveAnyRequiredPermission = jest
      .fn()
      .mockResolvedValueOnce({
        userId,
        warehouseId,
        roleId,
        roleKind: 'custom',
        granted: true,
        permissionId: PermissionId.ROLES_WATCH,
      })
      .mockResolvedValueOnce({
        userId,
        warehouseId,
        roleId,
        roleKind: 'custom',
        granted: false,
        permissionId: PermissionId.ROLES_WATCH,
      });
    const guard = new WarehouseAccessGuard(reflector, {
      resolveAnyRequiredPermission,
    } as unknown as AccessCurrentUserRepository);
    const firstRequest = { user: { userId } };

    await expect(guard.canActivate(contextFor(firstRequest))).resolves.toBe(
      true,
    );
    expect(Object.isFrozen(firstRequest.access)).toBe(true);
    expect(firstRequest.access).toEqual({
      userId,
      warehouseId,
      roleId,
      roleKind: 'custom',
      permissionId: PermissionId.ROLES_WATCH,
    });

    await expect(
      guard.canActivate(contextFor({ user: { userId } })),
    ).rejects.toMatchObject({ code: ErrorCode.ACCESS_DENIED });
    expect(resolveAnyRequiredPermission).toHaveBeenCalledTimes(2);
  });

  it.each([
    ['missing session composition', {}, undefined],
    ['missing membership', { user: { userId } }, null],
    [
      'missing permission',
      { user: { userId } },
      { userId, warehouseId, roleId, roleKind: 'custom', granted: false },
    ],
  ])(
    'denies %s without attaching access data',
    async (_name, request, result) => {
      const guard = new WarehouseAccessGuard(reflector, {
        resolveAnyRequiredPermission: jest.fn().mockResolvedValue(result),
      } as unknown as AccessCurrentUserRepository);

      await expect(guard.canActivate(contextFor(request))).rejects.toEqual(
        expect.objectContaining<ApplicationError>({
          code: ErrorCode.ACCESS_DENIED,
        }),
      );
      expect(request).not.toHaveProperty('access');
    },
  );
});
