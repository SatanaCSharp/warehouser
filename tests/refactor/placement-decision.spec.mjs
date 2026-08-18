import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { BASELINE_REVISION } from './baselines.mjs';

// CR-AC-03 of the `refactor-warehouse-components` change request — the mechanical half of
// "the rule is stated" (docs/change-requests/refactor-warehouse-components/spec.md §5).
//
// What this file can decide: that the new ADR exists, reads Accepted and carries each clause the
// criterion enumerates, that the predecessor is superseded with a resolving forward link and an
// otherwise intact body, and that the index lists both with the status each file declares. It grows
// with the rest of the documentation lane — T4 and T5 add the guide reconciliations.
//
// What it cannot decide, and does not pretend to: whether the ADR's prose actually narrows the
// predecessor rather than restating it, and whether a contributor can apply the tiebreak without
// re-deciding per case. test-plan.md § "Review gates" carries those to a named reviewer — the
// clauses below pin the structure so the reviewer reads a complete document, not so the judgement
// is skipped.

const ADR_DIRECTORY = 'docs/system/adr';
const PLACEMENT_ADR = `${ADR_DIRECTORY}/18-08-2026-scope-of-exercise-placement-tiebreak.md`;
const PREDECESSOR = `${ADR_DIRECTORY}/14-08-2026-domain-owned-flat-modules.md`;
const WEB_INDEX = 'docs/system/web-index.md';

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

test('the superseded ADR carries a forward link that resolves', () => {
  const predecessor = read(PREDECESSOR);

  assert.match(predecessor, /^Status: Superseded by /mu);

  const [, target] = /^Status: Superseded by .*?\((.+?)\)/mu.exec(predecessor);
  assert.equal(
    `${ADR_DIRECTORY}/${target.replace(/^\.\//u, '')}`,
    PLACEMENT_ADR,
  );
});

// sad.md §4.2 is explicit that a superseded ADR is a historical record: its body stays verbatim,
// including the sentence that names this request's target directory as a flatness violation. Only
// the status line may move. The comparison reads the baseline out of git rather than a committed
// copy — a second copy of the body in the tree would itself need keeping honest.
test('the superseded ADRs body is byte-identical to the baseline apart from its status line', () => {
  const withoutStatus = (source) =>
    source
      .split('\n')
      .filter((line) => !line.startsWith('Status:'))
      .join('\n');

  const baseline = execFileSync(
    'git',
    ['show', `${BASELINE_REVISION}:${PREDECESSOR}`],
    { encoding: 'utf8' },
  );

  assert.equal(withoutStatus(read(PREDECESSOR)), withoutStatus(baseline));
});

// A contributor following the index has to land on the decision that governs. Dropping the
// superseded ADR would also satisfy "the index does not point at the wrong rule", and would lose
// the history — so both must be listed, each with the status its own file declares.
test('the web index lists both ADRs with the status each file declares', () => {
  const index = read(WEB_INDEX);

  assert.ok(
    index.includes('18-08-2026-scope-of-exercise-placement-tiebreak.md'),
    'the index does not link the placement ADR',
  );
  assert.ok(
    index.includes('14-08-2026-domain-owned-flat-modules.md'),
    'the index dropped the superseded ADR instead of re-listing it',
  );
  assert.match(
    index,
    /Superseded/u,
    'the index does not mark the predecessor superseded',
  );
});
