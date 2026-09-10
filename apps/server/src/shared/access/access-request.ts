import type { AccessCurrentUser } from 'shared/access/access-current-user';
import type { WorkspaceCurrentUser } from 'shared/access/workspace-current-user';
import type { AuthenticatedRequest } from 'shared/guards/session-auth.guard';

export interface WarehouseAccessRequest extends AuthenticatedRequest {
  access?: AccessCurrentUser;
  workspace?: WorkspaceCurrentUser;
  /** The route-supplied identifiers `WarehouseAccessGuard` reads to prove the request names
   * exactly one Warehouse (AC-03a); never a source of authority by itself. */
  params?: Record<string, unknown>;
  body?: Record<string, unknown>;
}

/** The request shape `WorkspaceAccessGuard` resolves: a Workspace-scoped route carries no
 * Workspace identifier, so the guard derives the actor's Workspace authority entirely from the
 * session and attaches it under `workspace`, distinct from `WarehouseAccessRequest.access` so a
 * downstream handler can never receive the wrong principal shape under the same field name
 * (AC-31). */
export interface WorkspaceAccessRequest extends AuthenticatedRequest {
  workspace?: WorkspaceCurrentUser;
}
