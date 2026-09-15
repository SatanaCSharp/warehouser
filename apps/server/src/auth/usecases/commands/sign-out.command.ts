import { isDefined } from '@warehouser/utils/predicates';
import { digestSessionSecret } from 'auth/domain/security/session-secret';
import { AuthenticationRepository } from 'shared/domain/repositories/authentication.repository';

export class SignOutCommand {
  constructor(private readonly authentication: AuthenticationRepository) {}

  async execute(secret?: string): Promise<void> {
    if (!isDefined(secret)) {
      return;
    }

    await this.authentication.revokeSessionByDigest(
      digestSessionSecret(secret),
      new Date(),
    );
  }
}
