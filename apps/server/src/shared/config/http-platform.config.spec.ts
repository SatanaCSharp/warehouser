import { readHttpPlatformConfig } from 'shared/config/http-platform.config';

describe('readHttpPlatformConfig', () => {
  it('accepts an explicit comma-separated application-origin allowlist', () => {
    expect(
      readHttpPlatformConfig({
        APP_ORIGINS: 'https://app.example.test, http://localhost:5173',
        AUTH_COOKIE_SECURE: 'true',
        NODE_ENV: 'production',
      }),
    ).toEqual({
      allowedOrigins: ['https://app.example.test', 'http://localhost:5173'],
      secureCookies: true,
    });
  });

  it('accepts an explicit local cookie policy but refuses insecure production cookies', () => {
    expect(
      readHttpPlatformConfig({
        APP_ORIGINS: 'http://localhost:5173',
        AUTH_COOKIE_SECURE: 'false',
        NODE_ENV: 'development',
      }).secureCookies,
    ).toBe(false);
    expect(() =>
      readHttpPlatformConfig({
        APP_ORIGINS: 'https://app.example.test',
        AUTH_COOKIE_SECURE: 'false',
        NODE_ENV: 'production',
      }),
    ).toThrow('AUTH_COOKIE_SECURE must be true in production');
  });

  it('rejects missing, wildcard, and path-bearing origins', () => {
    expect(() => readHttpPlatformConfig({})).toThrow(
      'APP_ORIGINS must contain at least one explicit origin',
    );
    expect(() => readHttpPlatformConfig({ APP_ORIGINS: '*' })).toThrow(
      'APP_ORIGINS must contain only valid HTTP origins',
    );
    expect(() =>
      readHttpPlatformConfig({
        APP_ORIGINS: 'https://app.example.test/sign-in',
      }),
    ).toThrow('APP_ORIGINS must contain only valid HTTP origins');
  });
});
