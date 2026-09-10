import { Module } from '@nestjs/common';
import { DiscoveryModule } from '@nestjs/core';
import { DbTransactionService } from 'shared/database/db-transaction.service.js';
import { DbTransactionContext } from 'shared/database/db-transaction-context.service.js';
import { TransactionExecutor } from 'shared/database/transaction-executor.service.js';

@Module({
  imports: [DiscoveryModule],
  providers: [DbTransactionContext, DbTransactionService, TransactionExecutor],
  exports: [DbTransactionContext, DbTransactionService],
})
export class TransactionModule {}
