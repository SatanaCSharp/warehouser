import { useLocale } from '@react-aria/i18n';
import { render, screen } from '@testing-library/react';
import type { ReactElement } from 'react';
import { LocaleProvider } from 'shared/components/LocaleProvider';
import { describe, expect, it, vi } from 'vitest';

// The provider that keeps React Aria and i18next from disagreeing about the active language. It had
// no spec, and the disagreement it prevents is silent: React Aria falls back to `navigator.language`
// on its own, so a browser set to English renders `FormDateField` as `mm/dd/yyyy` and names the
// calendar's weekdays in English while the rest of the page is Ukrainian. Nothing throws — the page
// is simply half-translated — which is exactly the kind of defect a test has to hold.
//
// `useLocale` is what every HeroUI v3 component that formats or parses a value reads, so the
// assertion is made through it rather than through the rendered DOM of some component that happens
// to use it.

const mockLanguage = vi.hoisted(() => ({ resolvedLanguage: 'en' as unknown }));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ i18n: mockLanguage }),
}));

const ReportedLocale = (): ReactElement => {
  const { locale } = useLocale();

  return <span data-testid="locale">{locale}</span>;
};

const renderUnderLanguage = (resolvedLanguage: unknown): void => {
  mockLanguage.resolvedLanguage = resolvedLanguage;
  render(
    <LocaleProvider>
      <ReportedLocale />
    </LocaleProvider>,
  );
};

describe('LocaleProvider', () => {
  it('publishes the language i18next resolved to React Aria', () => {
    renderUnderLanguage('uk');

    expect(screen.getByTestId('locale')).toHaveTextContent('uk');
  });

  // i18next reports `undefined` until its resources have loaded. React Aria's own fallback at that
  // moment is the browser's language, which is the disagreement this provider exists to prevent —
  // so the fallback is stated here rather than left to the environment.
  it('falls back to English before i18next has resolved a language', () => {
    renderUnderLanguage(undefined);

    expect(screen.getByTestId('locale')).toHaveTextContent('en');
  });
});
