// T4: APP_TIMEZONE, read through ConfigService in the defaulted `get(key, fallback)` shape
// `LOG_PRETTY` uses in `shared/logger/app-logger.module.ts` — the task documents `UTC` as the
// default, so absence is not a failure — and
// validated so an invalid IANA zone name fails startup rather than reaching the repository layer
// (data-model.md § Time, timezone and the week; AC-07, AC-10, AC-14, AC-16, AC-20b).
import type { ConfigService } from '@nestjs/config';
import { readAppTimezoneConfig } from 'shared/config/app-timezone.config';
import { describe, expect, it } from 'vitest';

const configReturning = (value: string): ConfigService =>
  ({
    get: (key: string) => {
      if (key !== 'APP_TIMEZONE') {
        throw new Error(`unexpected config key requested: ${key}`);
      }
      return value;
    },
  }) as unknown as ConfigService;

// Simulates the real `ConfigService.get(key, defaultValue)`: the key is undeclared, so it answers
// with whatever default the caller passed — exactly what `readAppTimezoneConfig` must exercise to
// prove the documented `UTC` default, rather than a value handed to it directly.
const configWithoutAppTimezone = (): ConfigService =>
  ({
    get: (key: string, defaultValue?: string) => {
      if (key !== 'APP_TIMEZONE') {
        throw new Error(`unexpected config key requested: ${key}`);
      }
      return defaultValue;
    },
  }) as unknown as ConfigService;

describe('readAppTimezoneConfig', () => {
  it('reads a declared APP_TIMEZONE through ConfigService, as LOG_PRETTY is read', () => {
    expect(readAppTimezoneConfig(configReturning('Europe/Kyiv'))).toBe(
      'Europe/Kyiv',
    );
  });

  it('defaults to UTC when APP_TIMEZONE is not declared', () => {
    expect(readAppTimezoneConfig(configWithoutAppTimezone())).toBe('UTC');
  });

  it('fails startup when APP_TIMEZONE does not name a real IANA zone', () => {
    expect(() => readAppTimezoneConfig(configReturning('Not/AZone'))).toThrow(
      'APP_TIMEZONE must name a valid IANA timezone',
    );
  });
});
