import { namespaces, supportedLanguages } from 'i18n';
import { createInstance } from 'i18next';
import localeBaseline from 'test/locale-baseline.json';
import { describe, expect, it } from 'vitest';

import enAccess from '../public/locales/en/access.json';
import enCommon from '../public/locales/en/common.json';
import enCustomer from '../public/locales/en/customer.json';
import enCustomerOrder from '../public/locales/en/customer-order.json';
import enErrors from '../public/locales/en/errors.json';
import enHome from '../public/locales/en/home.json';
import enItem from '../public/locales/en/item.json';
import enPending from '../public/locales/en/pending.json';
import enPurchaseDraft from '../public/locales/en/purchase-draft.json';
import enSignIn from '../public/locales/en/sign-in.json';
import enSignUp from '../public/locales/en/sign-up.json';
import enSuccess from '../public/locales/en/success.json';
import enValidation from '../public/locales/en/validation.json';
import enWarehouse from '../public/locales/en/warehouse.json';
import enWorkspace from '../public/locales/en/workspace.json';
import ukAccess from '../public/locales/uk/access.json';
import ukCommon from '../public/locales/uk/common.json';
import ukCustomer from '../public/locales/uk/customer.json';
import ukCustomerOrder from '../public/locales/uk/customer-order.json';
import ukErrors from '../public/locales/uk/errors.json';
import ukHome from '../public/locales/uk/home.json';
import ukItem from '../public/locales/uk/item.json';
import ukPending from '../public/locales/uk/pending.json';
import ukPurchaseDraft from '../public/locales/uk/purchase-draft.json';
import ukSignIn from '../public/locales/uk/sign-in.json';
import ukSignUp from '../public/locales/uk/sign-up.json';
import ukSuccess from '../public/locales/uk/success.json';
import ukValidation from '../public/locales/uk/validation.json';
import ukWarehouse from '../public/locales/uk/warehouse.json';
import ukWorkspace from '../public/locales/uk/workspace.json';

