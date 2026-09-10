import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';
import type {
  WorkspaceMember,
  WorkspaceOwnerTransferResult,
  WorkspacePermission,
  WorkspaceRole,
  WorkspaceUser,
} from '@warehouser/contracts/workspaces';
import { WorkspacePermissionId } from '@warehouser/shared-types/enums';
import {
  WorkspaceMemberAddDto,
  WorkspaceOwnerTransferDto,
  WorkspaceRoleAssignmentDto,
  WorkspaceRoleDeletionDto,
  WorkspaceRoleWriteDto,
} from 'access/rest/dtos/workspace-access-mutation.dto';
import { AddWorkspaceMemberCommand } from 'access/usecases/commands/add-workspace-member.command';
import { AssignWorkspaceRoleCommand } from 'access/usecases/commands/assign-workspace-role.command';
import { CreateWorkspaceRoleCommand } from 'access/usecases/commands/create-workspace-role.command';
import { DeleteWorkspaceRoleCommand } from 'access/usecases/commands/delete-workspace-role.command';
import { RemoveWorkspaceMemberCommand } from 'access/usecases/commands/remove-workspace-member.command';
import { TransferWorkspaceOwnerCommand } from 'access/usecases/commands/transfer-workspace-owner.command';
import { UpdateWorkspaceRoleCommand } from 'access/usecases/commands/update-workspace-role.command';
import { ListWorkspaceMembersQuery } from 'access/usecases/queries/list-workspace-members.query';
import { ListWorkspacePermissionsQuery } from 'access/usecases/queries/list-workspace-permissions.query';
import { ListWorkspaceRolesQuery } from 'access/usecases/queries/list-workspace-roles.query';
import { ListWorkspaceUsersQuery } from 'access/usecases/queries/list-workspace-users.query';
import type { WorkspaceAccessRequest } from 'shared/access/access-request';
import { RequiredWorkspacePermission } from 'shared/decorators/required-workspace-permission.decorator';
import { SessionAuthGuard } from 'shared/guards/session-auth.guard';
import { WorkspaceAccessGuard } from 'shared/guards/workspace-access.guard';

/** The Workspace-scoped half of Access — Workspace Roles, the Workspace
 * Permission catalogue, Workspace Members, the Users membership assignment acts
 * on, and Owner transfer. Its subject is who may do what, not the Workspace
 * record, so it belongs to `access` rather than `workspaces` (CH-S2,
 * ADR 14-08-2026).
 *
 * It keeps `api/v1/workspace` — the same prefix `WorkspaceController` retains.
 * Controllers declare their prefix independently of source location, so one
 * prefix served by two modules is supported as long as no two handlers claim
 * the same method and path (ADR 14-08-2026, "Two modules may serve one URL
 * prefix"; sad.md §6.2). `tests/refactor/route-table.spec.mjs` proves that,
 * and that no path is shadowed or unreachable.
 *
 * Workspace-scoped routes carry **no** Workspace identifier: the guard derives
 * the actor's Workspace from the session, so no handler here reads a target
 * Workspace from the request (ADR 0001, sad.md §7). The controller stays a
 * transport adapter — it invokes one command or query and maps its result,
 * letting every typed failure propagate to the universal exception filter
 * (server-error-handling.md §5). */
@Controller('api/v1/workspace')
export class WorkspaceAccessController {
  constructor(
    private readonly listWorkspaceRolesQuery: ListWorkspaceRolesQuery,
    private readonly listWorkspacePermissionsQuery: ListWorkspacePermissionsQuery,
    private readonly listWorkspaceMembersQuery: ListWorkspaceMembersQuery,
    private readonly listWorkspaceUsersQuery: ListWorkspaceUsersQuery,
    private readonly createWorkspaceRoleCommand: CreateWorkspaceRoleCommand,
    private readonly updateWorkspaceRoleCommand: UpdateWorkspaceRoleCommand,
    private readonly deleteWorkspaceRoleCommand: DeleteWorkspaceRoleCommand,
    private readonly addWorkspaceMemberCommand: AddWorkspaceMemberCommand,
    private readonly removeWorkspaceMemberCommand: RemoveWorkspaceMemberCommand,
    private readonly assignWorkspaceRoleCommand: AssignWorkspaceRoleCommand,
    private readonly transferWorkspaceOwnerCommand: TransferWorkspaceOwnerCommand,
  ) {}

