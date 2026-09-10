const baseConfig = require('./jest.config.cjs');

/**
 * The architectural tier: assertions about the shape of the source tree rather than about what it
 * computes at runtime. These specs parse every production file with ts-morph, so they cost seconds
 * where a unit spec costs milliseconds — they run under their own command (`pnpm test:architectural`)
 * and are excluded from the unit tier by path, exactly as the PGlite specs are.
 *
 * @type {import('jest').Config}
 */
module.exports = {
  ...baseConfig,
  testMatch: ['<rootDir>/src/**/*.architectural.spec.ts'],
  testPathIgnorePatterns: ['/node_modules/'],
};