const resources = {
  en: {
    access: enAccess,
    common: enCommon,
    customer: enCustomer,
    'customer-order': enCustomerOrder,
    errors: enErrors,
    home: enHome,
    item: enItem,
    pending: enPending,
    'purchase-draft': enPurchaseDraft,
    'sign-in': enSignIn,
    'sign-up': enSignUp,
    success: enSuccess,
    validation: enValidation,
    warehouse: enWarehouse,
    workspace: enWorkspace,
  },
  uk: {
    access: ukAccess,
    common: ukCommon,
    customer: ukCustomer,
    'customer-order': ukCustomerOrder,
    errors: ukErrors,
    home: ukHome,
    item: ukItem,
    pending: ukPending,
    'purchase-draft': ukPurchaseDraft,
    'sign-in': ukSignIn,
    'sign-up': ukSignUp,
    success: ukSuccess,
    validation: ukValidation,
    warehouse: ukWarehouse,
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

// --- Locale identity baseline (modules-level-refactor T2, CR-RG-04) ------------------------------
//
// `test/locale-baseline.json` is every key and value in both languages, captured at
// `baseline_revision`. CR-RG-04 lets a key change the **namespace** it lives in, and lets its path
// within that namespace change in exactly one place — `access.json`'s three scope-named parents,
// which are forced because `access.json` already holds warehouse-scoped `roles`, `members` and
// `permissions`. Everything else must come out byte-identical.
//
// The gate expresses that by mapping the current tree back onto the baseline's coordinates through
// the closed list of relocations the change request permits, then requiring exact equality. A
// relocation that is not on this list, a changed value, an added key or a dropped key all surface as
// a difference. The list is closed by design: extending it is a deliberate, reviewable act.

type LocaleSnapshot = Record<string, Record<string, Record<string, string>>>;

type Relocation = {
  fromNamespace: string;
  fromPrefix: string;
  toNamespace: string;
  toPrefix: string;
};

const PERMITTED_RELOCATIONS: Relocation[] = [
  // CR-AC-01 — `workspace.json#warehouses` becomes the `warehouse` namespace, still nested under
  // `warehouses`, so only the namespace argument of `t()` changes.
  {
    fromNamespace: 'warehouse',
    fromPrefix: 'warehouses',
    toNamespace: 'workspace',
    toPrefix: 'warehouses',
  },
  // CR-AC-02 — the workspace-scoped access blocks join `access.json` under scope-named parents.
  {
    fromNamespace: 'access',
    fromPrefix: 'workspaceRoles',
    toNamespace: 'workspace',
    toPrefix: 'workspaceRoles',
  },
  {
    fromNamespace: 'access',
    fromPrefix: 'workspaceMembers',
    toNamespace: 'workspace',
    toPrefix: 'members',
  },
  {
    fromNamespace: 'access',
    fromPrefix: 'workspacePermissions',
    toNamespace: 'workspace',
    toPrefix: 'permissions',
  },
];

const localeFiles = import.meta.glob<Record<string, unknown>>(
  '../public/locales/*/*.json',
  { eager: true, import: 'default' },
);

const flatten = (value: object, prefix = ''): [string, string][] =>
  Object.entries(value).flatMap(([key, child]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    return typeof child === 'object' && child !== null
      ? flatten(child as object, path)
      : [[path, String(child)] as [string, string]];
  });

/** Every key and value currently on disk, read from the real locale directories rather than from a
 * fixed import list, so a namespace added or removed by a move is seen rather than missed. */
const currentSnapshot = (): LocaleSnapshot => {
  const snapshot: LocaleSnapshot = {};
  for (const [file, contents] of Object.entries(localeFiles)) {
    const [language, fileName] = file.split('/').slice(-2);
    const namespace = fileName.replace(/\.json$/u, '');
    snapshot[language] ??= {};
    snapshot[language][namespace] = Object.fromEntries(flatten(contents));
  }
  return snapshot;
};

const relocationFor = (
  namespace: string,
  path: string,
): Relocation | undefined =>
  PERMITTED_RELOCATIONS.find(
    (relocation) =>
      relocation.fromNamespace === namespace &&
      (path === relocation.fromPrefix ||
        path.startsWith(`${relocation.fromPrefix}.`)),
  );

/** Rewrites the current snapshot into the baseline's coordinates by undoing the permitted
 * relocations. Anything the list does not cover keeps its own namespace and path, and therefore
 * has to match the baseline exactly. */
const inBaselineCoordinates = (snapshot: LocaleSnapshot): LocaleSnapshot => {
  const rewritten: LocaleSnapshot = {};
  for (const [language, byNamespace] of Object.entries(snapshot)) {
    rewritten[language] = {};
    for (const [namespace, entries] of Object.entries(byNamespace)) {
      for (const [path, value] of Object.entries(entries)) {
        const relocation = relocationFor(namespace, path);
        const targetNamespace = relocation?.toNamespace ?? namespace;
        const targetPath = relocation
          ? `${relocation.toPrefix}${path.slice(relocation.fromPrefix.length)}`
          : path;
        rewritten[language][targetNamespace] ??= {};
        rewritten[language][targetNamespace][targetPath] = value;
      }
      // A namespace whose every key relocated away disappears with them, rather than remaining as
      // an empty object the baseline has no counterpart for.
      rewritten[language][namespace] ??= {};
    }
    for (const [namespace, entries] of Object.entries(rewritten[language])) {
      if (Object.keys(entries).length === 0) {
        delete rewritten[language][namespace];
      }
    }
  }
  return rewritten;
};

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
    // The collapsible sidebar's two directions, resolved in both languages
    // because the control's accessible name is the only thing naming it on the
    // rail (`adding-and-maintaining-web-localization.md` §"Add a translation
    // key", step 6).
    expect(instance.t('nav.collapse', { ns: 'common' })).toBe(
      'Collapse navigation',
    );
    expect(instance.t('nav.expand', { ns: 'common' })).toBe(
      'Expand navigation',
    );
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
    expect(instance.t('nav.collapse', { ns: 'common' })).toBe(
      'Згорнути навігацію',
    );
    expect(instance.t('nav.expand', { ns: 'common' })).toBe(
      'Розгорнути навігацію',
    );
    // Fixed native-name labels never change with the active locale (CR-AC-06).
    expect(instance.t('language.english', { ns: 'common' })).toBe('English');
    expect(instance.t('language.ukrainian', { ns: 'common' })).toBe(
      'Українська',
    );
  });
});

