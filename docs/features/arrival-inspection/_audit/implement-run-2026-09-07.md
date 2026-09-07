---
title: 'implement run notes — arrival-inspection'
date: '2026-09-07'
status: 'paused — 9 of 20 tasks committed; T11 RED preserved unmerged'
---

Findings discovered during `/implement` that the task docs do not contain, plus the resume
point. Written by the implement lead so the work survives the session that produced it.

# arrival-inspection — /implement resume point

Branch `12-arrival-inspection`. Re-enter with `/implement arrival-inspection`.
Read `CARRY-FORWARD.md` in this directory FIRST — it holds findings the task docs do not contain.

## Done (committed, gate-clean)

T1 d64f294 · T9 d9333c8 · T2 b645a2e · T3 318da7d (+ fa424ee typecheck fix)
T4 14cc8fa · T5 3d9ebec · T7 62b229f · T6 c19d931
Tracker commits: 4d850fe, 2c55f38, 2544d02, 2477ccf

## In flight when the run stopped

- T8 GREEN in .worktrees/a2 — see below for status at stop time
- T11 RED in .worktrees/a3 — RED only; NOT a completed task

## Not started

T10, T12, T13, T14, T15, T16, T17, T18, T19, T20

## Remaining DAG

P4 T8 ‖ T11 -> T12 (main: edits packages/contracts)
P5 T10 (needs T5,T8,T9)
P6 T13 ‖ T20 (T20 needs T10)
P7 T14 ‖ T15 -> T17 P8 T16 -> T18 P9 T19
All five UI tasks share public/locales + locale-baseline.json => ONE lane, never parallel.
T8 and T11 both edit usecase.module.ts => serialize their commits.

## THE GATE (use this exact set — `build` alone is NOT enough)

    cd apps/server
    npx jest --cacheDirectory /tmp/jest-cache-main
    NODE_OPTIONS=--experimental-vm-modules npx jest --config jest.pglite.config.cjs
    npx eslint src
    npx nest build
    npx tsc --noEmit -p tsconfig.json      # MANDATORY: build excludes **/*spec.ts

plus, whenever packages/contracts changed: pnpm --filter @warehouser/web build
plus, whenever packages/shared-types changed: pnpm --filter @warehouser/shared-types build FIRST
(apps/server resolves shared-types through dist/, not src/)

## Working practices that earned their keep

- Every test-author proves the RED is DRIVABLE: throwaway impl -> green -> mutate one thing ->
  confirm red -> delete scaffold. Caught a real problem in every single task.
- Worktree gates are ADVISORY. The authoritative gate is main, nothing else in flight.
- Collect an agent's patch the INSTANT it reports: git -C .worktrees/<w> add -A &&
  git -C .worktrees/<w> diff --cached --binary > <scratch>/<task>.patch
- `git apply -3` STAGES what it applies. Unstage other tasks' files before committing, or one
  commit swallows another task (happened once; split back out).
- Agents must use `npx` inside a worktree. `pnpm --filter` resolves against MAIN regardless of cwd.
- A suite failing with ZERO failed tests = PGlite worker-kill flake. Re-run before believing it.

## Real-PostgreSQL verification (already done for T1+T2, repeat for later migrations)

Docker IS reachable; warehouser-postgres-1 is up on PostgreSQL 17.10 (the production target).
docker exec warehouser-postgres-1 psql -U warehouser -d postgres -c "CREATE ROLE ai_migration_check LOGIN PASSWORD 'throwaway' SUPERUSER;"
docker exec warehouser-postgres-1 psql -U warehouser -d postgres -c "CREATE DATABASE ai_migration_check OWNER ai_migration_check;"
cd apps/server && DATABASE_HOST=localhost DATABASE_PORT=5432 DATABASE_USER=ai_migration_check \
DATABASE_PASSWORD=throwaway DATABASE_NAME=ai_migration_check \
pnpm exec typeorm-ts-node-commonjs migration:run -d src/shared/database/data-source.ts
...then migration:revert twice, verify nothing left behind, migration:run again. DROP both after.
No .env is read by this recipe.

---

# arrival-inspection — implement run: carry-forward findings

Facts discovered mid-run that a later task's brief MUST include. The task docs do NOT contain these.

## → T10 (line-ending condition commands) — DB constraint trap, NOT in the task doc

`chk_purchase_draft_lines_conformance_requires_ending` is
`ending_recorded_at IS NOT NULL AND ending_quantity > 0`.
So ANY verdict — `not_applicable` included — is refused on a zero-quantity ending.
Consequence: the ending command must never default or auto-derive a conformance verdict when
`ending_quantity` is 0; it must leave BOTH conformance columns NULL, or the write fails at the
database. Verified against the promoted migration by the T1 implementer.
Also: an _uninstructed_ line with a positive ending can only be `not_applicable`.

