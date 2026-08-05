import { type AuthRuntime, authRuntime } from 'auth/domain/auth-runtime';
import { toAuthenticatedCurrentUser } from 'auth/domain/authenticated-current-user';
import { toSession } from 'auth/domain/mappers/session.mapper';
import { digestSessionSecret } from 'auth/domain/security/session-secret';
import { UserId } from 'auth/domain/value-objects/identity-id';
import { AuthenticationRepository } from 'shared/domain/repositories/authentication.repository';

export class CurrentSessionQuery {
  constructor(
    private readonly authentication: AuthenticationRepository,
    private readonly digestSecret: (
      secret: string,
    ) => Buffer = digestSessionSecret,
    private readonly runtime: AuthRuntime = authRuntime,
  ) {}

  async execute(secret?: string): Promise<{ userId: string } | null> {
    if (!secret) {
      return null;
    }

    const sessionEntity = await this.authentication.findValidSessionByDigest(
      this.digestSecret(secret),
      this.runtime.now(),
    );
    if (!sessionEntity) {
      return null;
    }
    const session = toSession(sessionEntity);

    return toAuthenticatedCurrentUser(UserId.create(session.accountId.value));
  }
}
