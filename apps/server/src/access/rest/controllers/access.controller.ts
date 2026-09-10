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
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type {
  AccessProjection,
  ManagerTransferResult,
  MemberPage,
  PermissionPage,
  RolePage,
} from '@warehouser/contracts/access';
import { PermissionId } from '@warehouser/shared-types/enums';
import {
  ManagerTransferDto,
  RoleAssignmentDto,
  RoleDeletionDto,
  RoleWriteDto,
} from 'access/rest/dtos/access-mutation.dto.js';
import {
  PermissionPaginationDto,
  UuidPaginationDto,
} from 'access/rest/dtos/access-pagination.dto.js';
import { AssignMemberRoleCommand } from 'access/usecases/commands/assign-member-role.command.js';
import { CreateRoleCommand } from 'access/usecases/commands/create-role.command.js';
import { DeleteRoleCommand } from 'access/usecases/commands/delete-role.command.js';
import { TransferWarehouseManagerCommand } from 'access/usecases/commands/transfer-warehouse-manager.command.js';
import { UpdateRoleCommand } from 'access/usecases/commands/update-role.command.js';
import { ListAccessMembersQuery } from 'access/usecases/queries/list-access-members.query.js';
import { ListAccessPermissionsQuery } from 'access/usecases/queries/list-access-permissions.query.js';
import { ListAccessRolesQuery } from 'access/usecases/queries/list-access-roles.query.js';
import { ReadCurrentAccessQuery } from 'access/usecases/queries/read-current-access.query.js';
import type { WarehouseAccessRequest } from 'shared/access/access-request.js';
import { ArchivedTolerantRead } from 'shared/access/archived-tolerant-read.decorator.js';
import { RequiredPermission } from 'shared/decorators/required-permission.decorator.js';
import { SessionAuthGuard } from 'shared/guards/session-auth.guard.js';
import { WarehouseAccessGuard } from 'shared/guards/warehouse-access.guard.js';

type RoleResult = RolePage['items'][number];
type MemberResult = MemberPage['items'][number];

@Controller('api/v1/warehouses/:warehouseId/access')
export class AccessController {
  constructor(
    private readonly readCurrentAccessQuery: ReadCurrentAccessQuery,
    private readonly listAccessRolesQuery: ListAccessRolesQuery,
    private readonly listAccessPermissionsQuery: ListAccessPermissionsQuery,
    private readonly listAccessMembersQuery: ListAccessMembersQuery,
    private readonly createRoleCommand: CreateRoleCommand,
    private readonly updateRoleCommand: UpdateRoleCommand,
    private readonly assignMemberRoleCommand: AssignMemberRoleCommand,
    private readonly deleteRoleCommand: DeleteRoleCommand,
    private readonly transferWarehouseManagerCommand: TransferWarehouseManagerCommand,
  ) {}

  // Self-projection: any member of the named Warehouse may read their own membership, so this
  // handler requires only a valid session, not a specific Permission — `WarehouseAccessGuard`
  // requires a non-empty Permission list and would deny every actor otherwise. It is
  // archived-tolerant by construction: the query marks the Warehouse's archived state rather than
  // refusing the read (AC-12a).
  @Get('current')
  @UseGuards(SessionAuthGuard)
  readCurrent(
    @Param('warehouseId', new ParseUUIDPipe()) warehouseId: string,
    @Req() request: WarehouseAccessRequest,
  ): Promise<AccessProjection> {
    return this.readCurrentAccessQuery.execute(
      request.user!.userId,
      warehouseId,
    );
  }

  @Get('roles')
  @RequiredPermission(PermissionId.ROLES_WATCH)
  @ArchivedTolerantRead()
  @UseGuards(SessionAuthGuard, WarehouseAccessGuard)
  listRoles(
    @Req() request: WarehouseAccessRequest,
    @Query() pagination: UuidPaginationDto,
  ): Promise<RolePage> {
    return this.listAccessRolesQuery.execute(request.access!, pagination);
  }

  @Get('permissions')
  @RequiredPermission(PermissionId.ROLES_WATCH)
  @ArchivedTolerantRead()
  @UseGuards(SessionAuthGuard, WarehouseAccessGuard)
  listPermissions(
    @Req() request: WarehouseAccessRequest,
    @Query() pagination: PermissionPaginationDto,
  ): Promise<PermissionPage> {
    return this.listAccessPermissionsQuery.execute(request.access!, pagination);
  }

