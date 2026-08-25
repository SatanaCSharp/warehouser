import { Injectable } from '@nestjs/common';
import { assert } from '@warehouser/utils/asserts';
import type { WorkspaceCurrentUser } from 'shared/access/workspace-current-user';
import {
  AssignableRoleProjection,
  WarehouseMembershipAssignmentRepository,
} from 'shared/domain/repositories/warehouse-membership-assignment.repository';
import { workspaceTargetUnavailableError } from 'shared/errors/cross-module.errors';

export interface ListAssignableWarehouseRolesInput {
  readonly warehouseId: string;
}

// AC-23a — the narrow read carried by `WAREHOUSE_MEMBERSHIPS:ASSIGN`: the
// projection is narrowed to `id, name` in SQL by the repository itself and
// the protected Warehouse Manager Role is excluded, so the read grants no
// other capability inside that Warehouse.
@Injectable()
export class ListAssignableWarehouseRolesQuery {
  constructor(
    private readonly warehouseMembershipAssignmentRepository: WarehouseMembershipAssignmentRepository,
  ) {}

  async execute(
    currentUser: WorkspaceCurrentUser,
    input: ListAssignableWarehouseRolesInput,
  ): Promise<AssignableRoleProjection[]> {
    // AC-23a — the Warehouse must be resolved against the actor's own
    // Workspace *before* anything is projected. Filtering inside the
    // projection query is not equivalent: a Warehouse of another Workspace
    // and an own Warehouse with no custom Role both yield an empty rowset,
    // and contracts/openapi.yaml documents those as different outcomes
    // (`404 workspace.target_unavailable` vs `200 []`). Resolving first also
    // keeps a missing Warehouse and a cross-Workspace one indistinguishable,
    // exactly as `AssignWarehouseMembershipCommand` does for AC-24, so the
    // refusal never discloses that the other Workspace's Warehouse exists.
    const warehouseWorkspaceId =
      await this.warehouseMembershipAssignmentRepository.findWarehouseWorkspaceId(
        input.warehouseId,
      );
    assert(
      warehouseWorkspaceId === currentUser.workspaceId,
      workspaceTargetUnavailableError(),
    );

    return this.warehouseMembershipAssignmentRepository.readAssignableRoles(
      input.warehouseId,
      currentUser.workspaceId,
    );
  }
}
