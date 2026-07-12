// @ts-check
import baseConfig from '@warehouser/eslint-config-base';

export default [
    ...baseConfig,
    {
        ignores: ['eslint.config.mjs', 'dist/**', 'node_modules/**'],
    },
];
