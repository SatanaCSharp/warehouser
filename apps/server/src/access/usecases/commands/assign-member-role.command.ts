import { Injectable } from '@nestjs/common';
import { assert, assertDefined } from '@warehouser/utils/asserts';
import {
  managerTransferRequiredError,
  targetUnavailableError,
} from 'access/domain/errors/access.errors';
import { isProtectedWarehouseManagerRoleKind } from 'access/domain/predicates/workspace-authority.predicates';
import type { AccessCurrentUser } from 'shared/access/access-current-user';
import { RoleLifecycleRepository } from 'shared/domain/repositories/role-lifecycle.repository';
import { appliedGuardedWrite } from 'shared/predicates/persistence-write.predicates';

export interface AssignMemberRoleInput {
  readonly memberId: string;
  readonly roleId: string;
}

@Injectable()
export class AssignMemberRoleCommand {
  constructor(
    private readonly roleLifecycleRepository: RoleLifecycleRepository,
  ) {}

  async execute(
    currentUser: AccessCurrentUser,
    input: AssignMemberRoleInput,
  ): Promise<AssignMemberRoleInput> {
    const membership = await this.roleLifecycleRepository.findMemberRole(
      currentUser.warehouseId,
      input.memberId,
    );

    assertDefined(membership, targetUnavailableError());

    assert(
      !isProtectedWarehouseManagerRoleKind(membership.roleKind),
      managerTransferRequiredError(),
    );

    const role = await this.roleLifecycleRepository.findCustomRole(
      currentUser.warehouseId,
      input.roleId,
    );

    assertDefined(role, targetUnavailableError());

    const assigned = await this.roleLifecycleRepository.updateMemberRole(
      currentUser.warehouseId,
      input.memberId,
      role.id,
    );

    assert(appliedGuardedWrite(assigned), targetUnavailableError());

    return input;
  }
}
