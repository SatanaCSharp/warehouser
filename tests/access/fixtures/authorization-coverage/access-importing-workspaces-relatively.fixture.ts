// Fixture only. Proves the check still fails when a file under `access` reaches into `workspaces`
// through a RELATIVE specifier rather than a bare one. The narrowing that lets a scoped package
// subpath through (`@warehouser/contracts/workspaces`) must not open this path: a relative traversal
// into another module's source is exactly what server-architecture.md §Dependency direction forbids.
import type { WorkspaceContext } from '../../workspaces/domain/entities/workspace-context';

export const referencesWorkspacesRelatively = ():
  WorkspaceContext | undefined => undefined;
