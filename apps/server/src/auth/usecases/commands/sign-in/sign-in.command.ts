import {
  AccountRepository,
  EmailAddress,
  Password,
  Session,
  SessionDigest,
  SessionId,
  SessionRepository,
} from 'auth/domain';
import {
  AuthInvalidCredentialsError,
  AuthInvalidInputError,
  AuthSessionUnavailableError,
} from 'auth/errors';
import { PasswordHasher } from 'auth/services/password-hasher';
import { AuthIdGenerator, Clock } from 'auth/services/runtime';
import { SessionSecrets } from 'auth/services/session-secrets';
import { RegisteredSession } from 'auth/usecases/commands/register';

export class SignInCommand {
  constructor(
    private readonly accounts: AccountRepository,
    private readonly passwordHasher: PasswordHasher,
    private readonly sessions: SessionRepository,
    private readonly sessionSecrets: SessionSecrets,
    private readonly clock: Clock,
    private readonly ids: AuthIdGenerator,
  ) {}

  async execute(input: {
    email: string;
    password: string;
  }): Promise<RegisteredSession> {
    let email: EmailAddress;
    let password: Password;
    try {
      email = EmailAddress.create(input.email);
      password = Password.create(input.password);
    } catch {
      throw new AuthInvalidInputError();
    }

    const account = await this.accounts.findByNormalizedEmail(email);
    if (!account) {
      await this.passwordHasher.dummyVerify(password.value);
      throw new AuthInvalidCredentialsError();
    }

    if (
      !(await this.passwordHasher.verify(password.value, account.credential))
    ) {
      throw new AuthInvalidCredentialsError();
    }

    const generated = this.sessionSecrets.generate();
    const session = Session.establish({
      id: SessionId.create(this.ids.sessionId()),
      accountId: account.id,
      digest: SessionDigest.create(generated.digest),
      establishedAt: this.clock.now(),
    });
    try {
      await this.sessions.create(session);
    } catch {
      throw new AuthSessionUnavailableError();
    }

    return {
      userId: account.userId.value,
      sessionSecret: generated.secret,
      expiresAt: session.expiresAt,
    };
  }
}
