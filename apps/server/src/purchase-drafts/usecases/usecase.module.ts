import { Module } from '@nestjs/common';
import { CustomerOrdersUsecaseModule } from 'customer-orders/usecases/usecase.module';
import { PurchaseDraftAssemblyService } from 'purchase-drafts/domain/services/purchase-draft-assembly.service';
import { PurchaseDraftLineEndingService } from 'purchase-drafts/domain/services/purchase-draft-line-ending.service';
import { AddPurchaseDraftLineCommand } from 'purchase-drafts/usecases/commands/add-purchase-draft-line.command';
import { AddPurchaseDraftLineLinkCommand } from 'purchase-drafts/usecases/commands/add-purchase-draft-line-link.command';
import { ClosePurchaseDraftCommand } from 'purchase-drafts/usecases/commands/close-purchase-draft.command';
import { ConfirmPurchaseDraftLineArrivalCommand } from 'purchase-drafts/usecases/commands/confirm-purchase-draft-line-arrival.command';
import { CreatePurchaseDraftCommand } from 'purchase-drafts/usecases/commands/create-purchase-draft.command';
import { DiscardPurchaseDraftCommand } from 'purchase-drafts/usecases/commands/discard-purchase-draft.command';
import { ReadyPurchaseDraftCommand } from 'purchase-drafts/usecases/commands/ready-purchase-draft.command';
import { RecordPurchaseDraftLineDeliveryCommand } from 'purchase-drafts/usecases/commands/record-purchase-draft-line-delivery.command';
import { RemovePurchaseDraftLineCommand } from 'purchase-drafts/usecases/commands/remove-purchase-draft-line.command';
import { RemovePurchaseDraftLineLinkCommand } from 'purchase-drafts/usecases/commands/remove-purchase-draft-line-link.command';
import { RevisePurchaseDraftCommand } from 'purchase-drafts/usecases/commands/revise-purchase-draft.command';
import { RevisePurchaseDraftLineCommand } from 'purchase-drafts/usecases/commands/revise-purchase-draft-line.command';
import { RevisePurchaseDraftLineLinkCommand } from 'purchase-drafts/usecases/commands/revise-purchase-draft-line-link.command';
import { ListPackagingTypesQuery } from 'purchase-drafts/usecases/queries/list-packaging-types.query';
import { ListPurchaseDraftLinesQuery } from 'purchase-drafts/usecases/queries/list-purchase-draft-lines.query';
import { ListPurchaseDraftsQuery } from 'purchase-drafts/usecases/queries/list-purchase-drafts.query';
import { ReadPurchaseDraftQuery } from 'purchase-drafts/usecases/queries/read-purchase-draft.query';
import { ArrivalConfirmationRepository } from 'shared/domain/repositories/arrival-confirmation.repository';
import { CustomerAddressBookRepository } from 'shared/domain/repositories/customer-address-book.repository';
import { CustomerOrderLifecycleRepository } from 'shared/domain/repositories/customer-order-lifecycle.repository';
import { ItemCatalogueRepository } from 'shared/domain/repositories/item-catalogue.repository';
import { PackagingTypeCatalogueRepository } from 'shared/domain/repositories/packaging-type-catalogue.repository';
import { PurchaseDraftAssemblyRepository } from 'shared/domain/repositories/purchase-draft-assembly.repository';
import { PurchaseDraftFreezeRepository } from 'shared/domain/repositories/purchase-draft-freeze.repository';
import { PurchaseDraftReadRepository } from 'shared/domain/repositories/purchase-draft-read.repository';

// The assembly, freeze, closure, discard and arrival-confirmation transitions, and the drift-aware
// reads, are the application boundary the REST surface calls through (server-architecture.md
// "NestJS modules and exports"). Each command owns the rules of its own transition and its own
// transaction boundary; the checks several of them share — and only those — live in
// `PurchaseDraftAssemblyService`, which is a local provider here and stays unexported: a transport
// adapter reaches the module only through the use cases below.
// This module imports `CustomerOrdersUsecaseModule` to reach its exported `DemandAllocationService`
// (ADR 0002) rather than importing `customer-orders/domain/services/demand-allocation.service`
// directly.
@Module({
  imports: [CustomerOrdersUsecaseModule],
  providers: [
    PurchaseDraftAssemblyService,
    PurchaseDraftFreezeRepository,
    PurchaseDraftAssemblyRepository,
    PurchaseDraftReadRepository,
    ArrivalConfirmationRepository,
    PurchaseDraftLineEndingService,
    // Beside `PurchaseDraftAssemblyRepository`, which it reads the links of a line through (AC-15a),
    // `PurchaseDraftAssemblyService` reaches three further repositories, none of them provided by
    // the `@Global()` `DomainModule`, so each is a local provider here exactly as
    // `PurchaseDraftAssemblyRepository` already is.
    ItemCatalogueRepository,
    CustomerOrderLifecycleRepository,
    PackagingTypeCatalogueRepository,
    // AC-12/sad.md §6.7 step 4 — `RevisePurchaseDraftLineCommand` proves a Direct to Customer
    // line's Delivery Address is one of the acting Warehouse's and is active before it writes,
    // rather than letting `fk_purchase_draft_lines_delivery_address` fire and surface as a 500.
    CustomerAddressBookRepository,
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
    ConfirmPurchaseDraftLineArrivalCommand,
    RecordPurchaseDraftLineDeliveryCommand,
    ReadPurchaseDraftQuery,
    ListPurchaseDraftsQuery,
    ListPurchaseDraftLinesQuery,
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
    ConfirmPurchaseDraftLineArrivalCommand,
    RecordPurchaseDraftLineDeliveryCommand,
    ReadPurchaseDraftQuery,
    ListPurchaseDraftsQuery,
    ListPurchaseDraftLinesQuery,
  ],
})
export class PurchaseDraftsUsecaseModule {}
