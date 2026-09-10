import { Module } from '@nestjs/common';
import { AuthModule } from 'auth/auth.module';
import { CustomerDeliveryAddressesController } from 'customers/rest/controllers/customer-delivery-addresses.controller';
import { CustomersController } from 'customers/rest/controllers/customers.controller';
import { CustomersUsecaseModule } from 'customers/usecases/usecase.module';
import { WarehouseAccessGuard } from 'shared/guards/warehouse-access.guard';

// Two controllers, one module: `/customers` and `/customers/:customerId/delivery-addresses` are
// separate URL prefixes served by the module that owns the entity behind both, because a Delivery
// Address "has no life apart from the Customer that owns it" (ADR 18-08-2026, openapi.yaml
// `CustomerDeliveryAddress`).
//
// `AuthModule` supplies `SessionAuthGuard`'s dependencies; `WarehouseAccessGuard` is shared
// transport infrastructure from `shared/guards/` and is only registered here so Nest can construct
// it for this module's routes — registering a guard is not owning it (ADR 18-08-2026, CR-RG-06).
@Module({
  imports: [AuthModule, CustomersUsecaseModule],
  controllers: [CustomersController, CustomerDeliveryAddressesController],
  providers: [WarehouseAccessGuard],
})
export class CustomersRestModule {}
