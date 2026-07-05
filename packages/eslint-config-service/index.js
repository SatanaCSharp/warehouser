// @ts-check
import baseConfig from '@warehouser/eslint-config-base';

export default [
  ...baseConfig,
  {
    languageOptions: {
      sourceType: 'commonjs',
      parserOptions: {
        projectService: true,
      },
    },
    rules: {
      // NestJS-specific rule overrides
      '@typescript-eslint/no-explicit-any': 'off', // Common in NestJS decorators and dependency injection
      '@typescript-eslint/no-floating-promises': 'warn', // Warn about unhandled promises
      '@typescript-eslint/no-unsafe-argument': 'warn', // Warn about unsafe arguments
      '@typescript-eslint/no-unsafe-assignment': 'warn', // Warn about unsafe assignments
      '@typescript-eslint/no-unsafe-call': 'warn', // Warn about unsafe calls
      '@typescript-eslint/no-unsafe-member-access': 'warn', // Warn about unsafe member access
      '@typescript-eslint/no-unsafe-return': 'warn', // Warn about unsafe returns
      '@typescript-eslint/explicit-function-return-type': 'off', // NestJS decorators make this verbose
      '@typescript-eslint/explicit-module-boundary-types': 'off', // NestJS uses implicit types often
      'no-undef': 'off', // TypeScript handles this better than ESLint
    },
  },
  {
    files: ['./src/**/*.spec.ts'],
    rules: {
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/unbound-method': 'off',
    },
  },
];
