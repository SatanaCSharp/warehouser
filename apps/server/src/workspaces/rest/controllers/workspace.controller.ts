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
  ActiveWarehouseSelection,
  Workspace,
  WorkspaceContext,
  WorkspaceMember,
  WorkspaceOwnerTransferResult,
  WorkspacePermission,
  WorkspaceRole,
  WorkspaceUser,
} from '@warehouser/contracts/workspaces';
import { WorkspacePermissionId } from '@warehouser/shared-types/enums';
import type { WorkspaceAccessRequest } from 'shared/access/access-request';
import { RequiredWorkspacePermission } from 'shared/decorators/required-workspace-permission.decorator';
import { SessionAuthGuard } from 'shared/guards/session-auth.guard';
import { WorkspaceAccessGuard } from 'shared/guards/workspace-access.guard';
import {
  ActiveWarehouseWriteDto,
  WorkspaceMemberAddDto,
  WorkspaceOwnerTransferDto,
  WorkspaceRenameDto,
  WorkspaceRoleAssignmentDto,
  WorkspaceRoleDeletionDto,
  WorkspaceRoleWriteDto,
} from 'workspaces/rest/dtos/workspace-mutation.dto';
import { AddWorkspaceMemberCommand } from 'workspaces/usecases/commands/add-workspace-member.command';
import { AssignWorkspaceRoleCommand } from 'workspaces/usecases/commands/assign-workspace-role.command';
import { CreateWorkspaceRoleCommand } from 'workspaces/usecases/commands/create-workspace-role.command';
import { DeleteWorkspaceRoleCommand } from 'workspaces/usecases/commands/delete-workspace-role.command';
import { RemoveWorkspaceMemberCommand } from 'workspaces/usecases/commands/remove-workspace-member.command';
import { RenameWorkspaceCommand } from 'workspaces/usecases/commands/rename-workspace.command';
import { SetActiveWarehouseCommand } from 'workspaces/usecases/commands/set-active-warehouse.command';
import { TransferWorkspaceOwnerCommand } from 'workspaces/usecases/commands/transfer-workspace-owner.command';
import { UpdateWorkspaceRoleCommand } from 'workspaces/usecases/commands/update-workspace-role.command';
import { ListWorkspaceMembersQuery } from 'workspaces/usecases/queries/list-workspace-members.query';
import { ListWorkspacePermissionsQuery } from 'workspaces/usecases/queries/list-workspace-permissions.query';
import { ListWorkspaceRolesQuery } from 'workspaces/usecases/queries/list-workspace-roles.query';
import { ListWorkspaceUsersQuery } from 'workspaces/usecases/queries/list-workspace-users.query';
import { ReadWorkspaceContextQuery } from 'workspaces/usecases/queries/read-workspace-context.query';

/** Every route whose subject is the Workspace itself. Workspace-scoped routes carry **no**
 * Workspace identifier: the guard derives the actor's Workspace from the session, so no handler
 * here reads a target Workspace from the request (ADR 0001, sad.md §7). The controller stays a
 * transport adapter — it invokes one command or query and maps its result, letting every typed
 * failure propagate to the universal exception filter (server-error-handling.md §5). */
@Controller('api/v1/workspace')
export class WorkspaceController {
  constructor(
    private readonly readWorkspaceContextQuery: ReadWorkspaceContextQuery,
    private readonly listWorkspaceRolesQuery: ListWorkspaceRolesQuery,
    private readonly listWorkspacePermissionsQuery: ListWorkspacePermissionsQuery,
    private readonly listWorkspaceMembersQuery: ListWorkspaceMembersQuery,
    private readonly listWorkspaceUsersQuery: ListWorkspaceUsersQuery,
    private readonly renameWorkspaceCommand: RenameWorkspaceCommand,
    private readonly createWorkspaceRoleCommand: CreateWorkspaceRoleCommand,
    private readonly updateWorkspaceRoleCommand: UpdateWorkspaceRoleCommand,
    private readonly deleteWorkspaceRoleCommand: DeleteWorkspaceRoleCommand,
    private readonly addWorkspaceMemberCommand: AddWorkspaceMemberCommand,
    private readonly removeWorkspaceMemberCommand: RemoveWorkspaceMemberCommand,
    private readonly assignWorkspaceRoleCommand: AssignWorkspaceRoleCommand,
    private readonly transferWorkspaceOwnerCommand: TransferWorkspaceOwnerCommand,
    private readonly setActiveWarehouseCommand: SetActiveWarehouseCommand,
  ) {}

  /** sad.md §8 class 5 — the self-projection read. It declares **no** Workspace Permission
   * because requiring one to read one's own capabilities would be circular, and it must answer
   * for a User who is no Workspace Member at all: that empty `workspacePermissionIds` is exactly
   * how the web omits every Workspace control, navigation entry and destination (AC-30). */
  @Get('context')
  @UseGuards(SessionAuthGuard)
  async readContext(
    @Req() request: WorkspaceAccessRequest,
  ): Promise<WorkspaceContext> {
    const context = await this.readWorkspaceContextQuery.execute(
      request.user!.userId,
    );
    return {
      workspace: context.workspace,
      workspacePermissionIds:
        context.workspacePermissionIds as WorkspacePermissionId[],
      warehouses: context.warehouses.map((warehouse) => ({
        warehouseId: warehouse.warehouseId,
        name: warehouse.name,
        archivedAt: warehouse.archivedAt?.toISOString() ?? null,
        roleId: warehouse.roleId,
        roleKind: warehouse.roleKind,
      })),
      effectiveWarehouseId: context.effectiveWarehouseId,
    };
  }

  /** sad.md §8 class 4 — the single session-only-with-a-documented-membership-check route.
   * Selecting is not a capability over a Warehouse resource, so it declares no Permission at
   * either level; the command itself proves the actor holds a live, non-archived membership in
   * that Warehouse (sad.md §6.8). The selection is presentation state and never an authorization
   * input. */
  @Put('active-warehouse')
  @UseGuards(SessionAuthGuard)
  setActiveWarehouse(
    @Req() request: WorkspaceAccessRequest,
    @Body() input: ActiveWarehouseWriteDto,
  ): Promise<ActiveWarehouseSelection> {
    return this.setActiveWarehouseCommand.execute(request.user!.userId, {
      warehouseId: input.warehouseId,
    });
  }

  @Patch()
  @RequiredWorkspacePermission(WorkspacePermissionId.WORKSPACE_RENAME)
  @UseGuards(SessionAuthGuard, WorkspaceAccessGuard)
  renameWorkspace(
    @Req() request: WorkspaceAccessRequest,
    @Body() input: WorkspaceRenameDto,
  ): Promise<Workspace> {
    return this.renameWorkspaceCommand.execute(request.workspace!, {
      name: input.name,
    });
  }

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

  @Post('owner-transfer')
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
      isWorkspaceMember: user.isWorkspaceMember,
      warehouses: user.warehouseIds.map((warehouseId) => ({ warehouseId })),
    }));
  }
}
