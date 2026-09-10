import { Injectable } from '@nestjs/common';
import {
  WorkspacePermissionCatalogueRead,
  WorkspaceReadRepository,
} from 'shared/domain/repositories/workspace-read.repository';

// AC-32 — the system Workspace Permission catalogue, under
// `WORKSPACE_ROLES:WATCH`. The catalogue is not per-Workspace, so this query
// takes no principal-scoped argument; the transport guard already proved the
// actor holds the watch Permission before this query runs.
@Injectable()
export class ListWorkspacePermissionsQuery {
  constructor(
    private readonly workspaceReadRepository: WorkspaceReadRepository,
  ) {}

  execute(): Promise<WorkspacePermissionCatalogueRead[]> {
    return this.workspaceReadRepository.listWorkspacePermissionCatalogue();
  }
}
