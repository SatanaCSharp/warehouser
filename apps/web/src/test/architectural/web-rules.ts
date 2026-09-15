import type { IForbiddenRuleType, IRequiredRuleType } from 'dependency-cruiser';

/**
 * Every architectural rule this tier enforces, as dependency-cruiser rules.
 *
 * A rule lives here rather than in the spec that asserts it so that one list
 * answers *what is enforced*, and so the synthetic control in
 * `rule-teeth.architectural.spec.ts` can drive the same rule objects the real
 * specs do. A rule the control cannot make fire is a rule that proves nothing,
 * and a rule stated only inside a spec cannot be driven that way.
 *
 * **What this tier deliberately does not enforce.** Cross-module placement and
 * the declared public surface are *not* here, and their absence is a decision
 * rather than an omission. Two ADRs reject this mechanism for exactly that
 * ground: 'Enforce the tiebreak with an ESLint boundary plugin or
 * dependency-graph tool. Rejected here as a separate concern … The enumerated
 * surface declaration and its spec remain the mechanism.'
 * (`docs/system/adr/18-08-2026-scope-of-exercise-placement-tiebreak.md`,
 * Accepted; `docs/system/adr/14-08-2026-domain-owned-flat-modules.md` rejects it
 * on the same ground). `src/test/module-boundaries/` is that mechanism and
 * stays the owner. The rules below are the ones no existing spec covers.
 *
 * Each rule's `comment` cites the document it comes from. The citation is not
 * decoration: dependency-cruiser prints it on failure, so the contributor who
 * trips a rule is told which document to go read, and a rule nobody can trace
 * to a document is a rule this repository never decided on.
 */

/** A spec file. Excluded from rules that describe production layering. */
const SPEC = '\\.spec\\.tsx?$';

/**
 * How an npm package appears in a resolved path. dependency-cruiser resolves a
 * package to `node_modules/<name>/...`, and pnpm's store adds a
 * `.pnpm/<name>@<version>/node_modules/` prefix in front of that — so anchoring
 * a package rule with `^` matches nothing. Every package pattern below is
 * anchored on a path boundary instead.
 */
const pkg = (name: string): string => `(^|/)node_modules/${name}(/|$)`;

/**
 * §A — Layer direction.
 *
 * `docs/system/frontend-architecture.md` §3 lays `apps/web/src` out as a
 * composition layer (`main.tsx`, `App.tsx`, `router.ts`, `routes/`, `guards/`,
 * `store/`) over feature modules over `shared/`. The composition layer knows
 * about modules; a module does not know how it was composed.
 */
export const LAYER_RULES: IForbiddenRuleType[] = [
  {
    name: 'module-does-not-import-composition',
    comment:
      "A module is composed by the application, it does not compose it. `router.ts` registers routes, `guards/` decides entry and `routes/` holds the shells — a module reaching back into any of them inverts the layering and makes the module unusable anywhere else. docs/system/frontend-architecture.md §3, §'Routing'.",
    severity: 'error',
    from: { path: '^src/modules/', pathNot: SPEC },
    to: { path: '^src/(router\\.ts|App\\.tsx|main\\.tsx)$' },
  },
  {
    name: 'shared-does-not-import-the-composition-root',
    comment:
      "`shared/` is what the application is assembled from, so it may not depend on the assembly. `store/index.ts` is the composition root and `routes/` holds the shells; a shared component reaching either one can only be used in this application, in this tree, in that position. `store/hooks.ts` is deliberately *not* covered: 'Components use `useAppDispatch` and `useAppSelector` from `store/hooks.ts`' makes the typed hooks the sanctioned way into the store from anywhere. docs/system/frontend-architecture.md §3, §'State'.",
    severity: 'error',
    from: { path: '^src/shared/', pathNot: SPEC },
    to: { path: '^src/(store/index\\.ts$|routes/)' },
  },
  {
    name: 'production-does-not-import-test-support',
    comment:
      '`src/test/` holds fixtures, render helpers and in-memory backends. A production file importing one ships test code to the browser. docs/system/guides/placing-web-tests.md §5.',
    severity: 'error',
    from: { path: '^src/', pathNot: [SPEC, '^src/test/'] },
    to: { path: '^src/test/' },
  },
  {
    name: 'production-does-not-import-dev-dependencies',
    comment:
      'A package declared in `devDependencies` is not installed in a production build. Importing one from a non-spec file is a runtime failure waiting for a deploy.',
    severity: 'error',
    from: { path: '^src/', pathNot: [SPEC, '^src/test/', '\\.d\\.ts$'] },
    to: { dependencyTypes: ['npm-dev'], dependencyTypesNot: ['type-only'] },
  },
];

