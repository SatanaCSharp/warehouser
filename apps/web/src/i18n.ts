import i18n from 'i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import Backend from 'i18next-http-backend';
import { initReactI18next } from 'react-i18next';

export const supportedLanguages = ['en', 'uk'] as const;
export const namespaces = [
  'common',
  'errors',
  'home',
  'sign-in',
  'sign-up',
  'success',
  'validation',
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

export default i18n;
