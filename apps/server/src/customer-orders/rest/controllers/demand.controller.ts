import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import type { DemandLine } from '@warehouser/contracts/customer-orders';
import { PermissionId } from '@warehouser/shared-types/enums';
import { ReadConsolidatedDemandQuery } from 'customer-orders/usecases/queries/read-consolidated-demand.query';
import type { WarehouseAccessRequest } from 'shared/access/access-request';
import { ArchivedTolerantRead } from 'shared/access/archived-tolerant-read.decorator';
import { ObservedPermission } from 'shared/decorators/observed-permission.decorator';
import { RequiredPermission } from 'shared/decorators/required-permission.decorator';
import { SessionAuthGuard } from 'shared/guards/session-auth.guard';
import { WarehouseAccessGuard } from 'shared/guards/warehouse-access.guard';

/** The consolidated demand of one Warehouse (contracts/openapi.yaml
 * `/api/v1/warehouses/{warehouseId}/demand`, AC-04, AC-05, AC-23).
 *
 * It is a second controller inside `customer-orders` rather than a module of its own: a Demand Line
 * is derived from Customer Orders on every read and is never a stored record, so the entity whose
 * invariants it depends on owns it. A module's URL prefix and its owning module are allowed to
 * disagree (ADR 18-08-2026, retaining ADR 14-08-2026 §"Two modules may serve one URL prefix").
 *
 * AC-09a — the read declares `CUSTOMERS:WATCH` **observed** beside its one required Permission,
 * because the demand surface as a whole carries customer identity through the Customer Orders behind
 * each Demand Line. Under the aggregation shape `ordering` established — which this feature leaves
 * unchanged (sad.md §6.6 read note) — a Demand Line itself carries no customer name, no Delivery
 * Address and no count of either, so **this operation has no field to redact**: the per-order
 * customer and destination are read through `listCustomerOrders`, which is where AC-09a's and
 * AC-24's redaction lands (api-sync-report.md Finding 1, resolved (a)).
 *
 * The declaration is made anyway and deliberately. It leaves sad.md §8's authorization-coverage
 * check no exception to carve out for a read on the identity-bearing demand surface, and it means
 * that adding an identity field to `DemandLine` later cannot silently skip the Permission that
 * governs it. It costs nothing and can deny nothing: the guard resolves observed Permissions in the
 * grant read it already issues, and `canActivate` never consults the result (ADR 0001).
 *
 * AC-05 — the read requires exactly `CUSTOMER_ORDERS:WATCH`. The denial is produced entirely by
 * `WarehouseAccessGuard` before this handler runs, so it is the same `access.denied` response for a
 * Warehouse holding demand and for one holding none: nothing here can leak a customer name, a
 * quantity, an Item, or whether any demand exists at all. */
@Controller('api/v1/warehouses/:warehouseId/demand')
export class DemandController {
  constructor(
    private readonly readConsolidatedDemandQuery: ReadConsolidatedDemandQuery,
  ) {}

  // AC-04/AC-23 — one Demand Line per Item, returned whole and archived-tolerant. The nine fields
  // are named explicitly rather than spread: a spread satisfies the contract type without excess
  // property checking, so a field later added to `ConsolidatedDemandLineRead` would reach the wire
  // silently even though openapi.yaml `DemandLine` is `additionalProperties: false`. Listing them
  // makes the response shape a decision of this adapter, as `toCustomerOrderResponse` and
  // `toItemResponse` do.
  @Get()
  @RequiredPermission(PermissionId.CUSTOMER_ORDERS_WATCH)
  @ObservedPermission(PermissionId.CUSTOMERS_WATCH)
  @ArchivedTolerantRead()
  @UseGuards(SessionAuthGuard, WarehouseAccessGuard)
  async readConsolidatedDemand(
    @Req() request: WarehouseAccessRequest,
  ): Promise<DemandLine[]> {
    const lines = await this.readConsolidatedDemandQuery.execute(
      request.access!,
    );

    return lines.map((line) => ({
      itemId: line.itemId,
      sku: line.sku,
      description: line.description,
      unitOfMeasure: line.unitOfMeasure,
      totalOutstandingQuantity: line.totalOutstandingQuantity,
      earliestNeededBy: line.earliestNeededBy,
      onHandQuantity: line.onHandQuantity,
      unfulfilledCustomerOrderCount: line.unfulfilledCustomerOrderCount,
      coverage: line.coverage.map((entry) => ({
        purchaseDraftId: entry.purchaseDraftId,
        // AC-20 — "which Purchase Drafts link to it": the reference is what names the draft to the
        // member (`PD-0142 · 800`), the id only what the link is followed by.
        purchaseDraftReference: entry.purchaseDraftReference,
        purchaseDraftLineId: entry.purchaseDraftLineId,
        purchaseDraftState: entry.purchaseDraftState,
        statedQuantity: entry.statedQuantity,
      })),
    }));
  }
}
