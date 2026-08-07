import { createInstance } from 'i18next';
import { describe, expect, it } from 'vitest';

import { namespaces, supportedLanguages } from 'i18n';

import enAccess from '../public/locales/en/access.json';
import enCommon from '../public/locales/en/common.json';
import enErrors from '../public/locales/en/errors.json';
import enHome from '../public/locales/en/home.json';
import enSignIn from '../public/locales/en/sign-in.json';
import enSignUp from '../public/locales/en/sign-up.json';
import enSuccess from '../public/locales/en/success.json';
import enValidation from '../public/locales/en/validation.json';
import ukAccess from '../public/locales/uk/access.json';
import ukCommon from '../public/locales/uk/common.json';
import ukErrors from '../public/locales/uk/errors.json';
import ukHome from '../public/locales/uk/home.json';
import ukSignIn from '../public/locales/uk/sign-in.json';
import ukSignUp from '../public/locales/uk/sign-up.json';
import ukSuccess from '../public/locales/uk/success.json';
import ukValidation from '../public/locales/uk/validation.json';

const resources = {
  en: {
    access: enAccess,
    common: enCommon,
    errors: enErrors,
    home: enHome,
    'sign-in': enSignIn,
    'sign-up': enSignUp,
    success: enSuccess,
    validation: enValidation,
  },
  uk: {
    access: ukAccess,
    common: ukCommon,
    errors: ukErrors,
    home: ukHome,
    'sign-in': ukSignIn,
    'sign-up': ukSignUp,
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

const pluralSuffix = /_(?:zero|one|two|few|many|other)$/u;

const translationKeys = (value: object): string[] => [
  ...new Set(leafKeys(value).map((key) => key.replace(pluralSuffix, ''))),
];

describe('localization resources', () => {
  it('keeps registered namespaces and keys complete in every locale', () => {
    expect(Object.keys(resources.en).sort()).toEqual([...namespaces].sort());
    expect(Object.keys(resources.uk).sort()).toEqual([...namespaces].sort());
    expect(Object.keys(resources).sort()).toEqual(
      [...supportedLanguages].sort(),
    );

    for (const namespace of namespaces) {
      expect(translationKeys(resources.uk[namespace]).sort()).toEqual(
        translationKeys(resources.en[namespace]).sort(),
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

    expect(instance.t('form.submit', { ns: 'sign-in' })).toBe('Sign in');
    expect(instance.t('api.network', { ns: 'errors' })).toBe(
      'Check your connection and try again.',
    );

    await instance.changeLanguage('uk');
    expect(instance.t('form.submit', { ns: 'sign-in' })).toBe('Увійти');
    expect(instance.t('auth.signUp', { ns: 'success' })).toBe(
      'Ваш обліковий запис створено.',
    );
  });

  it('adds shell/menu/selector keys and drops obsolete per-action keys (CR-AC-11)', async () => {
    const instance = createInstance();
    await instance.init({
      fallbackLng: 'en',
      lng: 'en',
      ns: namespaces,
      resources,
    });

    expect(
      instance.t('members.actions', { ns: 'access', email: 'a@b.test' }),
    ).toBe('Actions for a@b.test');
    expect(instance.t('members.menu.editEmail', { ns: 'access' })).toBe(
      'Edit email',
    );
    expect(instance.t('members.menu.resetPassword', { ns: 'access' })).toBe(
      'Reset password',
    );
    expect(instance.t('members.menu.deleteMember', { ns: 'access' })).toBe(
      'Delete member',
    );
    expect(instance.exists('members.editEmail', { ns: 'access' })).toBe(false);
    expect(instance.exists('members.resetPassword', { ns: 'access' })).toBe(
      false,
    );
    expect(instance.exists('members.deleteMember', { ns: 'access' })).toBe(
      false,
    );

    expect(instance.t('nav.dashboard', { ns: 'common' })).toBe('Dashboard');
    expect(instance.t('nav.access', { ns: 'common' })).toBe('Access');
    expect(instance.t('nav.label', { ns: 'common' })).toBe(
      'Primary navigation',
    );
    expect(instance.t('nav.toggle', { ns: 'common' })).toBe('Open navigation');
    expect(instance.t('language.label', { ns: 'common' })).toBe(
      'Change language',
    );
    expect(instance.t('language.english', { ns: 'common' })).toBe('English');
    expect(instance.t('language.ukrainian', { ns: 'common' })).toBe(
      'Українська',
    );

    await instance.changeLanguage('uk');
    expect(instance.t('members.menu.editEmail', { ns: 'access' })).toBe(
      'Змінити електронну адресу',
    );
    expect(instance.t('nav.dashboard', { ns: 'common' })).toBe('Дашборд');
    expect(instance.t('nav.access', { ns: 'common' })).toBe('Доступ');
    // Fixed native-name labels never change with the active locale (CR-AC-06).
    expect(instance.t('language.english', { ns: 'common' })).toBe('English');
    expect(instance.t('language.ukrainian', { ns: 'common' })).toBe(
      'Українська',
    );
  });
});
