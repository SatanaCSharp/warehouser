import { randomUUID } from 'node:crypto';

export interface AuthRuntime {
  readonly now: () => Date;
  readonly identityId: () => string;
  readonly sessionId: () => string;
}

export const authRuntime: AuthRuntime = {
  now: () => new Date(),
  identityId: randomUUID,
  sessionId: randomUUID,
};
