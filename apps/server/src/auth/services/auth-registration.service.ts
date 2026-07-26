import { Injectable } from '@nestjs/common';
import { Account } from 'auth/domain/entities/account';
import { Session } from 'auth/domain/entities/session';
import { User } from 'auth/domain/entities/user';
import { toAccountEntity } from 'auth/mappers/account.mapper';
import { toSessionEntity } from 'auth/mappers/session.mapper';
import { toUserEntity } from 'auth/mappers/user.mapper';
import { Transactional } from 'shared/decorators/transactional.decorator';
import { AccountRepository } from 'shared/domain/repositories/account.repository';
import { SessionRepository } from 'shared/domain/repositories/session.repository';
import { UserRepository } from 'shared/domain/repositories/user.repository';

export interface RegisteredIdentity {
  readonly account: Account;
  readonly user: User;
  readonly session: Session;
}

@Injectable()
export class AuthRegistrationService {
  constructor(
    private readonly accounts: AccountRepository,
    private readonly users: UserRepository,
    private readonly sessions: SessionRepository,
  ) {}

  @Transactional()
  async registerIdentity(identity: RegisteredIdentity): Promise<void> {
    const createdAt = new Date();
    await this.accounts.createAccount(
      toAccountEntity(identity.account, createdAt),
    );
    await this.users.createUser(toUserEntity(identity.user, createdAt));
    await this.sessions.createSession(toSessionEntity(identity.session));
  }
}
