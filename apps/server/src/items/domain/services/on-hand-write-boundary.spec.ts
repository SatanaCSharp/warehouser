// T6 — the executable form of AC-18a. `spec.md` §5 AC-18a and `sad.md` §6.3 both state the same
// negative rule: On-hand Quantity "moves only through an adjustment that states its reason", and
// **nothing else in this release writes it, Arrival Confirmation included**. A behavioural test can
// only prove that of code that already exists; this one is a source-level boundary, so it fails the
// moment a later task (T15, `purchase-drafts/` Arrival Confirmation) starts writing the figure.
//
// It follows the source-scanning idiom `shared/domain/repositories/repository-boundaries.spec.ts`
// already uses for the "shared repositories never import a feature module" rule.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const sourceRoot = join(__dirname, '../../..');
const repositoryDirectory = join(sourceRoot, 'shared/domain/repositories');

const collectProductionSources = (
  directory: string,
): Array<{ path: string; source: string }> =>
  readdirSync(directory).flatMap((entry) => {
    const absolute = join(directory, entry);
    if (statSync(absolute).isDirectory()) {
      return collectProductionSources(absolute);
    }
    if (!entry.endsWith('.ts') || entry.includes('.spec.')) {
      return [];
    }
    return [
      {
        path: absolute.slice(sourceRoot.length + 1),
        source: readFileSync(absolute, 'utf8'),
      },
    ];
  });

// Every production file this release allows to so much as *name* the Item's on-hand figure, and why:
//
// - `on-hand-adjustment.predicates.ts` names the column the AC-09 rule is derived from, in a comment.
// - `create-item.command.ts` records that a new Item starts with nothing on hand (AC-06).
// - `list-warehouse-items.query.ts` reads the figure back for the Item list (AC-08).
// - `item.entity.ts` is the column itself.
// - `item-catalogue.repository.ts` writes the AC-06 starting figure and reads it back for the Item
//   list and the consolidated demand.
// - `item-stock-adjustment.repository.ts` is the single path by which an *existing* figure moves:
//   the member's counted figure and its immutable adjustment row, as one atomic pair (sad.md §6.3).
//
// This list is the tripwire, not the rule: a new entry is a deliberate decision about AC-18a, and a
// reader adding one has to say whether the new file reads the figure or moves it. Only the second
// kind is forbidden, and the two assertions below are what forbid it.
const ALLOWED_TO_NAME_THE_FIGURE = [
  'items/domain/predicates/on-hand-adjustment.predicates.ts',
  'items/usecases/commands/create-item.command.ts',
  'items/usecases/queries/list-warehouse-items.query.ts',
  'shared/domain/entities/item.entity.ts',
  'shared/domain/repositories/item-catalogue.repository.ts',
  'shared/domain/repositories/item-stock-adjustment.repository.ts',
];

// The one repository allowed to move the figure of an Item that already exists (AC-08, AC-18a).
const THE_SINGLE_WRITE_PATH = 'item-stock-adjustment.repository.ts';

describe('the On-hand Quantity write boundary (AC-18a)', () => {
  const namingTheFigure = collectProductionSources(sourceRoot)
    .filter(({ source }) => /onHandQuantity|on_hand_quantity/u.test(source))
    .map(({ path }) => path)
    .sort();

  it('is named by exactly the files this release allows to name it', () => {
    expect(namingTheFigure).toEqual(ALLOWED_TO_NAME_THE_FIGURE);
  });

  // server-architecture.md §Dependency direction — "persistence access stays inside specialized
  // concrete repositories", so a repository update is the only shape by which an existing Item's
  // figure can move. Exactly one repository is allowed to write one.
  const otherRepositories = readdirSync(repositoryDirectory).filter(
    (fileName) =>
      fileName.endsWith('.repository.ts') && fileName !== THE_SINGLE_WRITE_PATH,
  );

  it.each(otherRepositories)('%s updates no on-hand figure', (fileName) => {
    const source = readFileSync(join(repositoryDirectory, fileName), 'utf8');

    expect(source).not.toMatch(/update\([^;]*?onHandQuantity/su);
    expect(source).not.toMatch(/set\([^;]*?onHandQuantity/su);
  });

  // AC-08 / CONTEXT.md §Invariants — On-hand Quantity is **set to a counted figure**, never
  // expressed as an increase or a decrease applied to the figure already stored. A
  // `SET on_hand_quantity = on_hand_quantity + n` write, in any spelling, is the shape this forbids.
  it.each(ALLOWED_TO_NAME_THE_FIGURE)(
    '%s never derives the figure from the one already stored',
    (path) => {
      const source = readFileSync(join(sourceRoot, path), 'utf8');

      expect(source).not.toMatch(
        /onHandQuantity\s*[+-]|[+-]\s*onHandQuantity/u,
      );
      expect(source).not.toMatch(
        /on_hand_quantity\s*=\s*on_hand_quantity|\.(?:increment|decrement)\(/u,
      );
    },
  );
});
