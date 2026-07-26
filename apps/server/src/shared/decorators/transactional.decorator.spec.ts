import 'reflect-metadata';

import {
  Transactional,
  TRANSACTIONAL_KEY,
  type TransactionalMetadata,
} from 'shared/decorators/transactional.decorator';
import type { IsolationLevel } from 'typeorm/driver/types/IsolationLevel.js';

const getTransactionalMetadata = (
  target: object,
  methodName: string,
): TransactionalMetadata | undefined => {
  const method = Object.getOwnPropertyDescriptor(target, methodName)?.value;

  return Reflect.getMetadata(TRANSACTIONAL_KEY, method as object) as
    TransactionalMetadata | undefined;
};

describe('@Transactional', () => {
  it('marks a method for transaction execution with default options', () => {
    class ExampleService {
      @Transactional()
      async execute(): Promise<void> {}
    }

    expect(
      getTransactionalMetadata(ExampleService.prototype, 'execute'),
    ).toEqual({
      propagation: undefined,
      isolationLevel: undefined,
    });
  });

  it('records propagation and isolation-level overrides', () => {
    const isolationLevel: IsolationLevel = 'SERIALIZABLE';

    class ExampleService {
      @Transactional(false, isolationLevel)
      async execute(): Promise<void> {}
    }

    expect(
      getTransactionalMetadata(ExampleService.prototype, 'execute'),
    ).toEqual({
      propagation: false,
      isolationLevel,
    });
  });
});
