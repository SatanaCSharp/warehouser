import { Global, Module } from '@nestjs/common';
import { DiscoveryModule } from '@nestjs/core';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DbTransactionService } from 'shared/database/db-transaction.service';
import { DbTransactionContext } from 'shared/database/db-transaction-context.service';
import { TransactionExecutor } from 'shared/database/transaction-executor.service';
import { AccountEntity } from 'shared/domain/entities/account.entity';
import { SessionEntity } from 'shared/domain/entities/session.entity';
import { UserEntity } from 'shared/domain/entities/user.entity';
import { AccountRepository } from 'shared/domain/repositories/account.repository';
import { SessionRepository } from 'shared/domain/repositories/session.repository';
import { UserRepository } from 'shared/domain/repositories/user.repository';

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
    AccountRepository,
    UserRepository,
    SessionRepository,
  ],
  exports: [
    DbTransactionContext,
    DbTransactionService,
    AccountRepository,
    SessionRepository,
    UserRepository,
  ],
})
export class TransactionModule {}
