---
status: Draft
owner: 'QA + Backend Lead'
reviewers: ['Tech Lead', 'Frontend Lead']
updated_at: '2026-08-06'
feature_size: 'M'
---

# Test plan — users-management

A permissioned Warehouse Member creates, corrects, resets, and removes other Warehouse Members —
individually permissioned, Warehouse-scoped, and preserving the exactly-one-Manager /
exactly-one-Role / never-more-power-than-the-creator invariants throughout.

## Levels

| Level             | Scope                                                                                                                                                                                                                      | Strategy (generic — no tool names)                                                                                                                   |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Unit              | The four new domain predicates (self-action, protected-Manager-target, Permission-superset, reserved-Role) and the shared email/password predicates `users` reuses (already unit-tested by `auth`, re-run not re-written). | In-memory, no I/O.                                                                                                                                   |
| Integration       | `users` commands against a real Warehouse Membership / Account / User / Session store; `MemberLifecycleRepository` and the extended `AuthenticationRepository`; the Permission-catalogue migration.                        | An ephemeral real Postgres dependency, matching the convention `auth`/`access`'s own repository/command integration suites already use in this repo. |
| Contract          | The shared cross-Warehouse-hiding and missing-Permission denial shape, reused unmodified from `access`, validated across all four `users` endpoints; each endpoint's request/response against `packages/contracts/users`.  | Validate the real response shape against the agreed contract; no hand-rolled stubs.                                                                  |
| E2E               | The onboard-then-sign-in story (US-05), which spans `users`' create command and `auth`'s unmodified sign-in command.                                                                                                       | The flow exercised through its real entry points against ephemeral dependencies.                                                                     |
| Load              | Creation/email-change/password-change/deletion p95 latency and sustained throughput (`spec.md` §6, all numeric).                                                                                                           | The load tool already in your repo, or e.g. k6 or Locust.                                                                                            |
| Component         | Create Member form, the shared edit-email/reset-password dialog shell, and the delete-confirmation dialog — validation, loading, error, and success states in isolation.                                                   | Render in a component harness; assert output + behaviour, no full app boot.                                                                          |
| Visual-regression | Member list row states: default, Protected (Manager), You (self), and the desktop/mobile row-collapse breakpoint.                                                                                                          | Snapshot the render; fail on an unintended visual diff; update the baseline deliberately.                                                            |
| E2E-through-UI    | Each of the four lifecycle flows (create, email-change, password-change, delete) driven through the real Members workspace UI, plus the list's Permission-gated action visibility (US-06 rendering).                       | The flow exercised through the rendered UI against ephemeral dependencies.                                                                           |

## AC coverage

