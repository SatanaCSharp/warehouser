import { DbTransactionService } from 'shared/database/db-transaction.service';
import { DbTransactionContext } from 'shared/database/db-transaction-context.service';
import type { DataSource, EntityManager, QueryRunner } from 'typeorm';
import { describe, expect, it, vi } from 'vitest';

const createQueryRunner = (manager: EntityManager): QueryRunner =>
  ({
    manager,
    connect: vi.fn().mockResolvedValue(undefined),
    startTransaction: vi.fn().mockResolvedValue(undefined),
    commitTransaction: vi.fn().mockResolvedValue(undefined),
    rollbackTransaction: vi.fn().mockResolvedValue(undefined),
    release: vi.fn().mockResolvedValue(undefined),
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

  // Propagation, which is the branch every nested `executeInTransaction` takes in production: a use
  // case that calls another one must not open a second transaction, or the inner work would commit
  // independently of the outer and a rollback would leave it behind. Joining means no query runner
  // is created at all — so the assertion is that the callback ran on the *ambient* manager and that
  // the data source was never asked for a runner.
  it('joins an active transaction instead of opening a second one', async () => {
    const ambientManager = {} as EntityManager;
    const createQueryRunnerSpy = vi.fn();
    const context = {
      hasActiveTransaction: () => true,
      getEntityManager: () => ambientManager,
      run: () => {
        throw new Error('a joined transaction must not open its own context');
      },
    } as unknown as DbTransactionContext;
    const service = new DbTransactionService(
      { createQueryRunner: createQueryRunnerSpy } as unknown as DataSource,
      context,
    );

    await expect(
      service.executeInTransaction({}, (activeManager) =>
        Promise.resolve(activeManager),
      ),
    ).resolves.toBe(ambientManager);
    expect(createQueryRunnerSpy).not.toHaveBeenCalled();
  });

  // `propagation: false` is how a caller opts out of joining — the one case that wants its own
  // transaction even inside another. Without it the branch above would swallow the request, and the
  // work would commit with the outer transaction rather than on its own terms.
  it('opens its own transaction when propagation is refused, even inside one', async () => {
    const manager = {} as EntityManager;
    const queryRunner = createQueryRunner(manager);
    const context = {
      hasActiveTransaction: () => true,
      getEntityManager: () => ({}) as EntityManager,
      run: <T>(_manager: EntityManager, callback: () => Promise<T>) =>
        callback(),
    } as DbTransactionContext;
    const service = new DbTransactionService(
      { createQueryRunner: () => queryRunner } as DataSource,
      context,
    );

    await expect(
      service.executeInTransaction(
        { propagation: false, isolationLevel: 'SERIALIZABLE' },
        (activeManager) => Promise.resolve(activeManager),
      ),
    ).resolves.toBe(manager);
    expect(queryRunner.startTransaction).toHaveBeenCalledWith('SERIALIZABLE');
    expect(queryRunner.commitTransaction).toHaveBeenCalled();
  });
});
