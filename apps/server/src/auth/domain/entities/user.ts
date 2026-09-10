import { Account } from 'auth/domain/entities/account';
import { AccountId, UserId } from 'auth/domain/value-objects/identity-id';

export class User {
  private constructor(
    readonly id: UserId,
    readonly accountId: AccountId,
  ) {}

  static forAccount(account: Account): User {
    return new User(
      UserId.create(account.id.value),
      AccountId.create(account.id.value),
    );
  }
}
