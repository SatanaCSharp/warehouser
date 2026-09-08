import assert from 'node:assert/strict';
import { globSync } from 'node:fs';
import test from 'node:test';

// T14, check 1 — sad.md §8 "Authorization coverage": "every ending route whose request schema
// carries a `rejections` property declares `@ObservedPermission(REJECTIONS:CREATE)`, and every
// read whose response schema can carry a Rejection's cause declares
// `@ObservedPermission(REJECTIONS:WATCH)`."
//
// **Consolidated onto `tests/delivery-addresses/identity-coverage.mjs`'s engine rather than
// reimplemented (2026-09-08 review).** The first version of this check was a second, ts-jest-based
// handler-discovery/schema-walk living in `apps/server/src/purchase-drafts/module-boundaries.spec.ts`
// — a parallel implementation of exactly what `identity-coverage.mjs` already does repository-wide
// for Customer identity, with its own copies of the same bugs the review then found in *both*
// engines independently. Two engines computing the same kind of fact drift by construction; this
// feature's review is the proof, since fixing "the" bug meant fixing it twice. `identity-coverage.mjs`
// is now parameterised by field family (`identityFields`, `subjectModule`, `observedIdentifier`,
// `verbs`, `ruleLabel`) precisely so a second family — `rejections` / `REJECTIONS:*` — registers
// alongside the Customer-identity pair instead of re-deriving handler discovery, decorator parsing
// and schema-closure computation a second time. One mechanism, one set of parsing fixes, no drift.
//
// **The corpus is still repository-wide, not `purchase-drafts`-scoped.** The engine's contract-schema
// closure and controller glob are both global (`identity-coverage.mjs`'s own `CONTRACTS_GLOB` and this
// file's `controllerFiles()` below cover every `apps/server/src/**/*.controller.ts`), so a
// `rejections`-carrying route added in a module other than `purchase-drafts` inherits this rule too —
// closing the gap the 2026-09-08 review named in `sad.md` §8:875's repository-wide-check argument.
//
// **Scope ruling, carried in `purchase-drafts.controller.ts`'s own comments at both ending routes:
// the read half is scoped to `@Get` handlers.** `sad.md` §8:878-879 words it as "every read", which
// taken literally also catches the two ending routes — their 200 body is a `PurchaseDraftDetail`
// that can carry a cause — but `sad.md` §7:799 fixes their observed list as exactly
// `(REJECTIONS:CREATE, CUSTOMERS:WATCH)`, and that is what T13 shipped. An ending's failure mode is
// withholding the actor's own just-submitted refusal from itself for one response, corrected on the
// very next `GET`; never a disclosure. `verbs: new Set(['Get'])` below is that ruling, mechanical.
import {
  allHandlers,
  gapsForRequestField,
  gapsInHandlerSet,
  identityBearingContractTypes,
  identityBearingHandlers,
  requestBodyBearingDtoTypes,
  withoutObservedPermission,
} from '../delivery-addresses/identity-coverage.mjs';

const controllerFiles = () =>
  globSync('apps/server/src/**/*.controller.ts').filter(
    (file) => !file.endsWith('.spec.ts') && !file.includes('/auth/'),
  );

const REJECTIONS_FIELD = ['rejections'];

// ---------------------------------------------------------------------------------------------
// The read half — every `@Get` handler whose response can carry a Rejection's cause
// ---------------------------------------------------------------------------------------------

test('every @Get handler whose response can carry a Rejection\'s cause observes REJECTIONS:WATCH (sad.md §8/§10)', () => {
  const { types } = identityBearingContractTypes({
    identityFields: REJECTIONS_FIELD,
    subjectModule: null,
  });
  const files = controllerFiles();

  assert.ok(files.length > 0, 'expected controller files to scan');
  assert.ok(types.size > 0, 'expected at least one contract type to carry a Rejection\'s cause');

  const gaps = gapsInHandlerSet(allHandlers(files), types, {
    observedIdentifier: 'REJECTIONS_WATCH',
    requiredPattern: null,
    verbs: new Set(['Get']),
    ruleLabel: "a Rejection's cause",
  });

  assert.deepEqual(gaps, []);
});

// The corpus must actually reach real handlers on both sides, or the rule above could pass because
// nothing in the real tree exercises it — the "glob that stops matching" failure mode the DoD names.
test('the Rejection-cause read rule reaches real @Get handlers, so it cannot pass vacuously', () => {
  const { types } = identityBearingContractTypes({
    identityFields: REJECTIONS_FIELD,
    subjectModule: null,
  });
  const handlers = identityBearingHandlers(controllerFiles(), types).filter((label) =>
    allHandlers(controllerFiles()).some(
      (handler) =>
        `${handler.file}::${handler.methodName}` === label && handler.verb === 'Get',
    ),
  );

  assert.ok(
    handlers.length > 0,
    'expected at least one real @Get handler whose response can carry a Rejection\'s cause',
  );
  assert.ok(
    handlers.some((label) => label.includes('purchase-drafts.controller.ts')),
    'expected purchase-drafts.controller.ts to contribute a Rejection-cause-bearing @Get handler',
  );
});

