import { Module } from '@nestjs/common';
import { AccessController } from 'access/rest/controllers/access.controller';
import { AccessUsecaseModule } from 'access/usecases/usecase.module';
import { AuthModule } from 'auth/auth.module';
import { WarehouseAccessGuard } from 'shared/guards/warehouse-access.guard';

@Module({
  imports: [AuthModule, AccessUsecaseModule],
  controllers: [AccessController],
  providers: [WarehouseAccessGuard],
})
export class AccessRestModule {}
