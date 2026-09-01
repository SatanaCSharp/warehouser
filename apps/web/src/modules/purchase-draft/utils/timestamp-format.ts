import { formatTimestampDate } from 'shared/utils/date-format';

/**
 * The approved frames write the freeze moment to the minute — `22 Aug 2026,
 * 14:20` — because a draft frozen twice in one day has to be distinguishable
 * from itself (`previews/F0SpRx.png`). `shared/utils/date-format` renders the
 * calendar day every other ordering surface shows; only this module needs the
 * time beside it, so the pairing lives here rather than in `shared/`
 * (`placing-web-hooks.md` §3).
 *
 * The clock is 24-hour in both languages the application ships, matching the
 * frames; only the digits come from the active locale.
 */
const TIME_OPTIONS = {
  hour: '2-digit',
  hourCycle: 'h23',
  minute: '2-digit',
} as const;

export const formatTimestampMinutes = (
  isoTimestamp: string,
  locale: string,
): string =>
  `${formatTimestampDate(isoTimestamp, locale)}, ${new Intl.DateTimeFormat(
    locale,
    TIME_OPTIONS,
  ).format(new Date(isoTimestamp))}`;
