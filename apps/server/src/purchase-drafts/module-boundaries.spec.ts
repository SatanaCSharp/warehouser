import { readFileSync } from 'node:fs';
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
  it.each(['ConfirmPurchaseDraftArrivalCommand'])(
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
