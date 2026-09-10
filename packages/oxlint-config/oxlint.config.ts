import { createBaseConfig } from '@warehouser/oxlint-config';

/**
 * This package lints itself with the baseline it publishes.
 *
 * The specifier is the package's own name, resolved by Node and TypeScript through the `exports`
 * map in its `package.json` rather than through `node_modules` — the same self-reference the
 * sources in `src` use for each other, so nothing here depends on the workspace link being in
 * place and no specifier has to carry a `.ts` extension.
 */
export default createBaseConfig({ env: { node: true } });
