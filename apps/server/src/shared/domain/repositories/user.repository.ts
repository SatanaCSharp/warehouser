import { Injectable } from '@nestjs/common';
import { UserEntity } from 'shared/domain/entities/user.entity';
import { BaseRepository } from 'shared/domain/repositories/base.repository';
import { DataSource, DeepPartial } from 'typeorm';

@Injectable()
export class UserRepository extends BaseRepository<UserEntity> {
  constructor(dataSource: DataSource) {
    super(dataSource, UserEntity);
  }

  async createUser(user: DeepPartial<UserEntity>): Promise<void> {
    await this.repository.insert(user);
  }
}
