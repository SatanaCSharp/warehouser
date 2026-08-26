import { Module } from '@nestjs/common';
import { PurchaseDraftClosureService } from 'purchase-drafts/domain/services/purchase-draft-closure.service';
import { PurchaseDraftFreezeService } from 'purchase-drafts/domain/services/purchase-draft-freeze.service';
import { ClosePurchaseDraftCommand } from 'purchase-drafts/usecases/commands/close-purchase-draft.command';
import { DiscardPurchaseDraftCommand } from 'purchase-drafts/usecases/commands/discard-purchase-draft.command';
import { ReadyPurchaseDraftCommand } from 'purchase-drafts/usecases/commands/ready-purchase-draft.command';
import { ListPurchaseDraftsQuery } from 'purchase-drafts/usecases/queries/list-purchase-drafts.query';
import { ReadPurchaseDraftQuery } from 'purchase-drafts/usecases/queries/read-purchase-draft.query';
import { PurchaseDraftAssemblyRepository } from 'shared/domain/repositories/purchase-draft-assembly.repository';
import { PurchaseDraftFreezeRepository } from 'shared/domain/repositories/purchase-draft-freeze.repository';
import { PurchaseDraftReadRepository } from 'shared/domain/repositories/purchase-draft-read.repository';

// T13/T14 — the freeze, closure, discard transitions and the drift-aware reads are the application
// boundary T16's REST surface calls through (server-architecture.md "NestJS modules and exports").
@Module({
  providers: [
    PurchaseDraftFreezeService,
    PurchaseDraftClosureService,
    PurchaseDraftFreezeRepository,
    PurchaseDraftAssemblyRepository,
    PurchaseDraftReadRepository,
    ReadyPurchaseDraftCommand,
    ClosePurchaseDraftCommand,
    DiscardPurchaseDraftCommand,
    ReadPurchaseDraftQuery,
    ListPurchaseDraftsQuery,
  ],
  exports: [
    ReadyPurchaseDraftCommand,
    ClosePurchaseDraftCommand,
    DiscardPurchaseDraftCommand,
    ReadPurchaseDraftQuery,
    ListPurchaseDraftsQuery,
  ],
})
export class PurchaseDraftsUsecaseModule {}
