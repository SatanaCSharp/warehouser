// T17 — the CR-RG-05 path rewrite: which source path at `baseline_revision` became which source
// path at `HEAD`.
//
// `spec.md` CR-RG-05's Method says to "rewrite every moved source path to its post-move path".
// t17-compare-chunk-manifest.md's Definition of Done adds the constraint that matters: the rewrite
// must be "reviewable as an explicit mapping rather than a fuzzy match". So every pair below is
// written out by hand. A prefix rule would silently absorb a file this request never moved, and
// the whole point of the comparison is that nothing moved except what was declared.
//
// The mapping is applied to the `HEAD` side only, so the committed baseline is never rewritten.

/** CH-W6 (T6): `shared/api/*.ts` grouped into four domain directories. */
const SHARED_API_MOVES = [
  [
    'apps/web/src/shared/api/api-client.ts',
    'apps/web/src/shared/api/client/api-client.ts',
  ],
  [
    'apps/web/src/shared/api/mutation-outcome.ts',
    'apps/web/src/shared/api/client/mutation-outcome.ts',
  ],
  [
    'apps/web/src/shared/api/access-permissions-api.ts',
    'apps/web/src/shared/api/access/access-permissions-api.ts',
  ],
  [
    'apps/web/src/shared/api/warehouse-path.ts',
    'apps/web/src/shared/api/warehouse/warehouse-path.ts',
  ],
  [
    'apps/web/src/shared/api/workspace-context-api.ts',
    'apps/web/src/shared/api/workspace/workspace-context-api.ts',
  ],
  [
    'apps/web/src/shared/api/workspace-mutation.ts',
    'apps/web/src/shared/api/workspace/workspace-mutation.ts',
  ],
  [
    'apps/web/src/shared/api/workspace-users-api.ts',
    'apps/web/src/shared/api/workspace/workspace-users-api.ts',
  ],
];

const WAREHOUSES_TAB_SLICE = [
  'components/workspace-administration/warehouses/AddWarehouseAction.tsx',
  'components/workspace-administration/warehouses/AddWarehouseDialog.tsx',
  'components/workspace-administration/warehouses/ArchiveWarehouseDialog.tsx',
  'components/workspace-administration/warehouses/GiveWarehouseAccessAction.tsx',
  'components/workspace-administration/warehouses/GiveWarehouseAccessDialog.tsx',
  'components/workspace-administration/warehouses/WarehouseDetailPane.tsx',
  'components/workspace-administration/warehouses/WarehouseLifecycleActions.tsx',
  'components/workspace-administration/warehouses/WarehouseList.tsx',
  'components/workspace-administration/warehouses/WarehouseNameForm.tsx',
  'components/workspace-administration/warehouses/WarehousePeopleList.tsx',
  'components/workspace-administration/warehouses/WarehousesTab.tsx',
  'components/workspace-administration/warehouses/WithdrawWarehouseAccessDialog.tsx',
  'api/warehouse-api.ts',
  'hooks/useAssignWarehouseMembership.ts',
  'hooks/useCreateWarehouse.ts',
  'hooks/useRenameWarehouse.ts',
  'hooks/useRevokeWarehouseMembership.ts',
  'hooks/useSetWarehouseArchival.ts',
  'hooks/warehouse-name-validation.ts',
  'schemas/warehouse-name-form.schema.ts',
];

/** CH-W1 + CH-W2 (T7): the Warehouse administration slice, `modules/warehouse` → `modules/workspace`. */
const SLICE_MOVES = WAREHOUSES_TAB_SLICE.map((suffix) => [
  `apps/web/src/modules/warehouse/${suffix}`,
  `apps/web/src/modules/workspace/${suffix}`,
]);

/** Every declared move, `HEAD` path → `baseline_revision` path. */
export const POST_MOVE_TO_BASELINE_PATH = new Map(
  [...SHARED_API_MOVES, ...SLICE_MOVES].map(([before, after]) => [
    after,
    before,
  ]),
);

/**
 * The five components the splits carved out, and the component each was carved out of.
 *
 * These are the one category CR-RG-05's Method could not anticipate: they are *new source files*,
 * so a module-level diff cannot be empty while they exist, and no rewrite makes them disappear.
 * Filtering them out silently would be the dishonest move. Instead each is admitted by name and
 * held to the thing the criterion actually protects — it must land in the same chunk as its
 * parent, because a split that pushed code across a chunk seam *is* a bundle-shape change.
 */
const WAREHOUSES =
  'apps/web/src/modules/workspace/components/workspace-administration/warehouses';

export const SPLIT_MODULE_PARENTS = new Map([
  [`${WAREHOUSES}/WarehouseSearchField.tsx`, `${WAREHOUSES}/WarehouseList.tsx`],
  [
    `${WAREHOUSES}/WarehouseListSkeleton.tsx`,
    `${WAREHOUSES}/WarehouseList.tsx`,
  ],
  [`${WAREHOUSES}/WarehouseRow.tsx`, `${WAREHOUSES}/WarehouseList.tsx`],
  [`${WAREHOUSES}/WarehouseEnterLink.tsx`, `${WAREHOUSES}/WarehouseList.tsx`],
  [
    `${WAREHOUSES}/WarehousePersonRow.tsx`,
    `${WAREHOUSES}/WarehousePeopleList.tsx`,
  ],
]);

/** Rewrites a `HEAD` module path to the path it had at `baseline_revision`. */
export const toBaselinePath = (headPath) =>
  POST_MOVE_TO_BASELINE_PATH.get(headPath) ?? headPath;
