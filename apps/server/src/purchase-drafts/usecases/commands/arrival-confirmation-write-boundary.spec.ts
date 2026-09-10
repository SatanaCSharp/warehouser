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

import difference from 'lodash/difference.js';
import { describe, expect, it } from 'vitest';

const sourceRoot = join(import.meta.dirname, '../../..');

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

// T5/`sad.md` §2 "Three consequences that are easy to mistake for deviations" — the one place this
// path is now *allowed* to name a frozen field, and the exact two it may name.
// `chk_purchase_draft_lines_pre_receipt_conformance_instruction` makes the Pre-receipt Conformance a
// bound derived from the Packaging Type and Value-adding Note frozen on the line (AC-17, AC-17a), so
// `lockDraftLineForEnding` must *read* both. Reading them is all it may do: "writes no frozen field"
// below still holds this file to the full list, unnarrowed.
const THE_NARROWED_PROJECTION =
  'shared/domain/repositories/arrival-confirmation.repository.ts';

const THE_NARROWING = [
  'packagingTypeId',
  'packaging_type_id',
  'valueAddingNote',
  'value_adding_note',
];

// The half of the withholding `sad.md` §2 keeps absolute, and §11 records as the risk T5 carries.
// AC-19 bounds the ending quantity neither above nor below the ordered figure, so a path that could
// read it could derive a bound this operation does not have — which is what would turn `spec.md`
// §6.1's "Refusal as a route around the Allocation bound" from a property of the write path back
// into a check on it. Split out of the blanket rule above so the narrowing cannot take it with it.
const THE_UNNARROWABLE = ['orderedQuantity', 'ordered_quantity'];

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
  // T14, 2026-09-08 review — check 3's own DoD was unmet on two counts: `THE_CONFIRMATION_WRITE_PATH`
  // and `THE_UNNARROWABLE` are both hand-written lists with no assertion that either is non-empty, so
  // emptying either (or misspelling both of `THE_UNNARROWABLE`'s two entries) would make every case
  // below pass silently — the exact "glob that stops matching" failure mode the DoD names.
  it('the write-path corpus and the unnarrowable-field list are both non-empty', () => {
    expect(THE_CONFIRMATION_WRITE_PATH.length).toBeGreaterThan(0);
    expect(THE_UNNARROWABLE.length).toBeGreaterThan(0);
  });

  // A frozen field the code never names is a frozen field no refactor can accidentally start
  // writing — and it is also the evidence that no bound of this operation is derived from one,
  // which is what AC-17 requires when it makes the received quantity free to fall short of or
  // exceed what was ordered.
  it.each(THE_CONFIRMATION_WRITE_PATH)(
    '%s names no frozen field at all, beyond the two `sad.md` §2 narrows the withholding by',
    (path) => {
      const permitted = path === THE_NARROWED_PROJECTION ? THE_NARROWING : [];
      const named = namesFrozenField(stripComments(read(path)));

      // `difference` rather than equality, because either spelling of the two narrowed columns is
      // legal and neither is required — while a *third* frozen field, in any spelling, still fails.
      expect({ path, offending: difference(named, permitted) }).toMatchObject({
        offending: [],
      });
    },
  );

  // The narrowing is bounded, so it is asserted twice over: the list above admits exactly two
  // columns and no third, and this admits none of the ordered figure anywhere on the path — the
  // guarantee that survives every later widening of the projection.
  it.each(THE_CONFIRMATION_WRITE_PATH)(
    '%s never names the ordered quantity',
    (path) => {
      const named = THE_UNNARROWABLE.filter((field) =>
        new RegExp(`\\b${field}\\b`, 'u').test(stripComments(read(path))),
      );

      expect({ path, named }).toMatchObject({ named: [] });
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

    // T14, 2026-09-08 review — `'%s never names the ordered quantity'` above was the one rule in
    // this file with no positive control at all: nothing proved a projection naming `ordered_quantity`
    // (in either spelling) would actually be caught, so emptying `THE_UNNARROWABLE` or misspelling
    // both of its entries would have made every case of that rule pass silently. This is the fixture
    // check 3's own DoD requires — "a projection naming `ordered_quantity`" — run against the same
    // detector the real files above are checked with.
    it.each(['orderedQuantity', 'ordered_quantity'])(
      'detects a projection naming the ordered quantity as %s',
      (spelling) => {
        const fixture = `
          const lockDraftLineForEnding = async (manager, lineId) =>
            manager.query('SELECT id, ${spelling}, delivery_mode FROM purchase_draft_lines WHERE id = $1', [lineId]);
        `;

        const named = THE_UNNARROWABLE.filter((field) =>
          new RegExp(`\\b${field}\\b`, 'u').test(stripComments(fixture)),
        );

        expect(named).toContain(spelling);
      },
    );

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
