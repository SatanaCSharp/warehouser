import { Injectable } from '@nestjs/common';
import { PermissionId } from '@warehouser/shared-types/enums';
import {
  accessDeniedError,
  managerTransferRequiredError,
  targetUnavailableError,
} from 'access/domain/errors/access.errors';
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
      throw accessDeniedError();
    }
    const result = await this.roles.assignMemberRole(
      principal.warehouseId,
      input.memberId,
      input.roleId,
    );
    if (result === 'manager-transfer-required') {
      throw managerTransferRequiredError();
    }
    if (result !== 'assigned') {
      throw targetUnavailableError();
    }
    return input;
  }
}
