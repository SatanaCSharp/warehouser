---
id: T7
title: 'Add the Condition Split and Pre-receipt Conformance predicates and every named error factory to the purchase-drafts domain'
layer: 'domain'
deps: [T2]
acs:
  [
    'AC-02',
    'AC-03',
    'AC-04a',
    'AC-06',
    'AC-07',
    'AC-09',
    'AC-14',
    'AC-15b',
    'AC-16',
    'AC-17',
    'AC-17a',
    'AC-19',
    'AC-25',
  ]
files_hint:
  - 'apps/server/src/purchase-drafts/domain/predicates/'
  - 'apps/server/src/purchase-drafts/domain/errors/purchase-draft.errors.ts'
  - 'apps/server/src/purchase-drafts/domain/errors/purchase-draft.errors.spec.ts'
owner: 'Backend Lead'
estimate: 'M'
status: 'todo'
---

# T7 — Add the condition predicates and error factories

## Why

Every rule this feature enforces is decidable from values the ending command already holds, so each is
a pure predicate with a named error rather than a branch inside a command. Derives from
[sad.md §5](../sad.md) § `purchase-drafts/domain/predicates` and
`purchase-drafts/domain/errors`, and from [sad.md §6.1 steps 5–6](../sad.md).

## What

Add pure, domain-named predicates beside the shipped `purchase-draft-*.predicates.ts` files, one per
rule:

- a refused quantity that is not a whole number of at least one (AC-03);
- refusals totalling more than what was presented (AC-02);
- two refusals on one line carrying the same Reason (AC-09);
- the description requirement, expressed against the catalogue's `requiresDescription` flag (AC-07);
- a Source disagreeing with the line's Delivery Mode, **in both directions** (AC-25);
- a Met verdict beside a packaging-not-as-instructed or value-adding-note-not-applied refusal (AC-16);
- a Not applicable verdict on a line frozen with an instruction, and Met/Not met on a line frozen with
  none (AC-17, AC-17a);
- a line where nothing was received carrying either judgement (AC-04a);
- both 1 000-character bounds (AC-14, AC-15b);
- a Disposition aimed back at Undecided (AC-18a) and one outside the offered set (AC-19).

Add a named error factory for each, plus the Rejection-capability refusal
([ADR 0001](../adr/0001-payload-conditional-permission.md)) and the unknown-Reason refusal carrying
the catalogue so AC-06's message can list what is available. Each maps to a stable `ErrorCode` at the
global filter.

## Definition of Done

- [ ] Unit tests cover each predicate in isolation, including the boundary of each numeric and
      character bound.
- [ ] The description requirement is decided from the catalogue flag; no test and no production line
      names `unfit_other` (AC-07).
- [ ] The Source/Delivery Mode rule is tested in both directions — Inspected on a direct line and
      Customer-reported on a dock line (AC-25).
- [ ] The conformance rules are tested against all four frozen-instruction shapes: Packaging Type
      only, Value-adding Note only, both, neither (AC-17, AC-17a).
- [ ] Each error factory produces a distinct stable `ErrorCode`; the unknown-Reason error carries the
      available Reasons (AC-06) and the Disposition error carries the offered Dispositions (AC-19).
- [ ] `purchase-draft.errors.spec.ts` proves every new code is exported from
      `packages/shared-types` and none is a duplicate.
- [ ] **No file under `domain/` imports NestJS, HTTP or TypeORM**; `module-boundaries.spec.ts` proves
      it.
- [ ] `pnpm --filter @warehouser/server test`, `lint` and `build` are green.

## Notes

**Hard rule** ([spec.md §6](../spec.md) Catalogue integrity, [sad.md §4](../sad.md)): the
"unfit — other needs a description" rule is **catalogue data, not a hard-coded identifier**.
Hard-coding `unfit_other` would pass every test written today and would make the next prose-requiring
Reason a code change and a release rather than one migration row.

No error is caught, enriched or rethrown by any layer — the global filter maps it
([server use-case boundaries](../../../system/guides/server-use-case-boundaries.md)). This is also why
the Allocation bound in T10 must refuse from inside `DemandAllocationService` rather than being
enriched in `purchase-drafts`.

These predicates decide **one rule each**. Collecting every violation before refusing is T8's
responsibility, not theirs.
