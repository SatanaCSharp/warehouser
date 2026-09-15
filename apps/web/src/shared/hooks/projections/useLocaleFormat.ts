import { useLocale } from '@react-aria/i18n';
import { useMemo } from 'react';
import {
  formatCalendarDate,
  formatShortCalendarDate,
  formatShortTimestampDate,
  formatTimestampDate,
} from 'shared/utils/date-format';
import { formatQuantity } from 'shared/utils/number-format';

export type LocaleFormat = {
  /** A plain `YYYY-MM-DD` date as `25 Aug 2026`, with no timezone shift. */
  calendarDate: (isoDate: string) => string;
  /** An ISO-8601 timestamp as the calendar date it falls on, same shape. */
  timestampDate: (isoTimestamp: string) => string;
  /** A plain date as `5 Sep`, where the surrounding line establishes the year. */
  shortCalendarDate: (isoDate: string) => string;
  /** A timestamp as `24 Aug`, the shape the on-hand reason line draws. */
  shortTimestampDate: (isoTimestamp: string) => string;
  /** A whole quantity, group-separated as the frames draw it (`1 200`). */
  quantity: (value: number) => string;
};

/**
 * The formatters every ordering surface renders through, already bound to
 * the language the page is rendered in.
 *
 * The locale comes from `useLocale()` — React Aria's, published by
 * `shared/components/LocaleProvider` from i18next's resolved language — rather
 * than from `navigator.language` or a second `useTranslation()` read, so a date
 * in a table and a date inside a `FormDateField` can never disagree about the
 * month's name (frontend-architecture.md §"Runtime foundation").
 *
 * The pure functions behind it live in `shared/utils/` and take the locale
 * explicitly, so a formatter can also be exercised without a React tree.
 */
export const useLocaleFormat = (): LocaleFormat => {
  const { locale } = useLocale();

  return useMemo(
    () => ({
      calendarDate: (isoDate: string): string =>
        formatCalendarDate(isoDate, locale),
      timestampDate: (isoTimestamp: string): string =>
        formatTimestampDate(isoTimestamp, locale),
      shortCalendarDate: (isoDate: string): string =>
        formatShortCalendarDate(isoDate, locale),
      shortTimestampDate: (isoTimestamp: string): string =>
        formatShortTimestampDate(isoTimestamp, locale),
      quantity: (value: number): string => formatQuantity(value, locale),
    }),
    [locale],
  );
};
