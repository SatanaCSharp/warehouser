import type { CanActivate, ExecutionContext } from '@nestjs/common';
import { Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { WorkspacePermissionId } from '@warehouser/shared-types/enums';
import { workspaceDeniedError } from 'shared/access/access-denial.errors';
import type { WorkspaceAccessRequest } from 'shared/access/access-request';
import { workspaceCurrentUser } from 'shared/access/workspace-current-user';
import { REQUIRED_WORKSPACE_PERMISSION_KEY } from 'shared/decorators/required-workspace-permission.decorator';
import { WorkspaceCurrentUserRepository } from 'shared/domain/repositories/workspace-current-user.repository';

/** Composes after `SessionAuthGuard`. A User belongs to exactly one Workspace and never selects
 * it, so this guard reads no target identifier from the request at all — it derives the actor's
 * Workspace authority entirely from the session and decides no target ownership (ADR 0001, sad
 * §6.2). */
@Injectable()
export class WorkspaceAccessGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly currentUsers: WorkspaceCurrentUserRepository,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<WorkspaceAccessRequest>();
    // `getAllAndOverride` is typed to return `TResult`, but returns `undefined` when no target
    // carries the metadata key — an undecorated handler. The `| undefined` restores that case to
    // the type so the check below stays a real check rather than dead code.
    const permissionIds = this.reflector.getAllAndOverride<
      WorkspacePermissionId[] | undefined
    >(REQUIRED_WORKSPACE_PERMISSION_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!request.user || !permissionIds?.length) {
      throw workspaceDeniedError();
    }

    const current = await this.currentUsers.resolveRequiredWorkspacePermission(
      request.user.userId,
      permissionIds[0],
    );
    if (!current?.granted) {
      throw workspaceDeniedError();
    }

    request.workspace = workspaceCurrentUser({
      userId: current.userId,
      workspaceId: current.workspaceId,
      workspaceRoleId: current.workspaceRoleId,
      workspaceRoleKind: current.workspaceRoleKind,
      permissionId: current.permissionId as WorkspacePermissionId,
    });
    return true;
  }
}