  @Get('members')
  @RequiredPermission(PermissionId.USERS_WATCH)
  @ArchivedTolerantRead()
  @UseGuards(SessionAuthGuard, WarehouseAccessGuard)
  listMembers(
    @Req() request: WarehouseAccessRequest,
    @Query() pagination: UuidPaginationDto,
  ): Promise<MemberPage> {
    return this.listAccessMembersQuery.execute(request.access!, pagination);
  }

  @Post('roles')
  @HttpCode(HttpStatus.CREATED)
  @RequiredPermission(PermissionId.ROLES_CREATE)
  @UseGuards(SessionAuthGuard, WarehouseAccessGuard)
  async createRole(
    @Req() request: WarehouseAccessRequest,
    @Body() input: RoleWriteDto,
  ): Promise<RoleResult> {
    const role = await this.createRoleCommand.execute(request.access!, input);
    return {
      ...role,
      kind: 'custom',
      permissionIds: [...input.permissionIds],
      assignedMemberCount: 0,
    };
  }

  @Patch('roles/:roleId')
  @RequiredPermission(PermissionId.ROLES_UPDATE)
  @UseGuards(SessionAuthGuard, WarehouseAccessGuard)
  async updateRole(
    @Param('roleId', new ParseUUIDPipe()) roleId: string,
    @Req() request: WarehouseAccessRequest,
    @Body() input: RoleWriteDto,
  ): Promise<RoleResult> {
    const role = await this.updateRoleCommand.execute(request.access!, {
      roleId,
      ...input,
    });
    return {
      ...role,
      kind: 'custom',
      permissionIds: [...input.permissionIds],
      assignedMemberCount: 0,
    };
  }

  @Delete('roles/:roleId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequiredPermission(PermissionId.ROLES_DELETE)
  @UseGuards(SessionAuthGuard, WarehouseAccessGuard)
  async deleteRole(
    @Param('roleId', new ParseUUIDPipe()) roleId: string,
    @Req() request: WarehouseAccessRequest,
    @Body() input?: RoleDeletionDto,
  ): Promise<void> {
    await this.deleteRoleCommand.execute(request.access!, {
      roleId,
      replacementRoleId: input?.replacementRoleId,
    });
  }

  @Put('members/:userId/role')
  @RequiredPermission(PermissionId.ROLES_ASSIGN)
  @UseGuards(SessionAuthGuard, WarehouseAccessGuard)
  async assignMemberRole(
    @Param('userId', new ParseUUIDPipe()) userId: string,
    @Req() request: WarehouseAccessRequest,
    @Body() input: RoleAssignmentDto,
  ): Promise<MemberResult> {
    const assignment = await this.assignMemberRoleCommand.execute(
      request.access!,
      { memberId: userId, roleId: input.roleId },
    );
    return {
      userId: assignment.memberId,
      roleId: assignment.roleId,
      roleKind: 'custom',
    };
  }

  // The one archived-tolerant *mutating* handler ADR 0003 admits: AC-11 keeps this transfer
  // available while the Warehouse is archived, unlike every other mutating handler on this
  // controller (AC-12, AC-36, sad.md §6.7a). `WarehouseAccessGuard`'s read-tolerant flag functions
  // as an archived-bypass regardless of its read-biased name.
  @Post('manager-transfer')
  @HttpCode(HttpStatus.OK)
  @RequiredPermission(PermissionId.WAREHOUSE_MANAGER_ROLE_REASSIGN)
  @ArchivedTolerantRead()
  @UseGuards(SessionAuthGuard, WarehouseAccessGuard)
  async transferManager(
    @Req() request: WarehouseAccessRequest,
    @Body() input: ManagerTransferDto,
  ): Promise<ManagerTransferResult> {
    const result = await this.transferWarehouseManagerCommand.execute(
      request.access!,
      {
        recipientId: input.recipientUserId,
        replacementRoleId: input.formerManagerRoleId,
      },
    );
    return {
      managerUserId: result.managerId,
      formerManagerUserId: request.access!.userId,
      formerManagerRoleId: input.formerManagerRoleId,
    };
  }
}