## → T12 (read projections) / any contracts follow-up — placement question left open

`rejectionReasonSchema`, `rejectionSourceSchema`, `rejectionDispositionSchema` were placed in
`purchase-drafts-mutations.ts` (T9), justified by T9's files_hint. The analogous catalogue-read
schema `packagingTypeSchema` lives in `purchase-drafts-projections.ts`. mutations already imports
from projections, so moving them there is cycle-free and mechanical. Decide in T12.

## → T13 (REST surface) — route-table baseline

sad.md §10 says the route-table baseline gains exactly TWO rows and loses none.
`tests/refactor/route-table.baseline.json` is one of the three tests/refactor gates that SURVIVED
the 2026-08-30 cleanup (chunk-manifest, neighbour-trees, split-cases were deleted; baseline-artifacts,
placement-decision, route-table stay). So it is live and must be regenerated.

## → every UI task (T15–T19) — known repo traps

- HeroUI `FormTextField` wraps React Aria and SWALLOWS react-hook-form `defaultValues`. Any dialog
  that opens pre-filled (T18 amend-refusal is exactly this) must pass `defaultValue` to the field
  AS WELL AS `defaultValues` to `useForm`. Reference shape: `CorrectItemDialog.tsx`.
- Adding web copy trips `src/i18n.spec.ts` against `src/test/locale-baseline.json`. Regenerate by
  flattening `public/locales/*/*.json` to dotted keys, WRITE BACK IN EXISTING KEY ORDER (sorting is
  functionally equivalent but produces a ~450-line diff that buries the real change). Verify by
  key-set comparison: lost == 0, value-changed == 0, gained == exactly the new keys (x2 en/uk).
- All five UI tasks share `public/locales/` + `locale-baseline.json` -> ONE lane, never parallel.

## → T14 (architecture checks) — the lists it must not trust

`repository-boundaries.spec.ts` enumerates modules in a HAND-WRITTEN literal and omits
`purchase-drafts`. Other module-boundaries specs have the same rot (customers is a single-sibling
check; warehouses/access carry a 5-of-9 list whose comment falsely claims completeness).
sad.md §11 chose the fix: DERIVE the scope from disk + add a positive control proving the rule can
still fail. Idiom to copy: `arrival-confirmation-write-boundary.spec.ts`.
Non-derived scope may newly cover modules that have been skipping rules for months — expect fallout.

## Doc corrections made by the lead during the run

- `docs/features/arrival-inspection/sad.md` §7: the bullet listing Rejection Source as
  "never accepted as input" contradicted its own route table; api-sync-report.md § Finding 1
  adjudicated it wrong. Bullet rewritten (Source IS an input). Committed with T9.

## Verification caveats to report in the handoff

- T1 apply/revert was proven on **PGlite**, not a real PostgreSQL server. Everything the DoD names
  is covered, but it is "verified on PGlite", not "verified on the development database".
  Note also the shipped baseline needs PG15+ (1786525200000 uses `ON DELETE SET NULL (col_list)`).

## → T12 — MODULE CYCLE RISK (found by the T9 reviewer, upgraded from a style note)

T12's `PurchaseDraftLineRejection` read shape needs `rejectionSourceSchema` and
`rejectionDispositionSchema` inside `purchase-drafts-projections.ts`. Those currently live in
`purchase-drafts-mutations.ts` (T9), and **mutations already imports from projections**. Adding the
import the other way creates a module cycle over top-level `z.enum(...)` initialisation, and
`packages/eslint-config-base` has NO `import/no-cycle` rule to catch it.
FIRST STEP OF T12, before the projection union lands: move `rejectionReasonIdSchema`,
`rejectionSourceSchema`, `rejectionDispositionSchema`, `rejectionReasonSchema` (+ the
`RejectionReasonId` type) into `purchase-drafts-projections.ts`. Sibling precedent:
`packagingTypeIdSchema` / `packagingTypeSchema` / `purchaseDraftStateSchema` / `deliveryModeSchema`
all live in projections and are imported INTO mutations.

## Phase 1 outcome (committed)

- f5bbe65 docs — SDD artifacts
- d64f294 T1 — schema migration promoted; authoritative gate in main: integration 82 suites/810 tests
- d9333c8 T9 — contracts extended; contracts 289/289, web build green

## → T13 / api-sync-report reconcile — two violation `rule` names settled by implement

`api-sync-report.md` marks the violation vocabulary **medium confidence** and says `implement` may
settle a different one. T7 invented exactly two, both absent from every artifact:

