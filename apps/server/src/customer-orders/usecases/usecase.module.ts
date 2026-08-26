import { Module } from '@nestjs/common';
import { CustomerOrderLifecycleService } from 'customer-orders/domain/services/customer-order-lifecycle.service';
import { DemandAllocationService } from 'customer-orders/domain/services/demand-allocation.service';
import { AmendCustomerOrderCommand } from 'customer-orders/usecases/commands/amend-customer-order.command';
import { CancelCustomerOrderCommand } from 'customer-orders/usecases/commands/cancel-customer-order.command';
import { RecordCustomerOrderCommand } from 'customer-orders/usecases/commands/record-customer-order.command';
import { CustomerOrderLifecycleRepository } from 'shared/domain/repositories/customer-order-lifecycle.repository';
import { DemandAllocationRepository } from 'shared/domain/repositories/demand-allocation.repository';
import { ItemCatalogueRepository } from 'shared/domain/repositories/item-catalogue.repository';

// AC-01/AC-19/AC-19a — the demand lifecycle owns its rules in `CustomerOrderLifecycleService`, kept
// unexported: a transport adapter reaches it only through the commands below
// (server-architecture.md, "NestJS modules and exports").
const customerOrderServices = [CustomerOrderLifecycleService];

const customerOrderCommands = [
  RecordCustomerOrderCommand,
  AmendCustomerOrderCommand,
  CancelCustomerOrderCommand,
];

// ADR 0002 — `DemandAllocationService` is `customer-orders`' one deliberate export beyond its own
// commands: `purchase-drafts/domain/services/arrival-confirmation.service.ts` calls it inside the
// `@Transactional()` boundary *it* opens, reaching it only through this module's declared exports,
// never by importing `customer-orders/domain/services/demand-allocation.service` directly.
@Module({
  providers: [
    ...customerOrderServices,
    DemandAllocationService,
    ...customerOrderCommands,
    CustomerOrderLifecycleRepository,
    DemandAllocationRepository,
    ItemCatalogueRepository,
  ],
  exports: [...customerOrderCommands, DemandAllocationService],
})
export class CustomerOrdersUsecaseModule {}
