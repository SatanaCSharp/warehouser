import { Account } from 'auth/domain/entities/account';
import { EmailAddress } from 'auth/domain/value-objects/email-address';

export abstract class AccountRepository {
  abstract findByNormalizedEmail(email: EmailAddress): Promise<Account | null>;
}
