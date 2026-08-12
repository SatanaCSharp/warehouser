import { Injectable } from '@nestjs/common';
import type { WorkspaceCurrentUser } from 'shared/access/workspace-current-user';
import {
  AssignableRoleProjection,
  WarehouseMembershipAssignmentRepository,
} from 'shared/domain/repositories/warehouse-membership-assignment.repository';

export interface ListAssignableWarehouseRolesInput {
  readonly warehouseId: string;
}

// AC-23a — the narrow read carried by `WAREHOUSE_MEMBERSHIPS:ASSIGN`: the
// projection is narrowed to `id, name` in SQL by the repository itself, the
// protected Warehouse Manager Role is excluded, and the read is constrained
// to a Warehouse of `currentUser.workspaceId`, so a caller-supplied
// Warehouse of another Workspace resolves to an empty result rather than
// disclosing that Warehouse's Roles.
@Injectable()
export class ListAssignableWarehouseRolesQuery {
  constructor(
    private readonly warehouseMembershipAssignmentRepository: WarehouseMembershipAssignmentRepository,
  ) {}

  execute(
    currentUser: WorkspaceCurrentUser,
    input: ListAssignableWarehouseRolesInput,
  ): Promise<AssignableRoleProjection[]> {
    return this.warehouseMembershipAssignmentRepository.readAssignableRoles(
      input.warehouseId,
      currentUser.workspaceId,
    );
  }
}
