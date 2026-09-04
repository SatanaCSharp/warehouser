import { Module } from '@nestjs/common';
import { AuthModule } from 'auth/auth.module';
import { PackagingTypesController } from 'purchase-drafts/rest/controllers/packaging-types.controller';
import { PurchaseDraftLinesController } from 'purchase-drafts/rest/controllers/purchase-draft-lines.controller';
import { PurchaseDraftsController } from 'purchase-drafts/rest/controllers/purchase-drafts.controller';
import { PurchaseDraftsUsecaseModule } from 'purchase-drafts/usecases/usecase.module';
import { WarehouseAccessGuard } from 'shared/guards/warehouse-access.guard';

// Three controllers, one module: `/packaging-types`, `/purchase-drafts` and `/purchase-draft-lines`
// are separate URL prefixes served by the module that owns the entity behind all three. Both extra
// prefixes exist for the same reason — a literal segment must never compete with a
// `{purchaseDraftId}` parameter, so the Packaging Type catalogue and the by-line read (AC-22) are
// each addressed at the top level rather than under `/purchase-drafts/...` (T16 §What, T19 §Notes,
// sad.md §7). A controller carries exactly one prefix, so three prefixes are three classes.
//
// `AuthModule` supplies `SessionAuthGuard`'s dependencies; `WarehouseAccessGuard` is shared
// transport infrastructure from `shared/guards/` and is only registered here so Nest can construct
// it for this module's routes — registering a guard is not owning it (ADR 18-08-2026).
@Module({
  imports: [AuthModule, PurchaseDraftsUsecaseModule],
  controllers: [
    PackagingTypesController,
    PurchaseDraftsController,
    PurchaseDraftLinesController,
  ],
  providers: [WarehouseAccessGuard],
})
export class PurchaseDraftsRestModule {}
