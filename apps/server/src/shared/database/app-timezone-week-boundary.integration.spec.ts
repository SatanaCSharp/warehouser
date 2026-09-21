// `readAppTimezoneConfig` does not exist yet — this is a RED step for T4, together with
// `app-timezone.config.spec.ts`.
//
// Scope, decided honestly rather than left implicit (see the T4 task brief's own instruction to
// say so): no repository consumes APP_TIMEZONE yet — the `customer-orders`/`purchase-drafts` read
// repositories for Order Flow (AC-16) and the On-time Arrival Rate (AC-20b) are T5+ work, so
// "reaches the repositories as a bound parameter" cannot be exercised end to end at this task. What
// *is* T4's own production code is `readAppTimezoneConfig`, and what this spec proves is that its
// output — not a hand-picked literal — genuinely behaves as a bound query parameter against a real
// PostgreSQL connection: passing two different `readAppTimezoneConfig` results as `$2` buckets one
// unmodified instant into two different ISO weeks, in a connection whose own session `TimeZone` is
// never touched — which a connection-level `TimeZone` setting could not produce, and which is
// exactly the distinction `data-model.md § Time, timezone and the week` draws. The remaining join —
// this same value flowing out of a repository's own query — belongs with T5's first repository and
// should be asserted there, not fabricated here against a repository that does not exist.
import type { ConfigService } from '@nestjs/config';
import { readAppTimezoneConfig } from 'shared/config/app-timezone.config';
import dataSource from 'shared/database/data-source';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const configReturning = (value: string): ConfigService =>
  ({ get: () => value }) as unknown as ConfigService;

describe('APP_TIMEZONE as a bound query parameter (AC-16, AC-20b)', () => {
  beforeAll(async () => {
    await dataSource.initialize();
  });

  afterAll(async () => {
    await dataSource.destroy();
  });

  it('buckets the same instant into two different weeks under two different bound APP_TIMEZONE values', async () => {
    // 2026-09-20 23:30:00+00 is Sunday in UTC (week starting 2026-09-14) and 02:30 on Monday
    // 2026-09-21 in Europe/Kyiv (week starting 2026-09-21) — verified in data-model.md's own
    // worked example for the date shift; the week shift is the same instant carried one step
    // further, onto an ISO week boundary.
    const instant = '2026-09-20T23:30:00Z';
    const utcTimezone = readAppTimezoneConfig(configReturning('UTC'));
    const kyivTimezone = readAppTimezoneConfig(configReturning('Europe/Kyiv'));

    const [utcRow] = (await dataSource.query(
      `SELECT date_trunc('week', $1::timestamptz AT TIME ZONE $2)::date::text AS week_start`,
      [instant, utcTimezone],
    )) as { week_start: string }[];
    const [kyivRow] = (await dataSource.query(
      `SELECT date_trunc('week', $1::timestamptz AT TIME ZONE $2)::date::text AS week_start`,
      [instant, kyivTimezone],
    )) as { week_start: string }[];

    expect(utcRow.week_start).toBe('2026-09-14');
    expect(kyivRow.week_start).toBe('2026-09-21');
    expect(kyivRow.week_start).not.toBe(utcRow.week_start);
  });
});