| AC (spec.md §5)                                   | Test name (intent-based)                                                                                                                                   | Level                                              | Expected outcome                                                                                                                                              |
| ------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| AC-01 create happy path                           | creation with an in-Warehouse custom Role no more permissive than the actor succeeds                                                                       | integration + e2e-through-ui                       | new member exists with the selected Role; actor sees a creation confirmation                                                                                  |
| AC-02 create — invalid email/password             | creation is rejected when the submitted email or password fails format/length rules                                                                        | integration + component                            | nothing is created; the invalid field and reason are surfaced to the actor                                                                                    |
| AC-03 create — missing Permission                 | creation is denied when the actor lacks the user-creation Permission                                                                                       | integration + contract                             | nothing is created; the actor is told the required Permission is missing                                                                                      |
| AC-04 email-change happy path                     | an eligible target's email is changed and its sessions stay active                                                                                         | integration + e2e-through-ui                       | the new email is recorded, the target's sessions are untouched, the actor sees a confirmation                                                                 |
| AC-05 duplicate email (create/change)             | creation and email-change are each rejected when the email already belongs to any identity in the system                                                   | integration                                        | nothing is created or changed; the actor is told the email is already registered                                                                              |
| AC-06 password-change happy path                  | an eligible target's password is changed and every existing session for that target ends                                                                   | integration + e2e-through-ui                       | the new credential is recorded, all prior sessions for the target end, the actor sees a confirmation                                                          |
| AC-07 password-change — invalid length            | password change is rejected when the new password is outside the accepted length                                                                           | integration + component                            | nothing changes; the actor is told the password length is invalid                                                                                             |
| AC-08 delete happy path                           | deleting an eligible target removes its identity, membership, and sessions, and frees its email                                                            | integration + e2e-through-ui                       | the target has no membership, account, user, or session left; its email can be reused; actor sees a confirmation                                              |
| AC-09 cross-Warehouse target hidden               | each of create/email-change/password-change/delete is denied against a target outside the actor's Warehouse, without revealing existence                   | integration + contract                             | the action is refused with the same generic denial used for a missing target, across all four actions                                                         |
| AC-10 missing Permission (email/password/delete)  | email-change, password-change, and deletion are each denied when the actor lacks the matching Permission                                                   | integration + contract                             | the target is unchanged; the actor is told the required Permission is missing                                                                                 |
| AC-11 self-deletion blocked                       | an actor cannot delete their own Warehouse Member record                                                                                                   | unit + integration                                 | the deletion is blocked with an explanation that self-deletion is never allowed                                                                               |
| AC-12 sign in with initial credentials            | a newly created member signs in immediately with their initial email and password and receives exactly their Role's capabilities                           | e2e                                                | authentication succeeds and the granted capabilities match the assigned Role exactly                                                                          |
| AC-13 protected-Manager deletion blocked          | deletion is blocked while the target currently holds the Warehouse Manager Role                                                                            | unit + integration + component + visual-regression | the deletion is blocked with an explanation that the Manager Role must be transferred first; the row shows a Protected chip with no action controls           |
| AC-14 protected-Manager credential change blocked | email and password changes are blocked while the target currently holds the Warehouse Manager Role                                                         | unit + integration + component + visual-regression | the change is blocked with an explanation that the Manager Role must be transferred first; the row shows a Protected chip with no action controls             |
| AC-15 transfer/delete race                        | a concurrent Manager-transfer and a deletion attempt against the outgoing or incoming holder resolve so the transfer completes and the deletion is refused | integration                                        | exactly one Warehouse Manager exists at all times; the deletion attempt racing the transfer never succeeds                                                    |
| AC-16 Role exceeds creator's Permissions          | creation is blocked when the selected Role's Permissions include one the actor does not currently hold                                                     | unit + integration + component                     | nothing is created; the actor is told a new member's Role can never exceed their own Permissions                                                              |
| AC-17 Manager Role gains new Permissions          | every pre-existing Warehouse Manager Role directly holds the four lifecycle Permissions once the catalogue migration is applied                            | integration                                        | every `warehouse_manager`-kind Role has `USERS:CREATE`, `USERS:EMAIL_UPDATE`, `USERS:PASSWORD_CHANGE`, `USERS:DELETE` granted directly                        |
| AC-18 self email/password change blocked          | an actor cannot change their own email or password through the manager-driven action                                                                       | unit + integration + component + visual-regression | the change is blocked with an explanation that self-change is never allowed through this action; the actor's own row shows a You chip with no action controls |
| AC-19 peer credential takeover blocked            | email and password changes are blocked when the target's Role holds a Permission the actor lacks                                                           | unit + integration                                 | the change is blocked with an explanation that a more-permissioned target cannot have its credentials changed by this actor                                   |
| AC-20 reserved Manager Role at creation blocked   | creation is blocked when the reserved Warehouse Manager Role is selected instead of a custom Role                                                          | unit + integration + component                     | nothing is created; the actor is told the Manager Role is transfer-only; the Role field never lists it as an option                                           |

## Edge cases / error paths

