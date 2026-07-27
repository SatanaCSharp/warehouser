import { Injectable } from '@nestjs/common';
import { Account } from 'auth/domain/entities/account';
import { Session } from 'auth/domain/entities/session';
import { User } from 'auth/domain/entities/user';
import { toAccountEntity } from 'auth/domain/mappers/account.mapper';
import { toSessionEntity } from 'auth/domain/mappers/session.mapper';
import { toUserEntity } from 'auth/domain/mappers/user.mapper';
import { Transactional } from 'shared/decorators/transactional.decorator';
import { AuthenticationRepository } from 'shared/domain/repositories/authentication.repository';

export interface RegisteredIdentity {
  readonly account: Account;
  readonly user: User;
  readonly session: Session;
}

@Injectable()
export class AuthRegistrationService {
  constructor(private readonly authentication: AuthenticationRepository) {}

  @Transactional()
  async registerIdentity(identity: RegisteredIdentity): Promise<void> {
    const createdAt = new Date();
    await this.authentication.createRegistration({
      account: toAccountEntity(identity.account, createdAt),
      user: toUserEntity(identity.user, createdAt),
      session: toSessionEntity(identity.session),
    });
  }
}
