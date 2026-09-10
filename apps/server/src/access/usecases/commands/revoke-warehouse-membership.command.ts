import { Injectable } from '@nestjs/common';
import { assert, assertDefined } from '@warehouser/utils/asserts';
import {
  workspaceManagerTransferRequiredError,
  workspaceSelfActionDeniedError,
} from 'access/domain/errors/workspace-access.errors.js';
import {
  isMembershipSelfTarget,
  isProtectedWarehouseManagerRoleKind,
} from 'access/domain/predicates/workspace-authority.predicates.js';
import type { WorkspaceCurrentUser } from 'shared/access/workspace-current-user.js';
import { Transactional } from 'shared/decorators/transactional.decorator.js';
import { WarehouseMembershipAssignmentRepository } from 'shared/domain/repositories/warehouse-membership-assignment.repository.js';
import { workspaceTargetUnavailableError } from 'shared/errors/cross-module.errors.js';

export interface RevokeWarehouseMembershipInput {
  readonly targetUserId: string;
  readonly warehouseId: string;
}

export interface RevokeWarehouseMembershipResult {
  readonly userId: string;
  readonly warehouseId: string;
}

@Injectable()
export class RevokeWarehouseMembershipCommand {
  constructor(
    private readonly warehouseMembershipAssignmentRepository: WarehouseMembershipAssignmentRepository,
  ) {}

  @Transactional()
  async execute(
    currentUser: WorkspaceCurrentUser,
    input: RevokeWarehouseMembershipInput,
  ): Promise<RevokeWarehouseMembershipResult> {
    const membership =
      await this.warehouseMembershipAssignmentRepository.lockMembership(
        input.targetUserId,
        input.warehouseId,
      );
    // AC-25d — a missing membership and one in a Warehouse of another
    // Workspace fail identically, disclosing neither.
    assertDefined(membership, workspaceTargetUnavailableError());
    assert(
      membership.workspaceId === currentUser.workspaceId,
      workspaceTargetUnavailableError(),
    );

    // AC-25c — the protected Warehouse Manager's membership is never
    // withdrawn through ordinary revocation; it changes only through the
    // protected Warehouse transfer.
    assert(
      !isProtectedWarehouseManagerRoleKind(membership.roleKind),
      workspaceManagerTransferRequiredError(),
    );

    // AC-25c — a member never withdraws their own Warehouse authority.
    assert(
      !isMembershipSelfTarget(currentUser.userId, input.targetUserId),
      workspaceSelfActionDeniedError(),
    );

    // AC-25b — removes the Role and every Permission it granted; every
    // other membership stays untouched, and the target's `active_
    // warehouse_id` is cleared only when it pointed at this Warehouse.
    await this.warehouseMembershipAssignmentRepository.deleteMembership(
      input.targetUserId,
      input.warehouseId,
    );

    return { userId: input.targetUserId, warehouseId: input.warehouseId };
  }
}
