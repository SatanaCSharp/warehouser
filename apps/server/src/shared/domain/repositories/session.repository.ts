import { Injectable } from '@nestjs/common';
import { SessionEntity } from 'shared/domain/entities/session.entity';
import { BaseRepository } from 'shared/domain/repositories/base.repository';
import { DataSource, DeepPartial, IsNull, MoreThan } from 'typeorm';

@Injectable()
export class SessionRepository extends BaseRepository<SessionEntity> {
  constructor(dataSource: DataSource) {
    super(dataSource, SessionEntity);
  }

  async createSession(session: DeepPartial<SessionEntity>): Promise<void> {
    await this.repository.insert(session);
  }

  async findValidByDigest(
    digest: Buffer,
    at: Date,
  ): Promise<SessionEntity | null> {
    return this.repository.findOneBy({
      secretDigest: digest,
      revokedAt: IsNull(),
      expiresAt: MoreThan(at),
    });
  }

  async revokeByDigest(digest: Buffer, at: Date): Promise<boolean> {
    const result = await this.repository.update(
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
