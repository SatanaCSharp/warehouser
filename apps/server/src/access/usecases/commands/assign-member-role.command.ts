import { Injectable } from '@nestjs/common';
import { ErrorCode, PermissionId } from '@warehouser/shared-types/enums';
import { ApplicationError } from '@warehouser/shared-types/errors';
import type { AccessPrincipal } from 'shared/access/access-principal';
import { RoleLifecycleRepository } from 'shared/domain/repositories/access/role-lifecycle.repository';

export interface AssignMemberRoleInput {
  readonly memberId: string;
  readonly roleId: string;
}

@Injectable()
export class AssignMemberRoleCommand {
  constructor(private readonly roles: RoleLifecycleRepository) {}

  async execute(
    principal: AccessPrincipal,
    input: AssignMemberRoleInput,
  ): Promise<AssignMemberRoleInput> {
    if (principal.permissionId !== PermissionId.ROLES_ASSIGN) {
      throw new ApplicationError(ErrorCode.ACCESS_DENIED);
    }
    const assigned = await this.roles.assignMemberRole(
      principal.warehouseId,
      input.memberId,
      input.roleId,
    );
    if (!assigned) {
      throw new ApplicationError(ErrorCode.ACCESS_DENIED);
    }
    return input;
  }
}
