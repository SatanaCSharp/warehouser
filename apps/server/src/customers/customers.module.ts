import { Module } from '@nestjs/common';
import { CustomersRestModule } from 'customers/rest/rest.module';
import { CustomersUsecaseModule } from 'customers/usecases/usecase.module';

// The one file `app.module.ts` imports for this feature, mirroring `customer-orders.module.ts` and
// `items.module.ts`: the use-case module and the REST module that serves it.
//
// Nothing is re-exported. `customer-orders` re-exports its use-case module because ADR 0002 makes
// `DemandAllocationService` a deliberate export to `purchase-drafts`; `customers` has no such
// consumer, and `CustomerAddressBookService` must stay unreachable from outside the module
// (sad.md §5).
@Module({
  imports: [CustomersUsecaseModule, CustomersRestModule],
})
export class CustomersModule {}
