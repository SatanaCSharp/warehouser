import { Injectable } from '@nestjs/common';
import { assert, assertDefined } from '@warehouser/utils/asserts';
import type { WorkspaceCurrentUser } from 'shared/access/workspace-current-user';
import { Transactional } from 'shared/decorators/transactional.decorator';
import { WarehouseLifecycleRepository } from 'shared/domain/repositories/warehouse-lifecycle.repository';
import { WarehouseMembershipAssignmentRepository } from 'shared/domain/repositories/warehouse-membership-assignment.repository';
import { WorkspaceMembershipRepository } from 'shared/domain/repositories/workspace-membership.repository';
import { workspaceTargetUnavailableError } from 'shared/errors/cross-module.errors';
import {
  workspaceManagerTransferRequiredError,
  workspaceMembershipExistsError,
  workspaceSelfActionDeniedError,
} from 'workspaces/domain/errors/workspace.errors';
import {
  createsDuplicateWarehouseMembership,
  isMembershipSelfTarget,
  isProtectedWarehouseManagerRoleKind,
} from 'workspaces/domain/predicates/workspace-authority.predicates';

export interface AssignWarehouseMembershipInput {
  readonly targetUserId: string;
  readonly warehouseId: string;
  readonly roleId: string;
}

export interface AssignWarehouseMembershipResult {
  readonly userId: string;
  readonly warehouseId: string;
  readonly roleId: string;
  readonly roleKind: 'custom';
}

@Injectable()
export class AssignWarehouseMembershipCommand {
  constructor(
    private readonly warehouseMembershipAssignmentRepository: WarehouseMembershipAssignmentRepository,
    private readonly warehouseLifecycleRepository: WarehouseLifecycleRepository,
    private readonly workspaceMembershipRepository: WorkspaceMembershipRepository,
  ) {}

  @Transactional()
  async execute(
    currentUser: WorkspaceCurrentUser,
    input: AssignWarehouseMembershipInput,
  ): Promise<AssignWarehouseMembershipResult> {
    // AC-24 — the target must belong to the actor's own Workspace; a missing
    // target and one of another Workspace fail identically.
    const targetWorkspaceId =
      await this.workspaceMembershipRepository.findUserWorkspaceId(
        input.targetUserId,
      );
    assert(
      targetWorkspaceId === currentUser.workspaceId,
      workspaceTargetUnavailableError(),
    );

    // AC-24 — and so must the target Warehouse; a missing Warehouse and one
    // of another Workspace fail identically.
    const warehouse = await this.warehouseLifecycleRepository.lockWarehouse(
      input.warehouseId,
    );
    assertDefined(warehouse, workspaceTargetUnavailableError());
    assert(
      warehouse.workspaceId === currentUser.workspaceId,
      workspaceTargetUnavailableError(),
    );

    // AC-25a — a member never grants themself a membership in an existing
    // Warehouse; only someone else's grant establishes authority there.
    assert(
      !isMembershipSelfTarget(currentUser.userId, input.targetUserId),
      workspaceSelfActionDeniedError(),
    );

    // AC-25 — the protected Warehouse Manager Role is never a legal
    // assignment destination; it changes only through the protected
    // Warehouse transfer.
    const role = await this.warehouseMembershipAssignmentRepository.lockRole(
      input.warehouseId,
      input.roleId,
    );
    assertDefined(role, workspaceTargetUnavailableError());
    assert(
      !isProtectedWarehouseManagerRoleKind(role.kind),
      workspaceManagerTransferRequiredError(),
    );

    // AC-25 — a User holds at most one Role in any one Warehouse.
    const existingMembership =
      await this.warehouseMembershipAssignmentRepository.lockMembership(
        input.targetUserId,
        input.warehouseId,
      );
    assert(
      !createsDuplicateWarehouseMembership(
        existingMembership ? { id: existingMembership.userId } : null,
      ),
      workspaceMembershipExistsError(),
    );

    // AC-23 — grant exactly that Role in that Warehouse; every membership
    // already held is untouched.
    await this.warehouseMembershipAssignmentRepository.insertMembership({
      userId: input.targetUserId,
      warehouseId: input.warehouseId,
      workspaceId: currentUser.workspaceId,
      roleId: input.roleId,
      roleKind: 'custom',
    });

    return {
      userId: input.targetUserId,
      warehouseId: input.warehouseId,
      roleId: input.roleId,
      roleKind: 'custom',
    };
  }
}