describe('locale identity baseline (modules-level-refactor CR-RG-04)', () => {
  it('keeps every key and value identical to the baseline capture', () => {
    expect(inBaselineCoordinates(currentSnapshot())).toEqual(localeBaseline);
  });

  // The allowance itself is asserted, not just applied: widening it is how "the values are all
  // still there, only re-keyed" would quietly become true of copy that actually changed.
  it('allows a key path to move only under the scope-named access parents', () => {
    const pathChanging = PERMITTED_RELOCATIONS.filter(
      (relocation) => relocation.fromPrefix !== relocation.toPrefix,
    ).map(
      (relocation) =>
        `${relocation.toNamespace}:${relocation.toPrefix} -> ${relocation.fromNamespace}:${relocation.fromPrefix}`,
    );

    expect(pathChanging.sort()).toEqual([
      'workspace:members -> access:workspaceMembers',
      'workspace:permissions -> access:workspacePermissions',
    ]);
    // The third scope-named parent is already scope-named in `workspace.json`, so its path is
    // carried over unchanged and only its namespace moves.
    expect(
      PERMITTED_RELOCATIONS.filter(
        (relocation) => relocation.fromPrefix === relocation.toPrefix,
      ).map((relocation) => relocation.fromPrefix),
    ).toEqual(['warehouses', 'workspaceRoles']);
  });

  it('gives both languages the same key paths in the same namespaces', () => {
    const current = currentSnapshot();
    const normalize = (entries: Record<string, string>): string[] =>
      [
        ...new Set(
          Object.keys(entries).map((key) => key.replace(pluralSuffix, '')),
        ),
      ].sort();

    expect(Object.keys(current.uk).sort()).toEqual(
      Object.keys(current.en).sort(),
    );
    for (const namespace of Object.keys(current.en)) {
      expect(normalize(current.uk[namespace])).toEqual(
        normalize(current.en[namespace]),
      );
    }
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
    // AC-23 — an archived Warehouse IS entered now, read-only, so the sentence
    // that said it could not be entered was no longer true. The refusal it
    // accompanies is the Access address alone (CR-AC-17), which is what the
    // replacement copy names.
    expect(
      instance.t('shell.archivedEntryRefusal.description', { ns: 'common' }),
    ).toBe(
      "Archived warehouses aren't administered here. What one already holds stays readable to everyone permitted to read it.",
    );
    expect(instance.t('shell.archivedWarehouse.chip', { ns: 'common' })).toBe(
      'Archived warehouse',
    );
    expect(
      instance.t('shell.archivedWarehouse.heading', { ns: 'common' }),
    ).toBe('This warehouse has been archived');
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
    expect(instance.t('warehouses.enter', { ns: 'warehouse' })).toBe('Enter');
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
    expect(instance.t('warehouses.enter', { ns: 'warehouse' })).toBe('Увійти');
  });
});

// --- global-loader CR-AC-12 / CH-12 -------------------------------------------------------------
//
// Every destination now paints complete behind a route loader, so the seven per-language skeleton
// labels those destinations used to announce themselves with have no reader left. They are pinned
// as *absent* rather than merely unused: an orphaned `loading` key is an invitation to write an
// eighth waiting affordance against it, which is the outcome `spec.md` §6 (seven affordances → one)
// exists to prevent. `common.json` `shell.landing.pendingLabel` — `RoutePendingState.tsx:22`'s copy
// — is the one that survives, so it is asserted present in the same breath.

type LocaleNamespace = keyof (typeof resources)['en'];

/** The seven keys CR-AC-12 enumerates, each named by the namespace that used to hold it. */
const ORPHANED_WAITING_KEYS: [namespace: LocaleNamespace, key: string][] = [
  ['access', 'loading'],
  ['access', 'members.loading'],
  ['access', 'workspaceRoles.loading'],
  ['access', 'workspaceMembers.loading'],
  ['access', 'workspacePermissions.loading'],
  ['warehouse', 'warehouses.loading'],
  ['workspace', 'loading'],
];

