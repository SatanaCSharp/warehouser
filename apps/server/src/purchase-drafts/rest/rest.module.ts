import { Module } from '@nestjs/common';
import { AuthModule } from 'auth/auth.module';
import { PackagingTypesController } from 'purchase-drafts/rest/controllers/packaging-types.controller';
import { PurchaseDraftsController } from 'purchase-drafts/rest/controllers/purchase-drafts.controller';
import { PurchaseDraftsUsecaseModule } from 'purchase-drafts/usecases/usecase.module';
import { WarehouseAccessGuard } from 'shared/guards/warehouse-access.guard';

// Two controllers, one module: `/packaging-types` and `/purchase-drafts` are separate URL prefixes
// served by the module that owns the entity behind both — the catalogue a Purchase Draft Line's
// Packaging Type is chosen from is served at its own segment so no literal competes with a
// `{purchaseDraftId}` parameter (T16 §What, sad.md §7).
//
// `AuthModule` supplies `SessionAuthGuard`'s dependencies; `WarehouseAccessGuard` is shared
// transport infrastructure from `shared/guards/` and is only registered here so Nest can construct
// it for this module's routes — registering a guard is not owning it (ADR 18-08-2026).
@Module({
  imports: [AuthModule, PurchaseDraftsUsecaseModule],
  controllers: [PackagingTypesController, PurchaseDraftsController],
  providers: [WarehouseAccessGuard],
})
export class PurchaseDraftsRestModule {}
