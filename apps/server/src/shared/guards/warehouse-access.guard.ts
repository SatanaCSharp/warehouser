import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ErrorCode, type PermissionId } from '@warehouser/shared-types/enums';
import { ApplicationError } from '@warehouser/shared-types/errors';
import { accessPrincipal } from 'shared/access/access-principal';
import type { WarehouseAccessRequest } from 'shared/access/access-request';
import { REQUIRED_PERMISSION_KEY } from 'shared/decorators/required-permission.decorator';
import { AccessPrincipalRepository } from 'shared/domain/repositories/access/access-principal.repository';

@Injectable()
export class WarehouseAccessGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly principals: AccessPrincipalRepository,
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

    const current = await this.principals.resolveAnyRequiredPermission(
      request.user.userId,
      permissionIds,
    );
    if (!current?.granted) {
      throw new ApplicationError(ErrorCode.ACCESS_DENIED);
    }

    request.access = accessPrincipal({
      userId: current.userId,
      warehouseId: current.warehouseId,
      roleId: current.roleId,
      roleKind: current.roleKind,
      permissionId: current.permissionId as PermissionId,
    });
    return true;
  }
}
