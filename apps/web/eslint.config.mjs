import uiConfig from "@warehouser/eslint-config-ui";

export default [
  ...uiConfig,
  {
    ignores: ["dist/**", "node_modules/**"]
  },
  {
    // The Warehouse a screen operates on is its address, not ambient state.
    // `effectiveWarehouseId` is the stored selection — where the actor has
    // been, not what they may see or do. Every reader beyond the three
    // allowlisted below would be a route back to the cross-Warehouse leak
    // this change request removes, so any other reference in non-test web
    // sources fails lint. See docs/change-requests/workspace-warehouse/
    // spec.md CR-AC-06/CR-AC-09 and sad.md §4/§5.
    files: ["src/**/*.{ts,tsx}"],
    ignores: [
      "src/guards/landing.guard.ts",
      "src/shared/layouts/WarehouseSwitcher.tsx",
      "src/modules/warehouse/hooks/useRecordWarehouseEntry.ts",
      "**/*.spec.ts",
      "**/*.spec.tsx",
      "src/test/**"
    ],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: "Identifier[name='effectiveWarehouseId']",
          message:
            "effectiveWarehouseId is restricted to its three allowlisted readers (landing.guard.ts, WarehouseSwitcher.tsx, useRecordWarehouseEntry.ts). It records where the actor has been and grants nothing; every other screen must take its Warehouse from the route, not this stored selection."
        }
      ]
    }
  }
];