/**
 * §B — Graph hygiene.
 *
 * Neither rule here restates a sentence from `docs/system`; both are
 * conventions this tier introduces, and they are stated as such rather than
 * dressed up as an existing decision.
 */
export const HYGIENE_RULES: IForbiddenRuleType[] = [
  {
    name: 'no-circular-dependencies',
    comment:
      'No runtime import cycles. `import type` edges are exempt: TypeScript erases them, so a type cycle costs nothing at runtime, and `apps/web` has twelve of them today (`auth.slice` ↔ `auth.actions` among them) that are a consequence of how a slice and its case reducers are typed, not a defect. Not a restatement of a docs/system sentence — a convention this tier introduces.',
    severity: 'error',
    from: {},
    to: { circular: true, viaOnly: { dependencyTypesNot: ['type-only'] } },
  },
  {
    name: 'no-orphan-modules',
    comment:
      'A production file nothing imports and that imports nothing is dead. Entry points, ambient declarations, styles and everything under `src/test/` are exempt because nothing is meant to import them. Not a restatement of a docs/system sentence — a convention this tier introduces.',
    severity: 'error',
    from: {
      orphan: true,
      pathNot: [
        '\\.d\\.ts$',
        '^src/test/',
        '^src/main\\.tsx$',
        '^src/styles/',
        SPEC,
      ],
    },
    to: {},
  },
];

/**
 * §C — Route, router and loader.
 *
 * `docs/system/frontend-architecture.md` §'Route' and
 * `docs/system/guides/adding-a-web-module.md` §5–§6 give the router chunk a
 * budget: it holds route declarations, guards and loaders, and reaches a page
 * only through `lazyRouteComponent(() => import('./page'))`. Every rule here
 * protects that boundary, and each is a way of accidentally pulling a feature
 * into the chunk that loads before the first paint.
 */
