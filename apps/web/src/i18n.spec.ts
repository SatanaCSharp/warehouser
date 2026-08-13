import { createInstance } from 'i18next';
import { describe, expect, it } from 'vitest';

import { namespaces, supportedLanguages } from 'i18n';

import enAccess from '../public/locales/en/access.json';
import enCommon from '../public/locales/en/common.json';
import enErrors from '../public/locales/en/errors.json';
import enHome from '../public/locales/en/home.json';
import enPending from '../public/locales/en/pending.json';
import enSignIn from '../public/locales/en/sign-in.json';
import enSignUp from '../public/locales/en/sign-up.json';
import enSuccess from '../public/locales/en/success.json';
import enValidation from '../public/locales/en/validation.json';
import enWorkspace from '../public/locales/en/workspace.json';
import ukAccess from '../public/locales/uk/access.json';
import ukCommon from '../public/locales/uk/common.json';
import ukErrors from '../public/locales/uk/errors.json';
import ukHome from '../public/locales/uk/home.json';
import ukPending from '../public/locales/uk/pending.json';
import ukSignIn from '../public/locales/uk/sign-in.json';
import ukSignUp from '../public/locales/uk/sign-up.json';
import ukSuccess from '../public/locales/uk/success.json';
import ukValidation from '../public/locales/uk/validation.json';
import ukWorkspace from '../public/locales/uk/workspace.json';

