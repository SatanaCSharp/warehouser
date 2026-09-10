import { Account } from 'auth/domain/entities/account';
import { AccountEntity } from 'shared/domain/entities/account.entity';

export const toAccount = (entity: AccountEntity): Account =>
  Account.create({
    id: entity.id,
    email: entity.normalizedEmail,
    credential: {
      hash: entity.passwordHash,
      algorithm: entity.passwordHashAlgorithm,
      parameters: entity.passwordHashParameters,
    },
  });

export const toAccountEntity = (
  account: Account,
  createdAt: Date,
): Partial<AccountEntity> => ({
  id: account.id.value,
  userId: account.userId.value,
  normalizedEmail: account.email.value,
  passwordHash: account.credential.hash,
  passwordHashAlgorithm: account.credential.algorithm,
  passwordHashParameters: account.credential.parameters,
  createdAt,
  updatedAt: createdAt,
});
