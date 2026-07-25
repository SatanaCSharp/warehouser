import { assert } from '@warehouser/utils/asserts';
import { isSupportedPassword } from 'auth/domain/predicates/is-supported-password';

export class Password {
  private constructor(readonly value: string) {}

  static create(value: string): Password {
    assert(
      isSupportedPassword(value),
      'Password requires 8 to 128 Unicode code points',
    );
    return new Password(value);
  }
}
