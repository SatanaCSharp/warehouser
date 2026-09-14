export interface HttpPlatformConfig {
  readonly allowedOrigins: readonly string[];
  readonly secureCookies: boolean;
}

const isHttpProtocol = (url: URL): boolean =>
  url.protocol === 'http:' || url.protocol === 'https:';

const carriesNoCredentials = (url: URL): boolean =>
  url.username === '' && url.password === '';

/** An origin and nothing else: scheme, host and port, with no path, query, fragment or userinfo —
 * `url.origin === value` is what rejects everything after the authority. */
const isBareHttpOrigin = (url: URL, value: string): boolean =>
  isHttpProtocol(url) && url.origin === value && carriesNoCredentials(url);

const isHttpOrigin = (value: string): boolean => {
  try {
    return isBareHttpOrigin(new URL(value), value);
  } catch {
    return false;
  }
};

const parseAllowedOrigins = (value: string | undefined): string[] =>
  value
    ?.split(',')
    .map((origin) => origin.trim())
    .filter(Boolean) ?? [];

const assertOriginsDeclared = (origins: readonly string[]): void => {
  if (origins.length === 0) {
    throw new Error('APP_ORIGINS must contain at least one explicit origin');
  }
};

const assertOriginsWellFormed = (origins: readonly string[]): void => {
  if (
    origins.includes('*') ||
    origins.some((origin) => !isHttpOrigin(origin))
  ) {
    throw new Error('APP_ORIGINS must contain only valid HTTP origins');
  }
};

const readCookiePolicy = (value: string | undefined): 'false' | 'true' => {
  if (value !== 'true' && value !== 'false') {
    throw new Error('AUTH_COOKIE_SECURE must be either true or false');
  }
  return value;
};

const assertProductionCookiesSecure = (
  nodeEnv: string | undefined,
  value: string,
): void => {
  if (nodeEnv === 'production' && value !== 'true') {
    throw new Error('AUTH_COOKIE_SECURE must be true in production');
  }
};

const readSecureCookies = (
  environment: Readonly<Record<string, string | undefined>>,
): boolean => {
  const declared = readCookiePolicy(environment.AUTH_COOKIE_SECURE);
  assertProductionCookiesSecure(environment.NODE_ENV, declared);
  return declared === 'true';
};

export const readHttpPlatformConfig = (
  environment: Readonly<Record<string, string | undefined>>,
): HttpPlatformConfig => {
  const allowedOrigins = parseAllowedOrigins(environment.APP_ORIGINS);
  assertOriginsDeclared(allowedOrigins);
  assertOriginsWellFormed(allowedOrigins);

  return {
    allowedOrigins: [...new Set(allowedOrigins)],
    secureCookies: readSecureCookies(environment),
  };
};
