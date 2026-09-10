import { Injectable } from '@nestjs/common';
import { Account } from 'auth/domain/entities/account.js';
import { Session } from 'auth/domain/entities/session.js';
import { User } from 'auth/domain/entities/user.js';
import { toAccountEntity } from 'auth/domain/mappers/account.mapper.js';
import { toSessionEntity } from 'auth/domain/mappers/session.mapper.js';
import { toUserEntity } from 'auth/domain/mappers/user.mapper.js';
import { Transactional } from 'shared/decorators/transactional.decorator.js';
import { AuthenticationRepository } from 'shared/domain/repositories/authentication.repository.js';

export interface RegisteredIdentity {
  readonly account: Account;
  readonly user: User;
  // spec.md §1 (second boundary): a User's Workspace relation is established
  // when that User is created and never re-derived from Warehouse
  // memberships afterwards. For a registrant, that relation is the
  // Workspace registration bootstrap creates in the same transaction
  // (sad.md §6.1/§4), so it travels with the identity rather than being
  // written later.
  readonly workspaceId: string;
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
      user: toUserEntity(identity.user, createdAt, identity.workspaceId),
      session: toSessionEntity(identity.session),
    });
  }
}
