import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import type { PurchaseDraftLineListEntry } from '@warehouser/contracts/purchase-drafts';
import { PermissionId } from '@warehouser/shared-types/enums';
import { map } from 'lodash';
import { PurchaseDraftLineListQueryDto } from 'purchase-drafts/rest/dtos/purchase-draft-mutation.dto';
import { toLineListEntryResponse } from 'purchase-drafts/rest/mappers/purchase-draft-response.mapper';
import { ListPurchaseDraftLinesQuery } from 'purchase-drafts/usecases/queries/list-purchase-draft-lines.query';
import type { WarehouseAccessRequest } from 'shared/access/access-request';
import { ArchivedTolerantRead } from 'shared/access/archived-tolerant-read.decorator';
import { ObservedPermission } from 'shared/decorators/observed-permission.decorator';
import { RequiredPermission } from 'shared/decorators/required-permission.decorator';
import { SessionAuthGuard } from 'shared/guards/session-auth.guard';
import { WarehouseAccessGuard } from 'shared/guards/warehouse-access.guard';

/** AC-22 — the by-line read: every line of the acting Warehouse's drafts, each carrying the draft
 * it belongs to and **its own** Delivery Mode, so a member preparing the dock sees only the goods
 * they will physically handle and a member arranging a direct shipment sees only theirs.
 *
 * Served at `/purchase-draft-lines` at the **top level**, not as `/purchase-drafts/lines`, so no
 * literal segment competes with a `{purchaseDraftId}` parameter — a request for the draft whose
 * identifier happened to be `lines` would otherwise resolve here (sad.md §7, openapi.yaml
 * `listPurchaseDraftLines`). It is its own controller for the same reason: two `@Controller`
 * prefixes cannot live on one class, and `tests/refactor/route-table.spec.mjs` proves the split
 * shadows nothing.
 *
 * `@ObservedPermission(CUSTOMERS:WATCH)` beside the required `PURCHASE_DRAFTS:WATCH`, because
 * openapi.yaml `PurchaseDraftLineListEntry` carries a `PurchaseDraftLine`, whose identified form
 * carries a Direct to Customer line's customer, address and access notes (AC-09a, ADR 0001). The
 * observed Permission can neither admit nor deny; it only narrows what the response carries.
 *
 * A member holding `PURCHASE_DRAFTS:WATCH` and **no Workspace Role at all** reads every Via
 * Warehouse line's `warehouseDestination` here in full, **its access notes included**: the
 * Warehouse's own address is the operator's own premises data rather than a third party's
 * (spec.md § "Personal data touched"), openapi.yaml `LineWarehouseDestination` requires
 * `accessNotes` and states the object is "readable by any member holding `PURCHASE_DRAFTS:WATCH` in
 * that Warehouse and is **never** gated on `CUSTOMERS:WATCH`", and `WAREHOUSES:ADDRESS_UPDATE`
 * gates **recording** that address, not reading it (AC-10, sad.md §7). AC-09a withholds the
 * *customer* addresses and their access notes, which is what `customerDestination` and the links
 * carry.
 *
 * `@ArchivedTolerantRead()` (AC-23): every read of an archived Warehouse succeeds, and this
 * controller carries no mutation at all. */
@Controller('api/v1/warehouses/:warehouseId/purchase-draft-lines')
export class PurchaseDraftLinesController {
  constructor(
    private readonly listPurchaseDraftLinesQuery: ListPurchaseDraftLinesQuery,
  ) {}

  @Get()
  @RequiredPermission(PermissionId.PURCHASE_DRAFTS_WATCH)
  @ObservedPermission(
    PermissionId.CUSTOMERS_WATCH,
    PermissionId.REJECTIONS_WATCH,
  )
  @ArchivedTolerantRead()
  @UseGuards(SessionAuthGuard, WarehouseAccessGuard)
  async listPurchaseDraftLines(
    @Req() request: WarehouseAccessRequest,
    @Query() query: PurchaseDraftLineListQueryDto,
  ): Promise<PurchaseDraftLineListEntry[]> {
    const entries = await this.listPurchaseDraftLinesQuery.execute(
      request.access!,
      { deliveryMode: query.deliveryMode, state: query.state },
    );

    return map(entries, toLineListEntryResponse);
  }
}
