import { AccountId, UserId } from 'auth/domain/value-objects/identity-id';
import { EmailAddress } from 'shared/domain/security/email-address';
import { PasswordCredential } from 'shared/domain/security/password-hashing';

export interface CreateAccount {
  readonly id: string;
  readonly email: string;
  readonly credential: PasswordCredential;
}

export class Account {
  private constructor(
    readonly id: AccountId,
    readonly userId: UserId,
    readonly email: EmailAddress,
    readonly credential: PasswordCredential,
  ) {}

  static create(input: CreateAccount): Account {
    return new Account(
      AccountId.create(input.id),
      UserId.create(input.id),
      EmailAddress.create(input.email),
      input.credential,
    );
  }
}
