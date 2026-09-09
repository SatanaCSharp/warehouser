import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

// T13 — the executable form of the coordinator's ruling: "purchase-drafts currently has no
// usecases/ at all, so T16's REST surface would have nothing to call" — the declared public
// surface must be asserted rather than assumed, following
// `customer-orders/module-boundaries.spec.ts`'s (T9) precedent of reading `usecase.module.ts`'s
// source text and asserting its `providers`/`exports` blocks directly, rather than trusting that a
// command file existing implies it is wired into the module. `usecase.module.ts` does not exist
// yet, so this is a legitimate RED.
//
// Scoped narrowly to what T13 introduces — the three transition commands — not a full
// import-graph scan of the module, which is a different task's concern.
const usecaseModulePath = join(__dirname, 'usecases', 'usecase.module.ts');

const readUsecaseModuleSource = (): string =>
  readFileSync(usecaseModulePath, 'utf8');

const providersBlockOf = (source: string): string | undefined =>
  /providers:\s*\[(?<providers>[^\]]*)\]/u.exec(source)?.groups?.providers;

const exportsBlockOf = (source: string): string | undefined =>
  /exports:\s*\[(?<providers>[^\]]*)\]/u.exec(source)?.groups?.providers;

describe('purchase-drafts usecase module surface', () => {
  // sad.md §6.7/§6.11 — the freeze/closure/discard transitions are the application boundary
  // T16's REST surface calls through; they must be both provided (constructible by Nest's DI
  // container) and exported (reachable from the feature's `RestModule`).
  it.each([
    'ReadyPurchaseDraftCommand',
    'ClosePurchaseDraftCommand',
    'DiscardPurchaseDraftCommand',
  ])('provides and exports %s from the use-case module', (commandName) => {
    const source = readUsecaseModuleSource();

    expect(providersBlockOf(source)).toMatch(
      new RegExp(`\\b${commandName}\\b`, 'u'),
    );
    expect(exportsBlockOf(source)).toMatch(
      new RegExp(`\\b${commandName}\\b`, 'u'),
    );
  });

  // T14 — `ReadPurchaseDraftQuery`/`ListPurchaseDraftsQuery` are the application boundary the
  // Drift Signal REST surface calls through; a separate `it.each` from the transition commands
  // above so this task's RED does not collide with another task's edits to the same array.
  it.each(['ReadPurchaseDraftQuery', 'ListPurchaseDraftsQuery'])(
    'provides and exports %s from the use-case module',
    (queryName) => {
      const source = readUsecaseModuleSource();

      expect(providersBlockOf(source)).toMatch(
        new RegExp(`\\b${queryName}\\b`, 'u'),
      );
      expect(exportsBlockOf(source)).toMatch(
        new RegExp(`\\b${queryName}\\b`, 'u'),
      );
    },
  );

  // T12/AC-06 — `ListRejectionReasonsQuery` is the application boundary a `/rejection-reasons`
  // route calls through, following `ListPackagingTypesQuery`'s precedent immediately above it. An
  // `@Injectable` that exists but is absent from both blocks compiles clean and passes every unit
  // test while being unreachable from any transport adapter, which is exactly what `lint` and the
  // unit tier cannot catch and this regex assertion can.
  it('provides and exports ListRejectionReasonsQuery from the use-case module', () => {
    const source = readUsecaseModuleSource();

    expect(providersBlockOf(source)).toMatch(/\bListRejectionReasonsQuery\b/u);
    expect(exportsBlockOf(source)).toMatch(/\bListRejectionReasonsQuery\b/u);
  });
});

// T15 — the arrival-confirmation command is this feature's fourth application-boundary member;
// kept as its own `it.each` block, following T14's precedent, so a second concurrent addition to
// this file never collides on the same array literal.
describe('purchase-drafts usecase module surface (T15)', () => {
  it.each([
    'ConfirmPurchaseDraftLineArrivalCommand',
    'RecordPurchaseDraftLineDeliveryCommand',
  ])('provides and exports %s from the use-case module', (commandName) => {
    const source = readUsecaseModuleSource();

    expect(providersBlockOf(source)).toMatch(
      new RegExp(`\\b${commandName}\\b`, 'u'),
    );
    expect(exportsBlockOf(source)).toMatch(
      new RegExp(`\\b${commandName}\\b`, 'u'),
    );
  });
});

// T18 — the by-line read (AC-22) is this module's fifth application-boundary member; its own
// `it.each` block, following T14/T15's precedent, so a concurrent addition never collides on the
// same array literal.
describe('purchase-drafts usecase module surface (T18)', () => {
  it.each(['ListPurchaseDraftLinesQuery'])(
    'provides and exports %s from the use-case module',
    (queryName) => {
      const source = readUsecaseModuleSource();

      expect(providersBlockOf(source)).toMatch(
        new RegExp(`\\b${queryName}\\b`, 'u'),
      );
      expect(exportsBlockOf(source)).toMatch(
        new RegExp(`\\b${queryName}\\b`, 'u'),
      );
    },
  );
});

