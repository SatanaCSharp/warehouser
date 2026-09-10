import {
  isFeatureModulePath,
  isMapperModulePath,
  mapperDirectoryLayer,
  mapperLayerFor,
  valueImportersOf,
} from 'test/architectural/mapper-placement';
import type { MappingDeclaration } from 'test/architectural/mapping-patterns';
import { serverMappingDeclarations } from 'test/architectural/mapping-patterns';
import {
  productionSourceFiles,
  serverPath,
} from 'test/architectural/server-project';
import { describe, expect, it } from 'vitest';

/** Where a mapping is allowed to be declared, checked against the whole `apps/server` source tree.
 *
 * `server-architecture.md` § "Layer responsibilities → Domain" puts every mapping between a shared
 * persistence entity and a feature-owned domain object in `<feature-name>/domain/mappers/`, and
 * § REST puts the wire-shape translation in the REST layer, where `purchase-drafts/rest/mappers/`
 * holds it. Neither may be written into the file that happens to need it: a mapping inlined beside
 * its one caller is invisible to the next feature that needs the same translation, and — for a
 * response mapping — is exactly how a field nobody meant to publish reaches the wire twice, in two
 * copies that then disagree.
 *
 * The detector behind these assertions is `mapping-patterns.ts`; `mapping-patterns.architectural.spec.ts`
 * is what keeps it honest. */

const describeDeclaration = (mapping: MappingDeclaration): string =>
  `${mapping.path}:${mapping.line} ${mapping.name} (${mapping.patterns.join(', ')})`;

const featureMappings = (): readonly MappingDeclaration[] =>
  serverMappingDeclarations().filter((mapping) =>
    isFeatureModulePath(mapping.path),
  );

describe('mapper placement', () => {
  it('declares every mapping under domain/mappers/ or rest/mappers/', () => {
    const misplaced = featureMappings()
      .filter((mapping) => !isMapperModulePath(mapping.path))
      .map(describeDeclaration);

    expect(misplaced).toEqual([]);
  });

  it('never declares a mapping in a file that also uses it', () => {
    const inlined = featureMappings()
      .filter(
        (mapping) =>
          !isMapperModulePath(mapping.path) && mapping.usedInDeclaringFile,
      )
      .map(describeDeclaration);

    expect(inlined).toEqual([]);
  });

  it('keeps a mapper module in the layer that calls it', () => {
    const misdirected = productionSourceFiles()
      .filter((file) => isMapperModulePath(serverPath(file)))
      .flatMap((file) => {
        const path = serverPath(file);
        const required = mapperLayerFor(file);
        const actual = mapperDirectoryLayer(path);

        if (required === undefined || required === actual) {
          return [];
        }

        const consumers = valueImportersOf(file).map(serverPath);

        return [
          `${path} sits in ${actual}/mappers/ but ${required}/mappers/ is what calls it: ${consumers.join(', ')}`,
        ];
      });

    expect(misdirected).toEqual([]);
  });

  it('names every mapper module <subject>.mapper.ts', () => {
    const misnamed = productionSourceFiles()
      .map(serverPath)
      .filter(
        (path) => isMapperModulePath(path) && !path.endsWith('.mapper.ts'),
      )
      .filter((path) => !path.endsWith('.spec.ts'));

    expect(misnamed).toEqual([]);
  });

  it('puts nothing but mappings in a mappers directory', () => {
    const mapperModules = new Set(
      serverMappingDeclarations()
        .filter((mapping) => isMapperModulePath(mapping.path))
        .map((mapping) => mapping.path),
    );

    // A `mappers/` module with no mapping in it is either a misplaced helper or — the reason this
    // assertion is here at all — a mapping written in a shape the detector cannot see, which would
    // silently exempt every copy of that shape everywhere else.
    const empty = productionSourceFiles()
      .map(serverPath)
      .filter((path) => isMapperModulePath(path) && !mapperModules.has(path));

    expect(empty).toEqual([]);
  });
});