  @Get('roles')
  @RequiredWorkspacePermission(WorkspacePermissionId.WORKSPACE_ROLES_WATCH)
  @UseGuards(SessionAuthGuard, WorkspaceAccessGuard)
  async listRoles(
    @Req() request: WorkspaceAccessRequest,
  ): Promise<WorkspaceRole[]> {
    const roles = await this.listWorkspaceRolesQuery.execute(
      request.workspace!,
    );
    return roles.map((role) => ({
      id: role.id,
      name: role.name,
      kind: role.kind,
      workspacePermissionIds: role.permissionIds as WorkspacePermissionId[],
      assignedMemberCount: role.assignedMemberCount,
    }));
  }

  @Post('roles')
  @HttpCode(HttpStatus.CREATED)
  @RequiredWorkspacePermission(WorkspacePermissionId.WORKSPACE_ROLES_CREATE)
  @UseGuards(SessionAuthGuard, WorkspaceAccessGuard)
  async createRole(
    @Req() request: WorkspaceAccessRequest,
    @Body() input: WorkspaceRoleWriteDto,
  ): Promise<WorkspaceRole> {
    const role = await this.createWorkspaceRoleCommand.execute(
      request.workspace!,
      { name: input.name, permissionIds: input.workspacePermissionIds },
    );
    // A Role that has just been created is custom by construction — the
    // command refuses every reserved Permission — and no Workspace Member is
    // assigned to it yet, so both completions are facts rather than defaults.
    return {
      id: role.id,
      name: role.name,
      kind: 'custom',
      workspacePermissionIds: role.permissionIds as WorkspacePermissionId[],
      assignedMemberCount: 0,
    };
  }

  @Patch('roles/:workspaceRoleId')
  @RequiredWorkspacePermission(WorkspacePermissionId.WORKSPACE_ROLES_UPDATE)
  @UseGuards(SessionAuthGuard, WorkspaceAccessGuard)
  async updateRole(
    @Param('workspaceRoleId', new ParseUUIDPipe()) workspaceRoleId: string,
    @Req() request: WorkspaceAccessRequest,
    @Body() input: WorkspaceRoleWriteDto,
  ): Promise<WorkspaceRole> {
    const role = await this.updateWorkspaceRoleCommand.execute(
      request.workspace!,
      {
        roleId: workspaceRoleId,
        name: input.name,
        permissionIds: input.workspacePermissionIds,
      },
    );
    // The command refuses the protected Workspace Owner Role, so an updated
    // Role is always custom.
    return {
      id: role.id,
      name: role.name,
      kind: 'custom',
      workspacePermissionIds: role.permissionIds as WorkspacePermissionId[],
      assignedMemberCount: role.assignedMemberCount,
    };
  }

