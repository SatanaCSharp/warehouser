import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';

import { Project, type SourceFile } from 'ts-morph';

/** The `apps/server` directory, found by walking up from this file until the package manifest that
 * names the server appears. Resolved rather than hard-coded relative to `__dirname` so the specs
 * keep working from `src/` under ts-jest and from `dist/` if they are ever compiled. */
const findServerRoot = (): string => {
  let directory = __dirname;

  for (;;) {
    const manifest = join(directory, 'package.json');

    if (
      existsSync(manifest) &&
      (JSON.parse(readFileSync(manifest, 'utf8')) as { name?: string }).name ===
        '@warehouser/server'
    ) {
      return directory;
    }

    const parent = dirname(directory);

    if (parent === directory) {
      throw new Error(`apps/server root not found above ${__dirname}`);
    }

    directory = parent;
  }
};

export const serverRoot = findServerRoot();

let project: Project | undefined;

/** One ts-morph program over the server's own `tsconfig.json`, built once per Jest module registry
 * and shared by every architectural spec: parsing the source tree twice costs seconds for nothing. */
export const serverProject = (): Project => {
  project ??= new Project({
    tsConfigFilePath: join(serverRoot, 'tsconfig.json'),
    skipAddingFilesFromTsConfig: false,
  });

  return project;
};

/** A path relative to `apps/server`, with POSIX separators, so assertions and failure messages read
 * the same on every platform. */
export const serverPath = (file: SourceFile): string =>
  relative(serverRoot, file.getFilePath()).split(sep).join('/');

/** Production server code: everything the runtime loads. Specs, shared test support and migrations
 * are excluded — a factory that builds a fixture is not an application mapper, and migrations are
 * generated. */
export const isProductionPath = (path: string): boolean =>
  path.startsWith('src/') &&
  !path.startsWith('src/test/') &&
  !path.endsWith('.spec.ts') &&
  !path.endsWith('.d.ts');

export const productionSourceFiles = (): readonly SourceFile[] =>
  serverProject()
    .getSourceFiles()
    .filter((file) => isProductionPath(serverPath(file)));
