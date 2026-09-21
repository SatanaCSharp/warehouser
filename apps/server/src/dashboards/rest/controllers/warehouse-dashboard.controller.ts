import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import type {
  ArrivalTimingPanel,
  CoverageGapPanel,
  PurchasingPipelinePanel,
  ReasonConcentrationPanel,
} from '@warehouser/contracts/dashboards';
import { PermissionId } from '@warehouser/shared-types/enums';
import { ReadArrivalTimingQuery } from 'dashboards/usecases/queries/read-arrival-timing.query';
import { ReadCoverageGapQuery } from 'dashboards/usecases/queries/read-coverage-gap.query';
import { ReadPurchasingPipelineQuery } from 'dashboards/usecases/queries/read-purchasing-pipeline.query';
import { ReadReasonConcentrationQuery } from 'dashboards/usecases/queries/read-reason-concentration.query';
import type { WarehouseAccessRequest } from 'shared/access/access-request';
import { ArchivedTolerantRead } from 'shared/access/archived-tolerant-read.decorator';
import { ObservedPermission } from 'shared/decorators/observed-permission.decorator';
import { RequiredPermission } from 'shared/decorators/required-permission.decorator';
import { SessionAuthGuard } from 'shared/guards/session-auth.guard';
import { WarehouseAccessGuard } from 'shared/guards/warehouse-access.guard';

/** The four Warehouse Panels of `contracts/openapi.yaml`, served under the prefix that file fixes
 * (sad.md §5, §6.2). Every route is a read whose only input is the Warehouse the path names:
 * nothing carries a body or a query parameter, so this module owns no `createZodDto` adapter —
 * `WarehouseAccessGuard` resolves the one path parameter into the principal each query is handed.
 *
 * Authority is the membership held in **that** Warehouse and nothing else, so a Permission carried
 * by a membership in a sibling Warehouse of the same Workspace resolves nothing here and is refused
 * with the same non-enumerating `access.denied` an actor holding nothing receives (AC-24,
 * server-request-authorization.md § "The stage").
 *
 * Each handler declares exactly one `@RequiredPermission` — the member of the Panel's set its
 * records are keyed by — because the decorator is variadic while the guard evaluates only the
 * first, so a second identifier there would be silently ignored rather than conjoined. The rest of
 * a conjunction Panel's set is declared `@ObservedPermission`, resolved onto the principal, and
 * asserted by the query before it issues any read (ADR 0001, `panel-access.predicates.ts`). The
 * declared observed set of each handler below is exactly the set its query's predicate asks for.
 *
 * All four declare `@ArchivedTolerantRead()` from `shared/access/`, so an archived Warehouse serves
 * its figures on exactly the Permission terms that applied before archiving (AC-23) — the Panels
 * are how a member reads what an archived Warehouse still holds.
 *
 * The controller stays a transport adapter: it invokes one query and returns its result, which is
 * already the wire shape the contract publishes, and lets every typed failure propagate to the
 * universal exception filter (server-architecture.md §REST, server-error-handling.md §5). */
@Controller('api/v1/warehouses/:warehouseId/dashboard')
export class WarehouseDashboardController {
  constructor(
    private readonly readCoverageGapQuery: ReadCoverageGapQuery,
    private readonly readArrivalTimingQuery: ReadArrivalTimingQuery,
    private readonly readPurchasingPipelineQuery: ReadPurchasingPipelineQuery,
    private readonly readReasonConcentrationQuery: ReadReasonConcentrationQuery,
  ) {}

  // AC-01/AC-02/AC-03 — a conjunction Panel: Items admit it, Customer Orders and Purchase Drafts
  // are observed and asserted by the query (AC-13).
  @Get('coverage-gap')
  @RequiredPermission(PermissionId.ITEMS_WATCH)
  @ObservedPermission(
    PermissionId.CUSTOMER_ORDERS_WATCH,
    PermissionId.PURCHASE_DRAFTS_WATCH,
  )
  @ArchivedTolerantRead()
  @UseGuards(SessionAuthGuard, WarehouseAccessGuard)
  readCoverageGap(
    @Req() request: WarehouseAccessRequest,
  ): Promise<CoverageGapPanel> {
    return this.readCoverageGapQuery.execute(request.access!);
  }

  // AC-01/AC-02/AC-07 — the second conjunction Panel: Customer Orders admit it, Purchase Drafts are
  // observed and asserted by the query (AC-13).
  @Get('arrival-timing')
  @RequiredPermission(PermissionId.CUSTOMER_ORDERS_WATCH)
  @ObservedPermission(PermissionId.PURCHASE_DRAFTS_WATCH)
  @ArchivedTolerantRead()
  @UseGuards(SessionAuthGuard, WarehouseAccessGuard)
  readArrivalTiming(
    @Req() request: WarehouseAccessRequest,
  ): Promise<ArrivalTimingPanel> {
    return this.readArrivalTimingQuery.execute(request.access!);
  }

  // AC-01/AC-10/AC-11 — not a conjunction: one Permission admits it, so it declares no observed
  // Permission and its query asserts none.
  @Get('purchasing-pipeline')
  @RequiredPermission(PermissionId.PURCHASE_DRAFTS_WATCH)
  @ArchivedTolerantRead()
  @UseGuards(SessionAuthGuard, WarehouseAccessGuard)
  readPurchasingPipeline(
    @Req() request: WarehouseAccessRequest,
  ): Promise<PurchasingPipelinePanel> {
    return this.readPurchasingPipelineQuery.execute(request.access!);
  }

  // AC-01/AC-12 — not a conjunction either; Rejections alone admit it.
  @Get('reason-concentration')
  @RequiredPermission(PermissionId.REJECTIONS_WATCH)
  @ArchivedTolerantRead()
  @UseGuards(SessionAuthGuard, WarehouseAccessGuard)
  readReasonConcentration(
    @Req() request: WarehouseAccessRequest,
  ): Promise<ReasonConcentrationPanel> {
    return this.readReasonConcentrationQuery.execute(request.access!);
  }
}
