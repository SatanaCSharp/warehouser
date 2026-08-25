// The CR-RG-05 normalization: how a Rollup output map becomes a comparable module→chunk manifest.
//
// T1 captured the `baseline_revision` manifest with exactly this code, and T17 compares a `HEAD`
// build against it. The normalization therefore lives here, in one module both sides import,
// rather than being written twice: `spec.md` CR-RG-05's comparison is only meaningful if the two
// manifests were produced identically, and a second implementation of `chunkKey` or
// `isTrackedModule` that drifted by one character would make the diff report something other than
// the bundle shape.
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

import { stripContentHash } from './baselines.mjs';

/**
 * Only modules the request can actually move are recorded.
 *
 * A dependency's position inside the vendor chunk is not something CR-RG-05 has an opinion about,
 * and recording all of it would make the artifact churn on every lockfile bump. The chunk
 * inventory is what carries the "no new eager chunk" half of the criterion, and it is complete.
 */
export const isTrackedModule = (path) =>
  (path.startsWith('apps/web/src/') || path.startsWith('packages/')) &&
  !path.includes('node_modules');

export const toRepoRelative = (modulePath) =>
  modulePath.replace(`${process.cwd()}/`, '').replace(/^\0/u, '');

/**
 * A chunk identity that survives hash stripping.
 *
 * Stripping the content hash alone is not enough to name a chunk: every lazy route emits a chunk
 * called `page-<hash>.js`, so four distinct route boundaries collapse onto one key and the
 * manifest silently loses exactly the structure CR-RG-05 exists to protect ("every lazy
 * `import('./page')` route boundary is preserved"). A chunk that fronts a module is therefore
 * keyed by that module, which is stable across builds and is the thing the criterion names.
 */
export const chunkKey = (item) => {
  const stripped = stripContentHash(item.fileName);

  return item.facadeModuleId
    ? `${stripped} [${toRepoRelative(item.facadeModuleId)}]`
    : stripped;
};

const sortObject = (entries) =>
  Object.fromEntries([...entries].sort(([a], [b]) => (a < b ? -1 : 1)));

/** Turns a Rollup output array into the sorted `{ modules, chunks }` shape of the artifact. */
export const normalizeOutput = (output) => {
  const modules = [];
  const chunks = [];
  const seen = new Set();

  for (const item of output) {
    const key = chunkKey(item);

    // A collision would make the manifest quietly lossy in the same way the un-disambiguated
    // filename was, so it refuses instead.
    if (seen.has(key)) {
      throw new Error(
        `two output files normalize to the same chunk key '${key}' — ` +
          'the manifest would lose one of them',
      );
    }
    seen.add(key);

    if (item.type !== 'chunk') {
      chunks.push([key, { type: 'asset' }]);
      continue;
    }

    chunks.push([
      key,
      {
        type: 'chunk',
        isEntry: item.isEntry,
        isDynamicEntry: item.isDynamicEntry,
      },
    ]);

    for (const modulePath of Object.keys(item.modules)) {
      const relative = toRepoRelative(modulePath);
      if (isTrackedModule(relative)) {
        modules.push([relative, key]);
      }
    }
  }

  return { modules: sortObject(modules), chunks: sortObject(chunks) };
};

/** Runs the same production build `pnpm --filter @warehouser/web build` runs, in-process. */
export const buildWebBundle = async () => {
  const require = createRequire(
    pathToFileURL(`${process.cwd()}/apps/web/package.json`),
  );
  const { build } = await import(pathToFileURL(require.resolve('vite')).href);

  const result = await build({
    root: 'apps/web',
    configFile: 'apps/web/vite.config.ts',
    logLevel: 'silent',
  });
  const [{ output }] = Array.isArray(result) ? result : [result];

  return output;
};
