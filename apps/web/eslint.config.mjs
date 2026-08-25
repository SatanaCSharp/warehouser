import uiConfig from '@warehouser/eslint-config-ui';

export default [
  ...uiConfig,
  {
    ignores: ['dist/**', 'node_modules/**'],
  },
  {
    // The Warehouse a screen operates on is its address, not ambient state.
    // `effectiveWarehouseId` is the stored selection — where the actor has
    // been, not what they may see or do. Every reader beyond the three
    // allowlisted below would be a route back to the cross-Warehouse leak
    // this change request removes, so any other reference in non-test web
    // sources fails lint. See docs/change-requests/workspace-warehouse/
    // spec.md CR-AC-06/CR-AC-09 and sad.md §4/§5.
    files: ['src/**/*.{ts,tsx}'],
    ignores: [
      'src/guards/landing.guard.ts',
      'src/shared/components/RetainedContextMessage.tsx',
      'src/modules/warehouse/hooks/effects/useRecordWarehouseEntry.ts',
      '**/*.spec.ts',
      '**/*.spec.tsx',
      'src/test/**',
    ],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: "Identifier[name='effectiveWarehouseId']",
          message:
            'effectiveWarehouseId is restricted to its three allowlisted readers (landing.guard.ts, RetainedContextMessage.tsx, useRecordWarehouseEntry.ts). It records where the actor has been and grants nothing; every other screen must take its Warehouse from the route, not this stored selection.',
        },
        {
          // `ctx['effectiveWarehouseId']` parses as a Literal, not an
          // Identifier, so the selector above cannot see it. Without this the
          // named spec §6 control is bypassable by writing the property as a
          // string — which would read exactly like the reference it forbids.
          selector: "Literal[value='effectiveWarehouseId']",
          message:
            'effectiveWarehouseId is restricted to its three allowlisted readers (landing.guard.ts, RetainedContextMessage.tsx, useRecordWarehouseEntry.ts), including when reached through a computed member access or a string key.',
        },
      ],
    },
  },
];