export const ROUTING_RULES: IForbiddenRuleType[] = [
  {
    name: 'loader-imports-no-page-and-no-component',
    comment:
      "A loader 'imports no page and no component, because it is reachable from the router chunk and would defeat the lazy `import('./page')` boundary'. docs/system/frontend-architecture.md §'Route'; docs/system/guides/adding-a-web-module.md §6.",
    severity: 'error',
    from: { path: '^src/modules/[^/]+/loaders/', pathNot: SPEC },
    to: {
      path: '^src/modules/[^/]+/(page\\.tsx|components/)|^src/shared/(components|layouts)/',
    },
  },
  {
    name: 'route-holds-routing-concerns-only',
    comment:
      "'It contains no feature JSX, form handling, RTK dispatch, or direct API calls.' docs/system/frontend-architecture.md §'Route'. A `route.tsx` wires a loader and a lazy page; the work belongs to the page.",
    severity: 'error',
    from: { path: '^src/modules/.*/route\\.tsx$', pathNot: SPEC },
    to: {
      path: `^src/(modules/[^/]+/api/|shared/api/|store/hooks)|${pkg('react-hook-form')}`,
    },
  },
  {
    name: 'route-reaches-its-page-only-lazily',
    comment:
      "A route imports its page through `lazyRouteComponent(() => import('./page'))`. A static import of the same file puts the whole page in the router chunk and the lazy boundary stops meaning anything. docs/system/guides/adding-a-web-module.md §5.",
    severity: 'error',
    from: { path: '^src/modules/.*/route\\.tsx$', pathNot: SPEC },
    to: {
      path: '^src/modules/.*/page\\.tsx$',
      dynamic: false,
      dependencyTypesNot: ['type-only'],
    },
  },
  {
    name: 'router-renders-no-feature-component',
    comment:
      "'Rendering a feature component directly from `router.ts` instead of adding a module route/page.' — listed as an anti-pattern. docs/system/guides/adding-a-web-module.md §'Anti-patterns'.",
    severity: 'error',
    from: { path: '^src/router\\.ts$' },
    to: { path: '^src/modules/[^/]+/(components/|page\\.tsx)' },
  },
  {
    name: 'guard-holds-no-react',
    comment:
      "'Guards have no React imports or component rendering.' and 'Router guards do not use React hooks; the router receives the same RTK store in its context and reads it through selectors.' docs/system/frontend-architecture.md §'Authorization', §2.",
    severity: 'error',
    from: { path: '^src/guards/', pathNot: SPEC },
    to: {
      path: `${pkg('react')}|${pkg('react-dom')}|${pkg('react-redux')}|${pkg('@heroui/react')}|^src/.*\\.tsx$`,
      // Every guard names `RouterContext`, a type declared in
      // `routes/__root.route.tsx`. Importing a type out of a `.tsx` file is not
      // rendering and not a React import — TypeScript erases it — so the rule
      // judges runtime edges. Drop this and the rule fails on all five guards
      // for doing the one thing the router requires of them.
      dependencyTypesNot: ['type-only'],
    },
  },
];

/**
 * Two rules that were written, run, and removed — recorded because their
 * absence otherwise looks like nobody thought of them.
 *
 * **`loader-does-not-decide-access`.** The guide says 'a loader dispatches; it
 * does not decide access — a redirect or an entry verdict stays in `guards/`
 * and a loader reads the verdict the guard already published'
 * (`docs/system/guides/adding-a-web-module.md` §6). Expressed as
 * `loaders/ -> guards/` it fires on all five loaders, every one of which is
 * doing the sanctioned thing: `item.loader.ts` imports `admitsReads` and
 * `WarehouseEntryVerdict` to *read* the verdict. Reading a verdict and deciding
 * one are the same edge in the graph, so the graph cannot hold this rule. What
 * it forbids — throwing `redirect` — is a named export, which dependency-cruiser
 * does not see.
 *
 * **`endpoints-are-injected-from-api-directories`.** `injectEndpoints` should
 * only be called from an `api/` directory, but `api-client.ts` also exports
 * `ApiFailure` and `isApiFailure`, which `shared/errors/`,
 * `shared/utils/field-errors.ts` and a page legitimately import. Module
 * granularity cannot separate the endpoint machinery from the error shape
 * sharing a file with it. `rtk-query-is-configured-at-one-boundary` keeps the
 * part that *is* decidable: only `shared/api/client/` may reach RTK Query's
 * `createApi`.
 */

/**
 * §D — Redux Toolkit and RTK Query.
 *
 * `docs/system/frontend-architecture.md` §'State' fixes one direction through a
 * feature slice: the root store imports the slice, the slice imports its case
 * reducers, and nothing goes back the other way.
 */
