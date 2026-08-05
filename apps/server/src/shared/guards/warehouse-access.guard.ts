import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ErrorCode, type PermissionId } from '@warehouser/shared-types/enums';
import { ApplicationError } from '@warehouser/shared-types/errors';
import { accessCurrentUser } from 'shared/access/access-current-user';
import type { WarehouseAccessRequest } from 'shared/access/access-request';
import { REQUIRED_PERMISSION_KEY } from 'shared/decorators/required-permission.decorator';
import { AccessCurrentUserRepository } from 'shared/domain/repositories/access-current-user.repository';

@Injectable()
export class WarehouseAccessGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly currentUsers: AccessCurrentUserRepository,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<WarehouseAccessRequest>();
    const permissionIds = this.reflector.getAllAndOverride<PermissionId[]>(
      REQUIRED_PERMISSION_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!request.user || !permissionIds?.length) {
      throw new ApplicationError(ErrorCode.ACCESS_DENIED);
    }

    const current = await this.currentUsers.resolveAnyRequiredPermission(
      request.user.userId,
      permissionIds,
    );
    if (!current?.granted) {
      throw new ApplicationError(ErrorCode.ACCESS_DENIED);
    }

    request.access = accessCurrentUser({
      userId: current.userId,
      warehouseId: current.warehouseId,
      roleId: current.roleId,
      roleKind: current.roleKind,
      permissionId: current.permissionId as PermissionId,
    });
    return true;
  }
}
