// Fixture only. Proves the check fails a handler that declares a Workspace Permission but is
// guarded by `WarehouseAccessGuard` (level confusion — ADR 0001, AC-31 "cross-context").
import { Controller, Get, UseGuards } from '@nestjs/common';

import { WorkspacePermissionId } from '@warehouser/shared-types/enums';
import { RequiredWorkspacePermission } from 'shared/decorators/required-workspace-permission.decorator';
import { SessionAuthGuard } from 'shared/guards/session-auth.guard';
import { WarehouseAccessGuard } from 'shared/guards/warehouse-access.guard';

@Controller('api/v1/fixture/wrong-guard-pairing-a/:warehouseId')
export class WorkspacePermissionWithWarehouseGuardFixtureController {
  @Get()
  @RequiredWorkspacePermission(WorkspacePermissionId.WAREHOUSES_WATCH)
  @UseGuards(SessionAuthGuard, WarehouseAccessGuard)
  async listSomething(): Promise<void> {}
}
