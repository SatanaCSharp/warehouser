import { Module } from '@nestjs/common';
import { AuthModule } from 'auth/auth.module';
import { WarehouseDashboardController } from 'dashboards/rest/controllers/warehouse-dashboard.controller';
import { WorkspaceDashboardController } from 'dashboards/rest/controllers/workspace-dashboard.controller';
import { DashboardsUsecaseModule } from 'dashboards/usecases/usecase.module';
import { WarehouseAccessGuard } from 'shared/guards/warehouse-access.guard';
import { WorkspaceAccessGuard } from 'shared/guards/workspace-access.guard';

// `AuthModule` supplies `SessionAuthGuard`'s dependencies; `WarehouseAccessGuard` and
// `WorkspaceAccessGuard` are shared transport infrastructure from `shared/guards/` and are
// registered here only so Nest can construct them for this module's routes — registering a guard
// is not owning it (adding-a-server-module.md §1).
//
// One REST module carries both surfaces of the one capability: the Warehouse Panels under
// `api/v1/warehouses/:warehouseId/dashboard` and the Workspace Panels under
// `api/v1/workspace/dashboard`. A capability exercised at several scopes lives in one module and
// the scope appears in the file and symbol names, never in a second module
// (adding-a-server-module.md §1).
@Module({
  imports: [AuthModule, DashboardsUsecaseModule],
  controllers: [WarehouseDashboardController, WorkspaceDashboardController],
  providers: [WarehouseAccessGuard, WorkspaceAccessGuard],
})
export class DashboardsRestModule {}
