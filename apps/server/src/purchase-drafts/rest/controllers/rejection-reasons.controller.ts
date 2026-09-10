import { Controller, Get, UseGuards } from '@nestjs/common';
import type { RejectionReason } from '@warehouser/contracts/purchase-drafts';
import { PermissionId } from '@warehouser/shared-types/enums';
import { ListRejectionReasonsQuery } from 'purchase-drafts/usecases/queries/list-rejection-reasons.query.js';
import { ArchivedTolerantRead } from 'shared/access/archived-tolerant-read.decorator.js';
import { RequiredPermission } from 'shared/decorators/required-permission.decorator.js';
import { SessionAuthGuard } from 'shared/guards/session-auth.guard.js';
import { WarehouseAccessGuard } from 'shared/guards/warehouse-access.guard.js';

/** The Rejection Reason catalogue (contracts/openapi.yaml `/rejection-reasons`, sad.md §7). Served
 * at its own segment — not nested under `/purchase-drafts` — so no literal segment competes with a
 * `{purchaseDraftId}` parameter, mirroring `PackagingTypesController` (AC-06, T13 §What).
 *
 * The catalogue is system-managed and seeded by migration (CONTEXT.md §Invariants), so this
 * controller carries no mutation. It requires the same `PURCHASE_DRAFTS:WATCH` Permission every
 * other Purchase Draft read requires and is archived-tolerant (AC-23). */
@Controller('api/v1/warehouses/:warehouseId/rejection-reasons')
export class RejectionReasonsController {
  constructor(
    private readonly listRejectionReasonsQuery: ListRejectionReasonsQuery,
  ) {}

  @Get()
  @RequiredPermission(PermissionId.PURCHASE_DRAFTS_WATCH)
  @ArchivedTolerantRead()
  @UseGuards(SessionAuthGuard, WarehouseAccessGuard)
  // The query already projects the catalogue to a feature-owned shape, so there is no mapping left
  // to do here. Declaring the contract type is what proves the projection still matches it: a field
  // renamed on either side is a compile error rather than a hand-written map that silently agrees
  // with itself (code-review-back-end-2026-09-09.md).
  listRejectionReasons(): Promise<RejectionReason[]> {
    return this.listRejectionReasonsQuery.execute();
  }
}