// T17 — the ordering web shell registers three module-named namespaces
// (sad.md §8 Naming: `customer-order`, `purchase-draft`, `item`) with full
// en/uk key parity (adding-and-maintaining-web-localization.md §"Add a
// namespace"). None of the three is registered in `i18n.ts` yet, and none of
// the six locale files exists on disk, so every assertion below fails against
// the current tree rather than against a missing static import — the real
// resource assembly is read through `currentSnapshot()`'s `import.meta.glob`,
// which simply omits files that are not there yet.
describe('ordering web shell localization (T17)', () => {
  const orderingNamespaces = ['customer-order', 'purchase-draft', 'item'];

  it('registers the customer-order, purchase-draft and item namespaces', () => {
    for (const namespace of orderingNamespaces) {
      expect(namespaces).toContain(namespace);
    }
  });

  it('serves a locale file for each ordering namespace in every supported language', () => {
    const current = currentSnapshot();

    for (const language of supportedLanguages) {
      for (const namespace of orderingNamespaces) {
        expect(
          Object.keys(current[language] ?? {}),
          `${language}/${namespace}.json`,
        ).toContain(namespace);
      }
    }
  });

  it('gives the ordering namespaces full en/uk key parity', () => {
    const current = currentSnapshot();
    const normalize = (entries: Record<string, string> | undefined): string[] =>
      [
        ...new Set(
          Object.keys(entries ?? {}).map((key) =>
            key.replace(pluralSuffix, ''),
          ),
        ),
      ].sort();

    for (const namespace of orderingNamespaces) {
      expect(normalize(current.uk?.[namespace])).toEqual(
        normalize(current.en?.[namespace]),
      );
      // Fails loudly rather than passing on two empty arrays when the
      // namespace file does not exist in either language yet.
      expect(normalize(current.en?.[namespace]).length).toBeGreaterThan(0);
    }
  });
});

describe('global-loader waiting copy (CR-AC-12)', () => {
  it.each(supportedLanguages)(
    'holds none of the seven orphaned skeleton labels in %s',
    (language) => {
      const present = ORPHANED_WAITING_KEYS.filter(([namespace, key]) =>
        translationKeys(resources[language][namespace]).includes(key),
      ).map(([namespace, key]) => `${namespace}:${key}`);

      expect(present).toEqual([]);
    },
  );

  it('keeps both languages on the identical key set after the removal', () => {
    for (const namespace of namespaces) {
      expect(translationKeys(resources.uk[namespace]).sort()).toEqual(
        translationKeys(resources.en[namespace]).sort(),
      );
    }
  });

  it.each(supportedLanguages)(
    'keeps the surviving pending label the application renders in %s',
    async (language) => {
      const instance = createInstance();
      await instance.init({
        fallbackLng: 'en',
        lng: language,
        ns: namespaces,
        resources,
      });

      expect(
        translationKeys(resources[language].common).includes(
          'shell.landing.pendingLabel',
        ),
      ).toBe(true);
      expect(
        instance.t('shell.landing.pendingLabel', { ns: 'common' }),
      ).not.toBe('shell.landing.pendingLabel');
    },
  );
});

// --- the Warehouse detail pane's Cancel (delivery-addresses design review) ----------------------
//
// `warehouses.detail.cancel` was declared in both languages and rendered by nothing, while the
// warehouse detail pane the design draws
// (`docs/features/delivery-addresses/previews/warehouse-address-desktop-v1.html`) shows a Cancel
// beside the primary of every editable block. The key is now the label of the reset control in
// `WarehouseNameForm` and `WarehouseDeliveryAddressForm`, so it is pinned as *resolvable copy* in
// each supported language rather than left as an orphan a later change could quietly delete.
describe('warehouse detail Cancel copy (delivery-addresses design review)', () => {
  /** Total over the supported languages, so adding one fails to compile until it is translated. */
  const CANCEL_LABEL: Record<(typeof supportedLanguages)[number], string> = {
    en: 'Cancel',
    uk: 'Скасувати',
  };

  it.each(supportedLanguages)(
    'resolves the detail pane Cancel label in %s',
    async (language) => {
      const instance = createInstance();
      await instance.init({
        fallbackLng: 'en',
        lng: language,
        ns: namespaces,
        resources,
      });

      expect(
        translationKeys(resources[language].warehouse).includes(
          'warehouses.detail.cancel',
        ),
      ).toBe(true);
      expect(instance.t('warehouses.detail.cancel', { ns: 'warehouse' })).toBe(
        CANCEL_LABEL[language],
      );
    },
  );
});

