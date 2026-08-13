// Fixture only. Proves the check fails a handler that declares a Warehouse Permission but is
// guarded by `WorkspaceAccessGuard` (level confusion, the reverse of ADR 0001's pairing —
// AC-31 "cross-context").
import { Controller, Get, UseGuards } from '@nestjs/common';

import { PermissionId } from '@warehouser/shared-types/enums';
import { RequiredPermission } from 'shared/decorators/required-permission.decorator';
import { SessionAuthGuard } from 'shared/guards/session-auth.guard';
import { WorkspaceAccessGuard } from 'shared/guards/workspace-access.guard';

@Controller('api/v1/fixture/wrong-guard-pairing-b')
export class WarehousePermissionWithWorkspaceGuardFixtureController {
  @Get()
  @RequiredPermission(PermissionId.USERS_WATCH)
  @UseGuards(SessionAuthGuard, WorkspaceAccessGuard)
  async listSomething(): Promise<void> {}
}
