import { SetMetadata } from '@nestjs/common';
import type { IsolationLevel } from 'typeorm/driver/types/IsolationLevel.js';

export const TRANSACTIONAL_KEY = Symbol('TRANSACTIONAL_METHOD');

export interface TransactionalMetadata {
  readonly propagation?: boolean;
  readonly isolationLevel?: IsolationLevel;
}

export const Transactional = (
  propagation?: boolean,
  isolationLevel?: IsolationLevel,
): MethodDecorator =>
  SetMetadata(TRANSACTIONAL_KEY, {
    propagation,
    isolationLevel,
  } satisfies TransactionalMetadata);