export const STORE_RULES: IForbiddenRuleType[] = [
  {
    name: 'case-reducers-do-not-import-their-slice',
    comment:
      "'`<module>.actions.ts` … does not import the created slice or export Redux action creators' — and 'Importing the created slice into `<module>.actions.ts`, which creates the wrong dependency direction' is named as an anti-pattern. docs/system/frontend-architecture.md §'State'; docs/system/guides/adding-a-web-module.md §'Anti-patterns'.",
    severity: 'error',
    from: { path: '^src/modules/([^/]+)/store/[^/]+\\.actions\\.ts$' },
    to: {
      path: '^src/modules/$1/store/[^/]+\\.slice\\.ts$',
      // What the rule forbids is importing *the created slice* — the value. A
      // case reducer is typed `CaseReducer<AuthState>`, and `AuthState` is
      // declared in the slice file, so `auth.actions.ts` names it with an
      // `import type`. That edge is erased at compile time and creates none of
      // the wrong-direction coupling the rule exists to stop.
      dependencyTypesNot: ['type-only'],
    },
  },
  {
    name: 'typed-store-hooks-are-the-only-store-access',
    comment:
      "'Components use `useAppDispatch` and `useAppSelector` from `store/hooks.ts`, not repeatedly typed raw React Redux hooks.' docs/system/frontend-architecture.md §'State'. `store/hooks.ts` declares them, `main.tsx` mounts the `Provider` and `test/render.tsx` mounts it again for specs; those three are the rule's input, not exceptions to it.",
    severity: 'error',
    from: {
      path: '^src/(modules|shared|guards|routes)/',
      pathNot: SPEC,
    },
    to: { path: pkg('react-redux') },
  },
  {
    name: 'root-store-owns-no-feature-state',
    comment:
      "'Feature-owned slices live in `modules/<module>/store/` … The root `store/` composes those reducers; it does not own feature slices.' docs/system/frontend-architecture.md §'State'; docs/system/guides/adding-a-web-module.md §8. Expressed as a dependency because a root-store file reaching a feature's own state is the same mistake as declaring it there.",
    severity: 'error',
    from: { path: '^src/store/', pathNot: SPEC },
    to: { path: '^src/modules/[^/]+/store/[^/]+\\.(actions|selectors)\\.ts$' },
  },
];

/**
 * §E — External dependencies.
 *
 * Which packages `apps/web` is allowed to reach for, and how it must name them.
 */
