import { Module } from '@nestjs/common';
import { ReadArrivalTimingQuery } from 'dashboards/usecases/queries/read-arrival-timing.query';
import { ReadCoverageGapQuery } from 'dashboards/usecases/queries/read-coverage-gap.query';
import { ReadPurchasingPipelineQuery } from 'dashboards/usecases/queries/read-purchasing-pipeline.query';
import { ReadReasonConcentrationQuery } from 'dashboards/usecases/queries/read-reason-concentration.query';
import { WarehouseDemandCoverageRepository } from 'shared/domain/repositories/warehouse-demand-coverage.repository';
import { WarehousePurchasingReadRepository } from 'shared/domain/repositories/warehouse-purchasing-read.repository';
import { WarehouseRejectionReadRepository } from 'shared/domain/repositories/warehouse-rejection-read.repository';

// T11/sad.md §5 — the four Warehouse Panel reads, none of them provided by the `@Global()`
// `DomainModule`, so each repository is a local provider here exactly as `PurchaseDraftsUsecaseModule`
// provides `PurchaseDraftReadRepository`. `APP_TIMEZONE` needs no import: `AppTimezoneModule.forRoot()`
// registers it `global: true` in `AppModule` (shared/config/app-timezone.module.ts).
//
// T13 adds the four Workspace Panel queries and their repository to this module's providers and
// exports; the two tasks serialize on this file.
@Module({
  providers: [
    WarehouseDemandCoverageRepository,
    WarehousePurchasingReadRepository,
    WarehouseRejectionReadRepository,
    ReadCoverageGapQuery,
    ReadArrivalTimingQuery,
    ReadPurchasingPipelineQuery,
    ReadReasonConcentrationQuery,
  ],
  exports: [
    ReadCoverageGapQuery,
    ReadArrivalTimingQuery,
    ReadPurchasingPipelineQuery,
    ReadReasonConcentrationQuery,
  ],
})
export class DashboardsUsecaseModule {}
