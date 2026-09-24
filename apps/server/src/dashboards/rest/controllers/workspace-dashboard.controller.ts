import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import type {
  DemandPressurePanel,
  OrderFlowPanel,
  PurchasingSpreadPanel,
  ReceiptReliabilityPanel,
} from '@warehouser/contracts/dashboards';
import { WorkspacePermissionId } from '@warehouser/shared-types/enums';
import { ReadDemandPressureQuery } from 'dashboards/usecases/queries/read-demand-pressure.query';
import { ReadOrderFlowQuery } from 'dashboards/usecases/queries/read-order-flow.query';
import { ReadPurchasingSpreadQuery } from 'dashboards/usecases/queries/read-purchasing-spread.query';
import { ReadReceiptReliabilityQuery } from 'dashboards/usecases/queries/read-receipt-reliability.query';
import type { WorkspaceAccessRequest } from 'shared/access/access-request';
import { RequiredWorkspacePermission } from 'shared/decorators/required-workspace-permission.decorator';
import { SessionAuthGuard } from 'shared/guards/session-auth.guard';
import { WorkspaceAccessGuard } from 'shared/guards/workspace-access.guard';

/** The four Workspace Panels of `contracts/openapi.yaml`, served under the prefix that file fixes
 * (sad.md §5, §6.6). **No route names a Workspace**, in a path, a query or a body position:
 * `WorkspaceAccessGuard` derives the actor's Workspace entirely from the session, so there is no
 * identifier for a request to offer and none for this surface to trust (AC-22). Nothing here
 * carries a body or a query parameter, so this module owns no `createZodDto` adapter — every
 * handler is a bodyless GET whose only input is the principal the guard resolved.
 *
 * Authority is a **Workspace** Permission and the two levels never meet
 * (server-request-authorization.md § "The stage"): each guard reads only its own metadata key, so
 * `@RequiredWorkspacePermission` is what admits a request here and a Warehouse-level
 * `PermissionId` — however many Warehouse memberships an actor holds, and whatever those
 * memberships grant — resolves nothing against this key and is refused (AC-22). A Workspace Member
 * whose Workspace Role lacks the Permission is refused by the guard with the one non-enumerating
 * `workspace.denied` from `shared/access/access-denial.errors.ts`, which the universal exception
 * filter maps to 403 and which names no Warehouse, quantity, count or share (AC-15). The
 * controller raises nothing itself.
 *
 * None of the four declares `@ArchivedTolerantRead()`. That decorator tolerates an archived
 * **target** Warehouse, and these reads name no target: each scopes itself to the Workspace's
 * active Warehouses inside the query and reports the archived count as a field of its own.
 *
 * The controller stays a transport adapter: it invokes one query and returns its result, which is
 * already the wire shape the contract publishes, and lets every typed failure propagate to the
 * universal exception filter (server-architecture.md §REST, server-error-handling.md §5). */
@Controller('api/v1/workspace/dashboard')
export class WorkspaceDashboardController {
  constructor(
    private readonly readDemandPressureQuery: ReadDemandPressureQuery,
    private readonly readOrderFlowQuery: ReadOrderFlowQuery,
    private readonly readPurchasingSpreadQuery: ReadPurchasingSpreadQuery,
    private readonly readReceiptReliabilityQuery: ReadReceiptReliabilityQuery,
  ) {}

  // AC-14 — each active Warehouse's outstanding demand divided into the three Urgency Bands.
  @Get('demand-pressure')
  @RequiredWorkspacePermission(
    WorkspacePermissionId.WAREHOUSE_PERFORMANCE_WATCH,
  )
  @UseGuards(SessionAuthGuard, WorkspaceAccessGuard)
  readDemandPressure(
    @Req() request: WorkspaceAccessRequest,
  ): Promise<DemandPressurePanel> {
    return this.readDemandPressureQuery.execute(request.workspace!);
  }

  // AC-16/AC-17 — twelve weeks for the Workspace as a whole, naming none of its Warehouses.
  @Get('order-flow')
  @RequiredWorkspacePermission(
    WorkspacePermissionId.WAREHOUSE_PERFORMANCE_WATCH,
  )
  @UseGuards(SessionAuthGuard, WorkspaceAccessGuard)
  readOrderFlow(
    @Req() request: WorkspaceAccessRequest,
  ): Promise<OrderFlowPanel> {
    return this.readOrderFlowQuery.execute(request.workspace!);
  }

  // AC-18 — every active Warehouse counted against every Purchase Draft state.
  @Get('purchasing-spread')
  @RequiredWorkspacePermission(
    WorkspacePermissionId.WAREHOUSE_PERFORMANCE_WATCH,
  )
  @UseGuards(SessionAuthGuard, WorkspaceAccessGuard)
  readPurchasingSpread(
    @Req() request: WorkspaceAccessRequest,
  ): Promise<PurchasingSpreadPanel> {
    return this.readPurchasingSpreadQuery.execute(request.workspace!);
  }

  // AC-19/AC-20 — each active Warehouse's receipt outcome over the reporting period.
  @Get('receipt-reliability')
  @RequiredWorkspacePermission(
    WorkspacePermissionId.WAREHOUSE_PERFORMANCE_WATCH,
  )
  @UseGuards(SessionAuthGuard, WorkspaceAccessGuard)
  readReceiptReliability(
    @Req() request: WorkspaceAccessRequest,
  ): Promise<ReceiptReliabilityPanel> {
    return this.readReceiptReliabilityQuery.execute(request.workspace!);
  }
}
