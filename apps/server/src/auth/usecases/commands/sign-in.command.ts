import { assert } from '@warehouser/utils/asserts';
import { type AuthRuntime, authRuntime } from 'auth/domain/auth-runtime';
import { Session } from 'auth/domain/entities/session';
import {
  AuthInvalidCredentialsError,
  AuthInvalidInputError,
} from 'auth/domain/errors/auth.errors';
import { toAccount } from 'auth/domain/mappers/account.mapper';
import { toSessionEntity } from 'auth/domain/mappers/session.mapper';
import { isSupportedEmail } from 'auth/domain/predicates/is-supported-email';
import { isSupportedPassword } from 'auth/domain/predicates/is-supported-password';
import {
  dummyVerifyPassword,
  verifyPassword,
} from 'auth/domain/security/password';
import {
  type GeneratedSessionSecret,
  generateSessionSecret,
} from 'auth/domain/security/session-secret';
import { EmailAddress } from 'auth/domain/value-objects/email-address';
import { SessionId } from 'auth/domain/value-objects/identity-id';
import { Password } from 'auth/domain/value-objects/password';
import { SessionDigest } from 'auth/domain/value-objects/session-digest';
import { AuthenticationRepository } from 'shared/domain/repositories/authentication.repository';

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
