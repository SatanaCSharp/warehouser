import { redactSensitiveValues } from 'shared/errors/sensitive-value-redactor';
import { describe, expect, it } from 'vitest';

describe('redactSensitiveValues', () => {
  it('removes credentials, cookies, digests, hashes, and raw emails recursively', () => {
    expect(
      redactSensitiveValues({
        password: 'correct horse battery staple',
        headers: {
          cookie: 'warehouser_session=secret',
          authorization: 'Bearer secret',
        },
        cause: {
          message:
            'failure for Person@Example.test with passwordHash abc and sessionDigest def',
        },
      }),
    ).toEqual({
      password: '[REDACTED]',
      headers: {
        cookie: '[REDACTED]',
        authorization: '[REDACTED]',
      },
      cause: {
        message:
          'failure for [REDACTED_EMAIL] with passwordHash [REDACTED] and sessionDigest [REDACTED]',
      },
    });
  });

  // The array branch, which the recursive object walk above never reaches: an entry whose value is
  // an array is mapped element-by-element rather than treated as an object, so a secret sitting in
  // a list — a batch of failed logins, a `cause` chain — is redacted at the same depth as one
  // sitting under a key.
  it('walks into arrays and redacts each element', () => {
    expect(
      redactSensitiveValues([
        'contact Person@Example.test',
        { token: 'abc' },
        ['nested for Other@Example.test'],
      ]),
    ).toEqual([
      'contact [REDACTED_EMAIL]',
      { token: '[REDACTED]' },
      ['nested for [REDACTED_EMAIL]'],
    ]);
  });

  // The non-object, non-string tail: numbers, booleans, `null` and `undefined` pass through
  // untouched. `null` matters on its own because `typeof null === 'object'` — without the explicit
  // check it would reach `Object.entries` and come back as `{}`.
  it('returns primitives and null unchanged', () => {
    expect(redactSensitiveValues(42)).toBe(42);
    expect(redactSensitiveValues(true)).toBe(true);
    expect(redactSensitiveValues(null)).toBeNull();
    expect(redactSensitiveValues(undefined)).toBeUndefined();
  });
});
