import { EmailAddress } from 'auth/domain/value-objects/email-address';
import { AccountId, UserId } from 'auth/domain/value-objects/identity-id';

export interface PasswordCredential {
  readonly algorithm: string;
  readonly hash: string;
  readonly parameters: Readonly<Record<string, number | string>>;
}

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
