import { useLocale } from '@react-aria/i18n';
import { useCallback } from 'react';

import { formatTimestampMinutes } from 'modules/purchase-draft/utils/timestamp-format';

/**
 * Renders an ISO-8601 instant as `22 Aug 2026, 14:20` — the shape the frames
 * write the freeze moment, the Demand Snapshot's capture moment and every
 * lifecycle attribution in (`previews/F0SpRx.png`).
 *
 * The locale is React Aria's, exactly as `useLocaleFormat` reads it, so a
 * moment rendered here and a date rendered through the shared formatter cannot
 * disagree about the month's name.
 */
export const useMinuteTimestamp = (): ((isoTimestamp: string) => string) => {
  const { locale } = useLocale();

  return useCallback(
    (isoTimestamp: string) => formatTimestampMinutes(isoTimestamp, locale),
    [locale],
  );
};
