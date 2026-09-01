import { Module } from '@nestjs/common';
import { CustomerOrderLifecycleService } from 'customer-orders/domain/services/customer-order-lifecycle.service';
import { DemandAllocationService } from 'customer-orders/domain/services/demand-allocation.service';
import { AmendCustomerOrderCommand } from 'customer-orders/usecases/commands/amend-customer-order.command';
import { CancelCustomerOrderCommand } from 'customer-orders/usecases/commands/cancel-customer-order.command';
import { RecordCustomerOrderCommand } from 'customer-orders/usecases/commands/record-customer-order.command';
import { ListCustomerOrdersQuery } from 'customer-orders/usecases/queries/list-customer-orders.query';
import { ListLinkableCustomerOrdersForItemQuery } from 'customer-orders/usecases/queries/list-linkable-customer-orders-for-item.query';
import { ListUnfulfilledCustomerOrdersForItemQuery } from 'customer-orders/usecases/queries/list-unfulfilled-customer-orders-for-item.query';
import { ReadConsolidatedDemandQuery } from 'customer-orders/usecases/queries/read-consolidated-demand.query';
import { ConsolidatedDemandRepository } from 'shared/domain/repositories/consolidated-demand.repository';
import { CustomerOrderLifecycleRepository } from 'shared/domain/repositories/customer-order-lifecycle.repository';
import { DemandAllocationRepository } from 'shared/domain/repositories/demand-allocation.repository';
import { ItemCatalogueRepository } from 'shared/domain/repositories/item-catalogue.repository';

// AC-01/AC-19/AC-19a — each command owns the rules of its own transition and its own transaction
// boundary; the one locking read the amendment and the cancellation share lives in
// `CustomerOrderLifecycleService`, which stays unexported: a transport adapter reaches it only
// through the commands below (server-architecture.md, "Services", "NestJS modules and exports").
const customerOrderCommands = [
  RecordCustomerOrderCommand,
  AmendCustomerOrderCommand,
  CancelCustomerOrderCommand,
];

// AC-04/AC-20/AC-21a — the consolidated demand and the reads behind it. Exported for T11's REST
// surface: `/demand` is answered by the first, `/customer-orders` with its optional `itemId` and
// `state` by the second, and `?itemId=&state=unfulfilled` by the two destination-specific reads
// (contracts/openapi.yaml).
const customerOrderQueries = [
  ReadConsolidatedDemandQuery,
  ListCustomerOrdersQuery,
  ListUnfulfilledCustomerOrdersForItemQuery,
  ListLinkableCustomerOrdersForItemQuery,
];

// ADR 0002 — `DemandAllocationService` is `customer-orders`' one deliberate export beyond its own
// commands: `purchase-drafts/usecases/commands/confirm-purchase-draft-arrival.command.ts` calls it
// inside the `@Transactional()` boundary *it* opens.
//
// The *provider* is reached only through this export — `PurchaseDraftsUsecaseModule` imports this
// module and resolves the instance from it, rather than re-declaring it as a local provider, which
// is what keeps one instance and one dependency edge. The consumer still imports the class symbol
// from its defining file, because `emitDecoratorMetadata` needs a real constructor reference as the
// DI token; that import is the token, not a second path to the behaviour.
@Module({
  providers: [
    CustomerOrderLifecycleService,
    DemandAllocationService,
    ...customerOrderCommands,
    ...customerOrderQueries,
    ConsolidatedDemandRepository,
    CustomerOrderLifecycleRepository,
    DemandAllocationRepository,
    ItemCatalogueRepository,
  ],
  exports: [
    ...customerOrderCommands,
    ...customerOrderQueries,
    DemandAllocationService,
  ],
})
export class CustomerOrdersUsecaseModule {}