  @Delete('roles/:workspaceRoleId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequiredWorkspacePermission(WorkspacePermissionId.WORKSPACE_ROLES_DELETE)
  @UseGuards(SessionAuthGuard, WorkspaceAccessGuard)
  async deleteRole(
    @Param('workspaceRoleId', new ParseUUIDPipe()) workspaceRoleId: string,
    @Req() request: WorkspaceAccessRequest,
    @Body() input?: WorkspaceRoleDeletionDto,
  ): Promise<void> {
    await this.deleteWorkspaceRoleCommand.execute(request.workspace!, {
      roleId: workspaceRoleId,
      replacementRoleId: input?.replacementWorkspaceRoleId,
    });
  }

  @Get('permissions')
  @RequiredWorkspacePermission(WorkspacePermissionId.WORKSPACE_ROLES_WATCH)
  @UseGuards(SessionAuthGuard, WorkspaceAccessGuard)
  async listPermissions(): Promise<WorkspacePermission[]> {
    // The catalogue is system-managed and not per-Workspace, so the query
    // takes no principal and the handler needs no request; the guard has
    // already proved the actor holds the watch Permission.
    const permissions = await this.listWorkspacePermissionsQuery.execute();
    return permissions.map((permission) => ({
      id: permission.id as WorkspacePermissionId,
      label: permission.label,
      kind: permission.kind,
    }));
  }

  @Get('members')
  @RequiredWorkspacePermission(WorkspacePermissionId.WORKSPACE_MEMBERS_WATCH)
  @UseGuards(SessionAuthGuard, WorkspaceAccessGuard)
  async listMembers(
    @Req() request: WorkspaceAccessRequest,
  ): Promise<WorkspaceMember[]> {
    const members = await this.listWorkspaceMembersQuery.execute(
      request.workspace!,
    );
    return members.map((member) => ({
      userId: member.userId,
      workspaceRoleId: member.workspaceRoleId,
      workspaceRoleKind: member.workspaceRoleKind,
      // The identifying email the reader tells Workspace Members apart by,
      // on the same terms as the approved Warehouse member projection
      // (openapi.yaml `WorkspaceMember.email`). It names the Members AC-33
      // already grants and adds no Warehouse Role.
      email: member.email,
    }));
  }

  @Post('members')
  @HttpCode(HttpStatus.CREATED)
  @RequiredWorkspacePermission(WorkspacePermissionId.WORKSPACE_MEMBERS_ADD)
  @UseGuards(SessionAuthGuard, WorkspaceAccessGuard)
  async addMember(
    @Req() request: WorkspaceAccessRequest,
    @Body() input: WorkspaceMemberAddDto,
  ): Promise<WorkspaceMember> {
    const member = await this.addWorkspaceMemberCommand.execute(
      request.workspace!,
      {
        candidateUserId: input.userId,
        workspaceRoleId: input.workspaceRoleId,
      },
    );
    // AC-22 — ordinary addition never grants the protected Owner Role, so the
    // membership the command wrote is custom by construction.
    return {
      userId: member.userId,
      workspaceRoleId: member.workspaceRoleId,
      workspaceRoleKind: 'custom',
    };
  }

  @Delete('members/:userId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequiredWorkspacePermission(WorkspacePermissionId.WORKSPACE_MEMBERS_REMOVE)
  @UseGuards(SessionAuthGuard, WorkspaceAccessGuard)
  async removeMember(
    @Param('userId', new ParseUUIDPipe()) userId: string,
    @Req() request: WorkspaceAccessRequest,
  ): Promise<void> {
    await this.removeWorkspaceMemberCommand.execute(request.workspace!, {
      targetUserId: userId,
    });
  }

  @Put('members/:userId/role')
  @RequiredWorkspacePermission(WorkspacePermissionId.WORKSPACE_ROLES_ASSIGN)
  @UseGuards(SessionAuthGuard, WorkspaceAccessGuard)
  async assignMemberRole(
    @Param('userId', new ParseUUIDPipe()) userId: string,
    @Req() request: WorkspaceAccessRequest,
    @Body() input: WorkspaceRoleAssignmentDto,
  ): Promise<WorkspaceMember> {
    const assignment = await this.assignWorkspaceRoleCommand.execute(
      request.workspace!,
      { targetUserId: userId, workspaceRoleId: input.workspaceRoleId },
    );
    // AC-22 — ordinary assignment reaches only custom Workspace Roles.
    return {
      userId: assignment.userId,
      workspaceRoleId: assignment.workspaceRoleId,
      workspaceRoleKind: 'custom',
    };
  }

  // AC-26 — the transfer reassigns two existing Workspace memberships as one
  // outcome; it creates no resource, and openapi.yaml documents 200 with the
  // transfer result. `@Post` defaults to 201, so the status is stated here.
  @Post('owner-transfer')
  @HttpCode(HttpStatus.OK)
  @RequiredWorkspacePermission(
    WorkspacePermissionId.WORKSPACE_OWNER_ROLE_REASSIGN,
  )
  @UseGuards(SessionAuthGuard, WorkspaceAccessGuard)
  async transferOwner(
    @Req() request: WorkspaceAccessRequest,
    @Body() input: WorkspaceOwnerTransferDto,
  ): Promise<WorkspaceOwnerTransferResult> {
    const result = await this.transferWorkspaceOwnerCommand.execute(
      request.workspace!,
      {
        recipientUserId: input.recipientUserId,
        currentOwnerReplacementRoleId: input.formerOwnerWorkspaceRoleId,
      },
    );
    // Only the current Owner reaches this command (AC-27), so the actor of
    // the request is the former Owner of the completed transfer.
    return {
      ownerUserId: result.ownerId,
      formerOwnerUserId: request.workspace!.userId,
      formerOwnerWorkspaceRoleId: input.formerOwnerWorkspaceRoleId,
    };
  }

  @Get('users')
  @RequiredWorkspacePermission(WorkspacePermissionId.WORKSPACE_MEMBERS_WATCH)
  @UseGuards(SessionAuthGuard, WorkspaceAccessGuard)
  async listUsers(
    @Req() request: WorkspaceAccessRequest,
  ): Promise<WorkspaceUser[]> {
    const users = await this.listWorkspaceUsersQuery.execute(
      request.workspace!,
    );
    return users.map((user) => ({
      userId: user.userId,
      // AC-33 grants this read so the candidates of Workspace and Warehouse
      // membership assignment can be *found*; the email identifies them.
      email: user.email,
      isWorkspaceMember: user.isWorkspaceMember,
      warehouses: user.warehouseIds.map((warehouseId) => ({ warehouseId })),
    }));
  }
}