// T11 — the Rejection amendment command is this module's sixth application-boundary member; its
// own `it.each` block, following T14/T15/T18's precedent, so a concurrent addition never collides
// on the same array literal. `usecase.module.di.spec.ts` (T11) only proves the command constructs
// through Nest injection — `moduleRef.get()` resolves a non-exported provider too, so the export
// claim itself is proved here, over the module's source text, exactly as the other five members
// are.
describe('purchase-drafts usecase module surface (T11)', () => {
  it.each(['AmendPurchaseDraftRejectionCommand'])(
    'provides and exports %s from the use-case module',
    (commandName) => {
      const source = readUsecaseModuleSource();

      expect(providersBlockOf(source)).toMatch(
        new RegExp(`\\b${commandName}\\b`, 'u'),
      );
      expect(exportsBlockOf(source)).toMatch(
        new RegExp(`\\b${commandName}\\b`, 'u'),
      );
    },
  );
});

// T7 — server-architecture.md §Domain: "Domain entities and value objects must not import NestJS,
// HTTP adapters, BullMQ, TypeORM, or concrete persistence models", and server-error-handling.md §5:
// "Domain code and use cases throw framework-independent errors and do not import NestJS
// `HttpException` classes". The predicates and error factories this feature adds are the largest
// single addition this module's `domain/` has taken, so the rule is asserted over the **directory**
// rather than over a hand-written list of files: a file added tomorrow is covered without anyone
// remembering to extend an array (the rotted-list failure mode).
//
// **Scoped to the pure directories, and deliberately so.** T7's Definition of Done says "no file
// under `domain/` imports NestJS, HTTP or TypeORM", which the shipped tree already contradicts:
// `domain/services/purchase-draft-assembly.service.ts` is an `@Injectable()` provider, which
// server-architecture.md §Services sanctions — the rule it states is about entities and value
// objects, not about every file beneath `domain/`. Widening this scan to `services/` would turn a
// green shipped file red for obeying the architecture, so the scan covers `predicates/`,
// `value-objects/` and `errors/`, which is exactly the surface T7 adds to. Recorded rather than
// silently narrowed.
//
// **Two tiers, because the layers differ in what they are for**
// (code-review-back-end-2026-09-09.md). `mappers/` was outside the scan entirely, which is how a
// mapper that built the REST response shape out of `@warehouser/contracts` types passed unnoticed.
// It is scanned now — but not against the pure tier's specifier list, because
// server-architecture.md §"Layer responsibilities → Domain" puts the translation of a **shared
// persistence entity** into a feature-owned object in exactly this directory, so
// `shared/domain/entities/` is the one import a mapper is supposed to have and forbidding it here
// would turn a conforming file red.
//
// `@warehouser/contracts` is deliberately **not** on either list, and that is a limitation worth
// stating rather than hiding: `predicates/` legitimately re-exports the contract's `maxProseLength`
// and `mappers/` legitimately types its input mappings off the contract's request shapes, so no
// specifier rule can separate those from the response shape this review removed. The response-shape
// regression is pinned by name below instead.
describe('purchase-drafts domain independence (T7)', () => {
  // `rest/dtos/` joins the list on this review: server-architecture.md §"Use cases" forbids
  // depending on a REST DTO class outright, and nothing under `domain/` has a reason to.
  const FORBIDDEN_SPECIFIERS = [
    '@nestjs/',
    'typeorm',
    'shared/domain/entities/',
    'rest/dtos/',
  ];

  // What a mapper may not import. It keeps every entry above except the persistence entity, which is
  // its input.
  const FORBIDDEN_MAPPER_SPECIFIERS = FORBIDDEN_SPECIFIERS.filter(
    (specifier) => specifier !== 'shared/domain/entities/',
  );

  const PURE_DOMAIN_DIRECTORIES = ['predicates', 'value-objects', 'errors'];

  const walk = (directory: string): readonly string[] =>
    readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) {
        return walk(path);
      }
      return entry.isFile() &&
        entry.name.endsWith('.ts') &&
        !entry.name.endsWith('.spec.ts')
        ? [path]
        : [];
    });

  const domainSourceFiles = (): readonly string[] =>
    PURE_DOMAIN_DIRECTORIES.flatMap((directory) =>
      walk(join(__dirname, 'domain', directory)),
    );

  const mapperSourceFiles = (): readonly string[] =>
    walk(join(__dirname, 'domain', 'mappers'));

  /** The module specifiers a file actually imports, rather than every substring in it. Scanning raw
   * text made a *comment* naming a forbidden path fail the check — and, worse, would have let a
   * comment be what made it pass. Both `from '…'` and a dynamic `import('…')` are read. */
  const importedSpecifiers = (path: string): readonly string[] =>
    [
      ...readFileSync(path, 'utf8').matchAll(
        /(?:from|import)\s*\(?\s*['"](?<specifier>[^'"]+)['"]/gu,
      ),
    ].map((match) => match.groups?.specifier ?? '');

  const offendersImporting = (
    paths: readonly string[],
    specifier: string,
  ): readonly string[] =>
    paths.filter((path) =>
      importedSpecifiers(path).some((imported) => imported.includes(specifier)),
    );

  // The scan proves nothing unless it reaches this feature's own additions, so the two modules
  // T7 adds are named here — the one assertion in this block that is about placement rather than
  // about independence.
  it.each([
    'predicates/purchase-draft-condition.predicates.ts',
    'value-objects/line-condition.ts',
  ])('reaches %s under domain/', (relativePath) => {
    expect(
      domainSourceFiles().map((path) =>
        path.slice(join(__dirname, 'domain').length + 1),
      ),
    ).toContain(relativePath);
  });

  it.each(FORBIDDEN_MAPPER_SPECIFIERS)(
    'imports nothing from %s anywhere under domain/mappers/',
    (specifier) => {
      const offenders = offendersImporting(mapperSourceFiles(), specifier);

      expect(offenders).toEqual([]);
    },
  );

  it('scans the mappers, which is the layer the response-shape regression hid in', () => {
    expect(
      mapperSourceFiles().map((path) =>
        path.slice(join(__dirname, 'domain', 'mappers').length + 1),
      ),
    ).toEqual(expect.arrayContaining(['line-condition.mapper.ts']));
  });

  // The regression a specifier list cannot express, named outright: this mapper's job is the
  // condition account a read serves, and it must produce the **feature-owned** form. It once
  // imported `LineCondition`, `PurchaseDraftLineRejection` and `PreReceiptConformance` and returned
  // them, which put the wire shape two layers inward; the contract shapes are assembled in
  // `rest/purchase-draft-response.ts` now.
  it('builds the condition account without reaching for a contract response shape', () => {
    expect(
      importedSpecifiers(
        join(__dirname, 'domain/mappers/line-condition.mapper.ts'),
      ),
    ).not.toContain('@warehouser/contracts/purchase-drafts');
  });

  it.each(FORBIDDEN_SPECIFIERS)(
    'imports nothing from %s anywhere under domain/',
    (specifier) => {
      const offenders = offendersImporting(domainSourceFiles(), specifier);

      expect(offenders).toEqual([]);
    },
  );
});

