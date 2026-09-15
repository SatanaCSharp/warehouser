import { assert } from '@warehouser/utils/asserts';
import { normalizeEmail } from 'shared/domain/security/is-supported-email';
import { isSupportedEmail } from 'shared/predicates/credential.predicates';

export class EmailAddress {
  private constructor(readonly value: string) {}

  static create(input: string): EmailAddress {
    assert(isSupportedEmail(input), 'EmailAddress requires a supported email');
    return new EmailAddress(normalizeEmail(input));
  }
}
