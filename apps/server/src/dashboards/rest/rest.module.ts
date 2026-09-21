import { Module } from '@nestjs/common';
import { AuthModule } from 'auth/auth.module';
import { WarehouseDashboardController } from 'dashboards/rest/controllers/warehouse-dashboard.controller';
import { DashboardsUsecaseModule } from 'dashboards/usecases/usecase.module';
import { WarehouseAccessGuard } from 'shared/guards/warehouse-access.guard';

// `AuthModule` supplies `SessionAuthGuard`'s dependencies; `WarehouseAccessGuard` is shared
// transport infrastructure from `shared/guards/` and is registered here only so Nest can construct
// it for this module's routes — registering a guard is not owning it (adding-a-server-module.md §1).
//
// T14 adds the Workspace Dashboard controller to this module's `controllers` and
// `WorkspaceAccessGuard` to its providers; the two tasks serialize on this file.
@Module({
  imports: [AuthModule, DashboardsUsecaseModule],
  controllers: [WarehouseDashboardController],
  providers: [WarehouseAccessGuard],
})
export class DashboardsRestModule {}
