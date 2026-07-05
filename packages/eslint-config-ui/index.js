import baseConfig from '@warehouser/eslint-config-base';
import importPlugin from 'eslint-plugin-import';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import jsxA11y from 'eslint-plugin-jsx-a11y';

const baseConfigArray = baseConfig;
export default [
  ...baseConfigArray,
  {
    ignores: [
      '.next/**',
      'out/**',
      'dist/**',
      'build/**',
      '.output/**',
      'eslint.config.js',
      'next-env.d.ts',
      'postcss.config.mjs',
      '*.config.js',
      '*.config.ts',
      '.storybook/**',
    ],
  },
  {
    plugins: {
      react,
      'react-hooks': reactHooks,
      'jsx-a11y': jsxA11y,
      import: importPlugin,
    },
    settings: {
      react: {
        version: 'detect',
      },
      'import/resolver': {
        typescript: {
          alwaysTryTypes: true,
          project: './tsconfig.json',
        },
        node: {
          extensions: ['.js', '.jsx', '.ts', '.tsx'],
        },
      },
      'import/extensions': ['.js', '.jsx', '.ts', '.tsx'],
    },
    languageOptions: {
      parserOptions: {
        ecmaFeatures: {
          jsx: true,
        },
      },
    },
    rules: {
      // Import plugin rules for TypeScript path resolution
      // Note: import/no-unresolved is turned off because TypeScript handles this
      // and the resolver can have issues with baseUrl paths
      'import/no-unresolved': 'off',
      'import/named': 'error',
      'import/no-self-import': 'error',
      'import/no-cycle': 'warn',
      'import/no-useless-path-segments': 'warn',
      'import/newline-after-import': 'warn',
      'import/no-duplicates': 'warn',
      'import/first': 'warn',
      // Configure import/order for consistent import organization
      'import/order': [
        'warn',
        {
          groups: [
            'builtin',
            'external',
            'internal',
            'parent',
            'sibling',
            'index',
            'object',
            'type',
          ],
          'newlines-between': 'always',
          alphabetize: {
            order: 'asc',
            caseInsensitive: true,
          },
        },
      ],

      // Disable simple-import-sort rules from base config in favor of import/order
      'simple-import-sort/imports': 'off',
      'simple-import-sort/exports': 'off',

      // Import rules
      'import/extensions': [
        'error',
        'ignorePackages',
        {
          ts: 'never',
          tsx: 'never',
          js: 'never',
          jsx: 'never',
        },
      ],

      // React plugin rules
      'react/react-in-jsx-scope': 'off', // Not needed in React 17+
      'react/prop-types': 'off', // Using TypeScript for type checking
      'react/display-name': 'off', // Not needed with TypeScript
      'react/function-component-definition': [
        'error',
        {
          namedComponents: 'arrow-function',
          unnamedComponents: 'arrow-function',
        },
      ],
      'react/require-default-props': 'off', // Using TypeScript default parameters
      'react/jsx-props-no-spreading': 'off',
      'react/jsx-no-useless-fragment': ['error', { allowExpressions: true }],
      'react/jsx-key': [
        'error',
        { checkFragmentShorthand: true, checkKeyMustBeforeSpread: true },
      ],
      'react/jsx-no-duplicate-props': 'error',
      'react/jsx-no-undef': 'error',
      'react/jsx-uses-react': 'off', // Not needed in React 17+
      'react/jsx-uses-vars': 'error',
      'react/no-array-index-key': 'warn',
      'react/no-danger': 'warn',
      'react/no-deprecated': 'warn',
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
      'react/prefer-stateless-function': 'warn',

      // React Hooks rules
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',

      // JSX A11y rules
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

      // TypeScript ESLint overrides for React
      '@typescript-eslint/no-misused-promises': [
        'error',
        {
          checksVoidReturn: {
            arguments: false,
            attributes: false,
          },
        },
      ],

      // Redux Toolkit reducers mutate state via Immer — allow state param props
      'no-param-reassign': [
        'warn',
        {
          props: true,
          ignorePropertyModificationsFor: ['state'],
        },
      ],

      // Function naming (UI-specific preference)
      'func-names': ['error', 'always', { generators: 'never' }],
    },
  },
];
