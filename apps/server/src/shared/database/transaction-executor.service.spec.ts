import 'reflect-metadata';

import { DiscoveryService, MetadataScanner, Reflector } from '@nestjs/core';
import { DbTransactionService } from 'shared/database/db-transaction.service';
import { TransactionExecutor } from 'shared/database/transaction-executor.service';
import { Transactional } from 'shared/decorators/transactional.decorator';

describe(TransactionExecutor.name, () => {
  it('wraps decorated provider methods in a transaction', async () => {
    class ExampleService {
      readonly prefix = 'result';

      @Transactional(false, 'SERIALIZABLE')
      async execute(value: string): Promise<string> {
        return Promise.resolve(`${this.prefix}:${value}`);
      }
    }

    const service = new ExampleService();
    const executeInTransaction = jest.fn(
      async (
        _options: unknown,
        callback: () => Promise<unknown>,
      ): Promise<unknown> => callback(),
    );
    const executor = new TransactionExecutor(
      {
        getProviders: () => [{ instance: service }],
      } as unknown as DiscoveryService,
      new MetadataScanner(),
      new Reflector(),
      {
        executeInTransaction,
      } as unknown as DbTransactionService,
    );

    executor.onApplicationBootstrap();

    await expect(service.execute('value')).resolves.toBe('result:value');
    expect(executeInTransaction).toHaveBeenCalledWith(
      {
        propagation: false,
        isolationLevel: 'SERIALIZABLE',
      },
      expect.any(Function),
    );
  });

  it('preserves metadata when replacing a decorated method', () => {
    const additionalMetadataKey = Symbol('additional');

    class ExampleService {
      @Transactional()
      async execute(): Promise<void> {}
    }

    Reflect.defineMetadata(
      additionalMetadataKey,
      'preserved',
      ExampleService.prototype.execute,
    );
    const service = new ExampleService();
    const executor = new TransactionExecutor(
      {
        getProviders: () => [{ instance: service }],
      } as unknown as DiscoveryService,
      new MetadataScanner(),
      new Reflector(),
      {
        executeInTransaction: jest.fn(),
      } as unknown as DbTransactionService,
    );

    executor.onApplicationBootstrap();

    expect(
      Reflect.getMetadata(additionalMetadataKey, service.execute) as unknown,
    ).toBe('preserved');
  });
});
