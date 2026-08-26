import { Module } from '@nestjs/common';
import { CustomerOrdersUsecaseModule } from 'customer-orders/usecases/usecase.module';
import { ArrivalConfirmationService } from 'purchase-drafts/domain/services/arrival-confirmation.service';
import { PurchaseDraftAssemblyService } from 'purchase-drafts/domain/services/purchase-draft-assembly.service';
import { PurchaseDraftClosureService } from 'purchase-drafts/domain/services/purchase-draft-closure.service';
import { PurchaseDraftFreezeService } from 'purchase-drafts/domain/services/purchase-draft-freeze.service';
import { AddPurchaseDraftLineCommand } from 'purchase-drafts/usecases/commands/add-purchase-draft-line.command';
import { AddPurchaseDraftLineLinkCommand } from 'purchase-drafts/usecases/commands/add-purchase-draft-line-link.command';
import { ClosePurchaseDraftCommand } from 'purchase-drafts/usecases/commands/close-purchase-draft.command';
import { ConfirmPurchaseDraftArrivalCommand } from 'purchase-drafts/usecases/commands/confirm-purchase-draft-arrival.command';
import { CreatePurchaseDraftCommand } from 'purchase-drafts/usecases/commands/create-purchase-draft.command';
import { DiscardPurchaseDraftCommand } from 'purchase-drafts/usecases/commands/discard-purchase-draft.command';
import { ReadyPurchaseDraftCommand } from 'purchase-drafts/usecases/commands/ready-purchase-draft.command';
import { RemovePurchaseDraftLineCommand } from 'purchase-drafts/usecases/commands/remove-purchase-draft-line.command';
import { RemovePurchaseDraftLineLinkCommand } from 'purchase-drafts/usecases/commands/remove-purchase-draft-line-link.command';
import { RevisePurchaseDraftCommand } from 'purchase-drafts/usecases/commands/revise-purchase-draft.command';
import { RevisePurchaseDraftLineCommand } from 'purchase-drafts/usecases/commands/revise-purchase-draft-line.command';
import { RevisePurchaseDraftLineLinkCommand } from 'purchase-drafts/usecases/commands/revise-purchase-draft-line-link.command';
import { ListPackagingTypesQuery } from 'purchase-drafts/usecases/queries/list-packaging-types.query';
import { ListPurchaseDraftsQuery } from 'purchase-drafts/usecases/queries/list-purchase-drafts.query';
import { ReadPurchaseDraftQuery } from 'purchase-drafts/usecases/queries/read-purchase-draft.query';
import { ArrivalConfirmationRepository } from 'shared/domain/repositories/arrival-confirmation.repository';
import { CustomerOrderLifecycleRepository } from 'shared/domain/repositories/customer-order-lifecycle.repository';
import { ItemCatalogueRepository } from 'shared/domain/repositories/item-catalogue.repository';
import { PackagingTypeCatalogueRepository } from 'shared/domain/repositories/packaging-type-catalogue.repository';
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
    PurchaseDraftAssemblyService,
    PurchaseDraftFreezeService,
    PurchaseDraftClosureService,
    ArrivalConfirmationService,
    PurchaseDraftFreezeRepository,
    PurchaseDraftAssemblyRepository,
    PurchaseDraftReadRepository,
    ArrivalConfirmationRepository,
    // T12's assembly service reaches three further repositories, none of them provided by the
    // `@Global()` `DomainModule`, so each is a local provider here exactly as
    // `PurchaseDraftAssemblyRepository` already is.
    ItemCatalogueRepository,
    CustomerOrderLifecycleRepository,
    PackagingTypeCatalogueRepository,
    CreatePurchaseDraftCommand,
    RevisePurchaseDraftCommand,
    AddPurchaseDraftLineCommand,
    RevisePurchaseDraftLineCommand,
    RemovePurchaseDraftLineCommand,
    AddPurchaseDraftLineLinkCommand,
    RevisePurchaseDraftLineLinkCommand,
    RemovePurchaseDraftLineLinkCommand,
    ListPackagingTypesQuery,
    ReadyPurchaseDraftCommand,
    ClosePurchaseDraftCommand,
    DiscardPurchaseDraftCommand,
    ConfirmPurchaseDraftArrivalCommand,
    ReadPurchaseDraftQuery,
    ListPurchaseDraftsQuery,
  ],
  exports: [
    CreatePurchaseDraftCommand,
    RevisePurchaseDraftCommand,
    AddPurchaseDraftLineCommand,
    RevisePurchaseDraftLineCommand,
    RemovePurchaseDraftLineCommand,
    AddPurchaseDraftLineLinkCommand,
    RevisePurchaseDraftLineLinkCommand,
    RemovePurchaseDraftLineLinkCommand,
    ListPackagingTypesQuery,
    ReadyPurchaseDraftCommand,
    ClosePurchaseDraftCommand,
    DiscardPurchaseDraftCommand,
    ConfirmPurchaseDraftArrivalCommand,
    ReadPurchaseDraftQuery,
    ListPurchaseDraftsQuery,
  ],
})
export class PurchaseDraftsUsecaseModule {}
