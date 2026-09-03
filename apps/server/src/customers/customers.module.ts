import { Module } from '@nestjs/common';
import { CustomersUsecaseModule } from 'customers/usecases/usecase.module';

// The one file `app.module.ts` imports for this feature, mirroring `customer-orders.module.ts` and
// `items.module.ts`. `CustomersRestModule` joins the imports with T10, which is the task that serves
// the REST surface and wires the feature into the runtime; there is no REST module to compose yet,
// and adding-a-server-module.md §2 says to omit the structure that has no behaviour rather than
// create it for symmetry.
//
// Nothing is re-exported. `customer-orders` re-exports its use-case module because ADR 0002 makes
// `DemandAllocationService` a deliberate export to `purchase-drafts`; `customers` has no such
// consumer, and `CustomerAddressBookService` must stay unreachable from outside the module
// (sad.md §5).
@Module({
  imports: [CustomersUsecaseModule],
})
export class CustomersModule {}
