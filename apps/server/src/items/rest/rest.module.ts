import { Module } from '@nestjs/common';
import { AuthModule } from 'auth/auth.module';
import { ItemsController } from 'items/rest/controllers/items.controller';
import { ItemsUsecaseModule } from 'items/usecases/usecase.module';
import { WarehouseAccessGuard } from 'shared/guards/warehouse-access.guard';

// `AuthModule` supplies `SessionAuthGuard`'s dependencies; `WarehouseAccessGuard` is shared
// transport infrastructure from `shared/guards/` and is only registered here so Nest can
// construct it for this module's routes — registering a guard is not owning it
// (ADR 14-08-2026, CR-RG-06).
@Module({
  imports: [AuthModule, ItemsUsecaseModule],
  controllers: [ItemsController],
  providers: [WarehouseAccessGuard],
})
export class ItemsRestModule {}
