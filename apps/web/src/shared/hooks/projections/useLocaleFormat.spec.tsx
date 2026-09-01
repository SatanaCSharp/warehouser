import { I18nProvider } from '@react-aria/i18n';
import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { useLocaleFormat } from 'shared/hooks/projections/useLocaleFormat';
import { QUANTITY_GROUP_SEPARATOR } from 'shared/utils/number-format';

import type { ReactElement, ReactNode } from 'react';

const inLocale =
  (locale: string) =>
  ({ children }: { children: ReactNode }): ReactElement => (
    <I18nProvider locale={locale}>{children}</I18nProvider>
  );

describe('useLocaleFormat', () => {
  it('binds the three formatters to the locale the page is rendered in', () => {
    const { result } = renderHook(() => useLocaleFormat(), {
      wrapper: inLocale('en'),
    });

    expect(result.current.calendarDate('2026-08-25')).toBe('25 Aug 2026');
    expect(result.current.timestampDate('2026-08-25T09:30:00.000Z')).toBe(
      '25 Aug 2026',
    );
    expect(result.current.quantity(1200)).toBe(
      `1${QUANTITY_GROUP_SEPARATOR}200`,
    );
  });

  it('names the month in the active language', () => {
    const { result } = renderHook(() => useLocaleFormat(), {
      wrapper: inLocale('uk'),
    });

    expect(result.current.calendarDate('2026-08-25')).toMatch(/^25 \S+ 2026$/u);
    expect(result.current.calendarDate('2026-08-25')).not.toContain('Aug');
  });

  it('keeps one identity while the locale is unchanged, so it may be a dependency', () => {
    const { result, rerender } = renderHook(() => useLocaleFormat(), {
      wrapper: inLocale('en'),
    });
    const first = result.current;

    rerender();

    expect(result.current).toBe(first);
  });
});
