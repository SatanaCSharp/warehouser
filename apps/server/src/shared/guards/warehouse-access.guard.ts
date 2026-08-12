import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { PermissionId } from '@warehouser/shared-types/enums';
import { accessCurrentUser } from 'shared/access/access-current-user';
import {
  accessDeniedError,
  warehouseArchivedError,
} from 'shared/access/access-denial.errors';
import type { WarehouseAccessRequest } from 'shared/access/access-request';
import { READ_TOLERANT_KEY } from 'shared/access/archived-tolerant-read.decorator';
import { REQUIRED_PERMISSION_KEY } from 'shared/decorators/required-permission.decorator';
import { AccessCurrentUserRepository } from 'shared/domain/repositories/access-current-user.repository';

/** Reads the single Warehouse identifier the request unambiguously names. The route's
 * `warehouseId` param is authoritative; a body-supplied `warehouseId` that disagrees with it makes
 * the request as ambiguous as naming no Warehouse at all, and both are refused before anything is
 * resolved from the store (AC-03a). */
const resolveNamedWarehouseId = (
  request: WarehouseAccessRequest,
): string | undefined => {
  const paramsWarehouseId = request.params?.warehouseId as string | undefined;
  const bodyWarehouseId = request.body?.warehouseId as string | undefined;
  if (bodyWarehouseId !== undefined && bodyWarehouseId !== paramsWarehouseId) {
    return undefined;
  }
  return paramsWarehouseId;
};

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
    const warehouseId = resolveNamedWarehouseId(request);
    if (!request.user || !permissionIds?.length || !warehouseId) {
      throw accessDeniedError();
    }

    const current = await this.currentUsers.resolveRequiredPermission(
      request.user.userId,
      warehouseId,
      permissionIds[0],
    );
    if (!current?.granted) {
      throw accessDeniedError();
    }

    const archived = current.archivedAt !== null;
    const readTolerant = this.reflector.getAllAndOverride<boolean>(
      READ_TOLERANT_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (archived && !readTolerant) {
      throw warehouseArchivedError();
    }

    request.access = accessCurrentUser({
      userId: current.userId,
      warehouseId,
      roleId: current.roleId,
      roleKind: current.roleKind,
      permissionId: current.permissionId as PermissionId,
      archived,
    });
    return true;
  }
}
