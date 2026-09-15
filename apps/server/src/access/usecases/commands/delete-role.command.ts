import { Injectable } from '@nestjs/common';
import { Maybe } from '@warehouser/shared-types/utils';
import { assert, assertDefined } from '@warehouser/utils/asserts';
import { isDefined } from '@warehouser/utils/predicates';
import {
  replacementRequiredError,
  roleUnavailableError,
} from 'access/domain/errors/access.errors';
import { hasAssignedMembers } from 'access/domain/predicates/workspace-authority.predicates';
import { RoleDeletionService } from 'access/domain/services/role-deletion.service';
import type { AccessCurrentUser } from 'shared/access/access-current-user';
import { Transactional } from 'shared/decorators/transactional.decorator';
import { RoleLifecycleRepository } from 'shared/domain/repositories/role-lifecycle.repository';

export interface DeleteRoleInput {
  readonly roleId: string;
  readonly replacementRoleId?: Maybe<string>;
}

@Injectable()
export class DeleteRoleCommand {
  constructor(
    private readonly roleLifecycleRepository: RoleLifecycleRepository,
    private readonly roleDeletionService: RoleDeletionService,
  ) {}

  @Transactional()
  async execute(
    currentUser: AccessCurrentUser,
    input: DeleteRoleInput,
  ): Promise<{ readonly id: string }> {
    const warehouse = await this.roleLifecycleRepository.lockWarehouse(
      currentUser.warehouseId,
    );
    assertDefined(warehouse, roleUnavailableError());

    const source = await this.roleLifecycleRepository.lockCustomRole(
      currentUser.warehouseId,
      input.roleId,
    );
    assertDefined(source, roleUnavailableError());

    const assigned = await this.roleLifecycleRepository.countRoleMembers(
      currentUser.warehouseId,
      input.roleId,
    );
    assert(
      !hasAssignedMembers(assigned) || isDefined(input.replacementRoleId),
      replacementRequiredError(),
    );

    await this.roleDeletionService.replaceAssignments(
      currentUser.warehouseId,
      input.roleId,
      input.replacementRoleId,
    );

    await this.roleLifecycleRepository.removeCustomRole(
      currentUser.warehouseId,
      input.roleId,
    );
    return { id: input.roleId };
  }
}
