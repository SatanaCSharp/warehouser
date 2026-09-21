import { Module } from '@nestjs/common';
import { ReadArrivalTimingQuery } from 'dashboards/usecases/queries/read-arrival-timing.query';
import { ReadCoverageGapQuery } from 'dashboards/usecases/queries/read-coverage-gap.query';
import { ReadDemandPressureQuery } from 'dashboards/usecases/queries/read-demand-pressure.query';
import { ReadOrderFlowQuery } from 'dashboards/usecases/queries/read-order-flow.query';
import { ReadPurchasingPipelineQuery } from 'dashboards/usecases/queries/read-purchasing-pipeline.query';
import { ReadPurchasingSpreadQuery } from 'dashboards/usecases/queries/read-purchasing-spread.query';
import { ReadReasonConcentrationQuery } from 'dashboards/usecases/queries/read-reason-concentration.query';
import { ReadReceiptReliabilityQuery } from 'dashboards/usecases/queries/read-receipt-reliability.query';
import { WarehouseDemandCoverageRepository } from 'shared/domain/repositories/warehouse-demand-coverage.repository';
import { WarehousePurchasingReadRepository } from 'shared/domain/repositories/warehouse-purchasing-read.repository';
import { WarehouseRejectionReadRepository } from 'shared/domain/repositories/warehouse-rejection-read.repository';
import { WorkspacePerformanceReadRepository } from 'shared/domain/repositories/workspace-performance-read.repository';

// T11/T13/sad.md §5 — the four Warehouse Panel reads and the four Workspace Panel reads, none of
// their repositories provided by the `@Global()` `DomainModule`, so each is a local provider here
// exactly as `PurchaseDraftsUsecaseModule` provides `PurchaseDraftReadRepository`. `APP_TIMEZONE`
// needs no import: `AppTimezoneModule.forRoot()` registers it `global: true` in `AppModule`
// (shared/config/app-timezone.module.ts).
//
// One repository serves all four Workspace Panels — `WorkspacePerformanceReadRepository` is
// specialized around the Workspace's active-Warehouse scope rather than around one table
// (creating-a-server-repository.md) — so the Workspace half adds one provider and four queries.
@Module({
  providers: [
    WarehouseDemandCoverageRepository,
    WarehousePurchasingReadRepository,
    WarehouseRejectionReadRepository,
    WorkspacePerformanceReadRepository,
    ReadCoverageGapQuery,
    ReadArrivalTimingQuery,
    ReadPurchasingPipelineQuery,
    ReadReasonConcentrationQuery,
    ReadDemandPressureQuery,
    ReadOrderFlowQuery,
    ReadPurchasingSpreadQuery,
    ReadReceiptReliabilityQuery,
  ],
  exports: [
    ReadCoverageGapQuery,
    ReadArrivalTimingQuery,
    ReadPurchasingPipelineQuery,
    ReadReasonConcentrationQuery,
    ReadDemandPressureQuery,
    ReadOrderFlowQuery,
    ReadPurchasingSpreadQuery,
    ReadReceiptReliabilityQuery,
  ],
})
export class DashboardsUsecaseModule {}
