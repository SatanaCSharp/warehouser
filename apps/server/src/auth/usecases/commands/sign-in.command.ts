import { assert } from '@warehouser/utils/asserts';
import { Session } from 'auth/domain/entities/session';
import { isSupportedEmail } from 'auth/domain/predicates/is-supported-email';
import { isSupportedPassword } from 'auth/domain/predicates/is-supported-password';
import { EmailAddress } from 'auth/domain/value-objects/email-address';
import { SessionId } from 'auth/domain/value-objects/identity-id';
import { Password } from 'auth/domain/value-objects/password';
import { SessionDigest } from 'auth/domain/value-objects/session-digest';
import {
  AuthInvalidCredentialsError,
  AuthInvalidInputError,
} from 'auth/errors/auth.errors';
import { toAccount } from 'auth/mappers/account.mapper';
import { toSessionEntity } from 'auth/mappers/session.mapper';
import { type AuthRuntime, authRuntime } from 'auth/utils/auth-runtime';
import {
  createNodeScryptPasswordHasher,
  type PasswordHasher,
} from 'auth/utils/node-scrypt-password-hasher';
import {
  type GeneratedSessionSecret,
  generateSessionSecret,
} from 'auth/utils/opaque-session-secrets';
import { AccountRepository } from 'shared/domain/repositories/account.repository';
import { SessionRepository } from 'shared/domain/repositories/session.repository';

export interface SignedInSession {
  readonly userId: string;
  readonly sessionSecret: string;
  readonly expiresAt: Date;
}

export class SignInCommand {
  constructor(
    private readonly accounts: AccountRepository,
    private readonly sessions: SessionRepository,
    private readonly passwordHasher: PasswordHasher = createNodeScryptPasswordHasher(),
    private readonly generateSecret: () => GeneratedSessionSecret = generateSessionSecret,
    private readonly runtime: AuthRuntime = authRuntime,
  ) {}

  async execute(input: {
    email: string;
    password: string;
  }): Promise<SignedInSession> {
    assert(
      isSupportedEmail(input.email) && isSupportedPassword(input.password),
      AuthInvalidInputError(),
    );
    const email = EmailAddress.create(input.email);
    const password = Password.create(input.password);

    const accountEntity = await this.accounts.findByNormalizedEmail(
      email.value,
    );
    if (!accountEntity) {
      await this.passwordHasher.dummyVerify(password.value);
    }
    assert(accountEntity !== null, AuthInvalidCredentialsError());
    const account = toAccount(accountEntity);

    assert(
      await this.passwordHasher.verify(password.value, account.credential),
      AuthInvalidCredentialsError(),
    );

    const generated = this.generateSecret();
    const session = Session.establish({
      id: SessionId.create(this.runtime.sessionId()),
      accountId: account.id,
      digest: SessionDigest.create(generated.digest),
      establishedAt: this.runtime.now(),
    });
    await this.sessions.createSession(toSessionEntity(session));

    return {
      userId: account.userId.value,
      sessionSecret: generated.secret,
      expiresAt: session.expiresAt,
    };
  }
}
