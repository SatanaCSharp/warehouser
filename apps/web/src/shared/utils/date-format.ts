import { DateFormatter, parseDate } from '@internationalized/date';

/**
 * The approved frames draw every date as `25 Aug 2026` — day, abbreviated
 * month, four-digit year, in that order, in both `en` and `uk`
 * (`docs/features/ordering/previews/yGhkK.png`, `hWFRW.png`). `Intl` orders
 * those parts by locale (`en` alone would render `Aug 25, 2026`), so the order
 * is pinned here and only the part *values* — the month name and the numerals
 * — are taken from the active locale.
 */
const DATE_PART_OPTIONS = {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
} as const;

/**
 * The same day and month without the year — what the frames use wherever the
 * year is already established by its surroundings: the Items table's on-hand
 * reason line (`24 Aug · cycle count · by you`) and a draft card's
 * `expected 5 Sep` (`XIvAZ.png`, `F0SpRx.png`).
 */
const SHORT_DATE_PART_OPTIONS = {
  day: 'numeric',
  month: 'short',
} as const;

const renderParts = (
  locale: string,
  instant: Date,
  timeZone?: string,
  withYear = true,
): string => {
  const parts = new DateFormatter(locale, {
    ...(withYear ? DATE_PART_OPTIONS : SHORT_DATE_PART_OPTIONS),
    timeZone,
  }).formatToParts(instant);
  const valueOf = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((part) => part.type === type)?.value ?? '';

  const dayAndMonth = `${valueOf('day')} ${valueOf('month')}`;

  return withYear ? `${dayAndMonth} ${valueOf('year')}` : dayAndMonth;
};

/**
 * The one zone a plain calendar date is both anchored in and read back in.
 * Anchoring and formatting in the *same* fixed zone is what makes the rendered
 * day independent of where the viewer is; anchoring locally and formatting
 * locally would too, but only while both agree — and they do not, because
 * `Intl` caches the resolved local zone.
 */
const FIXED_ZONE = 'UTC';

/**
 * Renders a plain `YYYY-MM-DD` calendar date — a needed-by date, an expected
 * arrival date — as the frames draw it.
 *
 * **It never pushes the value through `new Date('2026-08-25')`.** That
 * constructor reads a date-only string as midnight UTC and then reports it in
 * the viewer's zone, so west of Greenwich `2026-08-25` renders as 24 Aug. The
 * same reinterpretation already produced a defect on the server side. A plain
 * date names a day, not an instant, so it is parsed as a `CalendarDate` and
 * both anchored and formatted in {@link FIXED_ZONE}: the day it names is the
 * day rendered, in every zone.
 *
 * Throws on a value that is not a calendar date: a malformed date is a contract
 * failure, and rendering some other day for it would hide one.
 */
export const formatCalendarDate = (isoDate: string, locale: string): string =>
  renderParts(locale, parseDate(isoDate).toDate(FIXED_ZONE), FIXED_ZONE);

/**
 * Renders an ISO-8601 timestamp — a draft's creation time, an archival time —
 * as the calendar date it falls on in the viewer's own zone, in the same shape
 * as {@link formatCalendarDate}. A timestamp *does* carry an instant, so the
 * zone conversion here is the correct answer rather than the bug above.
 */
export const formatTimestampDate = (
  isoTimestamp: string,
  locale: string,
): string => renderParts(locale, new Date(isoTimestamp));

/**
 * A plain calendar date as `5 Sep` — {@link formatCalendarDate} without the
 * year, for the places the frames drop it because the surrounding line already
 * establishes it. It carries the same zone guarantee, for the same reason.
 */
export const formatShortCalendarDate = (
  isoDate: string,
  locale: string,
): string =>
  renderParts(locale, parseDate(isoDate).toDate(FIXED_ZONE), FIXED_ZONE, false);

/**
 * A timestamp as the `24 Aug` the Items table's on-hand reason line draws
 * (`XIvAZ.png`; `design-handoff.md` names that line part of the contract).
 */
export const formatShortTimestampDate = (
  isoTimestamp: string,
  locale: string,
): string => renderParts(locale, new Date(isoTimestamp), undefined, false);