export const DEPENDENCY_RULES: IForbiddenRuleType[] = [
  {
    name: 'contracts-are-imported-by-subpath',
    comment:
      "'There is no root `.` export — consumers always import from a specific module subpath (`@warehouser/contracts/user`), not from the package root.' docs/system/guides/adding-and-using-contracts.md §3; docs/system/frontend-architecture.md §'Validation'.",
    severity: 'error',
    from: { path: '^src/' },
    to: {
      // Matched on the bare specifier, not on a resolved path. `packages/contracts`
      // publishes no root `exports` entry, so `@warehouser/contracts` resolves to
      // nothing and dependency-cruiser reports the specifier back unchanged —
      // whereas every legitimate subpath resolves through pnpm's workspace link
      // to `../../packages/contracts/dist/<module>/index.d.ts` and never mentions
      // `node_modules` at all. A pattern written against a resolved
      // `node_modules/@warehouser/contracts` path would match neither.
      path: '(^|/)@warehouser/contracts$',
    },
  },
  {
    name: 'lodash-is-imported-one-function-at-a-time',
    comment:
      "'Import the needed function directly so the web bundle includes only what it uses' — `import union from 'lodash/union'`, never the barrel. docs/system/frontend-architecture.md §4; docs/system/guides/placing-web-hooks.md §6.",
    severity: 'error',
    from: { path: '^src/' },
    to: { path: '(^|/)node_modules/lodash/index\\.js$' },
  },
  {
    name: 'heroui-is-the-only-ui-library',
    comment:
      "'Importing UI libraries other than the established HeroUI foundation without an architectural decision' is named as an anti-pattern, and 'There is no Warehouser UI wrapper package today, so do not invent imports from one.' docs/system/guides/adding-a-web-module.md §'Anti-patterns'; docs/system/frontend-architecture.md §'UI'.",
    severity: 'error',
    from: { path: '^src/' },
    to: {
      path: '(^|/)node_modules/(@mui|@material-ui|antd|@chakra-ui|react-bootstrap|@mantine|@radix-ui|@headlessui|semantic-ui-react|styled-components|@emotion)(/|$)',
    },
  },
  {
    name: 'zod-is-the-only-validation-library',
    comment:
      "Zod is 'the single validation technology across the monorepo'. docs/system/adr/12-07-2026-schema-validation-with-zod.md (Accepted).",
    severity: 'error',
    from: { path: '^src/' },
    to: {
      path: '(^|/)node_modules/(yup|joi|ajv|superstruct|valibot|class-validator|io-ts)(/|$)',
    },
  },
  {
    name: 'rtk-query-is-the-only-server-state-client',
    comment:
      'Server-state access goes through one injected API slice with a shared base query. docs/system/adr/02-08-2026-rtk-query-for-web-api-calls.md (Accepted). A second data-fetching client would be a second cache, a second invalidation model and a second error boundary.',
    severity: 'error',
    from: { path: '^src/' },
    to: {
      path: '(^|/)node_modules/(axios|swr|@tanstack/react-query|apollo-client|@apollo/client|superagent|got|node-fetch)(/|$)',
    },
  },
  {
    name: 'i18next-is-configured-at-one-boundary',
    comment:
      "'All user-visible copy is configured by the centralized boundary at `src/i18n.ts`.' docs/system/frontend-architecture.md §'Localization'. `react-i18next`'s `useTranslation` is the component-level API and stays available everywhere; it is the i18next core and its plugins that belong to the boundary alone.",
    severity: 'error',
    from: {
      path: '^src/',
      pathNot: ['^src/i18n\\.ts$', '^src/main\\.tsx$', '^src/test/', SPEC],
    },
    to: {
      path: `${pkg('i18next')}|${pkg('i18next-http-backend')}|${pkg('i18next-browser-languagedetector')}`,
    },
  },
  {
    name: 'form-resolvers-are-the-zod-resolver',
    comment:
      "`@hookform/resolvers` ships a resolver for every validation library there is; only its `zod` entry point is admissible here. docs/system/adr/12-07-2026-schema-validation-with-zod.md (Accepted): '`apps/web` uses `zod` directly (e.g. with a form library's zod resolver)'. Without this rule the previous rule is trivially side-stepped — `@hookform/resolvers/yup` pulls yup in without ever naming it.",
    severity: 'error',
    from: { path: '^src/' },
    to: { path: '(^|/)node_modules/@hookform/resolvers/(?!zod)' },
  },
  {
    name: 'rtk-query-is-configured-at-one-boundary',
    comment:
      "'Define one shared API slice for the Warehouser server base URL and register its reducer and middleware in `apps/web/src/store/index.ts`. Feature modules own their endpoint definitions and add them to the shared slice with `injectEndpoints`.' docs/system/adr/02-08-2026-rtk-query-for-web-api-calls.md (Accepted). `createApi` is called once, in `shared/api/client/`; a second call is a second cache and a second invalidation model. Type-only imports of RTK Query's types are everywhere and are not the thing being restricted.",
    severity: 'error',
    from: { path: '^src/', pathNot: ['^src/shared/api/client/', SPEC] },
    to: {
      // `@reduxjs/toolkit/query` resolves through the package's `exports` map to
      // `node_modules/@reduxjs/toolkit/dist/query/…`, so the pattern names the
      // path the resolver produces rather than the specifier a file writes.
      // `rule-teeth.architectural.spec.ts` drives this rule from the one
      // sanctioned importer precisely so a change to that layout is reported
      // instead of quietly turning the rule off.
      path: '(^|/)node_modules/@reduxjs/toolkit/dist/query(/|$)',
      dependencyTypesNot: ['type-only'],
    },
  },
  {
    name: 'schemas-and-api-adapters-emit-keys-not-sentences',
    comment:
      "'Schemas and API adapters emit keys or codes, not translated or hardcoded user-visible sentences.' docs/system/adr/27-07-2026-bundled-centralized-web-translations.md (Accepted). A schema or an api slice that reaches for a translator is producing copy at the wrong layer; the presentation boundary that may translate is `shared/alerts/`, which this rule's `from` does not cover.",
    severity: 'error',
    from: { path: '^src/(modules/[^/]+|shared)/(schemas|api)/', pathNot: SPEC },
    to: { path: `${pkg('react-i18next')}|${pkg('i18next')}` },
  },
  {
    name: 'locale-json-is-served-not-imported',
    comment:
      'Translations are served from `public/locales/<language>/`, not bundled. docs/system/adr/27-07-2026-bundled-centralized-web-translations.md (Accepted); docs/system/guides/adding-and-maintaining-web-localization.md. A production import of a locale JSON file bundles the copy and defeats the http backend; `src/test/setup.ts` and `i18n.spec.ts` import them deliberately, to run jsdom without a network.',
    severity: 'error',
    from: { path: '^src/', pathNot: ['^src/test/', SPEC] },
    to: { path: 'public/locales/' },
  },
];

