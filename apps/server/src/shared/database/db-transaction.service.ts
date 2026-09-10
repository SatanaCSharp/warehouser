import { Injectable } from '@nestjs/common';
import { DbTransactionContext } from 'shared/database/db-transaction-context.service';
import { DataSource, EntityManager } from 'typeorm';
import type { IsolationLevel } from 'typeorm/driver/types/IsolationLevel.js';

export interface TransactionOptions {
  readonly propagation?: boolean;
  readonly isolationLevel?: IsolationLevel;
}

@Injectable()
export class DbTransactionService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly context: DbTransactionContext,
  ) {}

  async executeInTransaction<T>(
    options: TransactionOptions,
    callback: (manager: EntityManager) => Promise<T>,
  ): Promise<T> {
    if (options.propagation !== false && this.context.hasActiveTransaction()) {
      return callback(this.context.getEntityManager());
    }

    const isolationLevel = options.isolationLevel ?? 'READ COMMITTED';
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction(isolationLevel);

    try {
      const result = await this.context.run(queryRunner.manager, () =>
        callback(queryRunner.manager),
      );
      await queryRunner.commitTransaction();
      return result;
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }
}
