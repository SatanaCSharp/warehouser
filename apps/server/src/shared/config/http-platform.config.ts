export interface HttpPlatformConfig {
  readonly allowedOrigins: readonly string[];
  readonly secureCookies: boolean;
}

const isHttpOrigin = (value: string): boolean => {
  try {
    const url = new URL(value);

    return (
      (url.protocol === 'http:' || url.protocol === 'https:') &&
      url.origin === value &&
      url.username === '' &&
      url.password === ''
    );
  } catch {
    return false;
  }
};

export const readHttpPlatformConfig = (
  environment: Readonly<Record<string, string | undefined>>,
): HttpPlatformConfig => {
  const allowedOrigins =
    environment.APP_ORIGINS?.split(',')
      .map((origin) => origin.trim())
      .filter(Boolean) ?? [];

  if (allowedOrigins.length === 0) {
    throw new Error('APP_ORIGINS must contain at least one explicit origin');
  }

  if (
    allowedOrigins.includes('*') ||
    allowedOrigins.some((origin) => !isHttpOrigin(origin))
  ) {
    throw new Error('APP_ORIGINS must contain only valid HTTP origins');
  }

  const secureCookies = environment.AUTH_COOKIE_SECURE;

  if (secureCookies !== 'true' && secureCookies !== 'false') {
    throw new Error('AUTH_COOKIE_SECURE must be either true or false');
  }

  if (environment.NODE_ENV === 'production' && secureCookies !== 'true') {
    throw new Error('AUTH_COOKIE_SECURE must be true in production');
  }

  return {
    allowedOrigins: [...new Set(allowedOrigins)],
    secureCookies: secureCookies === 'true',
  };
};
