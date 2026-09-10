import { Module } from '@nestjs/common';
import { CustomerOrdersRestModule } from 'customer-orders/rest/rest.module.js';
import { CustomerOrdersUsecaseModule } from 'customer-orders/usecases/usecase.module.js';

// Combines `customer-orders`' application API and its REST adapter, mirroring `items.module.ts` —
// the one file `app.module.ts` imports for this feature. `CustomerOrdersUsecaseModule` is
// re-exported because ADR 0002 makes `DemandAllocationService` this module's one deliberate export
// to `purchase-drafts` (T11, `tasks/customer-orders-rest-surface.md`).
@Module({
  imports: [CustomerOrdersUsecaseModule, CustomerOrdersRestModule],
  exports: [CustomerOrdersUsecaseModule],
})
export class CustomerOrdersModule {}
