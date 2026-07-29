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
}
