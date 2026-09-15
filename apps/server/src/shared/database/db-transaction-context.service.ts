import { AsyncLocalStorage } from 'node:async_hooks';

import { Injectable } from '@nestjs/common';
import { isDefined } from '@warehouser/utils/predicates';
import { DataSource, EntityManager } from 'typeorm';

const transactionStorageByDataSource = new WeakMap<
  DataSource,
  AsyncLocalStorage<EntityManager>
>();

export const getEntityManager = (dataSource: DataSource): EntityManager =>
  transactionStorageByDataSource.get(dataSource)?.getStore() ??
  dataSource.manager;

@Injectable()
export class DbTransactionContext {
  private readonly storage = new AsyncLocalStorage<EntityManager>();

  constructor(private readonly dataSource: DataSource) {
    transactionStorageByDataSource.set(dataSource, this.storage);
  }

  run<T>(manager: EntityManager, callback: () => Promise<T>): Promise<T> {
    return this.storage.run(manager, callback);
  }

  getEntityManager(): EntityManager {
    return getEntityManager(this.dataSource);
  }

  hasActiveTransaction(): boolean {
    return isDefined(this.storage.getStore());
  }
}
