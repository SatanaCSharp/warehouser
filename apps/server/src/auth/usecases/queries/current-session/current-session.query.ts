import {
  SessionDigest,
  SessionRepository,
  toAuthenticatedPrincipal,
  UserId,
} from 'auth/domain';
import { Clock } from 'auth/services/runtime';
import { SessionSecrets } from 'auth/services/session-secrets';

export class CurrentSessionQuery {
  constructor(
    private readonly sessions: SessionRepository,
    private readonly sessionSecrets: SessionSecrets,
    private readonly clock: Clock,
  ) {}

  async execute(secret?: string): Promise<{ userId: string } | null> {
    if (!secret) {
      return null;
    }

    const session = await this.sessions.findValidByDigest(
      SessionDigest.create(this.sessionSecrets.digest(secret)),
      this.clock.now(),
    );
    if (!session) {
      return null;
    }

    return toAuthenticatedPrincipal(UserId.create(session.accountId.value));
  }
}
