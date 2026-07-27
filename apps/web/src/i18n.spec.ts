import { createInstance } from 'i18next';
import { describe, expect, it } from 'vitest';

import { namespaces, supportedLanguages } from 'i18n';

import enCommon from '../public/locales/en/common.json';
import enErrors from '../public/locales/en/errors.json';
import enHome from '../public/locales/en/home.json';
import enSignIn from '../public/locales/en/sign-in.json';
import enSuccess from '../public/locales/en/success.json';
import enValidation from '../public/locales/en/validation.json';
import ukCommon from '../public/locales/uk/common.json';
import ukErrors from '../public/locales/uk/errors.json';
import ukHome from '../public/locales/uk/home.json';
import ukSignIn from '../public/locales/uk/sign-in.json';
import ukSuccess from '../public/locales/uk/success.json';
import ukValidation from '../public/locales/uk/validation.json';

const resources = {
  en: {
    common: enCommon,
    errors: enErrors,
    home: enHome,
    'sign-in': enSignIn,
    success: enSuccess,
    validation: enValidation,
  },
  uk: {
    common: ukCommon,
    errors: ukErrors,
    home: ukHome,
    'sign-in': ukSignIn,
    success: ukSuccess,
    validation: ukValidation,
  },
} as const;

const leafKeys = (value: object, prefix = ''): string[] =>
  Object.entries(value).flatMap(([key, child]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    return typeof child === 'object' && child !== null
      ? leafKeys(child as object, path)
      : [path];
  });

describe('localization resources', () => {
  it('keeps registered namespaces and keys complete in every locale', () => {
    expect(Object.keys(resources.en).sort()).toEqual([...namespaces].sort());
    expect(Object.keys(resources.uk).sort()).toEqual([...namespaces].sort());
    expect(Object.keys(resources).sort()).toEqual(
      [...supportedLanguages].sort(),
    );

    for (const namespace of namespaces) {
      expect(leafKeys(resources.uk[namespace]).sort()).toEqual(
        leafKeys(resources.en[namespace]).sort(),
      );
    }
  });

  it('resolves real keys and switches languages', async () => {
    const instance = createInstance();
    await instance.init({
      fallbackLng: 'en',
      lng: 'en',
      ns: namespaces,
      resources,
    });

    expect(instance.t('form.submit', { ns: 'sign-in' })).toBe('Log in');
    expect(instance.t('api.network', { ns: 'errors' })).toBe(
      'Check your connection and try again.',
    );

    await instance.changeLanguage('uk');
    expect(instance.t('form.submit', { ns: 'sign-in' })).toBe('Увійти');
    expect(instance.t('auth.signUp', { ns: 'success' })).toBe(
      'Ваш обліковий запис створено.',
    );
  });
});