// The copy the delivery-addresses design pass added to the `purchase-draft`
// namespace: the destination field's label and caption (keyed by tense and by
// Delivery Mode), the via-warehouse reading of an Address Drift, the by-line
// drift warning, the recorded-ending chip, and the two titles the per-line
// ending modal's information panels carry. Each is resolved through the real
// resource assembly in **both** languages, because a key present in only one
// of them is the commonest localization failure this repository has
// (`adding-and-maintaining-web-localization.md` §"Common failures").
describe('delivery-addresses purchase-draft copy', () => {
  const ADDED_KEYS = [
    'lineDelivery.destination.label.editable.via_warehouse',
    'lineDelivery.destination.label.editable.direct_to_customer',
    'lineDelivery.destination.label.frozen.via_warehouse',
    'lineDelivery.destination.label.frozen.direct_to_customer',
    'lineDelivery.destination.caption.editable.via_warehouse',
    'lineDelivery.destination.caption.editable.direct_to_customer',
    'lineDelivery.destination.caption.frozen.via_warehouse',
    'lineDelivery.destination.caption.frozen.direct_to_customer',
    'detail.driftAlert.addressRedirectedViaWarehouse',
    'detail.driftAlert.addressRedirectedViaWarehouse_dated',
    'linkRow.drift.addressRedirectedViaWarehouse',
    'linkRow.drift.addressRedirectedViaWarehouse_dated',
    'byLine.addressDrift',
    'transitions.lineEnding.recorded.arrival',
    'transitions.lineEnding.recorded.direct_delivery',
    'transitions.lineEnding.endsOnceTitle',
    'transitions.lineEnding.atomicityTitle',
    'dialogs.addLink.refusal.addressDisagreementTitle',
  ];

  it.each(supportedLanguages)(
    'resolves every added key in %s',
    async (language) => {
      const instance = createInstance();
      await instance.init({
        fallbackLng: 'en',
        lng: language,
        ns: namespaces,
        resources,
      });

      for (const key of ADDED_KEYS) {
        const value = instance.t(key, { ns: 'purchase-draft' });
        expect(value, `${language}:purchase-draft:${key}`).not.toBe(key);
        expect(
          value.length,
          `${language}:purchase-draft:${key}`,
        ).toBeGreaterThan(0);
      }
    },
  );

  it('states the tense of the destination field, and its two English labels', async () => {
    const instance = createInstance();
    await instance.init({
      fallbackLng: 'en',
      lng: 'en',
      ns: namespaces,
      resources,
    });

    expect(
      instance.t('lineDelivery.destination.label.editable.via_warehouse', {
        ns: 'purchase-draft',
      }),
    ).toBe('Goes to');
    expect(
      instance.t('lineDelivery.destination.label.frozen.direct_to_customer', {
        ns: 'purchase-draft',
      }),
    ).toBe('Went to');
  });

  // AC-18 — a via-warehouse line's reading of a moved Delivery Address is
  // reassurance, and the copy has to actually say so rather than repeating the
  // direct line's alarm under a different key.
  it('reassures rather than alarms on a via-warehouse address drift', async () => {
    const instance = createInstance();
    await instance.init({
      fallbackLng: 'en',
      lng: 'en',
      ns: namespaces,
      resources,
    });

    expect(
      instance.t('detail.driftAlert.addressRedirectedViaWarehouse', {
        ns: 'purchase-draft',
        customer: 'Nordwind Logistik GmbH',
        line: 1,
      }),
    ).toContain('still come to your dock');
  });
});

