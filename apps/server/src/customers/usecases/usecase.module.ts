import { Module } from '@nestjs/common';
import { CustomerAddressBookService } from 'customers/domain/services/customer-address-book.service';
import { AddCustomerDeliveryAddressCommand } from 'customers/usecases/commands/add-customer-delivery-address.command';
import { CorrectCustomerDeliveryAddressCommand } from 'customers/usecases/commands/correct-customer-delivery-address.command';
import { CorrectCustomerNameCommand } from 'customers/usecases/commands/correct-customer-name.command';
import { DeactivateCustomerCommand } from 'customers/usecases/commands/deactivate-customer.command';
import { DeactivateCustomerDeliveryAddressCommand } from 'customers/usecases/commands/deactivate-customer-delivery-address.command';
import { ReactivateCustomerCommand } from 'customers/usecases/commands/reactivate-customer.command';
import { ReactivateCustomerDeliveryAddressCommand } from 'customers/usecases/commands/reactivate-customer-delivery-address.command';
import { RecordCustomerCommand } from 'customers/usecases/commands/record-customer.command';
import { SetMainCustomerDeliveryAddressCommand } from 'customers/usecases/commands/set-main-customer-delivery-address.command';
import { CustomerAddressBookRepository } from 'shared/domain/repositories/customer-address-book.repository';
import { CustomerDirectoryRepository } from 'shared/domain/repositories/customer-directory.repository';

// AC-01/AC-03b/AC-04/AC-05/AC-06/AC-06a/AC-06b/AC-07 — the Customer's own lifecycle and its
// Delivery Address book: each command owns the rules of its transition and its own
// `@Transactional()` boundary, and the operations more than one of them needs live in
// `CustomerAddressBookService` below (server-architecture.md §Services). The queries sad.md §5
// lists join this list with T10.
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

// `customers`' application API. The commands and queries are exported because T10's REST surface
// reaches this feature only through them.
//
// `CustomerAddressBookService` is a provider and is **absent from `exports`** — sad.md §5: "not
// exported; nothing outside `customers` calls it". A transport adapter, and any other module, reach
// its behaviour only through the commands and queries above it
// (server-architecture.md, "Services", "NestJS modules and exports"). `module-boundaries.spec.ts`
// asserts that declaration statically and `usecase.module.di.spec.ts` compiles a consumer outside
// `customers` to prove it cannot resolve the provider at all.
//
// The two repositories are local providers rather than reached from the `@Global()` `DomainModule`,
// following `customer-orders/usecases/usecase.module.ts` and `purchase-drafts`: the module declares
// the persistence it depends on.
@Module({
  providers: [
    CustomerAddressBookService,
    ...customerCommands,
    CustomerDirectoryRepository,
    CustomerAddressBookRepository,
  ],
  exports: [...customerCommands],
})
export class CustomersUsecaseModule {}
