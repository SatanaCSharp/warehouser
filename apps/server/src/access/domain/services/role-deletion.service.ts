import { Injectable } from '@nestjs/common';
import { Maybe } from '@warehouser/shared-types/utils';
import { assert, assertDefined } from '@warehouser/utils/asserts';
import { replacementRequiredError } from 'access/domain/errors/access.errors';
import { RoleLifecycleRepository } from 'shared/domain/repositories/role-lifecycle.repository';

@Injectable()
export class RoleDeletionService {
  constructor(
    private readonly roleLifecycleRepository: RoleLifecycleRepository,
  ) {}

  async replaceAssignments(
    warehouseId: string,
    sourceRoleId: string,
    replacementRoleId?: Maybe<string>,
  ): Promise<void> {
    if (!replacementRoleId) {
      return;
    }

    assert(replacementRoleId !== sourceRoleId, replacementRequiredError());

    const replacement = await this.roleLifecycleRepository.lockCustomRole(
      warehouseId,
      replacementRoleId,
    );
    assertDefined(replacement, replacementRequiredError());

    await this.roleLifecycleRepository.replaceRoleAssignments(
      warehouseId,
      sourceRoleId,
      replacement.id,
    );
  }
}