/**
 * §F — Error handling and action feedback.
 *
 * `docs/system/guides/web-error-handling.md` gives each half of a failed
 * request exactly one owner. Every rule here is a component taking work back
 * from the owner the guide named.
 */
export const FEEDBACK_RULES: IForbiddenRuleType[] = [
  {
    name: 'field-error-mapping-belongs-to-the-endpoint',
    comment:
      "'Which field explains a refusal is the endpoint's declaration, not the caller's.' A code→fields table is declared beside the endpoint in the api slice with `fieldErrorsForCode`; 'Do not re-map codes to fields in a component, a hook, or a form.' docs/system/guides/web-error-handling.md §3.",
    severity: 'error',
    from: {
      path: '^src/(modules/[^/]+/(components|hooks)|shared/(components|hooks))/',
      pathNot: SPEC,
    },
    to: { path: '^src/shared/utils/field-errors' },
  },
  {
    name: 'components-declare-feedback-they-do-not-raise-it',
    comment:
      "'Declare the action, do not call the notifier.' `shared/alerts/mutation-actions.ts` holds one entry per mutation endpoint and `mutationFeedbackMiddleware` raises it; 'A component triggers the generated `use<Endpoint>Mutation` hook and writes no feedback code at all.' docs/system/guides/web-error-handling.md §4; docs/system/adr/19-08-2026-generated-mutation-hooks-in-components.md (Accepted).",
    severity: 'error',
    from: {
      path: '^src/modules/[^/]+/(components/|page\\.tsx)',
      pathNot: SPEC,
    },
    to: { path: '^src/shared/alerts/(mutation-actions|api-feedback)' },
  },
  {
    name: 'shared-alerts-are-not-feature-specific',
    comment:
      "'Put feedback for a feature-owned action in `modules/<module>/alerts/` … Use `shared/alerts/` only for presentation behavior that applies across feature modules.' docs/system/frontend-architecture.md §4. A shared alert that imports a module is feature-specific by construction.",
    severity: 'error',
    from: { path: '^src/shared/alerts/', pathNot: SPEC },
    to: { path: '^src/modules/' },
  },
];

/**
 * §F2 — Mechanisms with exactly one owner.
 *
 * Each of these is a decision that named a single file as the only place a
 * thing may be reached from. A second reader is not a style disagreement, it is
 * the decision quietly ceasing to hold — and nothing else in the repository
 * would notice.
 */
