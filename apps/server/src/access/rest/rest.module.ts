import { Module } from '@nestjs/common';
import { AccessController } from 'access/rest/controllers/access.controller.js';
import { WarehouseAccessController } from 'access/rest/controllers/warehouse-access.controller.js';
import { WorkspaceAccessController } from 'access/rest/controllers/workspace-access.controller.js';
import { AccessUsecaseModule } from 'access/usecases/usecase.module.js';
import { AuthModule } from 'auth/auth.module.js';
import { WarehouseAccessGuard } from 'shared/guards/warehouse-access.guard.js';
import { WorkspaceAccessGuard } from 'shared/guards/workspace-access.guard.js';

// Both guards are shared transport infrastructure from `shared/guards/` and are
// registered here only so Nest can construct them for this module's routes:
// `AccessController` is guarded by `WarehouseAccessGuard`, and
// `WarehouseAccessController` and `WorkspaceAccessController` by
// `WorkspaceAccessGuard`. Registering a guard is not owning it
// (ADR 14-08-2026, CR-RG-06).
//
// `WorkspaceAccessController` declares `api/v1/workspace`, the prefix
// `workspaces`' `WorkspaceController` keeps: two modules may serve one prefix
// as long as no two handlers claim the same method and path (ADR 14-08-2026).
@Module({
  imports: [AuthModule, AccessUsecaseModule],
  controllers: [
    AccessController,
    WarehouseAccessController,
    WorkspaceAccessController,
  ],
  providers: [WarehouseAccessGuard, WorkspaceAccessGuard],
})
export class AccessRestModule {}
