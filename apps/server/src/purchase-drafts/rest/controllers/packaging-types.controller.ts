import { Controller, Get, UseGuards } from '@nestjs/common';
import type { PackagingType } from '@warehouser/contracts/purchase-drafts';
import { PermissionId } from '@warehouser/shared-types/enums';
import { ListPackagingTypesQuery } from 'purchase-drafts/usecases/queries/list-packaging-types.query.js';
import { ArchivedTolerantRead } from 'shared/access/archived-tolerant-read.decorator.js';
import { RequiredPermission } from 'shared/decorators/required-permission.decorator.js';
import { SessionAuthGuard } from 'shared/guards/session-auth.guard.js';
import { WarehouseAccessGuard } from 'shared/guards/warehouse-access.guard.js';

/** The Packaging Type catalogue (contracts/openapi.yaml `/packaging-types`, sad.md §7). Served at
 * its own segment — not nested under `/purchase-drafts` — so no literal segment competes with a
 * `{purchaseDraftId}` parameter (T16 §What). A distinct URL prefix gets its own controller,
 * mirroring how `/demand` is `DemandController` beside `CustomerOrdersController` (T11).
 *
 * The catalogue is system-managed and seeded by migration (CONTEXT.md §Invariants), so this
 * controller carries no mutation. It requires the same `PURCHASE_DRAFTS:WATCH` Permission every
 * other Purchase Draft read requires and is archived-tolerant (AC-23). */
@Controller('api/v1/warehouses/:warehouseId/packaging-types')
export class PackagingTypesController {
  constructor(
    private readonly listPackagingTypesQuery: ListPackagingTypesQuery,
  ) {}

  @Get()
  @RequiredPermission(PermissionId.PURCHASE_DRAFTS_WATCH)
  @ArchivedTolerantRead()
  @UseGuards(SessionAuthGuard, WarehouseAccessGuard)
  async listPackagingTypes(): Promise<PackagingType[]> {
    const catalogue = await this.listPackagingTypesQuery.execute();

    return catalogue.map((entry) => ({ id: entry.id, label: entry.label }));
  }
}
