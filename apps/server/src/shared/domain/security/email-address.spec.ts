import { AssertionError } from '@warehouser/shared-types/errors';
import { EmailAddress } from 'shared/domain/security/email-address.js';
import { describe, expect, it } from 'vitest';

describe('EmailAddress', () => {
  it('normalizes a supported email while preserving its validated shape', () => {
    expect(EmailAddress.create('  Test.User@Example.TEST ').value).toBe(
      'test.user@example.test',
    );
    expect(() => EmailAddress.create('invalid@example')).toThrow(
      AssertionError,
    );
  });
});