// --- delivery-addresses Customers copy (design review remediation) --------------------------------
//
// The keys the Customers destination gained when its search, its awaiting table and its two
// deactivation confirmations were brought back to the approved frames. Each is resolved through the
// real resource assembly in **both** supported languages, because a key added to one file only is
// the commonest localization defect
// (`adding-and-maintaining-web-localization.md` §"Add a translation key", step 6).
describe('delivery-addresses customer copy (design review)', () => {
  const customerInstance = async (
    language: 'en' | 'uk',
  ): Promise<ReturnType<typeof createInstance>> => {
    const instance = createInstance();
    await instance.init({
      fallbackLng: 'en',
      lng: language,
      ns: namespaces,
      resources,
    });
    return instance;
  };

  it('resolves every added key in en', async () => {
    const instance = await customerInstance('en');

    expect(instance.t('directory.search', { ns: 'customer' })).toBe(
      'Search customers or addresses',
    );
    expect(instance.t('directory.toolbar', { ns: 'customer' })).toBe(
      'Customer search and actions',
    );
    expect(
      instance.t('detail.awaiting.itemMeta', {
        ns: 'customer',
        sku: 'WH-100420',
        unit: 'pieces',
      }),
    ).toBe('WH-100420 · counted in pieces');
    expect(
      instance.t('dialogs.deactivate.staysTitle', { ns: 'customer' }),
    ).toBe('What stays');
    expect(
      instance.t('dialogs.deactivate.awaitingDescription', {
        ns: 'customer',
        count: 1,
      }),
    ).toContain('1 unfulfilled order.');
    expect(
      instance.t('dialogs.deactivate.awaitingDescription', {
        ns: 'customer',
        count: 3,
      }),
    ).toContain('3 unfulfilled orders.');
    expect(
      instance.t('dialogs.deactivateAddress.staysTitle', { ns: 'customer' }),
    ).toBe('What stays');
    expect(
      instance.t('dialogs.deactivateAddress.mainTitle', { ns: 'customer' }),
    ).toBe('This is the main delivery address');
  });

  it('resolves every added key in uk', async () => {
    const instance = await customerInstance('uk');

    for (const key of [
      'directory.search',
      'directory.toolbar',
      'dialogs.deactivate.staysTitle',
      'dialogs.deactivate.awaitingTitle',
      'dialogs.deactivateAddress.staysTitle',
      'dialogs.deactivateAddress.mainTitle',
    ]) {
      expect(instance.exists(key, { ns: 'customer' })).toBe(true);
      expect(instance.t(key, { ns: 'customer' })).not.toBe(key);
    }

    expect(
      instance.t('detail.awaiting.itemMeta', {
        ns: 'customer',
        sku: 'WH-100420',
        unit: 'шт',
      }),
    ).toContain('WH-100420');
    expect(
      instance.t('dialogs.deactivate.awaitingDescription', {
        ns: 'customer',
        count: 3,
      }),
    ).toContain('3');
  });

  // The search field's placeholder is a promise about what the field does, and
  // `CustomerCatalogue` keeps it: the term is matched against the addresses as
  // well as the name. Both languages have to name addresses for that promise
  // to survive localization.
  it('promises addresses in the search placeholder in both languages', async () => {
    const en = await customerInstance('en');
    const uk = await customerInstance('uk');

    expect(en.t('directory.search', { ns: 'customer' })).toMatch(/addresses/iu);
    expect(uk.t('directory.search', { ns: 'customer' })).toMatch(/адрес/iu);
  });
});

// review-2026-09-09, finding 6 (stage 2). This branch renamed the allocation
// bound's rule on the server — `allocations_exceed_received_quantity` became
// `allocations_exceed_accepted_quantity` when the bound narrowed from what
// arrived to what was accepted (AC-11) — and left the web's arm for the old
// rule behind, parsing and rendering a violation no deployed server can emit.
// Removing that arm orphaned its sentence, so the sentence goes too, and the
// identity baseline is updated to match: this is a deliberate removal of a key
// that existed at `baseline_revision`, pinned here the way CR-AC-12's seven
// orphaned skeleton labels are, so it reads as an act rather than as drift.
describe('arrival-inspection orphaned allocation-bound copy (review 2026-09-09)', () => {
  const ORPHANED_BOUND_KEY =
    'transitions.lineEnding.refusal.bounds.exceedsReceived';

  it.each(supportedLanguages)(
    'holds no sentence for the renamed received-quantity bound in %s',
    (language) => {
      expect(
        translationKeys(resources[language]['purchase-draft']),
      ).not.toContain(ORPHANED_BOUND_KEY);
    },
  );

  it.each(supportedLanguages)(
    'keeps the accepted-quantity sentence that replaced it in %s',
    (language) => {
      expect(translationKeys(resources[language]['purchase-draft'])).toContain(
        'transitions.lineEnding.refusal.bounds.exceedsAccepted',
      );
    },
  );
});