- `note_too_long` (AC-15b)
- `condition_on_nothing_received` (AC-04a)
  Every other rule name is verbatim from the openapi examples (`rejections_exceed_received`,
  `unknown_rejection_reason`, `description_required`, `duplicate_rejection_reason`, `source_mismatch`,
  `met_contradicts_rejection`, `not_applicable_on_instructed_line`, `verdict_on_uninstructed_line`,
  `quantity_out_of_range`, `description_too_long`).
  ACTION: reconcile these two into openapi.yaml / api-sync-report when T13 lands the REST surface.

## sad.md §6.1 drift #2 (NOT yet corrected — decide at T13 or review)

`sad.md` §6.1 step 5 puts AC-03 and AC-14 inside the "Condition Split violated" branch and AC-15b
inside "Pre-receipt Conformance violated". `api-sync-report.md` §2/§4 and `openapi.yaml` instead map
all three to `purchase_drafts.invalid_input` (the `payloadShape` example). T7 followed the contract,
consistent with how Finding 1 was resolved for the Rejection Source. Same class of defect as the §7
bullet already fixed: sad prose vs the derived contract, contract wins.

## T7 scope notes

- AC-18a IS covered by T7 (predicate + `disposition_not_reversible` error factory) even though
  tasks.json's T7 `acs` array omits it. The task doc requires it.
- T7 added `apps/server/src/purchase-drafts/domain/value-objects/line-condition.ts`, outside
  files_hint. Justified: `server-architecture.md` §Domain forbids a domain module importing the
  persistence unions; `delivery-mode.ts` is the exact precedent. Accepted by the lead.
- T7's DoD says "no file under domain/ imports NestJS/HTTP/TypeORM". FALSE today:
  `domain/services/purchase-draft-assembly.service.ts` is `@Injectable()`, which
  `server-architecture.md` §Services sanctions. The rule is about entities and value objects. T7
  scoped its boundary scan to predicates/ + value-objects/ + errors/ and recorded why. Accepted.

## GATE CORRECTION (applies to EVERY remaining task)

`pnpm --filter @warehouser/server build` is NOT a sufficient vet step: tsconfig.build.json excludes
`**/*spec.ts`, and jest does not typecheck. MUST also run:
pnpm --filter @warehouser/server typecheck
Caught 2026-09-07: T3 broke two shipped entity specs with TS2322 while unit 1529/1529,
integration 830/830 and nest build were all green. Fixed in fa424ee.

## repository-boundaries.spec.ts is ALREADY REPAIRED (affects T14 scope)

It derives FEATURE_MODULES from readdirSync(sourceRoot) and repositorySources from disk, with
positive controls for the private-method and feature-import rules; purchase-drafts IS covered; new
repositories enter its corpus automatically. Verified 155/155 green on this branch by T4's author.
=> CHECK T14's task doc: part of its scope may already be done. The OTHER boundary specs
(customers, warehouses, access, purchase-drafts module-boundaries) were NOT re-verified.

## → T8 / T11 — amendment edge case no AC covers (found by T4's implementer)

The amendment predicate is `NOT (target = 'undecided' AND current <> 'undecided')`, which correctly
allows AC-18a's "correction between two decisions" while refusing a return to Undecided.
Consequence: aiming `undecided` at a row that is ALREADY `undecided` MATCHES and affects 1, writing
only the attribution. That is a no-change amendment, not a return. No AC covers it. Decide in T11
(the amend command) whether that should be refused earlier or is acceptable.
Also: `resolveRejectionReasons([])` returns `[]` via `In([])` and is untested — the calling command
should never reach it (a submission with no stated Reason has nothing to resolve).

## ADR 18-08 is a WEB placement tiebreak

It states outright that "the server side is not reconciled by this decision". Including it in a
server task's manifest is harmless but adds nothing. Drop it from server briefs; keep it for web.

## RAISED AGAINST THE SPEC — needs a human decision before T11/T13 ship

`spec.md` §6's NFR table asks for **"structured server timing logs"** for authorization and
line-ending latency. That directly contradicts `docs/system/guides/server-use-case-boundaries.md` §2
and `apps/server/AGENTS.md`, which forbid measuring anything in production code ("no `durationMs`
field in a production log entry"), and the repo-wide rule that coding agents must not add telemetry.
No timing was written anywhere in this run. Whoever implements T11/T13 must NOT add one to satisfy
the NFR table — the spec needs amending instead (a `clarify`/`change-request` decision, not an
implement one).

## STILL UNRAISED — sad.md §11 change-request item 7

"Any repository-wide assertion that a Closed draft is immutable is now wrong."
T11's author searched and found no such assertion in `apps/server` that its specs break
(`purchase-drafts/module-boundaries.spec.ts` enumerates commands by hand and needs no extension for
a new command file). The CR item nonetheless remains outstanding for the epic.
