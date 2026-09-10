---
id: T8
title: 'Add ArrivalInspectionService with the catalogue assertion, and the four module-level functions both ending commands share'
layer: 'domain'
deps: [T4, T7]
acs: ['AC-01a', 'AC-02', 'AC-06', 'AC-07', 'AC-09', 'AC-16', 'AC-17', 'AC-17a']
files_hint:
  - 'apps/server/src/purchase-drafts/domain/services/arrival-inspection.service.ts'
  - 'apps/server/src/purchase-drafts/usecases/usecase.module.ts'
  - 'apps/server/src/purchase-drafts/usecases/usecase.module.di.spec.ts'
owner: 'Backend Lead'
estimate: 'M'
status: 'todo'
---

# T8 — Add ArrivalInspectionService and the shared assertion functions

## Why

Both ending commands enforce the identical condition rules, and two callers is this repository's
extraction trigger. Only one of the five pieces needs a collaborator — the catalogue read — so only
that one is a class. Derives from [sad.md §5](../sad.md)
§ `purchase-drafts/domain/services/arrival-inspection.service.ts` and
[server architecture §Services](../../../system/server-architecture.md).

## What

Add `ArrivalInspectionService` as an **injectable** carrying only what needs the collaborator:
asserting every stated Reason against the catalogue, reading `RejectionReasonCatalogueRepository`
**once per ending**, and refusing an unknown Reason with the Reasons the catalogue offers (AC-06),
and a prose-requiring Reason submitted without prose (AC-07).

Add four **module-level functions** beside it, because none needs a collaborator and putting them on
the class would force a command that needs only them to take the whole service:

1. the Condition Split assertion (AC-02, AC-03, AC-09, AC-14, AC-25);
2. the Pre-receipt Conformance assertion (AC-15b, AC-16, AC-17, AC-17a);
3. the Rejection-capability assertion (AC-01a);
4. the derivation of the Accepted Quantity.

Register the service on `UsecaseModule` and **do not export it**.

## Definition of Done

- [ ] The catalogue is read **once** per ending regardless of how many Reasons the submission names; a
      unit test with a repository double asserts the call count.
- [ ] Each assertion **collects every violation of its rule set before refusing** — a unit test
      submits an input breaking three Condition Split rules at once and asserts all three are reported
      with their figures intact, not just the first.
- [ ] The Rejection-capability assertion fires only when the input carries at least one Rejection, and
      refuses with a typed error naming the capability before any write (AC-01a). A refusal-free input
      never reaches it — AC-01b is unreachable by this rule rather than passing through a permissive
      branch.
- [ ] The Accepted-Quantity derivation is unit-tested for a line with no refusals, a line refused
      entirely, and a line refused in part.
- [ ] The service is registered on `UsecaseModule` and is **not** exported; the DI spec proves both.
- [ ] The service and the four functions import nothing from NestJS beyond `@Injectable`, and nothing
      from HTTP or TypeORM.
- [ ] `pnpm --filter @warehouser/server test`, `lint` and `build` are green.

## Notes

**Hard rule** ([spec.md §6](../spec.md) Ending atomicity, [sad.md §6.1](../sad.md) flags): the
assertions must **collect before they refuse**. The member's whole submission is judged in one pass
and returned with every figure intact — the shipped allocation bound already collects every violation
before asserting, and these follow it. A first-failing-rule short circuit is a defect, not a
simplification.

The capability assertion reads `AccessCurrentUser.observedPermissionIds` to **narrow** what an
already-admitted request may do, never to widen anything
([ADR 0001](../adr/0001-payload-conditional-permission.md)). T20 promotes that rule into `docs/system`
in this same change; until it lands, `code-review-back-end` will correctly report this as
non-conformant against the current wording of `server-request-authorization.md`.
