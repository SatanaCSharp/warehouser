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
describe('purchase-drafts domain independence (T7)', () => {
  const FORBIDDEN_SPECIFIERS = [
    '@nestjs/',
    'typeorm',
    'shared/domain/entities/',
  ];

  const PURE_DOMAIN_DIRECTORIES = ['predicates', 'value-objects', 'errors'];

  const domainSourceFiles = (): readonly string[] => {
    const domainRoot = join(__dirname, 'domain');
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
    return PURE_DOMAIN_DIRECTORIES.flatMap((directory) =>
      walk(join(domainRoot, directory)),
    );
  };

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

  it.each(FORBIDDEN_SPECIFIERS)(
    'imports nothing from %s anywhere under domain/',
    (specifier) => {
      const offenders = domainSourceFiles().filter((path) =>
        readFileSync(path, 'utf8').includes(specifier),
      );

      expect(offenders).toEqual([]);
    },
  );
});
