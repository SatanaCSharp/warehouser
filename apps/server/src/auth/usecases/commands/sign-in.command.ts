import { assert } from '@warehouser/utils/asserts';
import { type AuthRuntime, authRuntime } from 'auth/domain/auth-runtime';
import { Session } from 'auth/domain/entities/session';
import {
  AuthInvalidCredentialsError,
  AuthInvalidInputError,
} from 'auth/domain/errors/auth.errors';
import { toAccount } from 'auth/domain/mappers/account.mapper';
import { toSessionEntity } from 'auth/domain/mappers/session.mapper';
import {
  type GeneratedSessionSecret,
  generateSessionSecret,
} from 'auth/domain/security/session-secret';
import { SessionId } from 'auth/domain/value-objects/identity-id';
import { SessionDigest } from 'auth/domain/value-objects/session-digest';
import { AuthenticationRepository } from 'shared/domain/repositories/authentication.repository';
import { EmailAddress } from 'shared/domain/security/email-address';
import { isSupportedEmail } from 'shared/domain/security/is-supported-email';
import { isSupportedPassword } from 'shared/domain/security/is-supported-password';
import { Password } from 'shared/domain/security/password';
import {
  dummyVerifyPassword,
  verifyPassword,
} from 'shared/domain/security/password-hashing';

export interface SignedInSession {
  readonly userId: string;
  readonly sessionSecret: string;
  readonly expiresAt: Date;
}

export class SignInCommand {
  constructor(
    private readonly authentication: AuthenticationRepository,
    private readonly verify: typeof verifyPassword = verifyPassword,
    private readonly dummyVerify: typeof dummyVerifyPassword = dummyVerifyPassword,
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

    const accountEntity =
      await this.authentication.findAccountByNormalizedEmail(email.value);
    if (!accountEntity) {
      await this.dummyVerify(password.value);
    }
    assert(accountEntity !== null, AuthInvalidCredentialsError());
    const account = toAccount(accountEntity);

    assert(
      await this.verify(password.value, account.credential),
      AuthInvalidCredentialsError(),
    );

    const generated = this.generateSecret();
    const session = Session.establish({
      id: SessionId.create(this.runtime.sessionId()),
      accountId: account.id,
      digest: SessionDigest.create(generated.digest),
      establishedAt: this.runtime.now(),
    });
    await this.authentication.createSession(toSessionEntity(session));

    return {
      userId: account.userId.value,
      sessionSecret: generated.secret,
      expiresAt: session.expiresAt,
    };
  }
}
