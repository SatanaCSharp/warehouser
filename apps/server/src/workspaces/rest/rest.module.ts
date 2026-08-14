import { Module } from '@nestjs/common';
import { AuthModule } from 'auth/auth.module';
import { WorkspaceAccessGuard } from 'shared/guards/workspace-access.guard';
import { WarehousesUsecaseModule } from 'warehouses/usecases/usecase.module';
import { WarehouseController } from 'workspaces/rest/controllers/warehouse.controller';
import { WorkspaceController } from 'workspaces/rest/controllers/workspace.controller';
import { WorkspacesUsecaseModule } from 'workspaces/usecases/usecase.module';

// `AuthModule` supplies `SessionAuthGuard`'s dependencies; `WorkspaceAccessGuard`
// is shared transport infrastructure from `shared/guards/` and is only
// registered here so Nest can construct it for this module's routes.
// `WarehousesUsecaseModule` supplies the Warehouse-record use cases
// `WarehouseController` invokes, which now live in `warehouses`; the
// controller itself moves there next, at which point this import goes with
// it.
@Module({
  imports: [AuthModule, WorkspacesUsecaseModule, WarehousesUsecaseModule],
  controllers: [WorkspaceController, WarehouseController],
  providers: [WorkspaceAccessGuard],
})
export class WorkspacesRestModule {}