// The app-tier mirror of the repo-root gate `tests/delivery-addresses/identity-coverage.spec.mjs`
// §"controllers call use cases only". That gate caught this module's controller reaching into
// `domain/mappers/` only *after* the change had been committed and every `apps/server` command was
// green, because the fix-up run's gate never invoked the root suite
// (`_review/review-2026-09-09.md`, finding 1). Asserted here as well so `pnpm test` — the command a
// server change is actually gated on — refuses the regression on its own, without depending on a
// reviewer remembering to run a second suite from the repository root.
//
// server-architecture.md §REST assigns HTTP-input-to-use-case-input translation to the REST layer,
// so the `to*` mappings a controller needs live under `rest/mappers/`; `domain/mappers/` keeps only
// the mappings a *use case* calls. The rule is stated over the whole directory rather than over a
// named file so a new controller inherits it.
describe('purchase-drafts controller layer (review 2026-09-09)', () => {
  const controllersDirectory = join(__dirname, 'rest', 'controllers');

  const controllerSourceFiles = (): readonly string[] =>
    readdirSync(controllersDirectory, { withFileTypes: true })
      .filter(
        (entry) =>
          entry.isFile() &&
          entry.name.endsWith('.controller.ts') &&
          !entry.name.endsWith('.spec.ts'),
      )
      .map((entry) => join(controllersDirectory, entry.name));

  const specifiersOf = (path: string): readonly string[] =>
    [
      ...readFileSync(path, 'utf8').matchAll(
        /(?:from|import)\s*\(?\s*['"](?<specifier>[^'"]+)['"]/gu,
      ),
    ].map((match) => match.groups?.specifier ?? '');

  it('scans the controllers, so the rule below cannot pass vacuously', () => {
    expect(
      controllerSourceFiles().map((path) =>
        path.slice(controllersDirectory.length + 1),
      ),
    ).toEqual(expect.arrayContaining(['purchase-drafts.controller.ts']));
  });

  it('imports no purchase-drafts domain code from any controller', () => {
    const offenders = controllerSourceFiles().flatMap((path) =>
      specifiersOf(path)
        .filter((specifier) => specifier.includes('purchase-drafts/domain/'))
        .map(
          (specifier) =>
            `${path.slice(controllersDirectory.length + 1)} -> ${specifier}`,
        ),
    );

    expect(offenders).toEqual([]);
  });
});
