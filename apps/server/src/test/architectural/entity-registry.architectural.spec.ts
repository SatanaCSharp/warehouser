import {
  productionSourceFiles,
  serverPath,
} from 'test/architectural/server-project';
import { SyntaxKind } from 'ts-morph';
import { describe, expect, it } from 'vitest';

/** Keeps `shared/database/entities.ts` in step with the entity files it lists.
 *
 * TypeORM can find entities by glob, and `shared/database/data-source.ts` still does. The test
 * tiers cannot: Vitest externalizes `typeorm` to Node, so a glob makes TypeORM `require()` the
 * `.ts` files itself, outside the SWC transform, and Node's type stripping rejects the first
 * `@Column()` it meets. The PGlite tier therefore hands `DataSource` a hand-written array instead.
 *
 * A hand-written array of files is exactly the thing that rots: add an entity, forget the barrel,
 * and the integration tier keeps passing — every spec that does not touch the new table still
 * works — until one fails with `EntityMetadataNotFoundError` for a reason that has nothing to do
 * with what it asserts. These assertions are what makes that a build failure instead. */

const ENTITY_REGISTRY = 'src/shared/database/entities.ts';

const entityFilePaths = (): readonly string[] =>
  productionSourceFiles()
    .map(serverPath)
    .filter((path) => path.endsWith('.entity.ts'))
    .sort();

const registeredEntityNames = (): readonly string[] => {
  const registry = productionSourceFiles().find(
    (file) => serverPath(file) === ENTITY_REGISTRY,
  );

  if (!registry) {
    throw new Error(`${ENTITY_REGISTRY} is missing`);
  }

  const declaration = registry.getVariableDeclarationOrThrow('entities');
  const literal = declaration.getInitializerIfKindOrThrow(
    SyntaxKind.ArrayLiteralExpression,
  );

  return literal
    .getElements()
    .map((element) => element.getText())
    .sort();
};

/** `warehouse-membership.entity.ts` → `WarehouseMembershipEntity`. */
const exportedClassNamesOf = (path: string): readonly string[] => {
  const file = productionSourceFiles().find(
    (each) => serverPath(each) === path,
  );

  if (!file) {
    throw new Error(`${path} is missing`);
  }

  return file
    .getClasses()
    .filter((declaration) => declaration.isExported())
    .map((declaration) => declaration.getName() ?? '');
};

describe('entity registry', () => {
  it('lists every *.entity.ts class in shared/database/entities.ts', () => {
    const registered = new Set(registeredEntityNames());

    const missing = entityFilePaths().flatMap((path) =>
      exportedClassNamesOf(path)
        .filter((name) => !registered.has(name))
        .map(
          (name) => `${path} exports ${name}, absent from ${ENTITY_REGISTRY}`,
        ),
    );

    expect(missing).toEqual([]);
  });

  it('lists nothing that is not an exported entity class', () => {
    const declared = new Set(
      entityFilePaths().flatMap((path) => exportedClassNamesOf(path)),
    );

    const stale = registeredEntityNames().filter((name) => !declared.has(name));

    expect(stale).toEqual([]);
  });

  it('imports every entity it lists', () => {
    const registry = productionSourceFiles().find(
      (file) => serverPath(file) === ENTITY_REGISTRY,
    );

    const imported = new Set(
      registry
        ?.getImportDeclarations()
        .flatMap((declaration) =>
          declaration.getNamedImports().map((each) => each.getName()),
        ) ?? [],
    );

    const unimported = registeredEntityNames().filter(
      (name) => !imported.has(name),
    );

    expect(unimported).toEqual([]);
  });
});