export const SOLE_OWNER_RULES: IForbiddenRuleType[] = [
  {
    name: 'action-dialog-state-goes-through-useActionDialog',
    comment:
      "'A surface that opens dialogs from its rows holds that state in `useActionDialog` and mounts them with `ActionDialogHost`. It does not write the null check, the `DialogHost`, or the inline record itself.' docs/system/adr/27-08-2026-reducer-driven-action-dialogs.md (Accepted); docs/system/guides/web-action-dialogs.md. `DialogHost` is the primitive `ActionDialogHost` is built from; a module reaching it directly is a surface writing the null check again. Specs mount it as a harness and are excluded.",
    severity: 'error',
    from: { path: '^src/modules/', pathNot: SPEC },
    to: { path: '^src/shared/components/DialogHost\\.tsx$' },
  },
  {
    name: 'the-feedback-registry-has-one-reader',
    comment:
      "'`shared/alerts/mutation-actions.ts` holds one entry per endpoint … `store/middleware/mutation-feedback.middleware.ts` reads it by the `meta.arg.endpointName` the lifecycle action already carries.' docs/system/adr/19-08-2026-generated-mutation-hooks-in-components.md (Accepted). A second reader is a component raising its own toast by another route.",
    severity: 'error',
    from: {
      path: '^src/',
      pathNot: [
        '^src/store/middleware/mutation-feedback\\.middleware\\.ts$',
        '^src/shared/alerts/mutation-actions',
        SPEC,
      ],
    },
    to: { path: '^src/shared/alerts/mutation-actions\\.ts$' },
  },
  {
    name: 'warehouse-entry-hook-has-one-outside-consumer',
    comment:
      "The scope-of-exercise tiebreak rests on a stated fact about this graph: '`useRecordWarehouseEntry` is imported from outside by exactly one production file, `shared/layouts/WarehouseLayout.tsx`. That single consumer is the composition layer, not a view, route or handler belonging to another entity's module.' docs/system/adr/18-08-2026-scope-of-exercise-placement-tiebreak.md (Accepted). A second consumer does not break a rule — it invalidates the premise the placement decision was made on, which is worth being told about.",
    severity: 'error',
    from: {
      path: '^src/',
      pathNot: [
        '^src/modules/warehouse/',
        '^src/shared/layouts/WarehouseLayout\\.tsx$',
        SPEC,
      ],
    },
    to: {
      path: '^src/modules/warehouse/hooks/effects/useRecordWarehouseEntry\\.ts$',
    },
  },
  {
    name: 'deleted-mutation-plumbing-stays-deleted',
    comment:
      "'Under that rule all 23 wrappers went, along with `run-mutation.ts`, `workspace-mutation.ts`, `access-mutation.ts`, `action-feedback.ts` and the three per-scope feedback adapters.' docs/system/adr/19-08-2026-generated-mutation-hooks-in-components.md (Accepted); '`useAccessCapabilities` is removed' docs/system/adr/19-08-2026-declarative-permission-gates.md (Accepted). Each name is a mechanism a decision replaced; an import of one is the old mechanism growing back.",
    severity: 'error',
    from: { path: '^src/' },
    to: {
      path: '(run-mutation|workspace-mutation|access-mutation|action-feedback|useAccessCapabilities)\\.tsx?$',
    },
  },
];

/**
 * §G — Component ownership.
 *
 * '`A component owns another component when the other component is rendered
 * only by it — no sibling, no other module reaches in and imports it
 * directly.`' docs/system/guides/placing-web-components.md §1. Nesting a
 * component under its owner is how that ownership is written down; reaching
 * past the owner into the nested tree is what makes the nesting a lie.
 */
