import { randomBytes, randomUUID } from 'node:crypto';

import type { AccountEntity } from 'shared/domain/entities/account.entity';
import type { SessionEntity } from 'shared/domain/entities/session.entity';
import type { UserEntity } from 'shared/domain/entities/user.entity';
import type { WarehouseMembershipEntity } from 'shared/domain/entities/warehouse-membership.entity';
import type { DeepPartial } from 'typeorm';

/**
 * Builds a valid `DeepPartial<AccountEntity>` for tests: a synthetic
 * `*.test` email, a scrypt-shaped (but not cryptographically real)
 * credential, and the `id === userId` identity-pairing invariant enforced by
 * `chk_accounts_user_identity_pair`.
 */
export const accountEntityFactory = (
  overrides: DeepPartial<AccountEntity> = {},
): DeepPartial<AccountEntity> => {
  const id = overrides.id ?? randomUUID();
  const now = new Date();

  return {
    normalizedEmail: `member.${randomUUID()}@example.test`,
    passwordHash: randomUUID().replace(/-/gu, ''),
    passwordHashAlgorithm: 'scrypt',
    passwordHashParameters: {
      cost: 131_072,
      blockSize: 8,
      parallelization: 1,
      keyLength: 32,
      maxMemory: 256 * 1024 * 1024,
      salt: randomUUID(),
    },
    createdAt: now,
    updatedAt: now,
    ...overrides,
    // Identity-pairing invariant (`chk_accounts_user_identity_pair`) always
    // holds — a caller may pin a specific identity via `overrides.id`, but
    // `userId` follows `id` and is never independently overridable.
    id,
    userId: id,
  };
};

/**
 * Builds a valid `DeepPartial<UserEntity>` deriving its identity from a
 * given `AccountEntity`, satisfying `chk_users_account_identity_pair`
 * (`UserEntity.id === UserEntity.accountId === AccountEntity.id`).
 */
export const userEntityFactory = (
  account: DeepPartial<AccountEntity>,
  overrides: DeepPartial<UserEntity> = {},
): DeepPartial<UserEntity> => {
  const now = new Date();

  return {
    createdAt: now,
    updatedAt: now,
    ...overrides,
    // Identity-pairing invariant (`chk_users_account_identity_pair`) is not
    // overridable: id === accountId === account.id always.
    id: account.id,
    accountId: account.id,
  };
};

/**
 * Builds a valid, `custom`-kind `DeepPartial<WarehouseMembershipEntity>`.
 * `roleKind` is always forced to `'custom'` (AC-20): a newly created member
 * is never granted the reserved `warehouse_manager` kind, even under an
 * explicit override attempt.
 */
export const warehouseMembershipEntityFactory = (
  overrides: DeepPartial<WarehouseMembershipEntity> &
    Pick<WarehouseMembershipEntity, 'userId' | 'warehouseId' | 'roleId'>,
): DeepPartial<WarehouseMembershipEntity> => {
  const now = new Date();

  return {
    createdAt: now,
    updatedAt: now,
    ...overrides,
    roleKind: 'custom',
  };
};

/**
 * Builds a valid, non-revoked `DeepPartial<SessionEntity>` for a given
 * `AccountEntity`.
 */
export const sessionEntityFactory = (
  account: DeepPartial<AccountEntity>,
  overrides: DeepPartial<SessionEntity> = {},
): DeepPartial<SessionEntity> => {
  const establishedAt = new Date();
  const expiresAt = new Date(establishedAt.getTime() + 60 * 60 * 1000);

  return {
    id: randomUUID(),
    // `chk_sessions_secret_digest_length` requires exactly 32 bytes
    // (`octet_length(secret_digest) = 32`), matching a real digest's size.
    secretDigest: randomBytes(32),
    establishedAt,
    expiresAt,
    revokedAt: null,
    ...overrides,
    accountId: account.id,
  };
};
