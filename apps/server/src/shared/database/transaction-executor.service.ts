import { Injectable, OnApplicationBootstrap } from '@nestjs/common';
import { DiscoveryService, MetadataScanner, Reflector } from '@nestjs/core';
import { DbTransactionService } from 'shared/database/db-transaction.service';
import type { TransactionalMetadata } from 'shared/decorators/transactional.decorator';
import { TRANSACTIONAL_KEY } from 'shared/decorators/transactional.decorator';

type ProviderInstance = Record<string, unknown>;
type ProviderMethod = (...arguments_: unknown[]) => unknown;

@Injectable()
export class TransactionExecutor implements OnApplicationBootstrap {
  constructor(
    private readonly discoveryService: DiscoveryService,
    private readonly metadataScanner: MetadataScanner,
    private readonly reflector: Reflector,
    private readonly transactionService: DbTransactionService,
  ) {}

  onApplicationBootstrap(): void {
    for (const provider of this.discoveryService.getProviders()) {
      this.wrapTransactionalMethods(provider.instance);
    }
  }

  private wrapTransactionalMethods(candidate: unknown): void {
    if (!this.isProviderInstance(candidate)) {
      return;
    }

    const prototype = Object.getPrototypeOf(candidate) as object | null;
    if (!prototype) {
      return;
    }

    // `getAllMethodNames` replaces the deprecated `scanFromPrototype`. It walks the same prototype
    // chain with the same filtering (own properties, no accessors, no constructor, functions only)
    // and stops at `Object.prototype`; it returns the names instead of mapping a callback over them.
    for (const methodName of this.metadataScanner.getAllMethodNames(
      prototype,
    )) {
      this.wrapTransactionalMethod(candidate, methodName);
    }
  }

  private wrapTransactionalMethod(
    instance: ProviderInstance,
    methodName: string,
  ): void {
    const candidate = instance[methodName];
    if (typeof candidate !== 'function') {
      return;
    }
    const originalMethod = candidate as ProviderMethod;

    // `Reflector.get` is typed to return `TResult`, but returns `undefined` for a method that
    // carries no `@Transactional` metadata — which is most of them. The `| undefined` restores
    // that case to the type so the early return below stays reachable.
    const metadata = this.reflector.get<TransactionalMetadata | undefined>(
      TRANSACTIONAL_KEY,
      originalMethod,
    );
    if (!metadata) {
      return;
    }

    const wrappedMethod = (...arguments_: unknown[]): Promise<unknown> =>
      this.transactionService.executeInTransaction(
        {
          propagation: metadata.propagation ?? true,
          isolationLevel: metadata.isolationLevel ?? 'READ COMMITTED',
        },
        () => Promise.resolve(originalMethod.apply(instance, arguments_)),
      );

    this.copyMetadata(originalMethod, wrappedMethod);
    Reflect.set(instance, methodName, wrappedMethod);
  }

  private copyMetadata(source: ProviderMethod, target: ProviderMethod): void {
    for (const key of Reflect.getMetadataKeys(source) as unknown[]) {
      Reflect.defineMetadata(key, Reflect.getMetadata(key, source), target);
    }
  }

  private isProviderInstance(value: unknown): value is ProviderInstance {
    return typeof value === 'object' && value !== null;
  }
}
