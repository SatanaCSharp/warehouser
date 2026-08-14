import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

// T2 — the split-case inventory gate of the `modules-level-refactor` change request
// (docs/change-requests/modules-level-refactor/spec.md CR-RG-01, test-plan.md § "Test data"). Four
// specs have a subject that splits across the new modules. Splitting a spec is the one structural
// edit that can quietly delete a behavioral assertion, so the case names they declare are captured
// at `baseline_revision` and compared after every split.
//
// SUBJECT_SPECS is the *current* home of those cases. As a spec splits, its successor files replace
// it here — that edit is structural, and the assertions below are what make it safe: the union of
// case names, and their total count, must come out unchanged. This gate is retired once the four
// splits land.
import { buildCaseInventory, extractCaseNames } from './split-cases.mjs';

const BASELINE_PATH = 'tests/refactor/split-cases.baseline.json';

const SUBJECT_SPECS = [
  'apps/server/src/warehouses/rest/controllers/warehouse.controller.spec.ts',
  'apps/server/src/access/rest/controllers/warehouse-access.controller.spec.ts',
  'apps/server/src/workspaces/rest/controllers/workspace.controller.spec.ts',
  'apps/server/src/workspaces/rest/controllers/workspace-http-contract.integration.spec.ts',
  'apps/web/src/modules/access/hooks/workspace-role-name-validation.spec.ts',
  'apps/web/src/modules/warehouse/hooks/warehouse-name-validation.spec.ts',
];

const baseline = JSON.parse(readFileSync(BASELINE_PATH, 'utf8'));

test('the four splitting specs declare exactly the baseline set of cases', () => {
  assert.deepEqual(buildCaseInventory(SUBJECT_SPECS), baseline.cases);
});

// A few case titles are declared in more than one of the four files, so the union alone cannot see
// one of a duplicated pair disappear. A split moves every case to exactly one successor file and
// therefore preserves the total as well.
test('no case is dropped where two specs share a title', () => {
  const total = SUBJECT_SPECS.reduce(
    (count, file) => count + extractCaseNames(file).length,
    0,
  );

  assert.equal(total, baseline.caseCount);
});
