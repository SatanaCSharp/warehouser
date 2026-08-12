// Fixture only. Proves the check fails a Warehouse-Permission-declaring handler whose HTTP verb
// decorator the check cannot resolve to a read/mutating classification at all (sad.md §8: every
// Warehouse-scoped handler must be read, mutating, or an admitted archived-tolerant membership-edge
// mutation — never left unclassified).
import { All, Controller, UseGuards } from '@nestjs/common';

import { PermissionId } from '@warehouser/shared-types/enums';
import { RequiredPermission } from 'shared/decorators/required-permission.decorator';
import { SessionAuthGuard } from 'shared/guards/session-auth.guard';
import { WarehouseAccessGuard } from 'shared/guards/warehouse-access.guard';

@Controller('api/v1/fixture/unclassified-verb/:warehouseId')
export class UnclassifiedVerbFixtureController {
  @All()
  @RequiredPermission(PermissionId.USERS_WATCH)
  @UseGuards(SessionAuthGuard, WarehouseAccessGuard)
  async handleAnything(): Promise<void> {}
}
