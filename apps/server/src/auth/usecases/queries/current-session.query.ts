import { toAuthenticatedPrincipal } from 'auth/domain/authenticated-principal';
import { UserId } from 'auth/domain/value-objects/identity-id';
import { toSession } from 'auth/mappers/session.mapper';
import { type AuthRuntime, authRuntime } from 'auth/utils/auth-runtime';
import { digestSessionSecret } from 'auth/utils/opaque-session-secrets';
import { SessionRepository } from 'shared/domain/repositories/session.repository';

export class CurrentSessionQuery {
  constructor(
    private readonly sessions: SessionRepository,
    private readonly digestSecret: (
      secret: string,
    ) => Buffer = digestSessionSecret,
    private readonly runtime: AuthRuntime = authRuntime,
  ) {}

  async execute(secret?: string): Promise<{ userId: string } | null> {
    if (!secret) {
      return null;
    }

    const sessionEntity = await this.sessions.findValidByDigest(
      this.digestSecret(secret),
      this.runtime.now(),
    );
    if (!sessionEntity) {
      return null;
    }
    const session = toSession(sessionEntity);

    return toAuthenticatedPrincipal(UserId.create(session.accountId.value));
  }
}
