import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type {
  AssignableWarehouseRole,
  WarehouseMembership,
} from '@warehouser/contracts/workspaces';
import { WorkspacePermissionId } from '@warehouser/shared-types/enums';
import { WarehouseMembershipAssignmentDto } from 'access/rest/dtos/warehouse-membership-mutation.dto';
import { AssignWarehouseMembershipCommand } from 'access/usecases/commands/assign-warehouse-membership.command';
import { RevokeWarehouseMembershipCommand } from 'access/usecases/commands/revoke-warehouse-membership.command';
import { ListAssignableWarehouseRolesQuery } from 'access/usecases/queries/list-assignable-warehouse-roles.query';
import type { WorkspaceAccessRequest } from 'shared/access/access-request';
import { RequiredWorkspacePermission } from 'shared/decorators/required-workspace-permission.decorator';
import { SessionAuthGuard } from 'shared/guards/session-auth.guard';
import { WorkspaceAccessGuard } from 'shared/guards/workspace-access.guard';

/** Every route whose subject is a membership **edge** into a Warehouse — granting or revoking a
 * Warehouse Role, which is Access, not the Warehouse record (CH-S3, ADR 14-08-2026 §Ownership).
 * It declares the same `api/v1/workspace/warehouses` prefix `warehouses`' `WarehouseController`
 * keeps, because source layout and URL layout are deliberately decoupled (sad.md §4.5): NestJS
 * serves one prefix from two controllers as long as no two handlers claim the same method and
 * path, which `tests/refactor/route-table.spec.mjs` asserts rather than assumes. Although every
 * handler carries a `warehouseId` path segment, authority resolves through the Workspace guard and
 * a Workspace Permission, never `WarehouseAccessGuard` or a Warehouse Permission: that guard also
 * consults archived state, which these operations must not (AC-11). The controller stays a
 * transport adapter — it invokes one command or query and maps its result, letting every typed
 * failure propagate to the universal exception filter (server-error-handling.md §5). */
@Controller('api/v1/workspace/warehouses')
export class WarehouseAccessController {
  constructor(
    private readonly listAssignableWarehouseRolesQuery: ListAssignableWarehouseRolesQuery,
    private readonly assignWarehouseMembershipCommand: AssignWarehouseMembershipCommand,
    private readonly revokeWarehouseMembershipCommand: RevokeWarehouseMembershipCommand,
  ) {}

  @Get(':warehouseId/assignable-roles')
  @RequiredWorkspacePermission(
    WorkspacePermissionId.WAREHOUSE_MEMBERSHIPS_ASSIGN,
  )
  @UseGuards(SessionAuthGuard, WorkspaceAccessGuard)
  async listAssignableRoles(
    @Param('warehouseId', new ParseUUIDPipe()) warehouseId: string,
    @Req() request: WorkspaceAccessRequest,
  ): Promise<AssignableWarehouseRole[]> {
    const roles = await this.listAssignableWarehouseRolesQuery.execute(
      request.workspace!,
      { warehouseId },
    );
    return roles.map((role) => ({ id: role.id, name: role.name }));
  }

  @Post(':warehouseId/memberships')
  @HttpCode(HttpStatus.CREATED)
  @RequiredWorkspacePermission(
    WorkspacePermissionId.WAREHOUSE_MEMBERSHIPS_ASSIGN,
  )
  @UseGuards(SessionAuthGuard, WorkspaceAccessGuard)
  async assignMembership(
    @Param('warehouseId', new ParseUUIDPipe()) warehouseId: string,
    @Req() request: WorkspaceAccessRequest,
    @Body() input: WarehouseMembershipAssignmentDto,
  ): Promise<WarehouseMembership> {
    const membership = await this.assignWarehouseMembershipCommand.execute(
      request.workspace!,
      { targetUserId: input.userId, warehouseId, roleId: input.roleId },
    );
    return {
      userId: membership.userId,
      warehouseId: membership.warehouseId,
      roleId: membership.roleId,
      roleKind: membership.roleKind,
    };
  }

  @Delete(':warehouseId/memberships/:userId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequiredWorkspacePermission(
    WorkspacePermissionId.WAREHOUSE_MEMBERSHIPS_REVOKE,
  )
  @UseGuards(SessionAuthGuard, WorkspaceAccessGuard)
  async revokeMembership(
    @Param('warehouseId', new ParseUUIDPipe()) warehouseId: string,
    @Param('userId', new ParseUUIDPipe()) userId: string,
    @Req() request: WorkspaceAccessRequest,
  ): Promise<void> {
    await this.revokeWarehouseMembershipCommand.execute(request.workspace!, {
      targetUserId: userId,
      warehouseId,
    });
  }
}
