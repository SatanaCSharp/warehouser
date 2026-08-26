import { Module } from '@nestjs/common';
import { CustomerOrdersUsecaseModule } from 'customer-orders/usecases/usecase.module';
import { ArrivalConfirmationService } from 'purchase-drafts/domain/services/arrival-confirmation.service';
import { PurchaseDraftClosureService } from 'purchase-drafts/domain/services/purchase-draft-closure.service';
import { PurchaseDraftFreezeService } from 'purchase-drafts/domain/services/purchase-draft-freeze.service';
import { ClosePurchaseDraftCommand } from 'purchase-drafts/usecases/commands/close-purchase-draft.command';
import { ConfirmPurchaseDraftArrivalCommand } from 'purchase-drafts/usecases/commands/confirm-purchase-draft-arrival.command';
import { DiscardPurchaseDraftCommand } from 'purchase-drafts/usecases/commands/discard-purchase-draft.command';
import { ReadyPurchaseDraftCommand } from 'purchase-drafts/usecases/commands/ready-purchase-draft.command';
import { ListPurchaseDraftsQuery } from 'purchase-drafts/usecases/queries/list-purchase-drafts.query';
import { ReadPurchaseDraftQuery } from 'purchase-drafts/usecases/queries/read-purchase-draft.query';
import { ArrivalConfirmationRepository } from 'shared/domain/repositories/arrival-confirmation.repository';
import { PurchaseDraftAssemblyRepository } from 'shared/domain/repositories/purchase-draft-assembly.repository';
import { PurchaseDraftFreezeRepository } from 'shared/domain/repositories/purchase-draft-freeze.repository';
import { PurchaseDraftReadRepository } from 'shared/domain/repositories/purchase-draft-read.repository';

// T13/T14/T15 — the freeze, closure, discard and arrival-confirmation transitions, and the
// drift-aware reads, are the application boundary T16's REST surface calls through
// (server-architecture.md "NestJS modules and exports").
// T15 imports `CustomerOrdersUsecaseModule` to reach its exported `DemandAllocationService`
// (ADR 0002) rather than importing `customer-orders/domain/services/demand-allocation.service`
// directly.
@Module({
  imports: [CustomerOrdersUsecaseModule],
  providers: [
    PurchaseDraftFreezeService,
    PurchaseDraftClosureService,
    ArrivalConfirmationService,
    PurchaseDraftFreezeRepository,
    PurchaseDraftAssemblyRepository,
    PurchaseDraftReadRepository,
    ArrivalConfirmationRepository,
    ReadyPurchaseDraftCommand,
    ClosePurchaseDraftCommand,
    DiscardPurchaseDraftCommand,
    ConfirmPurchaseDraftArrivalCommand,
    ReadPurchaseDraftQuery,
    ListPurchaseDraftsQuery,
  ],
  exports: [
    ReadyPurchaseDraftCommand,
    ClosePurchaseDraftCommand,
    DiscardPurchaseDraftCommand,
    ConfirmPurchaseDraftArrivalCommand,
    ReadPurchaseDraftQuery,
    ListPurchaseDraftsQuery,
  ],
})
export class PurchaseDraftsUsecaseModule {}
