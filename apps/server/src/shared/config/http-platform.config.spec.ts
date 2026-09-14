import { readHttpPlatformConfig } from 'shared/config/http-platform.config';
import { describe, expect, it } from 'vitest';

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

  // The three remaining ways a string can look like an origin without being one. Each is a distinct
  // refusal in `isBareHttpOrigin`, and none of them is reachable through the cases above: a
  // non-HTTP scheme parses, credentials parse, and a bare hostname does not parse at all.
  it.each([
    ['a non-HTTP scheme', 'ftp://app.example.test'],
    ['embedded credentials', 'https://user:secret@app.example.test'],
    ['an unparseable value', 'app.example.test'],
  ])('rejects an origin carrying %s', (_case, origin) => {
    expect(() =>
      readHttpPlatformConfig({
        APP_ORIGINS: origin,
        AUTH_COOKIE_SECURE: 'false',
      }),
    ).toThrow('APP_ORIGINS must contain only valid HTTP origins');
  });

  it('refuses a cookie policy that is neither true nor false', () => {
    expect(() =>
      readHttpPlatformConfig({
        APP_ORIGINS: 'https://app.example.test',
        AUTH_COOKIE_SECURE: 'yes',
      }),
    ).toThrow('AUTH_COOKIE_SECURE must be either true or false');
    expect(() =>
      readHttpPlatformConfig({ APP_ORIGINS: 'https://app.example.test' }),
    ).toThrow('AUTH_COOKIE_SECURE must be either true or false');
  });
});
