/**
 * The React UI layer — the successor to `packages/eslint-config-ui` plus `apps/web`'s own
 * `eslint.config.mjs`.
 *
 * Three plugins on top of the baseline (`react`, `jsx-a11y`, `import`) and the severities this
 * repository actually runs them at. oxlint files most of their rules under `correctness`, so
 * turning a plugin on turns its whole surface into errors; every rule below is named to keep the
 * severity it had under ESLint rather than the one the category would impose.
 *
 * The build-output and tooling `ignorePatterns` stay with `apps/web` — they describe that
 * application's directory layout, not the UI layer — and are passed to `createUiConfig` there.
 */
import { baseConfig } from '@warehouser/oxlint-config/base';
import { mergeOxlintConfig } from '@warehouser/oxlint-config/merge';
import type { OxlintConfig } from 'oxlint';

export const uiConfig: OxlintConfig = mergeOxlintConfig(baseConfig, {
  // Replaces the baseline's list rather than adding to it. `react` carries the react-hooks rules
  // too — oxlint has no `react-hooks/` prefix, so `rules-of-hooks` and `exhaustive-deps` are named
  // `react/…` below. `jsx-a11y` covers both `jsx-a11y` and `jsx-a11y-x`; `import` covers `import`
  // and `import-x`.
  //
  // `import`, `promise` and `vitest` are in the baseline now and are repeated here because the
  // merge REPLACES this field rather than unioning it — dropping one of them would silently switch
  // that plugin off for `apps/web` alone. `react-perf` is this layer's own addition; its four rules
  // are all `perf`, so the plugin costs nothing until they are named below.
  plugins: [
    'eslint',
    'typescript',
    'unicorn',
    'oxc',
    'import',
    'promise',
    'vitest',
    'react',
    'jsx-a11y',
    'react-perf',
  ],

  env: { browser: true },

  // oxlint validates this against semver and rejects ESLint's `"detect"`, so the major line is
  // stated outright. It matches the `react` catalog entry (`^19.2.7`).
  settings: { react: { version: '19' } },

  rules: {
    // ---- import
    // `import/no-unresolved` was `off` and has no oxlint rule either, so it needs no entry.
    'import/named': 'error',
    'import/no-self-import': 'error',
    'import/no-cycle': 'warn',
    'import/newline-after-import': 'warn',
    'import/no-duplicates': 'warn',
    'import/first': 'warn',
    'import/extensions': [
      'error',
      'ignorePackages',
      { ts: 'never', tsx: 'never', js: 'never', jsx: 'never' },
    ],
    // NOT ADOPTED: `import/namespace` comes on with the plugin because oxlint files it under
    // `correctness`, but the ESLint config never enabled it and its only findings here are the two
    // deliberate `Icons[exportName]` lookups in `shared/icons/icons.spec.tsx` — a table-driven
    // suite that asserts every required icon is exported, which a rule that "cannot validate a
    // computed reference" can only ever report as a defect.
    'import/namespace': 'off',
    // LOST: `import/order` and `import/no-useless-path-segments` — oxlint implements neither.
    // Ordering is not actually lost: it moves to `simple-import-sort`, which the root config runs
    // for both applications. The old UI config had to switch `simple-import-sort` off to stop it
    // fighting `import/order`, so retiring `import/order` removes that conflict rather than adding
    // one. `no-useless-path-segments` is a real but small loss — the bare-specifier convention
    // makes `./foo/../bar` close to unwritable here anyway.

    // ---- react
    'react/react-in-jsx-scope': 'off', // Not needed in React 17+
    'react/display-name': 'off', // Not needed with TypeScript
    'react/function-component-definition': [
      'error',
      {
        namedComponents: 'arrow-function',
        unnamedComponents: 'arrow-function',
      },
    ],
    'react/jsx-props-no-spreading': 'off',
    'react/jsx-no-useless-fragment': ['error', { allowExpressions: true }],
    'react/jsx-key': [
      'error',
      { checkFragmentShorthand: true, checkKeyMustBeforeSpread: true },
    ],
    'react/jsx-no-duplicate-props': 'error',
    'react/jsx-no-undef': 'error',
    'react/no-array-index-key': 'warn',
    'react/no-danger': 'warn',
    'react/no-direct-mutation-state': 'error',
    'react/no-unescaped-entities': 'warn',
    'react/no-unknown-property': 'error',
    'react/self-closing-comp': ['warn', { component: true, html: true }],
    'react/jsx-boolean-value': ['warn', 'never'],
    'react/jsx-curly-brace-presence': [
      'warn',
      { props: 'never', children: 'never' },
    ],
    'react/jsx-fragments': ['warn', 'syntax'],
    'react/jsx-no-target-blank': 'warn',
    'react/jsx-pascal-case': 'warn',
    'react/no-children-prop': 'warn',
    'react/no-danger-with-children': 'error',
    'react/no-unstable-nested-components': 'warn',
    // ---- Added after the ESLint migration.
    //
    // `only-export-components` is the successor to `react-refresh/only-export-components`, and it
    // is a Vite concern rather than a React one: a module that exports both a component and a plain
    // helper cannot be hot-replaced, so every edit to it does a full reload and discards the local
    // state the developer was in the middle of reproducing. One finding —
    // `shared/layouts/LanguageSelector.tsx`, which exports `resolveBaseLanguage` beside the
    // component. `warn` because splitting the file is a judgement call, not a defect.
    'react/only-export-components': 'warn',
    // A context `value={{ a, b }}` allocates a new object on every parent render and so re-renders
    // every consumer, unconditionally. It is invisible in review and it is the single most common
    // way a React context turns into a performance problem. Zero findings today.
    'react/jsx-no-constructed-context-values': 'warn',
    // LOST: `react/no-deprecated`. oxlint implements no blanket "this React API is deprecated"
    // rule; these five are the narrower checks it does have, and between them they cover the
    // legacy-API half of what the old rule caught. The lifecycle half — `componentWillMount` and
    // its siblings — is only reachable from a class component, and this application has none.
    'react/no-unsafe': 'warn',
    'react/no-string-refs': 'warn',
    'react/no-find-dom-node': 'warn',
    'react/no-is-mounted': 'warn',
    'react/no-render-return-value': 'warn',
    // LOST and harmless: `react/prop-types` and `react/require-default-props` were already `off`
    // (TypeScript owns both), `react/jsx-uses-react` was `off`, `react/jsx-uses-vars` was only
    // ESLint plumbing for `no-unused-vars` and oxlint's `no-unused-vars` reads JSX natively, and
    // `react/prefer-stateless-function` has nothing to police in a hooks-only codebase.

    // ---- react hooks. oxlint folds these into the `react` plugin; there is no `react-hooks/`
    //      prefix, so an existing `// eslint-disable-next-line react-hooks/…` comment would not
    //      match. There are none in `apps/web/src`.
    'react/rules-of-hooks': 'error',
    'react/exhaustive-deps': 'warn',
    // NOT ADOPTED: two further `react` rules oxlint files under `correctness` that this repository
    // has never run. Both are React-Compiler-era checks, and both are wrong on their single finding
    // here — which is why they are named rather than left to fire.
    //
    // `refs` reads `bodyRef.current` in `FormModalDialog`'s `focusFirstInvalid` as a render-time
    // access. It is not: the helper is declared in the component body but only ever called from the
    // submit handler, after a failed validation, which is exactly the "event handler" case the rule
    // says is allowed.
    'react/refs': 'off',
    // `set-state-in-effect` fires on `RetainedContextMessage`, whose effect exists precisely because
    // the value cannot be derived during render: `GET /workspace/context` reports both "never
    // chosen" and "selection ended" as `effectiveWarehouseId: null`, and the Warehouse a withdrawn
    // membership named can disappear from `warehouses` altogether, so the last selection has to be
    // remembered across a refetch. See the comment at the effect and
    // docs/change-requests/workspace-warehouse/spec.md CR-RG-03.
    'react/set-state-in-effect': 'off',

    // ---- `typescript/no-unnecessary-condition` is OFF for this application. The baseline runs it
    // (`apps/server` and `packages/*` are clean under it), but in `apps/web` it is unsound, and the
    // reason is one compiler option rather than any of the individual findings.
    //
    // `noUncheckedIndexedAccess` is not enabled anywhere in this repository, so indexing an array
    // or a record yields `T` rather than `T | undefined`. The rule believes that type. This
    // application does not — it guards index access, correctly — so the rule reads every one of
    // those guards as dead code and would have them deleted.
    //
    // All eight findings left after the honest ones were fixed are that same false positive, and
    // every one of them is load-bearing at runtime:
    //
    //   - `RoleDirectory` / `WorkspaceRoleDirectory` / `WarehousesTab`: `roles.find(…) ?? roles[0]`
    //     is `undefined` when the list is empty, so `!selectedRole ? null : …` is what keeps an
    //     empty Workspace from rendering an editor over nothing.
    //   - `PurchaseDraftRefusalAlert`: `codes[code]` is `undefined` for a code the map does not
    //     carry, and `validationKey === undefined` is the unknown-code fallback sentence.
    //   - `test/setup.ts`: `localeResponses[path]` is `undefined` for a path no fixture answers,
    //     and the ternary that check guards is the 404 branch the mock exists to serve.
    //   - `loader-permission-parity.spec.ts`: `NAMED_SETS[trimmed]` is the lookup-miss guard.
    //   - `module-boundaries.spec.ts`: already annotated `readonly string[] | undefined` by hand;
    //     the rule reads the `as Record<…>` cast beside it instead of the annotation.
    //   - `readiness-removal.spec.ts`: a named capture group that did not participate is
    //     `undefined`, which `RegExpExecArray['groups']` does not express.
    //
    // Taking the rule's advice at any of those sites injects a crash. Revisit if
    // `noUncheckedIndexedAccess` is ever turned on — at that point the rule becomes sound here and
    // this entry should go.
    'typescript/no-unnecessary-condition': 'off',

    // ---- react-perf. The plugin is listed above so that turning these on is a one-word change,
    // but all four are OFF, and the measurement is why.
    //
    // The idea is the prop-level counterpart to `jsx-no-constructed-context-values`: an object,
    // array, function or element written inline as a prop is a new identity on every render, which
    // defeats `React.memo` on the child. In this application that describes ordinary, correct code.
    // Measured on `apps/web/src`: 168 `jsx-no-new-function-as-prop`, 56 `jsx-no-new-array-as-prop`,
    // 43 `jsx-no-new-object-as-prop`, 31 `jsx-no-jsx-as-prop` — 298 findings.
    //
    // They are not a backlog. The dominant shape is React Hook Form's own API —
    // `<Controller render={({ field, fieldState }) => …} />`, which cannot be written any other way
    // — followed by every inline `onPress`/`onChange` handler in the tree. Nothing here is memoised
    // on the receiving side, so hoisting them would add `useCallback` noise for no measured gain.
    //
    // The cost of leaving them at `warn` is not cosmetic: `.husky/pre-commit` runs
    // `oxlint --type-aware --max-warnings=0` on staged files, so 298 warnings spread across the
    // component tree would make most of `apps/web` uncommittable.
    //
    // Turn them on per-directory, if ever, around components that are actually memoised.
    'react-perf/jsx-no-jsx-as-prop': 'off',
    'react-perf/jsx-no-new-array-as-prop': 'off',
    'react-perf/jsx-no-new-function-as-prop': 'off',
    'react-perf/jsx-no-new-object-as-prop': 'off',

    // ---- jsx-a11y. All 33 rules map one for one, but oxlint files every one of them under
    //      `correctness`, so enabling the plugin would make them all errors. This application runs
    //      them at `warn`, so each is restated at the severity it actually had.
    'jsx-a11y/alt-text': 'warn',
    'jsx-a11y/anchor-has-content': 'warn',
    'jsx-a11y/anchor-is-valid': 'warn',
    'jsx-a11y/aria-activedescendant-has-tabindex': 'warn',
    'jsx-a11y/aria-props': 'warn',
    'jsx-a11y/aria-proptypes': 'warn',
    'jsx-a11y/aria-role': ['warn', { ignoreNonDOM: true }],
    'jsx-a11y/aria-unsupported-elements': 'warn',
    'jsx-a11y/autocomplete-valid': 'warn',
    'jsx-a11y/click-events-have-key-events': 'warn',
    'jsx-a11y/control-has-associated-label': 'warn',
    'jsx-a11y/heading-has-content': 'warn',
    'jsx-a11y/html-has-lang': 'warn',
    'jsx-a11y/iframe-has-title': 'warn',
    'jsx-a11y/img-redundant-alt': 'warn',
    'jsx-a11y/interactive-supports-focus': 'warn',
    'jsx-a11y/label-has-associated-control': 'off', // Can be too strict
    'jsx-a11y/media-has-caption': 'warn',
    'jsx-a11y/mouse-events-have-key-events': 'warn',
    'jsx-a11y/no-access-key': 'warn',
    'jsx-a11y/no-aria-hidden-on-focusable': 'warn',
    'jsx-a11y/no-autofocus': ['warn', { ignoreNonDOM: true }],
    'jsx-a11y/no-distracting-elements': 'warn',
    'jsx-a11y/no-interactive-element-to-noninteractive-role': 'warn',
    'jsx-a11y/no-noninteractive-element-interactions': 'warn',
    'jsx-a11y/no-noninteractive-element-to-interactive-role': 'warn',
    'jsx-a11y/no-noninteractive-tabindex': 'warn',
    'jsx-a11y/no-redundant-roles': 'warn',
    'jsx-a11y/no-static-element-interactions': 'warn',
    'jsx-a11y/role-has-required-aria-props': 'warn',
    'jsx-a11y/role-supports-aria-props': 'warn',
    'jsx-a11y/scope': 'warn',
    'jsx-a11y/tabindex-no-positive': 'warn',
    // NOT ADOPTED: `prefer-tag-over-role` is oxlint's own addition to the plugin — it has no
    // `eslint-plugin-jsx-a11y` counterpart in the configured set, and it arrives as an error because
    // it too is `correctness`. Its 14 findings are `role="status"` live regions and the
    // `role="dialog"` queries the dialog specs use to find a React Aria dialog. Neither is
    // replaceable by the tag the rule proposes: `<output>` is a form-associated element with its own
    // labelling semantics rather than a general live region, and React Aria renders the dialog
    // element itself. Adopting it would mean rewriting working accessible markup on the rule's word.
    'jsx-a11y/prefer-tag-over-role': 'off',

    // ---- TypeScript override for React: a JSX event handler and an `onClick` may return a
    //      promise, so the void-return check is switched off for arguments and attributes only.
    'typescript/no-misused-promises': [
      'error',
      { checksVoidReturn: { arguments: false, attributes: false } },
    ],

    // ---- Redux Toolkit reducers mutate `state` via Immer, so that one parameter is exempt.
    'no-param-reassign': [
      'warn',
      { props: true, ignorePropertyModificationsFor: ['state'] },
    ],

    // ---- Function naming (UI-specific preference).
    'func-names': ['error', 'always', { generators: 'never' }],
    // NOTE: the `effectiveWarehouseId` control that used to sit in `apps/web/eslint.config.mjs` is
    // not here. It was a `no-restricted-syntax` rule, which oxlint does not implement, and it now
    // lives in `src/test/effective-warehouse-id/effective-warehouse-id.spec.ts` — where it is
    // stronger, because a spec cannot be waved through with an inline disable comment and its
    // matcher is driven by teeth cases rather than only by a corpus that happens to be clean.
    // See docs/change-requests/workspace-warehouse/spec.md CR-AC-06/CR-AC-09.
  },
});
