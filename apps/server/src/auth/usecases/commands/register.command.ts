import { assert } from '@warehouser/utils/asserts';
import { type AuthRuntime, authRuntime } from 'auth/domain/auth-runtime';
import { Account } from 'auth/domain/entities/account';
import { Session } from 'auth/domain/entities/session';
import { User } from 'auth/domain/entities/user';
import {
  AuthEmailAlreadyRegisteredError,
  AuthInvalidInputError,
} from 'auth/domain/errors/auth.errors';
import { isSupportedEmail } from 'auth/domain/predicates/is-supported-email';
import { isSupportedPassword } from 'auth/domain/predicates/is-supported-password';
import { hashPassword } from 'auth/domain/security/password';
import {
  type GeneratedSessionSecret,
  generateSessionSecret,
} from 'auth/domain/security/session-secret';
import { AuthRegistrationService } from 'auth/domain/services/auth-registration.service';
import { EmailAddress } from 'auth/domain/value-objects/email-address';
import { SessionId } from 'auth/domain/value-objects/identity-id';
import { Password } from 'auth/domain/value-objects/password';
import { SessionDigest } from 'auth/domain/value-objects/session-digest';
import { AuthenticationRepository } from 'shared/domain/repositories/authentication.repository';

export interface RegisterInput {
  readonly email: string;
  readonly password: string;
}

export interface RegisteredSession {
  readonly userId: string;
  readonly sessionSecret: string;
  readonly expiresAt: Date;
}

export class RegisterCommand {
  constructor(
    private readonly authentication: AuthenticationRepository,
    private readonly registrations: AuthRegistrationService,
    private readonly hash: typeof hashPassword = hashPassword,
    private readonly generateSecret: () => GeneratedSessionSecret = generateSessionSecret,
    private readonly runtime: AuthRuntime = authRuntime,
  ) {}

  async execute(input: RegisterInput): Promise<RegisteredSession> {
    const emailSupported = isSupportedEmail(input.email);
    const passwordSupported = isSupportedPassword(input.password);
    assert(
      emailSupported && passwordSupported,
      AuthInvalidInputError({
        ...(!emailSupported && { email: 'unsupported' }),
        ...(!passwordSupported && { password: 'unsupported' }),
      }),
    );
    const email = EmailAddress.create(input.email);
    const password = Password.create(input.password);

    assert(
      !(await this.authentication.findAccountByNormalizedEmail(email.value)),
      AuthEmailAlreadyRegisteredError(),
    );

    const credential = await this.hash(password.value);
    const account = Account.create({
      id: this.runtime.identityId(),
      email: email.value,
      credential,
    });
    const user = User.forAccount(account);
    const generated = this.generateSecret();
    const session = Session.establish({
      id: SessionId.create(this.runtime.sessionId()),
      accountId: account.id,
      digest: SessionDigest.create(generated.digest),
      establishedAt: this.runtime.now(),
    });

    await this.registrations.registerIdentity({ account, user, session });

    return {
      userId: user.id.value,
      sessionSecret: generated.secret,
      expiresAt: session.expiresAt,
    };
  }
}
