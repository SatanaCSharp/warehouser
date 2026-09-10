import { Injectable } from '@nestjs/common';
import type { WorkspaceCurrentUser } from 'shared/access/workspace-current-user.js';
import {
  WorkspaceReadRepository,
  WorkspaceUserWithWarehousesRead,
} from 'shared/domain/repositories/workspace-read.repository.js';

// AC-33 — every User of the actor's own Workspace, Workspace Member or not,
// with the Warehouses each belongs to (never a Warehouse Role), under
// `WORKSPACE_MEMBERS:WATCH`, so the candidates that Workspace membership and
// Warehouse-membership assignment act on can be found. Ownership is proven
// by scoping to `principal.workspaceId`, never a caller-supplied target.
@Injectable()
export class ListWorkspaceUsersQuery {
  constructor(
    private readonly workspaceReadRepository: WorkspaceReadRepository,
  ) {}

  execute(
    currentUser: WorkspaceCurrentUser,
  ): Promise<WorkspaceUserWithWarehousesRead[]> {
    return this.workspaceReadRepository.listWorkspaceUsersWithWarehouses(
      currentUser.workspaceId,
    );
  }
}
