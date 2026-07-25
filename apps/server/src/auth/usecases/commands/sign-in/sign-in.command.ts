import { assert } from '@warehouser/utils/asserts';
import {
  AccountRepository,
  EmailAddress,
  Password,
  Session,
  SessionDigest,
  SessionId,
  SessionRepository,
} from 'auth/domain';
import { isSupportedEmail } from 'auth/domain/predicates/is-supported-email';
import { isSupportedPassword } from 'auth/domain/predicates/is-supported-password';
import {
  AuthInvalidCredentialsError,
  AuthInvalidInputError,
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
    assert(
      isSupportedEmail(input.email) && isSupportedPassword(input.password),
      AuthInvalidInputError(),
    );
    const email = EmailAddress.create(input.email);
    const password = Password.create(input.password);

    const account = await this.accounts.findByNormalizedEmail(email);
    if (!account) {
      await this.passwordHasher.dummyVerify(password.value);
    }
    assert(account !== null, AuthInvalidCredentialsError());

    assert(
      await this.passwordHasher.verify(password.value, account.credential),
      AuthInvalidCredentialsError(),
    );

    const generated = this.sessionSecrets.generate();
    const session = Session.establish({
      id: SessionId.create(this.ids.sessionId()),
      accountId: account.id,
      digest: SessionDigest.create(generated.digest),
      establishedAt: this.clock.now(),
    });
    await this.sessions.create(session);

    return {
      userId: account.userId.value,
      sessionSecret: generated.secret,
      expiresAt: session.expiresAt,
    };
  }
}
