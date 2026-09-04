// T15 — the executable form of AC-15 and `spec.md` §6.1 "Allocation as a back door onto a frozen
// record": "Arrival Confirmation writes only received quantities, Allocations, and the move to
// Closed, and a member holding `PURCHASE_DRAFTS:RECEIVE` cannot reach the frozen lines, ordered
// quantities, links, Expected Arrival Date, or Pre-receipt Requirements through it."
//
// `spec.md` §6 "Frozen-record integrity" measures that target with "Integration checks **and**
// automated architecture checks", and the two prove different things.
// `purchase-draft-line-ending.integration.spec.ts` proves the frozen values of one seeded draft
// come back unchanged — a statement about the code as it stands today. This spec is the source-level
// half: it fails the moment the write path *gains* the ability to touch a frozen field, whether or
// not any test happens to exercise it. ADR 0002 "Consequences" is what makes that testable at all —
// "the frozen columns are not in any statement the confirmation issues, which makes `spec.md` §6.1's
// back-door requirement a property of the write path rather than a check".
//
// **What this spec cannot do**, and why the integration suite carries the other half: it reasons
// about source text, so a statement that is textually clean but unscoped at row level — an UPDATE
// predicated on a caller-supplied identifier alone — passes here. The cross-Warehouse and
// cross-draft cases in `purchase-draft-line-ending.integration.spec.ts` are what close that
// gap.
//
// It follows the source-scanning idiom `items/domain/on-hand-write-boundary.spec.ts`
// already uses for AC-18a, and `shared/domain/repositories/repository-boundaries.spec.ts` before it.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const sourceRoot = join(__dirname, '../../..');

const read = (path: string): string =>
  readFileSync(join(sourceRoot, path), 'utf8');

