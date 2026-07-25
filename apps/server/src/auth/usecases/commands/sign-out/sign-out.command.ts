import { SessionDigest, SessionRepository } from 'auth/domain';
import { AuthSignOutUnavailableError } from 'auth/errors';
import { Clock } from 'auth/services/runtime';
import { SessionSecrets } from 'auth/services/session-secrets';

export class SignOutCommand {
  constructor(
    private readonly sessions: SessionRepository,
    private readonly sessionSecrets: SessionSecrets,
    private readonly clock: Clock,
  ) {}

  async execute(secret?: string): Promise<void> {
    if (!secret) {
      return;
    }

    try {
      await this.sessions.revokeByDigest(
        SessionDigest.create(this.sessionSecrets.digest(secret)),
        this.clock.now(),
      );
    } catch {
      throw new AuthSignOutUnavailableError();
    }
  }
}
