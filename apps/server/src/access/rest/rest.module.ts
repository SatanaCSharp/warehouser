import { Module } from '@nestjs/common';
import { AccessController } from 'access/rest/controllers/access.controller';
import { WarehouseAccessController } from 'access/rest/controllers/warehouse-access.controller';
import { AccessUsecaseModule } from 'access/usecases/usecase.module';
import { AuthModule } from 'auth/auth.module';
import { WarehouseAccessGuard } from 'shared/guards/warehouse-access.guard';
import { WorkspaceAccessGuard } from 'shared/guards/workspace-access.guard';

// Both guards are shared transport infrastructure from `shared/guards/` and are
// registered here only so Nest can construct them for this module's routes:
// `AccessController` is guarded by `WarehouseAccessGuard` and
// `WarehouseAccessController` by `WorkspaceAccessGuard`. Registering a guard is
// not owning it (ADR 14-08-2026, CR-RG-06).
@Module({
  imports: [AuthModule, AccessUsecaseModule],
  controllers: [AccessController, WarehouseAccessController],
  providers: [WarehouseAccessGuard, WorkspaceAccessGuard],
})
export class AccessRestModule {}
