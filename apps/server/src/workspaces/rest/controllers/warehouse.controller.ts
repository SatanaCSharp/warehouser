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
  AssignableWarehouseRole,
  Warehouse,
  WarehouseMembership,
} from '@warehouser/contracts/workspaces';
import { WorkspacePermissionId } from '@warehouser/shared-types/enums';
import type { WorkspaceAccessRequest } from 'shared/access/access-request';
import { RequiredWorkspacePermission } from 'shared/decorators/required-workspace-permission.decorator';
import { SessionAuthGuard } from 'shared/guards/session-auth.guard';
import { WorkspaceAccessGuard } from 'shared/guards/workspace-access.guard';
import { ArchiveWarehouseCommand } from 'warehouses/usecases/commands/archive-warehouse.command';
import { CreateWarehouseCommand } from 'warehouses/usecases/commands/create-warehouse.command';
import { RenameWarehouseCommand } from 'warehouses/usecases/commands/rename-warehouse.command';
import { RestoreWarehouseCommand } from 'warehouses/usecases/commands/restore-warehouse.command';
import { ListWorkspaceWarehousesQuery } from 'warehouses/usecases/queries/list-workspace-warehouses.query';
import {
  WarehouseArchivalDto,
  WarehouseMembershipAssignmentDto,
  WarehouseWriteDto,
} from 'workspaces/rest/dtos/warehouse-mutation.dto';
import { AssignWarehouseMembershipCommand } from 'workspaces/usecases/commands/assign-warehouse-membership.command';
import { RevokeWarehouseMembershipCommand } from 'workspaces/usecases/commands/revoke-warehouse-membership.command';
import { ListAssignableWarehouseRolesQuery } from 'workspaces/usecases/queries/list-assignable-warehouse-roles.query';

/** Every route whose subject is the Warehouse record itself or a membership edge into it — never
 * a resource a Warehouse owns (spec.md §1, sad.md §7, T25 DoD). Although every mutation and the
 * assignable-Roles read carry a `warehouseId` path segment, authority resolves through the
 * Workspace guard and a Workspace Permission, never `WarehouseAccessGuard` or a Warehouse
 * Permission: that guard also consults archived state, which these operations must not (AC-11).
 * The controller stays a transport adapter — it invokes one command or query and maps its result,
 * letting every typed failure propagate to the universal exception filter
 * (server-error-handling.md §5). */
@Controller('api/v1/workspace/warehouses')
export class WarehouseController {
  constructor(
    private readonly listWorkspaceWarehousesQuery: ListWorkspaceWarehousesQuery,
    private readonly createWarehouseCommand: CreateWarehouseCommand,
    private readonly renameWarehouseCommand: RenameWarehouseCommand,
    private readonly archiveWarehouseCommand: ArchiveWarehouseCommand,
    private readonly restoreWarehouseCommand: RestoreWarehouseCommand,
    private readonly listAssignableWarehouseRolesQuery: ListAssignableWarehouseRolesQuery,
    private readonly assignWarehouseMembershipCommand: AssignWarehouseMembershipCommand,
    private readonly revokeWarehouseMembershipCommand: RevokeWarehouseMembershipCommand,
  ) {}

  @Get()
  @RequiredWorkspacePermission(WorkspacePermissionId.WAREHOUSES_WATCH)
  @UseGuards(SessionAuthGuard, WorkspaceAccessGuard)
  async listWarehouses(
    @Req() request: WorkspaceAccessRequest,
  ): Promise<Warehouse[]> {
    const warehouses = await this.listWorkspaceWarehousesQuery.execute(
      request.workspace!,
    );
    return warehouses.map((warehouse) => ({
      id: warehouse.id,
      name: warehouse.name,
      archivedAt: warehouse.archivedAt?.toISOString() ?? null,
    }));
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequiredWorkspacePermission(WorkspacePermissionId.WAREHOUSES_CREATE)
  @UseGuards(SessionAuthGuard, WorkspaceAccessGuard)
  async createWarehouse(
    @Req() request: WorkspaceAccessRequest,
    @Body() input: WarehouseWriteDto,
  ): Promise<Warehouse> {
    const warehouse = await this.createWarehouseCommand.execute(
      request.workspace!,
      { name: input.name },
    );
    return {
      id: warehouse.id,
      name: warehouse.name,
      archivedAt: warehouse.archivedAt?.toISOString() ?? null,
    };
  }

  // AC-11 — `RenameWarehouseCommand` now confirms the Warehouse's current
  // archived state from the row it locked, so the handler returns the full
  // `Warehouse` body openapi.yaml documents (200), matching what the
  // already-shipped web client Zod-validates against.
  @Patch(':warehouseId')
  @RequiredWorkspacePermission(WorkspacePermissionId.WAREHOUSES_RENAME)
  @UseGuards(SessionAuthGuard, WorkspaceAccessGuard)
  async renameWarehouse(
    @Param('warehouseId', new ParseUUIDPipe()) warehouseId: string,
    @Req() request: WorkspaceAccessRequest,
    @Body() input: WarehouseWriteDto,
  ): Promise<Warehouse> {
    const warehouse = await this.renameWarehouseCommand.execute(
      request.workspace!,
      { warehouseId, name: input.name },
    );
    return {
      id: warehouse.id,
      name: warehouse.name,
      archivedAt: warehouse.archivedAt?.toISOString() ?? null,
    };
  }

  // AC-11 — one contract route (`PUT .../archival`) maps to the two
  // opposite-direction commands; the request body's `archived` flag selects
  // which one runs. Both commands now confirm the full Warehouse record they
  // just wrote, so the handler answers 200 with the `Warehouse` body
  // openapi.yaml documents, matching what the already-shipped web client
  // Zod-validates against.
  @Put(':warehouseId/archival')
  @HttpCode(HttpStatus.OK)
  @RequiredWorkspacePermission(WorkspacePermissionId.WAREHOUSES_ARCHIVE)
  @UseGuards(SessionAuthGuard, WorkspaceAccessGuard)
  async setWarehouseArchival(
    @Param('warehouseId', new ParseUUIDPipe()) warehouseId: string,
    @Req() request: WorkspaceAccessRequest,
    @Body() input: WarehouseArchivalDto,
  ): Promise<Warehouse> {
    const warehouse = input.archived
      ? await this.archiveWarehouseCommand.execute(request.workspace!, {
          warehouseId,
        })
      : await this.restoreWarehouseCommand.execute(request.workspace!, {
          warehouseId,
        });

    return {
      id: warehouse.id,
      name: warehouse.name,
      archivedAt: warehouse.archivedAt?.toISOString() ?? null,
    };
  }

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
