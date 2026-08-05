import { Module } from '@nestjs/common';
import { DiscoveryModule } from '@nestjs/core';
import { DbTransactionService } from 'shared/database/db-transaction.service';
import { DbTransactionContext } from 'shared/database/db-transaction-context.service';
import { TransactionExecutor } from 'shared/database/transaction-executor.service';

@Module({
  imports: [DiscoveryModule],
  providers: [DbTransactionContext, DbTransactionService, TransactionExecutor],
  exports: [DbTransactionContext, DbTransactionService],
})
export class TransactionModule {}
