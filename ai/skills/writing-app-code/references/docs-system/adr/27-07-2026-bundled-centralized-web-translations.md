# Serve Centralized Web Translations from Public Locale Directories

Status: Accepted

Date: 2026-07-27

## Context

`apps/web` initializes i18next in `apps/web/src/i18n.ts` before React renders. Translation resources
need a stable, centralized layout that supports multiple languages and namespace-based loading
without bundling every locale into the application JavaScript.

## Decision

Keep all web translation resources under Vite's public directory:

```text
apps/web/public/locales/<language>/<namespace>.json
```

Use language identifiers configured in i18next's `supportedLngs`, beginning with `en`. Directory
names must exactly match those identifiers. Prefer BCP 47 tags: Ukrainian is `uk`; using a custom
identifier such as `ua` requires configuring `ua` consistently. Every supported language must
contain the same namespace files and key shape.

Use one namespace for each route-owned module that has substantial copy, using the module directory
name, and shared namespaces for cross-cutting copy. `common` contains genuinely reusable UI copy;
`validation`, `errors`, and `success` contain cross-module feedback. A key belongs to the module
namespace when removing that module would make the copy unnecessary.

Use nested JSON objects and dotted accessors, for example
`{ "head": { "title": "Inventory" } }` with `t("head.title")`. Do not mix nested objects with flat
keys that contain literal dots.

Load JSON through `i18next-http-backend` from `/locales/{{lng}}/{{ns}}.json`. The i18n bootstrap
owns the supported-language list, fallback language, namespace registration, default namespace,
browser detection, backend path, and React binding. Components and non-React modules do not import
locale JSON directly.

Store stable translation keys or domain/validation codes outside rendering code and translate at
the presentation boundary. React components use `react-i18next`; non-React code uses the shared
i18next instance only at a presentation boundary such as a notification adapter. Schemas and API
adapters emit keys or codes, not translated or hardcoded user-visible sentences.

## Alternatives

- Keep all resources inline in `i18n.ts`: rejected because configuration and copy would share one
  file and every locale would be bundled into the application entry point.
- Colocate translation files inside each feature module: rejected because adding a language and
  checking locale parity would require traversing every module, and shared keys would have
  ambiguous ownership.
- Bundle imported JSON under `src/shared/i18n/locales`: rejected because the HTTP-loaded public
  layout keeps locale payloads out of the initial JavaScript bundle and makes namespace loading
  explicit.
- Use one application-wide namespace: rejected because unrelated feature copy would accumulate in
  one key tree and module ownership would be lost.

## Consequences

- Adding a language is a deterministic mirrored-directory change and can be reviewed for complete
  namespace and key parity.
- Translation copy has one discoverable application boundary while namespace ownership still
  follows the web module structure.
- Translation namespaces are fetched at runtime and can fail with an HTTP 404 when a configured
  language/namespace file is absent.
- Locale resources do not contribute to the initial JavaScript bundle.
- Adding or changing translations still requires deploying the corresponding public assets.
- Tests must exercise the real i18n resource assembly and locale parity; an identity `t(key) => key`
  mock alone is not sufficient for localization behavior.

## Links

- [Adding and maintaining web localization](../guides/adding-and-maintaining-web-localization.md)
- [Frontend architecture](../frontend-architecture.md)
