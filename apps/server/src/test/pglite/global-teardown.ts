/* eslint-disable no-relative-import-paths/no-relative-import-paths --
 * Jest loads globalTeardown outside its module registry, so the
 * `moduleDirectories` baseUrl does not apply here.
 */
/** Removes the template dump `global-setup` built. */
import { rmSync } from 'node:fs';

import { PGLITE_DIRECTORY_KEY } from './global-setup';

export default (): void => {
  const directory = (globalThis as Record<symbol, unknown>)[
    PGLITE_DIRECTORY_KEY
  ] as string | undefined;

  if (directory) {
    rmSync(directory, { recursive: true, force: true });
  }
};
