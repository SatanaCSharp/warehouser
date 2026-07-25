import { Account } from 'auth/domain/entities/account';
import { Session } from 'auth/domain/entities/session';
import { User } from 'auth/domain/entities/user';

export interface RegisteredIdentity {
  readonly account: Account;
  readonly user: User;
  readonly session: Session;
}

export abstract class AuthRegistrationRepository {
  abstract registerIdentity(identity: RegisteredIdentity): Promise<void>;
}
