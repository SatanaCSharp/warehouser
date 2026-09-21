import type { ConfigService } from '@nestjs/config';
import { isValidIanaTimezone } from 'shared/predicates/iana-timezone.predicates';

/** The DI token `AppTimezoneModule.forRoot()` provides the validated `APP_TIMEZONE` value under —
 * see that module for how a `ConfigService` factory turns an invalid zone into a genuine Nest
 * bootstrap failure rather than merely a failure of this function in isolation. */
export const APP_TIMEZONE = 'APP_TIMEZONE';

/** Reads `APP_TIMEZONE` through `ConfigService.get` with the documented `'UTC'` default — the same
 * defaulted-read shape `shared/logger/app-logger.module.ts` already uses for `LOG_PRETTY`
 * (`config.get<string>('LOG_PRETTY', 'false')`), rather than `LOG_LEVEL`'s `getOrThrow`, which has
 * no default and would make an *absent* `APP_TIMEZONE` crash bootstrap — contradicting the task's
 * own "default `UTC`". An absent value therefore reads as `'UTC'`; a present-but-invalid value still
 * refuses.
 *
 * This is the single configuration value `data-model.md § Time, timezone and the week` binds as a
 * query parameter into every week, band and on-time verdict (AC-07, AC-10, AC-14, AC-16, AC-20b).
 * It is deliberately not validated with `assert`/a named `ApplicationError`/`SystemError` factory:
 * this check runs before any request path exists — during configuration read, ahead of the global
 * NestJS exception filter — so it throws a plain `Error`, matching the sibling startup check in
 * `shared/config/http-platform.config.ts` rather than the typed-error taxonomy
 * `guides/server-error-handling.md` reserves for failures the request path can reach. */
export const readAppTimezoneConfig = (config: ConfigService): string => {
  const timezone = config.get<string>('APP_TIMEZONE', 'UTC');

  if (!isValidIanaTimezone(timezone)) {
    throw new Error('APP_TIMEZONE must name a valid IANA timezone');
  }

  return timezone;
};
