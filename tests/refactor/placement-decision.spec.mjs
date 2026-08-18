import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

// CR-AC-03 of the `refactor-warehouse-components` change request — the mechanical half of
// "the rule is stated" (docs/change-requests/refactor-warehouse-components/spec.md §5).
//
// What this file can decide: that the new ADR exists, reads Accepted and carries each clause the
// criterion enumerates. It grows with the rest of the documentation lane — T3 adds the supersession
// and index checks, T4 and T5 the guide reconciliations.
//
// What it cannot decide, and does not pretend to: whether the ADR's prose actually narrows the
// predecessor rather than restating it, and whether a contributor can apply the tiebreak without
// re-deciding per case. test-plan.md § "Review gates" carries those to a named reviewer — the
// clauses below pin the structure so the reviewer reads a complete document, not so the judgement
// is skipped.

const ADR_DIRECTORY = 'docs/system/adr';
const PLACEMENT_ADR = `${ADR_DIRECTORY}/18-08-2026-scope-of-exercise-placement-tiebreak.md`;

const read = (path) => readFileSync(path, 'utf8');

// The five clauses CR-AC-03 and sad.md §4.1/§4.2/§4.5 require the ADR to state. Each is keyed on
// its bold lead — the sectioning convention ADR 14-08-2026 already uses — so the assertion names a
// structural landmark rather than a sentence a copy-edit would break.
const REQUIRED_CLAUSES = [
  '**The default is unchanged.**',
  '**The tiebreak.**',
  '**Why this is not the rejected "organize by consumer".**',
  '**This claims no domain asymmetry.**',
  '**Home versus grouping.**',
  '**A name states the domain addressed, not the module rendering it.**',
];

test('the placement ADR is Accepted and carries every clause CR-AC-03 enumerates', () => {
  const adr = read(PLACEMENT_ADR);

  assert.match(adr, /^Status: Accepted$/mu);

  for (const clause of REQUIRED_CLAUSES) {
    assert.ok(adr.includes(clause), `the ADR is missing the clause ${clause}`);
  }
});

// Risk R6 is that a future contributor over-applies the tiebreak. Both of its conditions are
// import-graph facts, and the ADR has to say so — a tiebreak whose conditions are a matter of taste
// is the third bullet of change.md §6's abort threshold.
test('the tiebreaks two conditions are stated as import-graph facts', () => {
  const adr = read(PLACEMENT_ADR);

  assert.match(adr, /sole consumer/iu);
  assert.match(adr, /import graph/iu);
  assert.match(adr, /scan/iu);
});
