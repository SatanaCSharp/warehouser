import { randomUUID } from 'node:crypto';

import { Injectable } from '@nestjs/common';
import { ErrorCode, PermissionId } from '@warehouser/shared-types/enums';
import { ApplicationError } from '@warehouser/shared-types/errors';
import { AccessName } from 'access/domain/value-objects/access-name';
import type { AccessPrincipal } from 'shared/access/access-principal';
import {
  RoleLifecycleRepository,
  type RoleWriteResult,
} from 'shared/domain/repositories/access/role-lifecycle.repository';

export interface CreateRoleRuntime {
  readonly roleId: () => string;
}

const createRoleRuntime: CreateRoleRuntime = { roleId: randomUUID };

export interface CreateRoleInput {
  readonly name: string;
  readonly permissionIds: readonly string[];
}

export interface RoleWriteProjection {
  readonly id: string;
  readonly name: string;
}

export const assertAuthority = (
  principal: AccessPrincipal,
  required: AccessPrincipal['permissionId'],
): void => {
  if (principal.permissionId !== required) {
    throw new ApplicationError(ErrorCode.ACCESS_DENIED);
  }
};

export const assertSaved = (result: RoleWriteResult): void => {
  if (result !== 'saved') {
    throw new ApplicationError(ErrorCode.ACCESS_DENIED, { reason: result });
  }
};

@Injectable()
export class CreateRoleCommand {
  constructor(
    private readonly roles: RoleLifecycleRepository,
    private readonly runtime: CreateRoleRuntime = createRoleRuntime,
  ) {}

  async execute(
    principal: AccessPrincipal,
    input: CreateRoleInput,
  ): Promise<RoleWriteProjection> {
    assertAuthority(principal, PermissionId.ROLES_CREATE);
    const id = this.runtime.roleId();
    const name = AccessName.create(input.name).value;
    const result = await this.roles.createCustomRole({
      id,
      warehouseId: principal.warehouseId,
      name,
      permissionIds: input.permissionIds,
    });
    assertSaved(result);
    return { id, name };
  }
}
