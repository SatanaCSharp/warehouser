import { AssertionError } from '@warehouser/shared-types/errors';
import { Password } from 'shared/domain/security/password';

describe('Password', () => {
  it('measures password length in Unicode code points and preserves whitespace', () => {
    const password = '  🔐pass  ';

    expect(Password.create(password).value).toBe(password);
    expect(() => Password.create('🔐'.repeat(7))).toThrow(AssertionError);
    expect(() => Password.create('🔐'.repeat(129))).toThrow(AssertionError);
  });
});