export const OWNERSHIP_RULES: IForbiddenRuleType[] = [
  {
    name: 'no-reach-into-another-owners-component-tree',
    comment:
      "'What this rule protects against is a consumer reaching into another component's private tree.' A file under `components/<owner>/components/` is the owner's private tree; only the owner's own subtree may import it. docs/system/guides/placing-web-components.md §1–§2. A module's declared public surface is exempt and is checked by `test/module-boundaries`.",
    severity: 'error',
    from: {
      path: '^src/modules/([^/]+)/components/([^/]+)/',
      pathNot: SPEC,
    },
    to: {
      path: '^src/modules/[^/]+/components/[^/]+/components/',
      pathNot: '^src/modules/$1/components/$2/',
    },
  },
  {
    name: 'no-reach-into-an-owners-component-tree-from-outside',
    comment:
      "The companion to the rule above, for the importer that sits in no owner's directory at all — a file at the `components/` root, a page, a loader. 'do not nest a sub-page component that has more than one consumer' (docs/system/guides/placing-web-components.md §2): a second consumer from outside is exactly the signal that the component was nested under an owner it does not belong to, and the fix is to unnest it rather than to reach in.",
    severity: 'error',
    from: {
      path: '^src/',
      pathNot: ['^src/modules/[^/]+/components/[^/]+/', SPEC],
    },
    to: { path: '^src/modules/[^/]+/components/[^/]+/components/' },
  },
  {
    name: 'context-provider-owns-a-reducer-and-nothing-else',
    comment:
      "'The provider owns `useReducer` and nothing else. No queries, no mutations, no toasts, no navigation.' docs/system/guides/sharing-web-state-with-context.md §8. `apps/web` holds no context today, so this rule is preventative — it is what stops the first one from becoming the module's orchestrator.",
    severity: 'error',
    from: { path: '^src/modules/[^/]+/context/', pathNot: SPEC },
    to: {
      path: `^src/(modules/[^/]+/api/|shared/api/|shared/alerts/|store/)|${pkg('@tanstack/react-router')}`,
    },
  },
  {
    name: 'context-provider-is-mounted-narrowly',
    comment:
      "'Mount it at the narrowest common ancestor of its consumers — the tab or the directory, never the page, the root layout, or `main.tsx`.' docs/system/guides/sharing-web-state-with-context.md §8. Preventative, as above.",
    severity: 'error',
    from: {
      path: '^src/(main\\.tsx|App\\.tsx)$|^src/(shared/layouts|routes)/|^src/modules/[^/]+/page\\.tsx$',
      pathNot: SPEC,
    },
    to: { path: '^src/modules/[^/]+/context/' },
  },
];

/**
 * §H — Required dependencies.
 *
 * dependency-cruiser's `required` rules, which fail on an *absent* edge rather
 * than a present one. Kept apart from the forbidden rules because the synthetic
 * control has to drive them the other way round: a fixture makes a forbidden
 * rule fire by adding an import and a required rule fire by omitting one.
 */
export const REQUIRED_RULES: IRequiredRuleType[] = [
  {
    name: 'slice-declares-its-case-reducers-elsewhere',
    comment:
      "'Dependencies flow from the slice to its case-reducer declarations.' A `<module>.slice.ts` creates the slice from the case reducers declared in the `<module>.actions.ts` beside it. docs/system/frontend-architecture.md §'State'; docs/system/guides/adding-a-web-module.md §8.",
    severity: 'error',
    module: { path: '^src/modules/([^/]+)/store/([^/]+)\\.slice\\.ts$' },
    to: { path: '^src/modules/$1/store/$2\\.actions\\.ts$' },
  },
  {
    name: 'route-declares-its-path-from-the-constants',
    comment:
      "'All application paths are declared in `shared/constants/routes.ts`. Route definitions, guards, navigation calls, and links reference `ROUTES`; they do not repeat path literals.' docs/system/frontend-architecture.md §'Routing'. Only the import is graph-visible; whether a literal is repeated anyway is not.",
    severity: 'error',
    module: {
      path: '^src/modules/[^/]+/route\\.tsx$',
      // `modules/warehouse/route.tsx` is the index child of
      // `routes/warehouse.route.tsx`: its `path` is `'/'`, which resolves to the
      // parent's own `fullPath`. It declares no application path, so it has no
      // constant to reference — the parent holds `ROUTES.WAREHOUSE`. This is the
      // one route in the tree for which the rule's premise does not apply.
      pathNot: '^src/modules/warehouse/route\\.tsx$',
    },
    to: { path: '^src/shared/constants/routes\\.ts$' },
  },
];

/** Every forbidden rule in this tier, in declaration order. */
export const ALL_FORBIDDEN_RULES: IForbiddenRuleType[] = [
  ...LAYER_RULES,
  ...HYGIENE_RULES,
  ...ROUTING_RULES,
  ...STORE_RULES,
  ...DEPENDENCY_RULES,
  ...FEEDBACK_RULES,
  ...SOLE_OWNER_RULES,
  ...OWNERSHIP_RULES,
];
