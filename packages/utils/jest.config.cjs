const baseConfig = require('@warehouser/jest-config-preset');

/** @type {import('jest').Config} */
module.exports = {
  ...baseConfig,
  'rootDir': './src',
  moduleDirectories: ['<rootDir>'],
};

