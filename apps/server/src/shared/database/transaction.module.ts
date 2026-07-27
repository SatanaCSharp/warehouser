import { Global, Module } from '@nestjs/common';
import { DiscoveryModule } from '@nestjs/core';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DbTransactionService } from 'shared/database/db-transaction.service';
import { DbTransactionContext } from 'shared/database/db-transaction-context.service';
import { TransactionExecutor } from 'shared/database/transaction-executor.service';
import { AccountEntity } from 'shared/domain/entities/account.entity';
import { SessionEntity } from 'shared/domain/entities/session.entity';
import { UserEntity } from 'shared/domain/entities/user.entity';
import { AuthenticationRepository } from 'shared/domain/repositories/authentication.repository';

@Global()
@Module({
  imports: [
    DiscoveryModule,
    TypeOrmModule.forFeature([AccountEntity, UserEntity, SessionEntity]),
  ],
  providers: [
    DbTransactionContext,
    DbTransactionService,
    TransactionExecutor,
    AuthenticationRepository,
  ],
  exports: [
    DbTransactionContext,
    DbTransactionService,
    AuthenticationRepository,
  ],
})
export class TransactionModule {}
