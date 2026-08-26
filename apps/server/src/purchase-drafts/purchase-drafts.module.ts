import { Module } from '@nestjs/common';
import { PurchaseDraftsRestModule } from 'purchase-drafts/rest/rest.module';
import { PurchaseDraftsUsecaseModule } from 'purchase-drafts/usecases/usecase.module';

// Combines `purchase-drafts`' application API and its REST adapter, mirroring
// `customer-orders.module.ts` — the one file `app.module.ts` imports for this feature.
@Module({
  imports: [PurchaseDraftsUsecaseModule, PurchaseDraftsRestModule],
  exports: [PurchaseDraftsUsecaseModule],
})
export class PurchaseDraftsModule {}
