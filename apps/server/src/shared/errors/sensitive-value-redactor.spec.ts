import { redactSensitiveValues } from 'shared/errors/sensitive-value-redactor';

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
});
