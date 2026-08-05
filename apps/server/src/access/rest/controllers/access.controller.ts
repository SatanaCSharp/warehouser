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
} from 'access/rest/dtos/access-mutation.dto';
import {
  PermissionPaginationDto,
  UuidPaginationDto,
} from 'access/rest/dtos/access-pagination.dto';
import { AssignMemberRoleCommand } from 'access/usecases/commands/assign-member-role.command';
import { CreateRoleCommand } from 'access/usecases/commands/create-role.command';
import { DeleteRoleCommand } from 'access/usecases/commands/delete-role.command';
import { TransferWarehouseManagerCommand } from 'access/usecases/commands/transfer-warehouse-manager.command';
import { UpdateRoleCommand } from 'access/usecases/commands/update-role.command';
import { ListAccessMembersQuery } from 'access/usecases/queries/list-access-members.query';
import { ListAccessPermissionsQuery } from 'access/usecases/queries/list-access-permissions.query';
import { ListAccessRolesQuery } from 'access/usecases/queries/list-access-roles.query';
import { ReadCurrentAccessQuery } from 'access/usecases/queries/read-current-access.query';
import type { WarehouseAccessRequest } from 'shared/access/access-request';
import { RequiredPermission } from 'shared/decorators/required-permission.decorator';
import { SessionAuthGuard } from 'shared/guards/session-auth.guard';
import { WarehouseAccessGuard } from 'shared/guards/warehouse-access.guard';

type RoleResult = RolePage['items'][number];
type MemberResult = MemberPage['items'][number];

@Controller('api/v1/access')
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

  @Get('current')
  @UseGuards(SessionAuthGuard)
  readCurrent(
    @Req() request: WarehouseAccessRequest,
  ): Promise<AccessProjection> {
    return this.readCurrentAccessQuery.execute(request.user!.userId);
  }

  @Get('roles')
  @RequiredPermission(PermissionId.ROLES_WATCH)
  @UseGuards(SessionAuthGuard, WarehouseAccessGuard)
  listRoles(
    @Req() request: WarehouseAccessRequest,
    @Query() pagination: UuidPaginationDto,
  ): Promise<RolePage> {
    return this.listAccessRolesQuery.execute(request.access!, pagination);
  }

  @Get('permissions')
  @RequiredPermission(PermissionId.ROLES_WATCH)
  @UseGuards(SessionAuthGuard, WarehouseAccessGuard)
  listPermissions(
    @Req() request: WarehouseAccessRequest,
    @Query() pagination: PermissionPaginationDto,
  ): Promise<PermissionPage> {
    return this.listAccessPermissionsQuery.execute(request.access!, pagination);
  }

  @Get('members')
  @RequiredPermission(PermissionId.USERS_WATCH)
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

  @Post('manager-transfer')
  @RequiredPermission(PermissionId.WAREHOUSE_MANAGER_ROLE_REASSIGN)
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
