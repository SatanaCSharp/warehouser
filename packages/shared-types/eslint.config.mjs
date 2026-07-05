// @ts-check
import baseConfig from '@warehouser/eslint-config-base';

export default [
    ...baseConfig,
    {
        ignores: ['eslint.config.mjs', 'dist/**', 'node_modules/**'],
    },
    // {   TODO the lint-staged has to be fixed
    //     rules: {
    //         '@typescript-eslint/no-base-to-string': 'off'
    //     }
    // }
];