const resources = {
  en: {
    access: enAccess,
    common: enCommon,
    errors: enErrors,
    home: enHome,
    pending: enPending,
    'sign-in': enSignIn,
    'sign-up': enSignUp,
    success: enSuccess,
    validation: enValidation,
    workspace: enWorkspace,
  },
  uk: {
    access: ukAccess,
    common: ukCommon,
    errors: ukErrors,
    home: ukHome,
    pending: ukPending,
    'sign-in': ukSignIn,
    'sign-up': ukSignUp,
    success: ukSuccess,
    validation: ukValidation,
    workspace: ukWorkspace,
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

  it('translates permission ids and falls back to the server label when a key is missing', async () => {
    const instance = createInstance();
    await instance.init({
      fallbackLng: 'en',
      lng: 'en',
      ns: namespaces,
      resources,
    });

    expect(instance.t('permissions.items.USERS_CREATE', { ns: 'access' })).toBe(
      'Create users',
    );
    expect(
      instance.t('permissions.items.UNKNOWN:PERMISSION'.replace(':', '_'), {
        ns: 'access',
        defaultValue: 'Server-provided label',
      }),
    ).toBe('Server-provided label');

    await instance.changeLanguage('uk');
    expect(instance.t('permissions.items.USERS_CREATE', { ns: 'access' })).toBe(
      'Створити користувачів',
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

describe('workspace-warehouse T1 shell/enter-action keys', () => {
  it('resolves the grouped context-switcher, refusal, no-context and enter-action keys added by workspace-warehouse T1', async () => {
    const instance = createInstance();
    await instance.init({
      fallbackLng: 'en',
      lng: 'en',
      ns: namespaces,
      resources,
    });

    expect(
      instance.t('shell.contextSwitcher.triggerLabel', {
        ns: 'common',
        context: 'Central DC',
      }),
    ).toBe('Context switcher, Central DC');
    expect(
      instance.t('shell.contextSwitcher.triggerLabelNoContext', {
        ns: 'common',
      }),
    ).toBe('Context switcher, choose a context');
    expect(
      instance.t('shell.contextSwitcher.workspaceGroupLabel', {
        ns: 'common',
      }),
    ).toBe('Workspace');
    expect(
      instance.t('shell.contextSwitcher.warehousesGroupLabel', {
        ns: 'common',
      }),
    ).toBe('Warehouses');
    expect(
      instance.t('shell.contextSwitcher.currentLabel', { ns: 'common' }),
    ).toBe('Current');
    expect(
      instance.t('shell.contextSwitcher.archivedLabel', { ns: 'common' }),
    ).toBe('Archived');
    expect(
      instance.t('shell.contextSwitcher.noAccessLabel', { ns: 'common' }),
    ).toBe('No access');
    expect(
      instance.t('shell.contextSwitcher.workspaceNoAccessExplanation', {
        ns: 'common',
      }),
    ).toBe('You do not have access to the workspace.');
    expect(instance.t('shell.noContext.heading', { ns: 'common' })).toBe(
      'Nothing is entered yet',
    );
    // T30 / CR-AC-18 — the line names no direction (the switcher is above the
    // content at every viewport, never below it) and no action (paragraph 2
    // offers none at all to an actor holding no selectable row); it states what
    // the control carries and leaves the offer to the control itself.
    expect(instance.t('shell.noContext.description', { ns: 'common' })).toBe(
      'The context switcher lists the workspace and any warehouses you can enter.',
    );
    expect(instance.t('shell.entryRefusal.heading', { ns: 'common' })).toBe(
      "This address isn't available to you",
    );
    expect(instance.t('shell.entryRefusal.description', { ns: 'common' })).toBe(
      'Use the switcher to go somewhere you have access to.',
    );
    expect(
      instance.t('shell.archivedEntryRefusal.heading', { ns: 'common' }),
    ).toBe('This warehouse is archived');
    expect(
      instance.t('shell.archivedEntryRefusal.description', { ns: 'common' }),
    ).toBe(
      "Archived warehouses can't be entered. Your access to other warehouses is unchanged.",
    );
    expect(instance.t('shell.landing.pendingLabel', { ns: 'common' })).toBe(
      'Preparing your workspace…',
    );
    expect(instance.t('shell.landing.errorHeading', { ns: 'common' })).toBe(
      'Something went wrong',
    );
    expect(instance.t('shell.landing.errorDescription', { ns: 'common' })).toBe(
      "We couldn't check your access. Try again.",
    );
    expect(instance.t('shell.landing.retry', { ns: 'common' })).toBe(
      'Try again',
    );
    expect(instance.t('warehouses.enter', { ns: 'workspace' })).toBe('Enter');
  });

  it('drops the switcher keys this change request orphaned', async () => {
    const instance = createInstance();
    await instance.init({
      fallbackLng: 'en',
      lng: 'en',
      ns: namespaces,
      resources,
    });

    expect(instance.exists('workspaceSwitcher.label', { ns: 'common' })).toBe(
      false,
    );
    expect(
      instance.exists('workspaceSwitcher.archivedReason', { ns: 'common' }),
    ).toBe(false);
    expect(
      instance.exists('workspaceSwitcher.empty.action', { ns: 'common' }),
    ).toBe(false);
    expect(
      instance.exists('shell.contextSwitcher.workspaceRowLabel', {
        ns: 'common',
      }),
    ).toBe(false);
  });

  it('resolves the same shell/enter-action keys in Ukrainian', async () => {
    const instance = createInstance();
    await instance.init({
      fallbackLng: 'en',
      lng: 'uk',
      ns: namespaces,
      resources,
    });

    expect(
      instance.t('shell.contextSwitcher.triggerLabel', {
        ns: 'common',
        context: 'Central DC',
      }),
    ).toBe('Перемикач контексту, Central DC');
    expect(
      instance.t('shell.contextSwitcher.triggerLabelNoContext', {
        ns: 'common',
      }),
    ).toBe('Перемикач контексту, оберіть контекст');
    expect(
      instance.t('shell.contextSwitcher.workspaceGroupLabel', {
        ns: 'common',
      }),
    ).toBe('Робочий простір');
    expect(
      instance.t('shell.contextSwitcher.warehousesGroupLabel', {
        ns: 'common',
      }),
    ).toBe('Склади');
    expect(
      instance.t('shell.contextSwitcher.currentLabel', { ns: 'common' }),
    ).toBe('Поточний');
    expect(
      instance.t('shell.contextSwitcher.archivedLabel', { ns: 'common' }),
    ).toBe('Архівовано');
    expect(
      instance.t('shell.contextSwitcher.noAccessLabel', { ns: 'common' }),
    ).toBe('Немає доступу');
    expect(instance.t('shell.noContext.heading', { ns: 'common' })).toBe(
      'Ще нічого не обрано',
    );
    expect(instance.t('shell.noContext.description', { ns: 'common' })).toBe(
      'Перемикач контексту показує робочий простір і склади, до яких ви можете увійти.',
    );
    expect(instance.t('shell.entryRefusal.heading', { ns: 'common' })).toBe(
      'Ця адреса вам недоступна',
    );
    expect(
      instance.t('shell.archivedEntryRefusal.heading', { ns: 'common' }),
    ).toBe('Цей склад в архіві');
    expect(instance.t('shell.landing.retry', { ns: 'common' })).toBe(
      'Спробувати знову',
    );
    expect(instance.t('warehouses.enter', { ns: 'workspace' })).toBe('Увійти');
  });
});
