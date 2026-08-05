import { randomUUID } from 'node:crypto';

import { Injectable, Optional } from '@nestjs/common';
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

export interface CreateRoleRuntime {
  readonly roleId: () => string;
}

const defaultCreateRoleRuntime: CreateRoleRuntime = { roleId: randomUUID };

export interface CreateRoleInput {
  readonly name: string;
  readonly permissionIds: readonly string[];
}

export interface RoleWriteProjection {
  readonly id: string;
  readonly name: string;
}

@Injectable()
export class CreateRoleCommand {
  constructor(
    private readonly roleLifecycleRepository: RoleLifecycleRepository,
    @Optional()
    private readonly createRoleRuntime: CreateRoleRuntime = defaultCreateRoleRuntime,
  ) {}

  @Transactional()
  async execute(
    currentUser: AccessCurrentUser,
    input: CreateRoleInput,
  ): Promise<RoleWriteProjection> {
    const id = this.createRoleRuntime.roleId();
    const name = AccessName.create(input.name).value;

    const warehouse = await this.roleLifecycleRepository.lockWarehouse(
      currentUser.warehouseId,
    );
    assertDefined(warehouse, roleUnavailableError());

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

    assert(matchingRole === null, roleNameConflictError());

    await this.roleLifecycleRepository.createCustomRole(
      {
        id,
        warehouseId: currentUser.warehouseId,
        name,
      },
      permissions,
    );

    return { id, name };
  }
}
