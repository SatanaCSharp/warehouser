import i18n from 'i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import Backend from 'i18next-http-backend';
import { initReactI18next } from 'react-i18next';

export const supportedLanguages = ['en', 'uk'] as const;
export const namespaces = [
  'access',
  'common',
  'customer',
  'customer-order',
  'errors',
  'home',
  'item',
  'pending',
  'purchase-draft',
  'sign-in',
  'sign-up',
  'success',
  'validation',
  'warehouse',
  'workspace',
] as const;

export const i18nReady = i18n
  .use(Backend)
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    fallbackLng: 'en',
    debug: import.meta.env.DEV && import.meta.env.MODE !== 'test',
    supportedLngs: supportedLanguages,
    defaultNS: 'common',
    ns: namespaces,
    backend: {
      loadPath: '/locales/{{lng}}/{{ns}}.json',
    },
    interpolation: {
      escapeValue: false,
    },
  });

/**
 * `index.html` can only ship one static `lang`, and the detector may resolve a
 * different language before the first paint — so the document would keep
 * declaring English while rendering Ukrainian, and assistive technology would
 * pronounce it as English. i18next owns the active language, so it also owns
 * the attribute that announces it.
 */
const syncDocumentLanguage = (language: string): void => {
  document.documentElement.lang = language;
};

i18n.on('languageChanged', syncDocumentLanguage);
void i18nReady.then(() => syncDocumentLanguage(i18n.resolvedLanguage ?? 'en'));

export default i18n;
