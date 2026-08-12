// Fixture only. Proves the check fails when a file under `access` imports from `workspaces`
// (server-architecture.md §Dependency direction — modules communicate through exported use-case
// modules, not another module's controller or persistence implementation).
import type { WorkspaceContext } from 'workspaces/domain/entities/workspace-context';

export const referencesWorkspaces = (): WorkspaceContext | undefined =>
  undefined;
