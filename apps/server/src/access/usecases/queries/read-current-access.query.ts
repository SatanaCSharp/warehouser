import { Injectable } from '@nestjs/common';
import type { AccessProjection } from '@warehouser/contracts/access';
import { ErrorCode } from '@warehouser/shared-types/enums';
import { ApplicationError } from '@warehouser/shared-types/errors';
import { AccessPrincipalRepository } from 'shared/domain/repositories/access/access-principal.repository';

@Injectable()
export class ReadCurrentAccessQuery {
  constructor(private readonly principals: AccessPrincipalRepository) {}

  async execute(userId: string): Promise<AccessProjection> {
    const projection = await this.principals.resolveCurrentAccess(userId);
    if (!projection) {
      throw new ApplicationError(ErrorCode.ACCESS_DENIED);
    }

    return {
      warehouseId: projection.warehouseId,
      roleId: projection.roleId,
      roleKind: projection.roleKind,
      permissionIds: [...projection.permissionIds],
    };
  }
}
