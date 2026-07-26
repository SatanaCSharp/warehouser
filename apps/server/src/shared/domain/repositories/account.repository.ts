import { Injectable } from '@nestjs/common';
import { AccountEntity } from 'shared/domain/entities/account.entity';
import { BaseRepository } from 'shared/domain/repositories/base.repository';
import { DeepPartial } from 'typeorm';
import { DataSource } from 'typeorm';

@Injectable()
export class AccountRepository extends BaseRepository<AccountEntity> {
  constructor(dataSource: DataSource) {
    super(dataSource, AccountEntity);
  }

  findByNormalizedEmail(
    normalizedEmail: string,
  ): Promise<AccountEntity | null> {
    return this.repository.findOneBy({
      normalizedEmail,
    });
  }

  async createAccount(account: DeepPartial<AccountEntity>): Promise<void> {
    await this.repository.insert(account);
  }
}
