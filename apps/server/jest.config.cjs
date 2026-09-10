const baseConfig = require('@warehouser/jest-config-preset');

/** @type {import('jest').Config} */
module.exports = {
  ...baseConfig,
  rootDir: '.',
  moduleDirectories: ['<rootDir>/src', 'node_modules'],
  testMatch: ['<rootDir>/{src,migrations}/**/*.spec.ts'],
  testRegex: undefined,
  // The unit tier. Integration specs are excluded by path rather than by an
  // environment flag, so they cannot be run against a developer's own database
  // by accident — only `jest.pglite.config.cjs`, which provisions a database
  // per test file, opts them back in.
  testPathIgnorePatterns: [
    '/node_modules/',
    '\\.integration\\.spec\\.ts$',
    // The architectural tier parses the whole source tree with ts-morph; `jest.architectural.config.cjs`
    // runs it under its own command rather than making every unit run pay for it.
    '\\.architectural\\.spec\\.ts$',
  ],
};
