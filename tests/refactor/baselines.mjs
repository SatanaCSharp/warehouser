// Shared constants for the three `baseline_revision` comparison artifacts of the
// `refactor-warehouse-components` change request (docs/change-requests/refactor-warehouse-components/
// tasks/t1-capture-baseline-artifacts.md).
//
// The artifacts live under `apps/web/src/test/baselines/` because that is where the change request
// files them and where the gates that read them resolve `test/…`. The capture script and the gates
// that compare against it both import their locations from here, so a path can never drift between
// the producer and its consumers.

/** The revision every regression boundary of this change request is measured against. */
export const BASELINE_REVISION = '42f1205d552f8284f8ec57358ad9022340b5f76e';

const BASELINES_DIRECTORY = 'apps/web/src/test/baselines';

/** The 39 case names of the pre-split `WarehousesTab.spec.tsx`, grouped by `describe`. */
export const WAREHOUSES_TAB_CASES_PATH = `${BASELINES_DIRECTORY}/warehouses-tab-cases.json`;

/** The normalized module→chunk map — content hashes stripped, keys sorted. */
export const CHUNK_MANIFEST_PATH = `${BASELINES_DIRECTORY}/module-chunk-manifest.json`;

/** A per-file blob digest of the five trees CR-RG-07 fences. */
export const NEIGHBOUR_TREES_PATH = `${BASELINES_DIRECTORY}/neighbour-trees.json`;

/**
 * The five trees `spec.md` CR-RG-07 fences.
 *
 * `modules/warehouse` and `modules/workspace` are deliberately absent: they are the trees this
 * request changes, and digesting them would turn the fence into a snapshot test of the refactor
 * itself.
 */
export const FENCED_TREES = [
  'apps/web/src/modules/access',
  'apps/web/src/modules/auth',
  'apps/web/src/modules/home',
  'apps/server',
  'packages/contracts',
];

/** The pre-split spec the case inventory is captured from, at `BASELINE_REVISION`. */
export const WAREHOUSES_TAB_SPEC_AT_BASELINE =
  'apps/web/src/modules/warehouse/components/workspace-administration/warehouses/WarehousesTab.spec.tsx';

/**
 * Strips vite's content hash from a chunk filename.
 *
 * `vite.config.ts` declares no `manualChunks`, so every emitted filename carries an 8-character
 * content hash (`page-B30SwT_D.js`). Two builds of an identical tree therefore differ in every
 * filename, and CR-RG-05's comparison is meaningless until the hash is removed.
 */
export const stripContentHash = (fileName) =>
  fileName.replace(/-[A-Za-z0-9_-]{8}(\.[a-z]+)$/u, '$1');
