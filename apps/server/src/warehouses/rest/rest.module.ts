import { Module } from '@nestjs/common';
import { AuthModule } from 'auth/auth.module';
import { WorkspaceAccessGuard } from 'shared/guards/workspace-access.guard';
import { WarehouseController } from 'warehouses/rest/controllers/warehouse.controller';
import { WarehousesUsecaseModule } from 'warehouses/usecases/usecase.module';

// `AuthModule` supplies `SessionAuthGuard`'s dependencies; `WorkspaceAccessGuard`
// is shared transport infrastructure from `shared/guards/` and is only
// registered here so Nest can construct it for this module's routes —
// registering a guard is not owning it (ADR 14-08-2026, CR-RG-06).
@Module({
  imports: [AuthModule, WarehousesUsecaseModule],
  controllers: [WarehouseController],
  providers: [WorkspaceAccessGuard],
})
export class WarehousesRestModule {}
