import {
  Body,
  Controller,
  Get,
  Patch,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';
import type {
  ActiveWarehouseSelection,
  Workspace,
  WorkspaceContext,
} from '@warehouser/contracts/workspaces';
import { WorkspacePermissionId } from '@warehouser/shared-types/enums';
import type { WorkspaceAccessRequest } from 'shared/access/access-request.js';
import { RequiredWorkspacePermission } from 'shared/decorators/required-workspace-permission.decorator.js';
import { SessionAuthGuard } from 'shared/guards/session-auth.guard.js';
import { WorkspaceAccessGuard } from 'shared/guards/workspace-access.guard.js';
import {
  ActiveWarehouseWriteDto,
  WorkspaceRenameDto,
} from 'workspaces/rest/dtos/workspace-mutation.dto.js';
import { RenameWorkspaceCommand } from 'workspaces/usecases/commands/rename-workspace.command.js';
import { SetActiveWarehouseCommand } from 'workspaces/usecases/commands/set-active-warehouse.command.js';
import { ReadWorkspaceContextQuery } from 'workspaces/usecases/queries/read-workspace-context.query.js';

/** Every route whose subject is the Workspace itself. Workspace-scoped routes carry **no**
 * Workspace identifier: the guard derives the actor's Workspace from the session, so no handler
 * here reads a target Workspace from the request (ADR 0001, sad.md §7). The controller stays a
 * transport adapter — it invokes one command or query and maps its result, letting every typed
 * failure propagate to the universal exception filter (server-error-handling.md §5).
 *
 * The roles, members, permissions, users and owner-transfer handlers left for
 * `access`'s `WorkspaceAccessController`, which keeps this same
 * `api/v1/workspace` prefix (CH-S2, ADR 14-08-2026). No route changed; only the
 * class and module declaring eleven of them did. */
@Controller('api/v1/workspace')
export class WorkspaceController {
  constructor(
    private readonly readWorkspaceContextQuery: ReadWorkspaceContextQuery,
    private readonly renameWorkspaceCommand: RenameWorkspaceCommand,
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
}
