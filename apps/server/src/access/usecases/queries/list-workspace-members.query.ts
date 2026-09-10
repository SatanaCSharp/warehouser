import { Injectable } from '@nestjs/common';
import type { WorkspaceCurrentUser } from 'shared/access/workspace-current-user.js';
import {
  WorkspaceMemberRead,
  WorkspaceReadRepository,
} from 'shared/domain/repositories/workspace-read.repository.js';

// AC-33 — the Workspace Members of the actor's own Workspace with their
// Workspace Role assignment, under `WORKSPACE_MEMBERS:WATCH`. Ownership is
// proven by scoping to `principal.workspaceId`, never a caller-supplied
// target.
@Injectable()
export class ListWorkspaceMembersQuery {
  constructor(
    private readonly workspaceReadRepository: WorkspaceReadRepository,
  ) {}

  execute(currentUser: WorkspaceCurrentUser): Promise<WorkspaceMemberRead[]> {
    return this.workspaceReadRepository.listWorkspaceMembers(
      currentUser.workspaceId,
    );
  }
}
