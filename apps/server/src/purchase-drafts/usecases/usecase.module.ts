import { Module } from '@nestjs/common';
import { PurchaseDraftClosureService } from 'purchase-drafts/domain/services/purchase-draft-closure.service';
import { PurchaseDraftFreezeService } from 'purchase-drafts/domain/services/purchase-draft-freeze.service';
import { ClosePurchaseDraftCommand } from 'purchase-drafts/usecases/commands/close-purchase-draft.command';
import { DiscardPurchaseDraftCommand } from 'purchase-drafts/usecases/commands/discard-purchase-draft.command';
import { ReadyPurchaseDraftCommand } from 'purchase-drafts/usecases/commands/ready-purchase-draft.command';
import { PurchaseDraftAssemblyRepository } from 'shared/domain/repositories/purchase-draft-assembly.repository';
import { PurchaseDraftFreezeRepository } from 'shared/domain/repositories/purchase-draft-freeze.repository';

// T13 — the freeze, closure and discard transitions are the application boundary T16's REST
// surface calls through (server-architecture.md "NestJS modules and exports").
@Module({
  providers: [
    PurchaseDraftFreezeService,
    PurchaseDraftClosureService,
    PurchaseDraftFreezeRepository,
    PurchaseDraftAssemblyRepository,
    ReadyPurchaseDraftCommand,
    ClosePurchaseDraftCommand,
    DiscardPurchaseDraftCommand,
  ],
  exports: [
    ReadyPurchaseDraftCommand,
    ClosePurchaseDraftCommand,
    DiscardPurchaseDraftCommand,
  ],
})
export class PurchaseDraftsUsecaseModule {}
