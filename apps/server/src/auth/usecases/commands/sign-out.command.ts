import { type AuthRuntime, authRuntime } from 'auth/domain/auth-runtime';
import { digestSessionSecret } from 'auth/domain/security/session-secret';
import { AuthenticationRepository } from 'shared/domain/repositories/authentication.repository';

export class SignOutCommand {
  constructor(
    private readonly authentication: AuthenticationRepository,
    private readonly digestSecret: (
      secret: string,
    ) => Buffer = digestSessionSecret,
    private readonly runtime: AuthRuntime = authRuntime,
  ) {}

  async execute(secret?: string): Promise<void> {
    if (!secret) {
      return;
    }

    await this.authentication.revokeSessionByDigest(
      this.digestSecret(secret),
      this.runtime.now(),
    );
  }
}
