import { Module } from '@nestjs/common';
import { AccessMutationController } from 'access/rest/access-mutation.controller';
import { AccessReadController } from 'access/rest/access-read.controller';
import { AccessUsecaseModule } from 'access/usecases/usecase.module';
import { AuthModule } from 'auth/auth.module';
import { WarehouseAccessGuard } from 'shared/guards/warehouse-access.guard';

@Module({
  imports: [AuthModule, AccessUsecaseModule],
  controllers: [AccessReadController, AccessMutationController],
  providers: [WarehouseAccessGuard],
})
export class AccessModule {}
