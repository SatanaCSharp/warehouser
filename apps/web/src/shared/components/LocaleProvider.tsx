import { I18nProvider } from '@react-aria/i18n';
import { useTranslation } from 'react-i18next';

import type { ReactElement, ReactNode } from 'react';

type LocaleProviderProps = { children: ReactNode };

/**
 * Publishes i18next's active language to React Aria, which every HeroUI v3
 * component that formats or parses a value reads through `useLocale`.
 *
 * Without it React Aria falls back to `navigator.language`, so a browser set
 * to English would render `FormDateField`'s segments as `mm/dd/yyyy` and name
 * the calendar's weekdays in English while the rest of the page is Ukrainian —
 * the same disagreement `i18n.ts` already resolves for `document.lang`, and
 * for the same reason: i18next owns the active language, so it also owns
 * everything that announces or formats in it.
 *
 * It sits in `main.tsx`'s provider chain rather than in `App.tsx`, which
 * provides the router and nothing else.
 */
export const LocaleProvider = ({
  children,
}: LocaleProviderProps): ReactElement => {
  const { i18n } = useTranslation();

  return (
    <I18nProvider locale={i18n.resolvedLanguage ?? 'en'}>
      {children}
    </I18nProvider>
  );
};
