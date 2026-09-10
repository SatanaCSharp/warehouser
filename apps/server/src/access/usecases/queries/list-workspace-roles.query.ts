import { Injectable } from '@nestjs/common';
import type { WorkspaceCurrentUser } from 'shared/access/workspace-current-user.js';
import {
  WorkspaceReadRepository,
  WorkspaceRoleWithPermissionsRead,
} from 'shared/domain/repositories/workspace-read.repository.js';

// AC-32 — the Workspace Roles of the actor's own Workspace, under
// `WORKSPACE_ROLES:WATCH`. Ownership is proven by scoping to
// `principal.workspaceId`, never a caller-supplied target; the transport
// guard is what already proved the actor holds the watch Permission.
@Injectable()
export class ListWorkspaceRolesQuery {
  constructor(
    private readonly workspaceReadRepository: WorkspaceReadRepository,
  ) {}

  execute(
    currentUser: WorkspaceCurrentUser,
  ): Promise<WorkspaceRoleWithPermissionsRead[]> {
    return this.workspaceReadRepository.listWorkspaceRolesWithPermissions(
      currentUser.workspaceId,
    );
  }
}
