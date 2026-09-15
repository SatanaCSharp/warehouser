import { isDefined } from '@warehouser/utils/predicates';
import type { AuthRuntime } from 'auth/domain/auth-runtime';
import { authRuntime } from 'auth/domain/auth-runtime';
import { toAuthenticatedCurrentUser } from 'auth/domain/mappers/authenticated-current-user.mapper';
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
    if (!isDefined(secret)) {
      return null;
    }

    const sessionEntity = await this.authentication.findValidSessionByDigest(
      this.digestSecret(secret),
      this.runtime.now(),
    );
    if (!isDefined(sessionEntity)) {
      return null;
    }
    const session = toSession(sessionEntity);

    return toAuthenticatedCurrentUser(UserId.create(session.accountId.value));
  }
}
