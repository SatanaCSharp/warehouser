import { Injectable } from '@nestjs/common';
import { getEntityManager } from 'shared/database/db-transaction-context.service';
import { AccountEntity } from 'shared/domain/entities/account.entity';
import { SessionEntity } from 'shared/domain/entities/session.entity';
import { UserEntity } from 'shared/domain/entities/user.entity';
import { DataSource, DeepPartial, IsNull, MoreThan } from 'typeorm';

export interface RegistrationPersistenceInput {
  readonly account: DeepPartial<AccountEntity>;
  readonly user: DeepPartial<UserEntity>;
  readonly session: DeepPartial<SessionEntity>;
}

export interface IdentityPersistenceInput {
  readonly account: DeepPartial<AccountEntity>;
  readonly user: DeepPartial<UserEntity>;
}

export interface CredentialPersistenceInput {
  readonly hash: string;
  readonly algorithm: string;
  readonly parameters: Record<string, number | string>;
}

@Injectable()
export class AuthenticationRepository {
  constructor(private readonly dataSource: DataSource) {}

  findAccountByNormalizedEmail(
    normalizedEmail: string,
  ): Promise<AccountEntity | null> {
    return getEntityManager(this.dataSource)
      .getRepository(AccountEntity)
      .findOneBy({ normalizedEmail });
  }

  async createRegistration(input: RegistrationPersistenceInput): Promise<void> {
    const manager = getEntityManager(this.dataSource);
    await manager.insert(AccountEntity, input.account);
    await manager.insert(UserEntity, input.user);
    await manager.insert(SessionEntity, input.session);
  }

  async createSession(session: DeepPartial<SessionEntity>): Promise<void> {
    await getEntityManager(this.dataSource).insert(SessionEntity, session);
  }

  findValidSessionByDigest(
    digest: Buffer,
    at: Date,
  ): Promise<SessionEntity | null> {
    return getEntityManager(this.dataSource)
      .getRepository(SessionEntity)
      .findOneBy({
        secretDigest: digest,
        revokedAt: IsNull(),
        expiresAt: MoreThan(at),
      });
  }

  async revokeSessionByDigest(digest: Buffer, at: Date): Promise<boolean> {
    const result = await getEntityManager(this.dataSource)
      .getRepository(SessionEntity)
      .update(
        {
          secretDigest: digest,
          revokedAt: IsNull(),
          expiresAt: MoreThan(at),
        },
        { revokedAt: at },
      );

    return result.affected === 1;
  }

  async createIdentity(input: IdentityPersistenceInput): Promise<void> {
    // fk_accounts_user_id / fk_users_account_id are INITIALLY DEFERRED, so the Account+User
    // pair must land in a single statement: two separate autocommitted INSERT statements
    // would each trip the deferred check at the end of that single statement. Expressing the
    // users insert as a CTE feeding the accounts insert keeps both rows within one statement
    // without opening an ad hoc repository-level transaction.
    const manager = getEntityManager(this.dataSource);
    const insertUser = manager
      .createQueryBuilder()
      .insert()
      .into(UserEntity)
      .values(input.user);

    await manager
      .createQueryBuilder()
      .insert()
      .into(AccountEntity)
      .values(input.account)
      .addCommonTableExpression(insertUser, 'inserted_users')
      .execute();
  }

  async updateEmail(
    accountId: string,
    normalizedEmail: string,
    updatedAt: Date,
  ): Promise<boolean> {
    const result = await getEntityManager(this.dataSource)
      .getRepository(AccountEntity)
      .update({ id: accountId }, { normalizedEmail, updatedAt });

    return result.affected === 1;
  }

  async updateCredential(
    accountId: string,
    credential: CredentialPersistenceInput,
    updatedAt: Date,
  ): Promise<boolean> {
    const result = await getEntityManager(this.dataSource)
      .getRepository(AccountEntity)
      .update(
        { id: accountId },
        {
          passwordHash: credential.hash,
          passwordHashAlgorithm: credential.algorithm,
          passwordHashParameters: credential.parameters,
          updatedAt,
        },
      );

    return result.affected === 1;
  }

  async revokeSessionsByAccountId(
    accountId: string,
    at: Date,
  ): Promise<number> {
    const result = await getEntityManager(this.dataSource)
      .getRepository(SessionEntity)
      .update({ accountId, revokedAt: IsNull() }, { revokedAt: at });

    return result.affected ?? 0;
  }

  async deleteSessionsByAccountId(accountId: string): Promise<void> {
    await getEntityManager(this.dataSource)
      .getRepository(SessionEntity)
      .delete({ accountId });
  }

  async deleteIdentity(identityId: string): Promise<void> {
    // fk_accounts_user_id / fk_users_account_id are ON DELETE RESTRICT: Postgres checks a
    // RESTRICT action immediately after the statement that violates it, regardless of the
    // constraint's DEFERRABLE INITIALLY DEFERRED declaration (deferring is only honored for
    // NO ACTION). Two separate DELETE statements — in either order — therefore always trip
    // the other row's still-existing reference. A single statement, with the users delete
    // expressed as a CTE feeding the accounts delete, removes both rows before either
    // RESTRICT trigger evaluates, satisfying the deferred pair as intended.
    const manager = getEntityManager(this.dataSource);
    const deleteUser = manager
      .createQueryBuilder()
      .delete()
      .from(UserEntity)
      .where('id = :identityId', { identityId });

    await manager
      .createQueryBuilder()
      .delete()
      .from(AccountEntity)
      .where('id = :identityId', { identityId })
      .addCommonTableExpression(deleteUser, 'deleted_users')
      .execute();
  }
}
