import { Module } from '@nestjs/common';
import { AuthModule } from 'auth/auth.module';
import { CustomerOrdersController } from 'customer-orders/rest/controllers/customer-orders.controller';
import { DemandController } from 'customer-orders/rest/controllers/demand.controller';
import { CustomerOrdersUsecaseModule } from 'customer-orders/usecases/usecase.module';
import { WarehouseAccessGuard } from 'shared/guards/warehouse-access.guard';

// Two controllers, one module: `/demand` and `/customer-orders` are separate URL prefixes served by
// the module that owns the entity behind both, because a Demand Line is derived from Customer
// Orders (ADR 18-08-2026).
//
// `AuthModule` supplies `SessionAuthGuard`'s dependencies; `WarehouseAccessGuard` is shared
// transport infrastructure from `shared/guards/` and is only registered here so Nest can construct
// it for this module's routes — registering a guard is not owning it (ADR 18-08-2026, CR-RG-06).
@Module({
  imports: [AuthModule, CustomerOrdersUsecaseModule],
  controllers: [DemandController, CustomerOrdersController],
  providers: [WarehouseAccessGuard],
})
export class CustomerOrdersRestModule {}
