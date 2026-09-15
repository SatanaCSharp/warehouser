import { isEmpty } from '@warehouser/utils/predicates';
import {
  isBooleanDeclaration,
  isDeclaredTrue,
  isProductionEnvironment,
} from 'shared/predicates/environment-flag.predicates';
import { isHttpOrigin } from 'shared/predicates/http-origin.predicates';

export interface HttpPlatformConfig {
  readonly allowedOrigins: readonly string[];
  readonly secureCookies: boolean;
}

const parseAllowedOrigins = (value: string | undefined): string[] =>
  value
    ?.split(',')
    .map((origin) => origin.trim())
    .filter(Boolean) ?? [];

const assertOriginsDeclared = (origins: readonly string[]): void => {
  if (isEmpty(origins)) {
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
  if (!isBooleanDeclaration(value)) {
    throw new Error('AUTH_COOKIE_SECURE must be either true or false');
  }
  return value;
};

const assertProductionCookiesSecure = (
  nodeEnv: string | undefined,
  value: string,
): void => {
  if (isProductionEnvironment(nodeEnv) && !isDeclaredTrue(value)) {
    throw new Error('AUTH_COOKIE_SECURE must be true in production');
  }
};

// Returns the declared policy rather than a boolean: it reads the environment and refuses an
// illegal or unsafe declaration, which is enforcement, not a question about a value. Turning the
// declaration into a flag is `isSecureCookiePolicy`'s job.
const readCookiePolicyFor = (
  environment: Readonly<Record<string, string | undefined>>,
): 'false' | 'true' => {
  const declared = readCookiePolicy(environment.AUTH_COOKIE_SECURE);
  assertProductionCookiesSecure(environment.NODE_ENV, declared);
  return declared;
};

export const readHttpPlatformConfig = (
  environment: Readonly<Record<string, string | undefined>>,
): HttpPlatformConfig => {
  const allowedOrigins = parseAllowedOrigins(environment.APP_ORIGINS);
  assertOriginsDeclared(allowedOrigins);
  assertOriginsWellFormed(allowedOrigins);

  return {
    allowedOrigins: [...new Set(allowedOrigins)],
    secureCookies: readCookiePolicyFor(environment) === 'true',
  };
};
