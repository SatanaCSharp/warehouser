import {
  authCredentialsSchema,
  authenticatedUserSchema,
  errorResponseSchema,
} from 'auth';

describe('auth contracts', () => {
  it('normalizes email and preserves the password exactly', () => {
    const password = '  🔐pass  ';

    expect(
      authCredentialsSchema.parse({
        email: '  Test.User@Example.TEST ',
        password,
      }),
    ).toEqual({ email: 'test.user@example.test', password });
  });

  it('measures passwords in Unicode code points', () => {
    expect(
      authCredentialsSchema.safeParse({
        email: 'person@example.test',
        password: '🔐'.repeat(8),
      }).success,
    ).toBe(true);
    expect(
      authCredentialsSchema.safeParse({
        email: 'person@example.test',
        password: '🔐'.repeat(129),
      }).success,
    ).toBe(false);
  });

  it('rejects unsupported emails and unknown request fields', () => {
    expect(
      authCredentialsSchema.safeParse({
        email: 'person@example',
        password: 'password',
      }).success,
    ).toBe(false);
    expect(
      authCredentialsSchema.safeParse({
        email: 'person@example.test',
        password: 'password',
        authorization: ['admin'],
      }).success,
    ).toBe(false);
  });

  it('exposes only the authenticated user identifier', () => {
    expect(
      authenticatedUserSchema.parse({
        user: { id: '00000000-0000-4000-8000-000000000001' },
      }),
    ).toEqual({
      user: { id: '00000000-0000-4000-8000-000000000001' },
    });
  });

  it('accepts only stable safe error envelopes', () => {
    expect(
      errorResponseSchema.safeParse({
        code: 'auth.invalid_credentials',
        message: 'The email or password is incorrect.',
        details: { fields: { email: 'Correct this field.' } },
      }).success,
    ).toBe(true);
    expect(
      errorResponseSchema.safeParse({
        code: 'InvalidCredentials',
        message: 'unsafe',
        stack: 'secret',
      }).success,
    ).toBe(false);
  });
});