// The rule is about the statements the confirmation issues, not the prose explaining them: these
// files name the frozen fields in comments precisely to record *why* they are absent from the code.
const stripComments = (source: string): string =>
  source.replace(/\/\*[\s\S]*?\*\//gu, ' ').replace(/\/\/[^\n]*/gu, ' ');

// AC-15's frozen subjects, in both their TypeScript and their column spelling: the lines themselves
// (their Item and ordered quantity), the links (their stated quantity), the Expected Arrival Date,
// and the two halves of the Pre-receipt Requirement (`data-model.md` `packaging_type_id` /
// `value_adding_note`, "Both halves of the Pre-receipt Requirement").
const FROZEN_FIELDS = [
  'orderedQuantity',
  'ordered_quantity',
  'packagingTypeId',
  'packaging_type_id',
  'valueAddingNote',
  'value_adding_note',
  'expectedArrivalDate',
  'expected_arrival_date',
  'statedQuantity',
  'stated_quantity',
  'itemId',
  'item_id',
];

// The two tables whose *contents* AC-15 freezes: a confirmation that added or removed a line or a
// link would leave every column untouched and still be the back door §6.1 forbids.
const FROZEN_TABLES =
  /PurchaseDraftLineEntity|PurchaseDraftLineLinkEntity|purchase_draft_lines|purchase_draft_line_links/u;

// The whole ending: the two `purchase-drafts` halves and the rule service they share, plus the
// demand half ADR 0002 delegates to. T17 replaced the single whole-draft command with the per-line
// pair, and the boundary widened with it rather than being narrowed to one of them.
// Both are held to the same strong rule — neither has any business naming a frozen field, and in
// fact neither does.
const THE_CONFIRMATION_WRITE_PATH = [
  'purchase-drafts/usecases/commands/confirm-purchase-draft-line-arrival.command.ts',
  'purchase-drafts/usecases/commands/record-purchase-draft-line-delivery.command.ts',
  'purchase-drafts/domain/services/purchase-draft-line-ending.service.ts',
  'shared/domain/repositories/arrival-confirmation.repository.ts',
  'customer-orders/domain/services/demand-allocation.service.ts',
  'shared/domain/repositories/demand-allocation.repository.ts',
];

// `purchase-draft-assembly` is the *unfrozen* write path — AC-10/AC-12, the one place these fields
// and tables are legitimately written. It is the positive control for every rule below: a rule that
// cannot fail proves nothing, and an inert check that looks like a guard is worse than none.
const THE_UNFROZEN_WRITE_PATH =
  'shared/domain/repositories/purchase-draft-assembly.repository.ts';

// Every persistence call that can change a row. `set(` is QueryBuilder's assignment form; `query(`
// is raw SQL, without which a hand-written UPDATE would be invisible to this spec.
const WRITE_CALL =
  /\.(?:update|insert|upsert|save|delete|softDelete|remove|set|query)\s*\(/gu;

// A structural write, in both idioms this repository uses: `getRepository(X).insert(...)` puts the
// entity *outside* the argument list, so a rule that reads only the argument list misses it
// entirely; `manager.insert(X, ...)` puts it inside.
const STRUCTURAL_WRITE =
  /(?:getRepository\s*\(\s*(?<repositoryEntity>\w+)\s*\)\s*\.\s*(?:insert|upsert|delete|softDelete|remove)\s*\(|\.\s*(?:insert|upsert|delete|softDelete|remove)\s*\(\s*(?<managerEntity>\w+)\s*,|\.\s*query\s*\(\s*[`'"][^`'"]*(?:INSERT|DELETE)[^`'"]*[`'"])/giu;

// The text of one balanced call argument list, so a frozen field mentioned in a *later*, unrelated
// statement is never mistaken for part of this write.
const argumentsOf = (source: string, openParenIndex: number): string => {
  let depth = 0;
  for (let index = openParenIndex; index < source.length; index += 1) {
    const character = source[index];
    if (character === '(') {
      depth += 1;
    } else if (character === ')') {
      depth -= 1;
      if (depth === 0) {
        return source.slice(openParenIndex + 1, index);
      }
    }
  }
  return source.slice(openParenIndex);
};

const writeStatementsOf = (source: string): string[] => {
  const code = stripComments(source);
  return [...code.matchAll(WRITE_CALL)].map((match) =>
    argumentsOf(code, match.index + match[0].length - 1),
  );
};

const namesFrozenField = (code: string): string[] =>
  FROZEN_FIELDS.filter((field) => new RegExp(`\\b${field}\\b`, 'u').test(code));

// Every structural write in a file, rendered as the entity or raw statement it targets.
const structuralWriteTargetsOf = (source: string): string[] =>
  [...stripComments(source).matchAll(STRUCTURAL_WRITE)].map(
    (match) =>
      match.groups?.repositoryEntity ?? match.groups?.managerEntity ?? match[0],
  );

describe('the frozen-record write boundary of a line ending (AC-15, spec.md §6.1)', () => {
  // A frozen field the code never names is a frozen field no refactor can accidentally start
  // writing — and it is also the evidence that no bound of this operation is derived from one,
  // which is what AC-17 requires when it makes the received quantity free to fall short of or
  // exceed what was ordered.
  it.each(THE_CONFIRMATION_WRITE_PATH)(
    '%s names no frozen field at all',
    (path) => {
      expect(namesFrozenField(stripComments(read(path)))).toEqual([]);
    },
  );

  it.each(THE_CONFIRMATION_WRITE_PATH)('%s writes no frozen field', (path) => {
    for (const statement of writeStatementsOf(read(path))) {
      expect({ path, statement }).toMatchObject({
        statement: expect.not.stringMatching(
          new RegExp(`\\b(?:${FROZEN_FIELDS.join('|')})\\b`, 'u'),
        ),
      });
    }
  });

  it.each(THE_CONFIRMATION_WRITE_PATH)(
    '%s creates and removes no Purchase Draft line or link',
    (path) => {
      for (const target of structuralWriteTargetsOf(read(path))) {
        expect({ path, target }).toMatchObject({
          target: expect.not.stringMatching(FROZEN_TABLES),
        });
      }
    },
  );

  // The three positive controls. Each asserts that the *unfrozen* assembly path trips the rule its
  // sibling above asserts the confirmation does not, so none of those three can silently become a
  // check that matches nothing.
  describe('the rules can fail: the unfrozen assembly path trips each of them', () => {
    it('names frozen fields', () => {
      expect(
        namesFrozenField(stripComments(read(THE_UNFROZEN_WRITE_PATH))).length,
      ).toBeGreaterThan(0);
    });

    it('writes frozen fields', () => {
      const offending = writeStatementsOf(read(THE_UNFROZEN_WRITE_PATH)).filter(
        (statement) =>
          new RegExp(`\\b(?:${FROZEN_FIELDS.join('|')})\\b`, 'u').test(
            statement,
          ),
      );

      expect(offending.length).toBeGreaterThan(0);
    });

    // The raw-SQL and `manager.insert(Entity, ...)` branches of `STRUCTURAL_WRITE` have no
    // real-world example in this repository today, so a typo in either would go unnoticed by the
    // file-based controls — the exact failure mode the inert first version of this spec had. These
    // exercise the detector against fixtures instead: if a branch stops matching, this fails even
    // though every production file is still clean.
    it.each([
      [
        'a raw-SQL delete',
        `await manager.query('DELETE FROM purchase_draft_lines WHERE id = $1', [id]);`,
      ],
      [
        'a raw-SQL insert',
        'await manager.query(`INSERT INTO purchase_draft_line_links (id) VALUES ($1)`, [id]);',
      ],
      [
        'the manager.insert(Entity, ...) idiom',
        'await manager.insert(PurchaseDraftLineEntity, { id });',
      ],
      [
        'the getRepository(Entity).delete idiom',
        'await manager.getRepository(PurchaseDraftLineLinkEntity).delete({ id });',
      ],
    ])('detects %s reaching a frozen table', (_idiom, source) => {
      const targets = structuralWriteTargetsOf(source);

      expect(targets.length).toBeGreaterThan(0);
      expect(targets.some((target) => FROZEN_TABLES.test(target))).toBe(true);
    });

    // …and stays quiet on the shapes the confirmation legitimately uses, so the rule is not simply
    // matching everything.
    it.each([
      [
        'an UPDATE, which AC-15 permits on this path',
        'await manager.getRepository(PurchaseDraftLineEntity).update({ id }, { receivedQuantity });',
      ],
      [
        'a structural write to a table AC-15 does not freeze',
        'await manager.getRepository(ArrivalAllocationEntity).insert(rows);',
      ],
    ])('does not flag %s', (_shape, source) => {
      const targets = structuralWriteTargetsOf(source);

      expect(targets.some((target) => FROZEN_TABLES.test(target))).toBe(false);
    });

    it('creates Purchase Draft lines and links', () => {
      const targets = structuralWriteTargetsOf(
        read(THE_UNFROZEN_WRITE_PATH),
      ).filter((target) => FROZEN_TABLES.test(target));

      expect(targets).toEqual(
        expect.arrayContaining([
          'PurchaseDraftLineEntity',
          'PurchaseDraftLineLinkEntity',
        ]),
      );
    });
  });
});