// The teeth: removing the declaration from a real, currently-conforming `@Get` handler must be
// caught — the fixture the DoD requires, over the real controller tree rather than a fabrication.
test('fails when REJECTIONS:WATCH is removed from a Rejection-cause-bearing @Get handler', () => {
  const { types } = identityBearingContractTypes({
    identityFields: REJECTIONS_FIELD,
    subjectModule: null,
  });
  const files = controllerFiles();

  const stripped = withoutObservedPermission(files, 'readPurchaseDraft');
  const gaps = gapsInHandlerSet(stripped, types, {
    observedIdentifier: 'REJECTIONS_WATCH',
    requiredPattern: null,
    verbs: new Set(['Get']),
    ruleLabel: "a Rejection's cause",
  });

  assert.ok(
    gaps.some((gap) => gap.includes('readPurchaseDraft')),
    `expected readPurchaseDraft to be reported, got: ${JSON.stringify(gaps)}`,
  );
});

// The scope ruling itself, proven both ways: a `POST` ending route with a cause-bearing response
// and no observed `REJECTIONS:WATCH` is *not* flagged (sad.md §7:799's deliberate exception), and
// the same removal on a `@Get` sibling *is* — so `verbs: new Set(['Get'])` is doing real work
// rather than accidentally matching everything or nothing.
test('does not flag the ending routes, which sad.md §7 deliberately excludes from the read half', () => {
  const { types } = identityBearingContractTypes({
    identityFields: REJECTIONS_FIELD,
    subjectModule: null,
  });
  const files = controllerFiles();

  const gaps = gapsInHandlerSet(allHandlers(files), types, {
    observedIdentifier: 'REJECTIONS_WATCH',
    requiredPattern: null,
    verbs: new Set(['Get']),
    ruleLabel: "a Rejection's cause",
  });

  assert.ok(
    !gaps.some((gap) => gap.includes('recordPurchaseDraftLineArrival')),
    'expected the arrival ending route to be outside the read half entirely',
  );
  assert.ok(
    !gaps.some((gap) => gap.includes('recordPurchaseDraftLineDirectDelivery')),
    'expected the direct-delivery ending route to be outside the read half entirely',
  );
});

// ---------------------------------------------------------------------------------------------
// The write half — every route whose request body can carry `rejections`
// ---------------------------------------------------------------------------------------------

test('every route whose request body carries `rejections` observes REJECTIONS:CREATE (sad.md §8/§10)', () => {
  const requestBodyTypes = requestBodyBearingDtoTypes(REJECTIONS_FIELD);
  const files = controllerFiles();

  assert.ok(
    requestBodyTypes.size > 0,
    'expected at least one request Dto to carry `rejections`',
  );

  const gaps = gapsForRequestField(allHandlers(files), requestBodyTypes, {
    observedIdentifier: 'REJECTIONS_CREATE',
    ruleLabel: 'a Rejection',
  });

  assert.deepEqual(gaps, []);
});

test('the Rejection-create write rule reaches real handlers, so it cannot pass vacuously', () => {
  const requestBodyTypes = requestBodyBearingDtoTypes(REJECTIONS_FIELD);
  const handlers = allHandlers(controllerFiles()).filter(
    (handler) =>
      handler.requestBodyType !== undefined &&
      requestBodyTypes.has(handler.requestBodyType),
  );

  assert.ok(
    handlers.length > 0,
    'expected at least one real handler whose request body carries `rejections`',
  );
  assert.ok(
    handlers.every((handler) => handler.file.includes('purchase-drafts.controller.ts')),
    'expected both `rejections`-carrying request bodies to belong to purchase-drafts.controller.ts',
  );
});

// The teeth, over a fabricated handler built only for this test: a route whose request body
// carries `rejections` and does not observe `REJECTIONS:CREATE` — reported by file and method, not
// a bare boolean.
test('fails a fixture route carrying `rejections` without observing REJECTIONS:CREATE', () => {
  const requestBodyTypes = requestBodyBearingDtoTypes(REJECTIONS_FIELD);
  const [oneRequestBodyType] = requestBodyTypes;

  const gaps = gapsForRequestField(
    [
      {
        file: 'fixture.controller.ts',
        methodName: 'recordSomethingWithRejections',
        verb: 'Post',
        responseType: null,
        requestBodyType: oneRequestBodyType,
        decorators: '@Post()\n@RequiredPermission(PermissionId.PURCHASE_DRAFTS_RECEIVE)',
      },
    ],
    requestBodyTypes,
    { observedIdentifier: 'REJECTIONS_CREATE', ruleLabel: 'a Rejection' },
  );

  assert.equal(gaps.length, 1);
  assert.match(gaps[0], /recordSomethingWithRejections/u);
});

// …and does not flag a route with no `@Body()` parameter, or a route whose `@Body()` Dto carries
// no `rejections` — the rule must not simply flag every handler that lacks the observed
// declaration.
test('does not flag a handler with no request body, or one whose body carries no `rejections`', () => {
  const requestBodyTypes = requestBodyBearingDtoTypes(REJECTIONS_FIELD);

  const gaps = gapsForRequestField(
    [
      {
        file: 'fixture.controller.ts',
        methodName: 'readSomething',
        verb: 'Get',
        responseType: 'Something',
        requestBodyType: undefined,
        decorators: '@Get()',
      },
      {
        file: 'fixture.controller.ts',
        methodName: 'closeSomething',
        verb: 'Post',
        responseType: 'Something',
        requestBodyType: 'PurchaseDraftClosureDto',
        decorators: '@Post()',
      },
    ],
    requestBodyTypes,
    { observedIdentifier: 'REJECTIONS_CREATE', ruleLabel: 'a Rejection' },
  );

  assert.deepEqual(gaps, []);
});
