// @ts-check
import baseConfig from '@warehouser/eslint-config-base';

export default [
    ...baseConfig,
    {
        ignores: ['eslint.config.mjs', 'dist/**', 'node_modules/**'],
    },
    {
        files: ['./src/**/*.spec.ts'],
        rules: {
            '@typescript-eslint/no-unsafe-assignment': 'off',
            '@typescript-eslint/no-unsafe-member-access': 'off',
            '@typescript-eslint/no-unsafe-call': 'off',
            '@typescript-eslint/no-unsafe-argument': 'off',
            '@typescript-eslint/unbound-method': 'off',
        },
    },
];
