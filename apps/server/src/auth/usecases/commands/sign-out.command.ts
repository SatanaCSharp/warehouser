import { type AuthRuntime, authRuntime } from 'auth/utils/auth-runtime';
import { digestSessionSecret } from 'auth/utils/opaque-session-secrets';
import { SessionRepository } from 'shared/domain/repositories/session.repository';

export class SignOutCommand {
  constructor(
    private readonly sessions: SessionRepository,
    private readonly digestSecret: (
      secret: string,
    ) => Buffer = digestSessionSecret,
    private readonly runtime: AuthRuntime = authRuntime,
  ) {}

  async execute(secret?: string): Promise<void> {
    if (!secret) {
      return;
    }

    await this.sessions.revokeByDigest(
      this.digestSecret(secret),
      this.runtime.now(),
    );
  }
}
