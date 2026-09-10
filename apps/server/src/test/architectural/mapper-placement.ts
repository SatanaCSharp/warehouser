import {
  productionSourceFiles,
  serverPath,
} from 'test/architectural/server-project';
import type { SourceFile } from 'ts-morph';

/** The two directories a mapping may be declared in, per `server-architecture.md`:
 *
 * - `<module>/domain/mappers/` — "Mappings between shared persistence entities and feature-owned
 *   domain objects belong in `<feature-name>/domain/mappers/`", invoked by a use case or a domain
 *   service above the repository boundary;
 * - `<module>/rest/mappers/` — the REST boundary's own translation between the wire shape and the
 *   use-case boundary, which `purchase-drafts` established when the 2026-09-09 review moved the
 *   request mappings out of the controller.
 *
 * Which of the two a given mapping belongs to follows its consumer, which is what
 * `mapperLayerFor` decides. */
export const MAPPER_DIRECTORY =
  /^src\/[a-z0-9-]+\/(?<layer>domain|rest)\/mappers\/[^/]+$/u;

export type MapperLayer = 'domain' | 'rest';

/** `shared/` is server-wide infrastructure, not a feature module: it has no `domain/mappers` or
 * `rest/mappers` to hold a mapping, and the architecture puts every feature mapping in the owning
 * feature anyway. A repository that shapes its own raw rows next to the query producing them —
 * `permissionRows`, `capturedDeliveryStatement` — is persistence-internal and stays where it is;
 * `src/test/` is test support. Both are outside this rule. */
export const isFeatureModulePath = (path: string): boolean =>
  /^src\/[a-z0-9-]+\//u.test(path) &&
  !path.startsWith('src/shared/') &&
  !path.startsWith('src/test/');

export const featureModuleOf = (path: string): string | undefined =>
  isFeatureModulePath(path) ? path.split('/')[1] : undefined;

export const isMapperModulePath = (path: string): boolean =>
  MAPPER_DIRECTORY.test(path);

export const mapperDirectoryLayer = (path: string): MapperLayer | undefined => {
  const matched = MAPPER_DIRECTORY.exec(path);

  return matched?.groups === undefined
    ? undefined
    : (matched.groups.layer as MapperLayer);
};

/** The layer a file belongs to. Everything a use case, a domain service, a handler or a repository
 * can reach is `domain` for this rule's purpose; only the REST surface is `rest`. */
export const layerOf = (path: string): MapperLayer =>
  /^src\/[a-z0-9-]+\/rest\//u.test(path) ? 'rest' : 'domain';

/** Files that import `file` and can actually call what it exports.
 *
 * Type-only imports do not count: a controller naming `ItemCatalogueEntryRead` to type its own
 * parameter is not a REST consumer of the domain mapping that produces it, and treating it as one
 * would drag domain mappings out into `rest/`. */
export const valueImportersOf = (file: SourceFile): readonly SourceFile[] =>
  productionSourceFiles().filter((candidate) => {
    if (candidate === file) {
      return false;
    }

    return candidate.getImportDeclarations().some((declaration) => {
      if (declaration.getModuleSpecifierSourceFile() !== file) {
        return false;
      }

      if (declaration.isTypeOnly()) {
        return false;
      }

      const named = declaration.getNamedImports();

      return (
        named.length === 0 ||
        named.some((specifier) => !specifier.isTypeOnly()) ||
        declaration.getDefaultImport() !== undefined ||
        declaration.getNamespaceImport() !== undefined
      );
    });
  });

/** Where a mapper module has to live given who calls it: `rest/mappers/` when the REST surface is
 * its only caller, `domain/mappers/` as soon as anything inward — a use case, a domain service, a
 * handler — calls it too. A module nobody calls yet keeps whichever of the two it already has. */
export const mapperLayerFor = (file: SourceFile): MapperLayer | undefined => {
  const consumers = valueImportersOf(file).map((consumer) =>
    layerOf(serverPath(consumer)),
  );

  if (consumers.length === 0) {
    return undefined;
  }

  return consumers.every((layer) => layer === 'rest') ? 'rest' : 'domain';
};