- Target identifier missing or malformed on an email-change/password-change/delete request → expected: denied with the same generic cross-Warehouse-hidden outcome as AC-09 (integration + contract).
- Two concurrent creation attempts submit the same not-yet-registered email → expected: exactly one succeeds, the other is rejected as a duplicate, with no partially created identity left behind (integration, concurrency).
- A lifecycle command fails partway through its transaction (e.g. the credential-hash step succeeds but the persistence write is interrupted) → expected: the whole attempt rolls back — no identity, membership, credential, or session change survives (integration, injected-failure — covers the "Lifecycle atomicity" NFR).
- Bulk session revocation on password-change is scoped correctly → expected: only the target Account's sessions are revoked; a peer's sessions in the same Warehouse are provably untouched (integration — dedicated test per `sad.md` §11's flagged risk).
- Deletion sequencing satisfies the existing `RESTRICT` foreign-key order (membership → sessions → users/accounts) → expected: deletion succeeds without a foreign-key violation, exercising the exact statement order `data-model.md`'s Deletion sequencing section specifies (integration).
- The Permission-catalogue migration runs twice (idempotency) → expected: no duplicate `permissions` or `role_permissions` rows; `USERS:CREATE`'s pre-existing grants are unaffected by `down` (integration, migration up/up/down).
- Members list is requested without `USERS:WATCH` → expected: read-denied state, no row data delivered (integration + component, per design-handoff "States and interactions").
- A per-row action becomes invalid mid-session because a concurrent Role/Permission change removed it → expected: the stale control is denied server-side and removed from the UI on the next refetch, not merely hidden client-side (integration + e2e-through-ui, per `sad.md` §6.5).

## Test data

- Seed strategy: the new persistence-entity factories `data-model.md` defines —
  `accountEntityFactory`, `userEntityFactory`, `warehouseMembershipEntityFactory`,
  `sessionEntityFactory` — plus the existing `access`-owned Role/Permission fixtures for Warehouse,
  Role, and Permission rows. No real-looking email or password value; synthetic/`example.test` values
  only.
- Integration dependency: an ephemeral real Postgres dependency, NOT a mocked datastore — the same
  real-database convention this repo's existing `auth`/`access` command- and repository-integration
  suites already use.
- Cleanup boundary: per-test. Each test creates and tears down its own Warehouse/Role/Membership/
  Account/User/Session rows, so the many denial-path tests that share the unique-email and
  one-Manager-per-Warehouse constraints never collide, and the AC-15 concurrency test starts from
  known-clean state.

## NFR validation (load)

- Creation latency p95 ≤ 400 ms → scenario: sustain a representative creation-request rate for a
  fixed duration, assert p95 request latency (excluding client network time) ≤ 400 ms.
- Email-change and password-change latency p95 ≤ 300 ms → scenario: sustain a representative
  request rate mixing both operations for a fixed duration, assert p95 request latency ≤ 300 ms for
  each operation type.
- Deletion latency p95 ≤ 500 ms → scenario: sustain a representative deletion-request rate for a
  fixed duration, assert p95 request latency ≤ 500 ms.
- Throughput ≥ 30 operations/second per running service instance for 10 minutes → scenario: sustain
  30 ops/s (mixed across the four lifecycle operations) for 10 minutes against one service instance,
  assert no error-rate regression and the operation continues to meet its own latency target under
  load.

**Current state:** `tests/users/release-gates.mjs`/`.spec.mjs` implement and unit-test the
threshold-evaluation logic above (percentile math, the throughput formula, the terminal-outcome
check) against hand-supplied sample data — this is manual-input evidence that the _math_ is
correct, not an automated load driver exercising a running service instance. None of the four
scenarios above are wired to a real load tool yet (spec.md §6, footnote 1). Treat this as an open
follow-up, not a met NFR.

<!-- "Lifecycle atomicity" and "Authorization coverage" (spec.md §6) carry a 100% target but are not
load scenarios — they are covered by the integration/architecture rows above (rollback-on-failure,
AC-11/13/14/15/16/18/19/20 command enforcement, and the Authorization-coverage architecture test in
sad.md §8), not by throughput or latency. -->

## CI placement

- On every PR: unit, contract, component.
- On schedule / pre-release: integration, e2e, e2e-through-ui, visual-regression, load.
