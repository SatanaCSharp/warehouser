import { Module } from '@nestjs/common';
import { AuthModule } from 'auth/auth.module.js';
import { PackagingTypesController } from 'purchase-drafts/rest/controllers/packaging-types.controller.js';
import { PurchaseDraftLinesController } from 'purchase-drafts/rest/controllers/purchase-draft-lines.controller.js';
import { PurchaseDraftsController } from 'purchase-drafts/rest/controllers/purchase-drafts.controller.js';
import { RejectionReasonsController } from 'purchase-drafts/rest/controllers/rejection-reasons.controller.js';
import { PurchaseDraftsUsecaseModule } from 'purchase-drafts/usecases/usecase.module.js';
import { WarehouseAccessGuard } from 'shared/guards/warehouse-access.guard.js';

// Four controllers, one module: `/packaging-types`, `/purchase-drafts`, `/purchase-draft-lines` and
// `/rejection-reasons` are separate URL prefixes served by the module that owns the entity behind
// all four. Every extra prefix exists for the same reason — a literal segment must never compete
// with a `{purchaseDraftId}` parameter, so the Packaging Type catalogue, the by-line read (AC-22)
// and the Rejection Reason catalogue (AC-06) are each addressed at the top level rather than under
// `/purchase-drafts/...` (T16 §What, T19 §Notes, T13 §What, sad.md §7). A controller carries exactly
// one prefix, so four prefixes are four classes.
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
    RejectionReasonsController,
  ],
  providers: [WarehouseAccessGuard],
})
export class PurchaseDraftsRestModule {}
