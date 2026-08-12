// Fixture only. Proves the check fails a Warehouse-Permission-declaring handler whose route (class
// path + method path) carries no `warehouseId` parameter (sad.md §8 class 2).
import { Controller, Get, UseGuards } from '@nestjs/common';

import { PermissionId } from '@warehouser/shared-types/enums';
import { RequiredPermission } from 'shared/decorators/required-permission.decorator';
import { SessionAuthGuard } from 'shared/guards/session-auth.guard';
import { WarehouseAccessGuard } from 'shared/guards/warehouse-access.guard';

@Controller('api/v1/fixture/no-warehouse-id')
export class MissingWarehouseIdFixtureController {
  @Get('items')
  @RequiredPermission(PermissionId.USERS_WATCH)
  @UseGuards(SessionAuthGuard, WarehouseAccessGuard)
  async listItems(): Promise<void> {}
}
