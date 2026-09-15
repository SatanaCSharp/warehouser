import {
  formatCalendarDate,
  formatShortCalendarDate,
  formatShortTimestampDate,
  formatTimestampDate,
} from 'shared/utils/date-format';
import { afterEach, describe, expect, it } from 'vitest';

const ORIGINAL_TIME_ZONE = process.env.TZ;

/**
 * Zones either side of Greenwich, far enough out that a UTC-midnight
 * reinterpretation lands on a different calendar day in both directions:
 * Kiritimati is UTC+14, Niue UTC−11.
 */
const AHEAD_OF_UTC = 'Pacific/Kiritimati';
const BEHIND_UTC = 'Pacific/Niue';

describe('formatCalendarDate', () => {
  afterEach(() => {
    process.env.TZ = ORIGINAL_TIME_ZONE;
  });

  it('renders a plain calendar date as the frames draw it', () => {
    expect(formatCalendarDate('2026-08-25', 'en')).toBe('25 Aug 2026');
  });

  it('keeps the day, month and year order in every supported language', () => {
    expect(formatCalendarDate('2026-09-02', 'en')).toBe('2 Sep 2026');
    expect(formatCalendarDate('2026-09-02', 'uk')).toMatch(/^2 \S+ 2026$/u);
  });

  // The bug this exists to prevent: `new Date('2026-08-25')` is midnight UTC,
  // which is 24 Aug in any zone behind Greenwich and 25 Aug only by luck ahead
  // of it. A plain date names a day, not an instant, so the rendered day must
  // not move with the viewer's zone. The same reinterpretation already produced
  // a defect on the server side.
  it.each([
    ['ahead of UTC', AHEAD_OF_UTC],
    ['behind UTC', BEHIND_UTC],
  ])('names the same day in a zone %s', (_label, timeZone) => {
    process.env.TZ = timeZone;

    expect(formatCalendarDate('2026-08-25', 'en')).toBe('25 Aug 2026');
    expect(formatCalendarDate('2026-01-01', 'en')).toBe('1 Jan 2026');
    expect(formatCalendarDate('2026-12-31', 'en')).toBe('31 Dec 2026');
  });

  it('rejects a value that is not a calendar date rather than rendering another day', () => {
    expect(() => formatCalendarDate('not-a-date', 'en')).toThrow();
  });
});

describe('formatTimestampDate', () => {
  it('renders the calendar date an instant falls on, in the same shape', () => {
    expect(formatTimestampDate('2026-08-25T09:30:00.000Z', 'en')).toBe(
      '25 Aug 2026',
    );
  });
});

// The frames drop the year wherever the surrounding line already establishes it:
// the Items table's on-hand reason line (`24 Aug · cycle count · by you`,
// `XIvAZ.png`) and a draft card's `expected 5 Sep` (`F0SpRx.png`).
describe('the short forms', () => {
  it('renders a calendar date as day and month alone', () => {
    expect(formatShortCalendarDate('2026-09-05', 'en')).toBe('5 Sep');
  });

  it('renders a timestamp as day and month alone', () => {
    expect(formatShortTimestampDate('2026-08-24T09:30:00.000Z', 'en')).toBe(
      '24 Aug',
    );
  });

  // The short form carries the same guarantee as the long one: a plain date
  // names a day, and that day is what renders wherever the viewer sits.
  it.each([
    ['ahead of UTC', AHEAD_OF_UTC],
    ['behind UTC', BEHIND_UTC],
  ])('names the same day in a zone %s', (_label, timeZone) => {
    process.env.TZ = timeZone;

    expect(formatShortCalendarDate('2026-01-01', 'en')).toBe('1 Jan');
    expect(formatShortCalendarDate('2026-12-31', 'en')).toBe('31 Dec');
  });
});
