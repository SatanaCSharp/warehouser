# Adding and Maintaining Web Localization

Use this guide when adding visible copy, a namespace, or a language to `apps/web`. The placement and
loading rules come from the accepted
[web translation ADR](../adr/27-07-2026-bundled-centralized-web-translations.md).

## Current foundation

i18next is initialized once in `apps/web/src/i18n.ts` and imported by `apps/web/src/main.tsx` before
the first React render. `react-i18next` provides the React binding,
`i18next-browser-languagedetector` selects the startup language, and `i18next-http-backend` loads
namespace JSON from `/locales/{{lng}}/{{ns}}.json`.

Vite serves those resources from:

```text
apps/web/public/locales/
├── en/
│   ├── common.json
│   └── <namespace>.json
└── <language>/
    ├── common.json
    └── <namespace>.json
```

The language directory name must exactly match a value in `supportedLngs`. For example, the current
Ukrainian configuration uses the BCP 47 language code `uk`, so its directory is
`apps/web/public/locales/uk`. If the application deliberately configures `ua` instead, the
directory must be `apps/web/public/locales/ua`.

Components must never import locale files directly.

## Choose the namespace owner

Put a key in:

- `<module>.json` when the copy belongs to one route-owned module, for example
  `public/locales/en/inventory.json`;
- `common.json` only when the same copy is genuinely reused by multiple modules;
- `validation.json`, `errors.json`, or `success.json` for cross-module validation and action
  feedback governed by the web error-handling policy.

Do not put feature copy in `common` merely to avoid selecting a namespace. If deleting a module
would make the string unnecessary, the module owns it.

Use nested JSON consistently:

```json
{
  "head": {
    "title": "Inventory"
  }
}
```

Access this as `head.title` inside the `inventory` namespace. Do not encode the same path as the
flat JSON key `"head.title"`.

## Add a translation key

1. Select the owning namespace using the rule above.
2. Add the same nested key to that namespace file in every supported language.
3. Keep interpolation variable names identical across locales.
4. Use the namespace-aware translator in a React presentation component.
5. Outside React, carry a stable key or code until its owning alert or presentation adapter
   translates it.
6. Add or update a focused test that resolves the real key in every supported language.

Never hardcode user-visible copy in pages, components, Zod schemas, API adapters, or toast calls.
Do not store already translated strings in state when the language may change. Never show raw server
messages, server codes, or untranslated keys to users.

## Add a namespace

1. Add `<namespace>.json` under every supported language directory.
2. Give every locale file the same key shape.
3. Add the namespace to the `ns` list in `apps/web/src/i18n.ts`.
4. Ensure the HTTP backend's `loadPath` remains `/locales/{{lng}}/{{ns}}.json`.
5. Verify that no registered namespace lacks a file and no file exists without registration.

Namespace names should match their owning web module. Use a shared feedback namespace only for the
cross-module categories listed above.

## Add a language

1. Choose its BCP 47 tag and add it to the supported-language type/list in the i18n boundary.
2. Copy the complete namespace file set from the fallback language into
   `apps/web/public/locales/<language>/`.
3. Translate every value without renaming keys or interpolation parameters.
4. Add the language code to `supportedLngs` in `apps/web/src/i18n.ts`.
5. Add the language to the user-facing language selector and display its native language name.
6. Make the selector read the active value from i18next state; do not initialize independent local
   state to a hardcoded language.
7. Configure detection and persistence behavior through `i18next-browser-languagedetector`. A
   cached or detected language and the selector's visible value must never disagree.
8. Verify fallback behavior, persisted/detected startup behavior, and a live language change.

Do not add a language with a partial namespace set. The fallback language is a recovery mechanism,
not a substitute for completing a supported locale.

## React and non-React usage

React components should prefer a namespace-scoped hook:

```tsx
const { t } = useTranslation('inventory');

return <h1>{t('head.title')}</h1>;
```

Use one consistent pattern rather than mixing namespace-scoped hooks with prefixes such as
`t('inventory:head.title')` in components.

Non-React schemas and domain/API modules must not call hooks. They emit a stable key or typed code:

```ts
const requiredEmailKey = 'validation:email.required';
```

The form or owning alert adapter resolves that value at presentation time. Direct `i18next.t(...)`
calls belong only in presentation adapters where a hook cannot be used; feature-specific alert
adapters stay under `modules/<module>/alerts/`, while cross-feature adapters belong under
`shared/alerts/`.

`apps/web/src/i18n.ts` registers `initReactI18next`, and `main.tsx` imports that bootstrap before
rendering the application.

## Verification

Localization tests must use the real resource assembly for:

- equal namespace sets across supported languages;
- equal key sets and compatible interpolation parameters;
- representative lookup in each namespace and language;
- fallback behavior;
- language switching and selector synchronization when a selector exists.

A general component-test mock may return keys for unrelated tests, but it does not replace focused
localization tests.

Run the normal web gate:

```sh
pnpm --filter @warehouser/web lint
pnpm --filter @warehouser/web test
pnpm --filter @warehouser/web build
```

## Common failures

- Adding a locale file for only one language.
- Registering a namespace with no matching file, or creating a file that is never registered.
- Mixing nested JSON keys with literal dotted keys.
- Putting module-specific copy in `common`.
- Translating inside schemas, API adapters, reducers, or stored form state.
- Hardcoding the selected language independently of i18next.
- Relying only on an identity translation mock.
- Using a locale directory name that differs from the configured `supportedLngs` value.
- Putting locale files under `src/`, where the configured HTTP backend cannot load them.
