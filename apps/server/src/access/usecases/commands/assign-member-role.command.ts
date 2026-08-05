import { Injectable } from '@nestjs/common';
import { assert, assertDefined } from '@warehouser/utils/asserts';
import {
  managerTransferRequiredError,
  targetUnavailableError,
} from 'access/domain/errors/access.errors';
import type { AccessCurrentUser } from 'shared/access/access-current-user';
import { RoleLifecycleRepository } from 'shared/domain/repositories/role-lifecycle.repository';

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
      membership.roleKind !== 'warehouse_manager',
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

    assert(assigned, targetUnavailableError());

    return input;
  }
}
