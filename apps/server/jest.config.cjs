const baseConfig = require('@warehouser/jest-config-preset');

/** @type {import('jest').Config} */
module.exports = {
  ...baseConfig,
  rootDir: '.',
  moduleDirectories: ['<rootDir>/src', 'node_modules'],
  testMatch: ['<rootDir>/{src,migrations}/**/*.spec.ts'],
  testRegex: undefined,
};
