// Fixture only. Proves the check fails a mutating Warehouse-scoped handler that declares archived
// tolerance without appearing on ADR 0003's admitted membership-edge mutation list
// (docs/features/workspaces/adr/0003-archived-tolerant-membership-edge-mutations.md).
import { Controller, Post, UseGuards } from '@nestjs/common';

import { PermissionId } from '@warehouser/shared-types/enums';
import { ArchivedTolerantRead } from 'shared/access/archived-tolerant-read.decorator';
import { RequiredPermission } from 'shared/decorators/required-permission.decorator';
import { SessionAuthGuard } from 'shared/guards/session-auth.guard';
import { WarehouseAccessGuard } from 'shared/guards/warehouse-access.guard';

@Controller('api/v1/fixture/unadmitted-archived-tolerant-mutation/:warehouseId')
export class UnadmittedArchivedTolerantMutationFixtureController {
  @Post('do-something')
  @RequiredPermission(PermissionId.USERS_CREATE)
  @ArchivedTolerantRead()
  @UseGuards(SessionAuthGuard, WarehouseAccessGuard)
  async doSomething(): Promise<void> {}
}
