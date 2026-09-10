import { Injectable } from '@nestjs/common';
import type { WorkspaceCurrentUser } from 'shared/access/workspace-current-user.js';
import {
  WorkspaceReadRepository,
  WorkspaceWarehouseRead,
} from 'shared/domain/repositories/workspace-read.repository.js';

// AC-33 — the Warehouses of the actor's own Workspace with their archived
// state, under `WAREHOUSES:WATCH`. Ownership is proven by scoping to
// `principal.workspaceId`, never a caller-supplied target.
@Injectable()
export class ListWorkspaceWarehousesQuery {
  constructor(
    private readonly workspaceReadRepository: WorkspaceReadRepository,
  ) {}

  execute(
    currentUser: WorkspaceCurrentUser,
  ): Promise<WorkspaceWarehouseRead[]> {
    return this.workspaceReadRepository.listWorkspaceWarehouses(
      currentUser.workspaceId,
    );
  }
}
