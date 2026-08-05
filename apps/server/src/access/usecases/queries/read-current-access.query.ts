import { Injectable } from '@nestjs/common';
import type { AccessProjection } from '@warehouser/contracts/access';
import { assertDefined } from '@warehouser/utils/asserts';
import { membershipRequiredError } from 'access/domain/errors/access.errors';
import { AccessCurrentUserRepository } from 'shared/domain/repositories/access-current-user.repository';

@Injectable()
export class ReadCurrentAccessQuery {
  constructor(
    private readonly accessCurrentUserRepository: AccessCurrentUserRepository,
  ) {}

  async execute(userId: string): Promise<AccessProjection> {
    const projection =
      await this.accessCurrentUserRepository.resolveCurrentAccess(userId);
    assertDefined(projection, membershipRequiredError());

    return {
      warehouseId: projection.warehouseId,
      roleId: projection.roleId,
      roleKind: projection.roleKind,
      permissionIds: [...projection.permissionIds],
    };
  }
}
