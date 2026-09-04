import { globSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

// T20 — the companion architecture checks `docs/features/delivery-addresses/sad.md` §10 lists
// beside the observed-Permission rule: "controllers call use cases only; `customers` domain code
// imports no framework; no module imports another module's `domain/errors/`, predicates or DTOs;
// shared repositories import no feature module; `customers` does not import `purchase-drafts`".
//
// Per-module forms of some of these already exist and are left in place —
// `customers/module-boundaries.spec.ts` (T6) owns the `customers` purity and sibling rules,
// `access/` and `warehouses/module-boundaries.spec.ts` own theirs, and
// `shared/domain/repositories/repository-boundaries.spec.ts` owns the repository rules. What none of
// them does is hold **for every module**, and each keeps its own hand-written module list:
//
//   repository-boundaries.spec.ts  ['access','auth','customer-orders','customers','items','users','warehouses','workspaces']
//   access/module-boundaries.spec.ts       ['access','auth','users','warehouses','workspaces']
//
// Both omit `purchase-drafts`, and the second omits four more. Neither is wrong by construction —
// they were right when written and rotted silently as modules were added, which is precisely the
// failure mode sad.md §11 chose mechanical defences to avoid. **This module derives the list from
// the filesystem instead**, so a module added tomorrow is governed the day it appears.

const SOURCE_ROOT = 'apps/server/src';

// A module is a directory directly under `src/`
// (adr/14-08-2026-domain-owned-flat-modules.md §Flatness). `shared/` is explicitly not a module, and
// `test/` is support rather than production code.
const NON_MODULE_DIRECTORIES = new Set(['shared', 'test']);

/** Every feature module, read from disk rather than remembered. */
export const featureModules = () =>
  readdirSync(SOURCE_ROOT)
    .filter((entry) => statSync(join(SOURCE_ROOT, entry)).isDirectory())
    .filter((entry) => !NON_MODULE_DIRECTORIES.has(entry))
    .sort();

/**
 * The production files one rule scans, as `{ file, source }` pairs.
 *
 * `injected` lets a test drive the **same rule** over deliberate fixture sources instead of the
 * tree. That is what makes each positive control below exercise the real code path rather than a
 * re-implementation of it — an inert check that looks like a guard is worse than none
 * (`arrival-confirmation-write-boundary.spec.ts` states the same principle for its own rules).
 *
 * Inline fixture *sources* rather than fixture *files* under `apps/server/src`, for the reason
 * `access/module-boundaries.spec.ts` records: any file under `src/` is compiled by `tsc` and linted
 * by `eslint src`, so a fixture there would make the deliberate violation a real import in the
 * shipped tree.
 */
const productionSources = (pattern, injected) =>
  injected ??
  globSync(pattern)
    .filter((file) => !file.includes('.spec.'))
    .map((file) => ({ file, source: readFileSync(file, 'utf8') }));

const importedSpecifiers = (source) =>
  Array.from(
    source.matchAll(/(?:from|require\()\s*['"]([^'"]+)['"]/gu),
  ).map((match) => match[1]);

/**
 * Specifiers a file imports **for their values** — `import type` excluded.
 *
 * The distinction is the repository's own, not one invented here:
 * `customers/module-boundaries.spec.ts` records that "a domain mapper may name a shared TypeORM
 * persistence entity **by type** — `customer-orders`' mapper already does — while the domain itself
 * imports no framework symbol of its own". A type-only import is erased at compile time; it creates
 * no runtime edge and makes no call.
 *
 * It matters for the controller rule specifically, whose subject is what a controller *does*:
 * `items.controller.ts` names `ItemCatalogueEntryRead` from a domain mapper to annotate a shape, and
 * annotating a shape is not accessing persistence or holding business logic. It stays a value-import
 * rule so that importing the mapper *function* and calling it would still fail.
 */
const valueImportSpecifiers = (source) =>
  Array.from(
    source.matchAll(/(?:^|\n)\s*import\s+(type\s+)?[^;]*?from\s*['"]([^'"]+)['"]/gu),
  )
    .filter((match) => match[1] === undefined)
    .map((match) => match[2]);

/**
 * Whether `specifier` reaches into `moduleName`, in either spelling this application uses: a bare
 * specifier (intra-application imports resolve through `baseUrl: ./src`) or a relative traversal.
 *
 * A scoped package subpath is never a module import. `@warehouser/contracts/customers` names the
 * domain the contract describes, not the module consuming it — the distinction
 * `repository-boundaries.spec.ts` and `access/module-boundaries.spec.ts` both already draw, and
 * without which every module but one is forbidden the contract it must serve.
 */
const reachesModule = (specifier, moduleName) => {
  if (specifier.startsWith('@')) {
    return false;
  }
  const bare = new RegExp(`^${moduleName}/`, 'u');
  const relative = new RegExp(`(?:^|/)\\.\\./${moduleName}/`, 'u');
  return bare.test(specifier) || relative.test(`/${specifier}`);
};

/** The module a production file belongs to, or `null` for `shared/`. */
const owningModule = (file) => {
  const match = new RegExp(`^${SOURCE_ROOT}/([^/]+)/`, 'u').exec(file);
  const owner = match?.[1] ?? null;
  return owner !== null && NON_MODULE_DIRECTORIES.has(owner) ? null : owner;
};

// adding-a-server-module.md §8 — another module's error factories, domain predicates and DTOs are
// reached only through an exported use-case module, never by importing them directly. Stated as the
// path shapes that are module-private.
const MODULE_PRIVATE_SEGMENTS = [
  { pattern: /\/domain\/errors\//u, what: "another module's domain/errors/" },
  { pattern: /\.predicates(?:$|')/u, what: "another module's domain predicate" },
  { pattern: /\/rest\/dtos\//u, what: "another module's rest/dtos/" },
];

/**
 * Every production file that imports a **sibling** module's module-private surface.
 *
 * Scoped to imports that cross a module boundary: a module reaching its own `domain/errors/` is the
 * normal case, and only the sibling edge is the rule.
 */
export const findModulePrivateImports = (injected) => {
  const modules = featureModules();
  const violations = [];

  for (const { file, source } of productionSources(
    `${SOURCE_ROOT}/**/*.ts`,
    injected,
  )) {
    const owner = owningModule(file);

    for (const specifier of importedSpecifiers(source)) {
      for (const sibling of modules) {
        if (sibling === owner || !reachesModule(specifier, sibling)) {
          continue;
        }
        for (const { pattern, what } of MODULE_PRIVATE_SEGMENTS) {
          if (pattern.test(specifier)) {
            violations.push(
              `${file} -> ${specifier}: imports ${what} (module-private, adding-a-server-module.md §8)`,
            );
          }
        }
      }
    }
  }

  return violations;
};

// server-architecture.md §Layer responsibilities — "REST controllers and BullMQ handlers invoke use
// cases. They must not contain business logic or access persistence directly" (apps/server/AGENTS.md
// restates it). Expressed as the imports a controller may not make: persistence, and any module's
// domain internals. A controller reaches its own module through `usecases/`, and `shared/` for
// guards, decorators and the access principal.
const CONTROLLER_FORBIDDEN = [
  {
    pattern: /^shared\/domain\/repositories\//u,
    what: 'a repository (persistence reached directly)',
  },
  {
    pattern: /^shared\/domain\/entities\//u,
    what: 'a persistence entity',
  },
  { pattern: /^typeorm$/u, what: 'TypeORM' },
];

/**
 * Every controller that reaches past its use cases into persistence or a domain internal.
 *
 * The domain rule is derived from the module list rather than written out: a controller may not
 * import `<any module>/domain/`, its own included — the use case is the boundary, and a controller
 * that names a domain symbol is doing business logic in a transport adapter.
 */
export const findControllerLayerViolations = (injected) => {
  const modules = featureModules();
  const violations = [];

  for (const { file, source } of productionSources(
    `${SOURCE_ROOT}/**/*.controller.ts`,
    injected,
  )) {

    for (const specifier of valueImportSpecifiers(source)) {
      for (const { pattern, what } of CONTROLLER_FORBIDDEN) {
        if (pattern.test(specifier)) {
          violations.push(
            `${file} -> ${specifier}: a controller imports ${what}; controllers call use cases only ` +
              '(server-architecture.md §Layer responsibilities)',
          );
        }
      }

      for (const moduleName of modules) {
        if (
          reachesModule(specifier, moduleName) &&
          /\/domain\//u.test(specifier)
        ) {
          violations.push(
            `${file} -> ${specifier}: a controller imports ${moduleName} domain code; controllers ` +
              'call use cases only (server-architecture.md §Layer responsibilities)',
          );
        }
      }
    }
  }

  return violations;
};

/**
 * Every file under `shared/domain/repositories/` importing a feature module.
 *
 * server-architecture.md §"Dependency direction": "shared repositories never depend on dedicated
 * feature modules". `repository-boundaries.spec.ts` already asserts this against a hand-written
 * module list that omits `purchase-drafts`; this is the same rule over the derived list.
 */
export const findRepositoryFeatureImports = (injected) => {
  const modules = featureModules();
  const violations = [];

  for (const { file, source } of productionSources(
    `${SOURCE_ROOT}/shared/domain/repositories/**/*.ts`,
    injected,
  )) {

    for (const specifier of importedSpecifiers(source)) {
      for (const moduleName of modules) {
        if (reachesModule(specifier, moduleName)) {
          violations.push(
            `${file} -> ${specifier}: a shared repository imports the ${moduleName} feature module ` +
              '(server-architecture.md §Dependency direction)',
          );
        }
      }
    }
  }

  return violations;
};

const FRAMEWORK_SPECIFIERS = [
  '@nestjs/typeorm',
  'typeorm',
  'express',
  'node:http',
  'http',
  'bullmq',
];

/**
 * Every file under `customers/domain/` importing a framework symbol.
 *
 * `domain/services/` is exempt for the DI marker alone, exactly as
 * `customers/module-boundaries.spec.ts` and the accepted `workspaces` equivalent record: a domain
 * service is registered as a Nest provider and so carries `@Injectable()`, while TypeORM, HTTP and
 * queue transports stay forbidden everywhere under `domain/`.
 */
export const findCustomersDomainFrameworkImports = (injected) => {
  const violations = [];

  for (const { file, source } of productionSources(
    `${SOURCE_ROOT}/customers/domain/**/*.ts`,
    injected,
  )) {

    for (const specifier of importedSpecifiers(source)) {
      if (FRAMEWORK_SPECIFIERS.includes(specifier)) {
        violations.push(
          `${file} -> ${specifier}: customers domain code imports a framework symbol ` +
            '(server-architecture.md §Domain)',
        );
      }
      if (
        /^@nestjs\//u.test(specifier) &&
        !/\/domain\/services\//u.test(file)
      ) {
        violations.push(
          `${file} -> ${specifier}: customers domain code outside domain/services/ imports NestJS ` +
            '(server-architecture.md §Domain)',
        );
      }
    }
  }

  return violations;
};

/** Every `customers` file importing `purchase-drafts` — sad.md §10's one-directional edge. */
export const findCustomersImportingPurchaseDrafts = (injected) =>
  productionSources(`${SOURCE_ROOT}/customers/**/*.ts`, injected).flatMap(
    ({ file, source }) =>
      importedSpecifiers(source)
        .filter((specifier) => reachesModule(specifier, 'purchase-drafts'))
        .map(
          (specifier) =>
            `${file} -> ${specifier}: customers imports purchase-drafts; the edge is ` +
            'one-directional (sad.md §10)',
        ),
  );

/** Exposed so the teeth checks can drive the same predicate the rules above use. */
export const reachesModuleForTest = reachesModule;
