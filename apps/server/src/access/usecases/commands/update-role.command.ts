import { Injectable } from '@nestjs/common';
import { ErrorCode, PermissionId } from '@warehouser/shared-types/enums';
import { ApplicationError } from '@warehouser/shared-types/errors';
import { AccessName } from 'access/domain/value-objects/access-name';
import type { AccessPrincipal } from 'shared/access/access-principal';
import {
  RoleLifecycleRepository,
  type RoleWriteResult,
} from 'shared/domain/repositories/access/role-lifecycle.repository';

export interface UpdateRoleInput {
  readonly roleId: string;
  readonly name: string;
  readonly permissionIds: readonly string[];
}

export interface UpdatedRoleProjection {
  readonly id: string;
  readonly name: string;
}

const assertUpdateAuthority = (principal: AccessPrincipal): void => {
  if (principal.permissionId !== PermissionId.ROLES_UPDATE) {
    throw new ApplicationError(ErrorCode.ACCESS_DENIED);
  }
};

const assertRoleUpdated = (result: RoleWriteResult): void => {
  if (result !== 'saved') {
    throw new ApplicationError(ErrorCode.ACCESS_DENIED, { reason: result });
  }
};

@Injectable()
export class UpdateRoleCommand {
  constructor(private readonly roles: RoleLifecycleRepository) {}

  async execute(
    principal: AccessPrincipal,
    input: UpdateRoleInput,
  ): Promise<UpdatedRoleProjection> {
    assertUpdateAuthority(principal);
    const name = AccessName.create(input.name).value;
    const result = await this.roles.updateCustomRole({
      id: input.roleId,
      warehouseId: principal.warehouseId,
      name,
      permissionIds: input.permissionIds,
    });
    assertRoleUpdated(result);
    return { id: input.roleId, name };
  }
}
