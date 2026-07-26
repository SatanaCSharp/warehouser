import { DbTransactionService } from 'shared/database/db-transaction.service';
import { DbTransactionContext } from 'shared/database/db-transaction-context.service';
import type { DataSource, EntityManager, QueryRunner } from 'typeorm';

const createQueryRunner = (manager: EntityManager): QueryRunner =>
  ({
    manager,
    connect: jest.fn().mockResolvedValue(undefined),
    startTransaction: jest.fn().mockResolvedValue(undefined),
    commitTransaction: jest.fn().mockResolvedValue(undefined),
    rollbackTransaction: jest.fn().mockResolvedValue(undefined),
    release: jest.fn().mockResolvedValue(undefined),
  }) as unknown as QueryRunner;

describe(DbTransactionService.name, () => {
  it('commits successful work and releases the query runner', async () => {
    const manager = {} as EntityManager;
    const queryRunner = createQueryRunner(manager);
    const context = {
      hasActiveTransaction: () => false,
      run: <T>(_manager: EntityManager, callback: () => Promise<T>) =>
        callback(),
    } as DbTransactionContext;
    const service = new DbTransactionService(
      {
        createQueryRunner: () => queryRunner,
      } as DataSource,
      context,
    );

    await expect(
      service.executeInTransaction({}, (activeManager) =>
        Promise.resolve(activeManager),
      ),
    ).resolves.toBe(manager);
    expect(queryRunner.startTransaction).toHaveBeenCalledWith('READ COMMITTED');
    expect(queryRunner.commitTransaction).toHaveBeenCalled();
    expect(queryRunner.rollbackTransaction).not.toHaveBeenCalled();
    expect(queryRunner.release).toHaveBeenCalled();
  });

  it('rolls back failed work and releases the query runner', async () => {
    const failure = new Error('transaction failed');
    const queryRunner = createQueryRunner({} as EntityManager);
    const context = {
      hasActiveTransaction: () => false,
      run: <T>(_manager: EntityManager, callback: () => Promise<T>) =>
        callback(),
    } as DbTransactionContext;
    const service = new DbTransactionService(
      {
        createQueryRunner: () => queryRunner,
      } as DataSource,
      context,
    );

    await expect(
      service.executeInTransaction({}, () => Promise.reject(failure)),
    ).rejects.toBe(failure);
    expect(queryRunner.rollbackTransaction).toHaveBeenCalled();
    expect(queryRunner.commitTransaction).not.toHaveBeenCalled();
    expect(queryRunner.release).toHaveBeenCalled();
  });
});
