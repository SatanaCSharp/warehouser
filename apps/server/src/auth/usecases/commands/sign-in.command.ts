import { randomUUID } from 'node:crypto';

import { assert, assertDefined } from '@warehouser/utils/asserts';
import { isDefined } from '@warehouser/utils/predicates';
import { Session } from 'auth/domain/entities/session';
import {
  AuthInvalidCredentialsError,
  AuthInvalidInputError,
} from 'auth/domain/errors/auth.errors';
import { toAccount } from 'auth/domain/mappers/account.mapper';
import { toSessionEntity } from 'auth/domain/mappers/session.mapper';
import { generateSessionSecret } from 'auth/domain/security/session-secret';
import { SessionId } from 'auth/domain/value-objects/identity-id';
import { SessionDigest } from 'auth/domain/value-objects/session-digest';
import { AuthenticationRepository } from 'shared/domain/repositories/authentication.repository';
import { EmailAddress } from 'shared/domain/security/email-address';
import { Password } from 'shared/domain/security/password';
import {
  dummyVerifyPassword,
  verifyPassword,
} from 'shared/domain/security/password-hashing';
import {
  isSupportedEmail,
  isSupportedPassword,
  matchesStoredCredential,
} from 'shared/predicates/credential.predicates';

export interface SignedInSession {
  readonly userId: string;
  readonly sessionSecret: string;
  readonly expiresAt: Date;
}

export class SignInCommand {
  constructor(private readonly authentication: AuthenticationRepository) {}

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
    if (!isDefined(accountEntity)) {
      await dummyVerifyPassword(password.value);
    }
    assertDefined(accountEntity, AuthInvalidCredentialsError());
    const account = toAccount(accountEntity);

    assert(
      matchesStoredCredential(
        await verifyPassword(password.value, account.credential),
      ),
      AuthInvalidCredentialsError(),
    );

    const generated = generateSessionSecret();
    const session = Session.establish({
      id: SessionId.create(randomUUID()),
      accountId: account.id,
      digest: SessionDigest.create(generated.digest),
      establishedAt: new Date(),
    });
    await this.authentication.createSession(toSessionEntity(session));

    return {
      userId: account.userId.value,
      sessionSecret: generated.secret,
      expiresAt: session.expiresAt,
    };
  }
}
