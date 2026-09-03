import { Module } from '@nestjs/common';
import { CustomerAddressBookService } from 'customers/domain/services/customer-address-book.service';
import { CustomerAddressBookRepository } from 'shared/domain/repositories/customer-address-book.repository';
import { CustomerDirectoryRepository } from 'shared/domain/repositories/customer-directory.repository';

// `customers`' application API. The commands and queries sad.md §5 lists arrive with T8, T9 and
// T10; what this module holds today is the one operation set they share.
//
// `CustomerAddressBookService` is a provider and is **absent from `exports`** — sad.md §5: "not
// exported; nothing outside `customers` calls it". A transport adapter, and any other module, reach
// its behaviour only through the commands and queries added above it
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
    CustomerDirectoryRepository,
    CustomerAddressBookRepository,
  ],
})
export class CustomersUsecaseModule {}
