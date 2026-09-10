import { Module } from '@nestjs/common';
import { CustomerAddressBookService } from 'customers/domain/services/customer-address-book.service.js';
import { AddCustomerDeliveryAddressCommand } from 'customers/usecases/commands/add-customer-delivery-address.command.js';
import { CorrectCustomerDeliveryAddressCommand } from 'customers/usecases/commands/correct-customer-delivery-address.command.js';
import { CorrectCustomerNameCommand } from 'customers/usecases/commands/correct-customer-name.command.js';
import { DeactivateCustomerCommand } from 'customers/usecases/commands/deactivate-customer.command.js';
import { DeactivateCustomerDeliveryAddressCommand } from 'customers/usecases/commands/deactivate-customer-delivery-address.command.js';
import { ReactivateCustomerCommand } from 'customers/usecases/commands/reactivate-customer.command.js';
import { ReactivateCustomerDeliveryAddressCommand } from 'customers/usecases/commands/reactivate-customer-delivery-address.command.js';
import { RecordCustomerCommand } from 'customers/usecases/commands/record-customer.command.js';
import { SetMainCustomerDeliveryAddressCommand } from 'customers/usecases/commands/set-main-customer-delivery-address.command.js';
import { ListCustomersQuery } from 'customers/usecases/queries/list-customers.query.js';
import { ReadCustomerQuery } from 'customers/usecases/queries/read-customer.query.js';
import { CustomerAddressBookRepository } from 'shared/domain/repositories/customer-address-book.repository.js';
import { CustomerAwaitingDemandRepository } from 'shared/domain/repositories/customer-awaiting-demand.repository.js';
import { CustomerDirectoryRepository } from 'shared/domain/repositories/customer-directory.repository.js';

// AC-01/AC-03b/AC-04/AC-05/AC-06/AC-06a/AC-06b/AC-07 — the Customer's own lifecycle and its
// Delivery Address book: each command owns the rules of its transition and its own
// `@Transactional()` boundary, and the operations more than one of them needs live in
// `CustomerAddressBookService` below (server-architecture.md §Services).
const customerCommands = [
  RecordCustomerCommand,
  CorrectCustomerNameCommand,
  DeactivateCustomerCommand,
  ReactivateCustomerCommand,
  AddCustomerDeliveryAddressCommand,
  CorrectCustomerDeliveryAddressCommand,
  SetMainCustomerDeliveryAddressCommand,
  DeactivateCustomerDeliveryAddressCommand,
  ReactivateCustomerDeliveryAddressCommand,
];

// AC-06/AC-08/AC-12 — the reads sad.md §5 lists. `listCustomers?active=true` is the picker read
// rather than a third query: openapi.yaml addresses both readings through one operation, and a
// second class would differ only in a boolean it does not choose.
const customerQueries = [ListCustomersQuery, ReadCustomerQuery];

// `customers`' application API. The commands and queries are exported because the REST surface
// reaches this feature only through them.
//
// `CustomerAddressBookService` is a provider and is **absent from `exports`** — sad.md §5: "not
// exported; nothing outside `customers` calls it". A transport adapter, and any other module, reach
// its behaviour only through the commands and queries above it
// (server-architecture.md, "Services", "NestJS modules and exports"). `module-boundaries.spec.ts`
// asserts that declaration statically and `usecase.module.di.spec.ts` compiles a consumer outside
// `customers` to prove it cannot resolve the provider at all.
//
// The three repositories are local providers rather than reached from the `@Global()` `DomainModule`,
// following `customer-orders/usecases/usecase.module.ts` and `purchase-drafts`: the module declares
// the persistence it depends on.
@Module({
  providers: [
    CustomerAddressBookService,
    ...customerCommands,
    ...customerQueries,
    CustomerDirectoryRepository,
    CustomerAddressBookRepository,
    CustomerAwaitingDemandRepository,
  ],
  exports: [...customerCommands, ...customerQueries],
})
export class CustomersUsecaseModule {}
