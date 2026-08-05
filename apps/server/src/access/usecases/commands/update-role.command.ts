import { Injectable } from '@nestjs/common';
import { assert, assertDefined } from '@warehouser/utils/asserts';
import {
  invalidRoleError,
  roleNameConflictError,
  roleUnavailableError,
} from 'access/domain/errors/access.errors';
import { AccessName } from 'access/domain/value-objects/access-name';
import type { AccessCurrentUser } from 'shared/access/access-current-user';
import { Transactional } from 'shared/decorators/transactional.decorator';
import { RoleLifecycleRepository } from 'shared/domain/repositories/role-lifecycle.repository';

export interface UpdateRoleInput {
  readonly roleId: string;
  readonly name: string;
  readonly permissionIds: readonly string[];
}

export interface UpdatedRoleProjection {
  readonly id: string;
  readonly name: string;
}

@Injectable()
export class UpdateRoleCommand {
  constructor(
    private readonly roleLifecycleRepository: RoleLifecycleRepository,
  ) {}

  @Transactional()
  async execute(
    currentUser: AccessCurrentUser,
    input: UpdateRoleInput,
  ): Promise<UpdatedRoleProjection> {
    const name = AccessName.create(input.name).value;

    const warehouse = await this.roleLifecycleRepository.lockWarehouse(
      currentUser.warehouseId,
    );
    assertDefined(warehouse, roleUnavailableError());

    const role = await this.roleLifecycleRepository.lockCustomRole(
      currentUser.warehouseId,
      input.roleId,
    );
    assertDefined(role, roleUnavailableError());

    const permissions =
      await this.roleLifecycleRepository.findAssignablePermissions(
        input.permissionIds,
      );
    assert(
      permissions.length === new Set(input.permissionIds).size,
      invalidRoleError(),
    );

    const matchingRole = await this.roleLifecycleRepository.findRoleByName(
      currentUser.warehouseId,
      name,
    );
    assert(
      matchingRole === null || matchingRole.id === role.id,
      roleNameConflictError(),
    );

    await this.roleLifecycleRepository.updateCustomRole(role.id, name);

    await this.roleLifecycleRepository.replaceCustomRolePermissions(
      role.id,
      permissions,
    );

    return { id: input.roleId, name };
  }
}
