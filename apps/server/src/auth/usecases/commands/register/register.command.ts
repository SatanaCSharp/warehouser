import {
  Account,
  AccountRepository,
  AuthRegistrationRepository,
  EmailAddress,
  Password,
  Session,
  SessionDigest,
  SessionId,
  User,
} from 'auth/domain';
import {
  AuthEmailAlreadyRegisteredError,
  AuthInvalidInputError,
} from 'auth/errors';
import { PasswordHasher } from 'auth/services/password-hasher';
import { AuthIdGenerator, Clock } from 'auth/services/runtime';
import { SessionSecrets } from 'auth/services/session-secrets';

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
    private readonly accounts: AccountRepository,
    private readonly registrations: AuthRegistrationRepository,
    private readonly passwordHasher: PasswordHasher,
    private readonly sessionSecrets: SessionSecrets,
    private readonly clock: Clock,
    private readonly ids: AuthIdGenerator,
  ) {}

  async execute(input: RegisterInput): Promise<RegisteredSession> {
    let email: EmailAddress;
    let password: Password;
    try {
      email = EmailAddress.create(input.email);
      password = Password.create(input.password);
    } catch {
      throw new AuthInvalidInputError();
    }

    if (await this.accounts.findByNormalizedEmail(email)) {
      throw new AuthEmailAlreadyRegisteredError();
    }

    const credential = await this.passwordHasher.hash(password.value);
    const account = Account.create({
      id: this.ids.identityId(),
      email: email.value,
      credential,
    });
    const user = User.forAccount(account);
    const generated = this.sessionSecrets.generate();
    const session = Session.establish({
      id: SessionId.create(this.ids.sessionId()),
      accountId: account.id,
      digest: SessionDigest.create(generated.digest),
      establishedAt: this.clock.now(),
    });

    await this.registrations.registerIdentity({ account, user, session });

    return {
      userId: user.id.value,
      sessionSecret: generated.secret,
      expiresAt: session.expiresAt,
    };
  }
}
