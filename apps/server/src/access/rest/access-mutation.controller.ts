import {
  Body,
  Controller,
  Delete,
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
  ManagerTransferResult,
  MemberPage,
  RolePage,
} from '@warehouser/contracts/access';
import { PermissionId } from '@warehouser/shared-types/enums';
import {
  ManagerTransferDto,
  RoleAssignmentDto,
  RoleDeletionDto,
  RoleWriteDto,
} from 'access/rest/dtos/access-mutation.dto';
import { AssignMemberRoleCommand } from 'access/usecases/commands/assign-member-role.command';
import { CreateRoleCommand } from 'access/usecases/commands/create-role.command';
import { DeleteRoleCommand } from 'access/usecases/commands/delete-role.command';
import { TransferWarehouseManagerCommand } from 'access/usecases/commands/transfer-warehouse-manager.command';
import { UpdateRoleCommand } from 'access/usecases/commands/update-role.command';
import type { WarehouseAccessRequest } from 'shared/access/access-request';
import { RequiredPermission } from 'shared/decorators/required-permission.decorator';
import { SessionAuthGuard } from 'shared/guards/session-auth.guard';
import { WarehouseAccessGuard } from 'shared/guards/warehouse-access.guard';

type RoleResult = RolePage['items'][number];
type MemberResult = MemberPage['items'][number];

@Controller('api/v1/access')
export class AccessMutationController {
  constructor(
    private readonly create: CreateRoleCommand,
    private readonly update: UpdateRoleCommand,
    private readonly assign: AssignMemberRoleCommand,
    private readonly remove: DeleteRoleCommand,
    private readonly transfer: TransferWarehouseManagerCommand,
  ) {}

  @Post('roles')
  @HttpCode(HttpStatus.CREATED)
  @RequiredPermission(PermissionId.ROLES_CREATE)
  @UseGuards(SessionAuthGuard, WarehouseAccessGuard)
  async createRole(
    @Req() request: WarehouseAccessRequest,
    @Body() input: RoleWriteDto,
  ): Promise<RoleResult> {
    const role = await this.create.execute(request.access!, input);
    return { ...role, kind: 'custom', permissionIds: [...input.permissionIds] };
  }

  @Patch('roles/:roleId')
  @RequiredPermission(PermissionId.ROLES_UPDATE)
  @UseGuards(SessionAuthGuard, WarehouseAccessGuard)
  async updateRole(
    @Param('roleId', new ParseUUIDPipe()) roleId: string,
    @Req() request: WarehouseAccessRequest,
    @Body() input: RoleWriteDto,
  ): Promise<RoleResult> {
    const role = await this.update.execute(request.access!, {
      roleId,
      ...input,
    });
    return { ...role, kind: 'custom', permissionIds: [...input.permissionIds] };
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
    await this.remove.execute(request.access!, {
      roleId,
      replacementRoleId: input?.replacementRoleId ?? undefined,
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
    const assignment = await this.assign.execute(request.access!, {
      memberId: userId,
      roleId: input.roleId,
    });
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
    const result = await this.transfer.execute(request.access!, {
      recipientId: input.recipientUserId,
      replacementRoleId: input.formerManagerRoleId,
    });
    return {
      managerUserId: result.managerId,
      formerManagerUserId: request.access!.userId,
      formerManagerRoleId: input.formerManagerRoleId,
    };
  }
}
