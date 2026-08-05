---
status: Draft
owner: 'QA + implementing engineer'
reviewers: ['Implementing Engineer', 'Tech Lead']
updated_at: '2026-08-03'
feature_size: 'M'
---

# Test plan — access

This plan verifies Warehouse-scoped authorization, invariant-preserving access lifecycle operations, registration provisioning, and the web access-administration experience.

## Levels

| Level             | Scope                                                                                                       | Strategy                                                                                                     |
| ----------------- | ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| unit              | Name, Permission, protected-Role, assignment, and transfer rules without I/O.                               | Exercise domain values and rules entirely in memory.                                                         |
| integration       | Access modules and transactions against their owned persistence boundary.                                   | Use an ephemeral real database spun up for the suite and exercise real constraints and transaction behavior. |
| contract          | Shared registration and access API boundaries.                                                              | Validate real requests, responses, and safe failures against the agreed schemas.                             |
| e2e               | Registration, Role lifecycle, authorization, reads, and manager transfer through real service entry points. | Exercise complete flows against ephemeral dependencies.                                                      |
| load              | Numeric latency, throughput, atomicity, freshness, and coverage targets.                                    | Use the load tool already in the repository, or e.g. k6 or Locust, with the scenarios below.                 |
| component         | Sign-up and access-administration UI states and interactions in isolation.                                  | Render each state with controlled inputs and assert output, accessibility, and behavior.                     |
| visual-regression | Approved web layouts and state variants.                                                                    | Compare rendered states with approved baselines and review intentional changes.                              |
| e2e-through-UI    | Registration and access administration through the rendered web application.                                | Drive critical user stories through the UI against ephemeral dependencies.                                   |

## AC coverage

| AC (spec.md §5) | Test name (intent-based)                                                   | Level                                                                                | Expected outcome                                                                                                                                                   |
| --------------- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| AC-01           | registration provisions immediate Warehouse access atomically              | unit + integration + contract + e2e + e2e-through-UI                                 | Exactly one linked identity, Warehouse, protected manager Role, assignment, and session are created and immediate access is confirmed.                             |
| AC-02           | failed registration provisioning leaves no partial identity or access      | unit + integration + contract + e2e                                                  | Every registration object and access right is absent, and the visitor receives a safe failure explanation.                                                         |
| AC-02a          | Warehouse names enforce Unicode-aware validation while allowing duplicates | unit + integration + contract + e2e + component + e2e-through-UI                     | Invalid names identify the violated rule; valid duplicate names are accepted and submitted Unicode is preserved.                                                   |
| AC-03           | authorized member creates an assignable custom Role                        | unit + integration + contract + e2e + e2e-through-UI                                 | The Warehouse-local Role with zero or more assignable Permissions is available for assignment and success is confirmed.                                            |
| AC-04           | exact duplicate Role name is rejected while case variants remain distinct  | unit + integration + contract + e2e                                                  | The duplicate is rejected without mutation; a differently cased name can be created.                                                                               |
| AC-05           | system-managed and reserved Permission changes are rejected                | unit + integration + contract + e2e                                                  | Unknown or reserved membership and Permission-definition edits are rejected without changing the catalogue or Role.                                                |
| AC-06           | Role Permission update changes the next authorization decision             | unit + integration + contract + e2e                                                  | The new, including empty, Permission set is stored and is authoritative on the next protected request.                                                             |
| AC-06a          | valid Role rename preserves submitted Unicode semantics                    | unit + integration + contract + e2e                                                  | The trimmed name is stored without normalization and differently cased names remain distinct.                                                                      |
| AC-06b          | invalid custom Role names are rejected with a specific explanation         | unit + integration + contract + e2e + component + e2e-through-UI                     | Empty, overlong, control/format-containing, and exact duplicate names are rejected without mutation and the violated rule is shown.                                |
| AC-07           | protected Warehouse Manager Role cannot be mutated                         | unit + integration + contract + e2e                                                  | Rename, deletion, and Permission changes are rejected and the protected Role remains unchanged.                                                                    |
| AC-08           | authorized same-Warehouse assignment leaves exactly one Role               | unit + integration + contract + e2e + e2e-through-UI                                 | The target member holds exactly the selected custom Role and confirmation is returned.                                                                             |
| AC-09           | ordinary assignment cannot grant the protected manager Role                | unit + integration + contract + e2e                                                  | The assignment is denied and neither manager nor target assignment changes.                                                                                        |
| AC-09a          | ordinary assignment cannot replace the current manager Role                | unit + integration + contract + e2e                                                  | Reassignment is denied and the current manager remains the sole manager.                                                                                           |
| AC-10           | cross-Warehouse Role assignment is denied                                  | unit + integration + contract + e2e                                                  | Cross-Warehouse target or Role identifiers disclose no foreign access data and no assignment changes.                                                              |
| AC-11           | assigned Role deletion replaces all members atomically                     | unit + integration + contract + e2e + e2e-through-UI                                 | Every affected member moves to the same-Warehouse replacement and the source Role is deleted as one outcome.                                                       |
| AC-12           | failed assigned Role deletion rolls back replacements                      | unit + integration + contract + e2e                                                  | All original assignments and the source Role remain unchanged and a safe failure explanation is returned.                                                          |
| AC-12a          | unassigned custom Role is deleted without replacement                      | unit + integration + contract + e2e                                                  | The Role is removed and all member assignments remain unchanged.                                                                                                   |
| AC-13           | manager transfer swaps protected and replacement Roles atomically          | unit + integration + contract + e2e + e2e-through-UI                                 | The recipient becomes the sole manager and the former manager receives the selected custom Role as one outcome.                                                    |
| AC-14           | unauthorized manager transfer preserves the sole manager                   | unit + integration + contract + e2e                                                  | The transfer is denied and exactly one unchanged manager remains.                                                                                                  |
| AC-14a          | self or cross-Warehouse transfer recipient is rejected                     | unit + integration + contract + e2e                                                  | The transfer is denied without disclosing foreign membership and exactly one manager remains.                                                                      |
| AC-15           | missing capability is hidden in web and denied by server                   | unit + integration + contract + component + visual-regression + e2e + e2e-through-UI | The action is absent from the rendered UI, a direct request is denied, and no state changes.                                                                       |
| AC-16           | Permission never overrides Warehouse ownership                             | unit + integration + contract + e2e                                                  | A permitted actor cannot act on a foreign resource and receives a non-enumerating denial.                                                                          |
| AC-17           | every business capability declares and enforces access rules               | unit + integration + contract + e2e                                                  | Each user-accessible business handler has an explicit Permission and ownership strategy; documented infrastructure handlers remain exempt.                         |
| AC-18           | catalogue update applies assignable and reserved Permission rules          | unit + integration + contract + e2e                                                  | New catalogue entries have the declared classification, every protected Role receives the specified update, and custom Roles change only when explicitly directed. |
| AC-19           | unauthorized custom Role lifecycle operations make no changes              | unit + integration + contract + e2e                                                  | Create, update, rename, and delete attempts are denied and Roles and assignments remain unchanged.                                                                 |
| AC-20           | Role and catalogue reads are scoped by Role-read authority                 | integration + contract + component + visual-regression + e2e-through-UI              | Authorized users see only current-Warehouse Roles and catalogue data in a deterministic bounded view.                                                              |
| AC-21           | member and assignment reads are scoped by member-read authority            | integration + contract + component + visual-regression + e2e-through-UI              | Authorized users see only current-Warehouse members and assignments in a deterministic bounded view.                                                               |
| AC-22           | unauthorized access reads disclose no protected data                       | integration + contract + component + visual-regression + e2e-through-UI              | The read is denied, the protected dataset is neither fetched nor rendered, and no requested information is disclosed.                                              |

## Edge cases / error paths

- Missing or malformed Warehouse name during registration → registration remains uncommitted and the applicable name rule is explained.
- Warehouse name of exactly 100 user-perceived characters → accepted; 101 characters → rejected without partial registration.
- Unicode names with combining sequences or differently normalized forms → preserved as submitted and evaluated by user-perceived character count.
- Exact duplicate custom Role name → rejected; differently cased or differently normalized names → treated as distinct.
- Unknown, reserved, or definition-changing Permission input → rejected without catalogue or Role mutation.
- Empty custom Role Permission set → accepted and authorizes no protected capability on the next decision.
- Missing access membership or missing required Permission → request is denied without exposing protected data.
- Foreign Role, member, replacement, or transfer-recipient identifier → non-enumerating denial and no local or foreign mutation.
- Protected Role supplied to ordinary assignment, update, or deletion → rejected with the protected Role unchanged.
- Assigned Role deletion without a replacement, with the source as replacement, or with an invalid replacement → rejected without assignment changes.
- Persistence failure during registration, Role replacement, or manager transfer → the complete transaction rolls back.
- Two concurrent Role creations with the same exact Warehouse-local name → at most one succeeds and the stored invariant holds.
- Concurrent assigned-Role deletion and assignment → operations serialize safely and no member becomes roleless.
- Concurrent manager transfers → exactly one coherent transfer outcome wins and each Warehouse retains exactly one manager.
- Permission revoked or Role reassigned during an active session → the next protected request uses the new authority.
- Capability projection becomes stale during a UI action → server denial is shown safely and refreshed access removes the stale control.
- Access dependency unavailable → protected operations fail closed and perform no business mutation.

## Test data

- Seed strategy: composable factories for Warehouses, assignable and reserved Permissions, custom and protected Roles, grants, Users, and same-Warehouse memberships; graph fixtures use synthetic identifiers and non-personal example identities.
- Integration dependency: an ephemeral real database spun up for the suite; the datastore is not mocked.
- Cleanup boundary: per-test transaction rollback or equivalent complete reset, plus per-suite teardown of the ephemeral dependency, so ordering and retries cannot leak state.
- Concurrency fixtures: two independent connections operating on the same seeded Warehouse graph with deterministic synchronization points.
- Contract fixtures: valid and invalid boundary objects derived from the shared schemas, including safe non-enumerating failure projections.
- UI fixtures: capability projections for full, partial, revoked, loading, empty, validation, success, denied, and rollback-safe failure states.

## NFR validation (load)

- Authorization evaluation latency, added p95 ≤ 50 ms → sustain 50 protected operations per second for 10 minutes and assert added authorization p95 is at most 50 ms.
- Role read latency, p95 ≤ 250 ms → sustain 50 mixed Role and catalogue reads per second for 10 minutes and assert service-side p95 is at most 250 ms.
- Role mutation latency, p95 ≤ 500 ms → sustain 10 non-conflicting Role mutations per second for 10 minutes and assert service-side p95 is at most 500 ms.
- Protected-operation throughput, at least 50 operations per second per running service instance for 10 minutes → sustain that rate for 10 minutes and assert achieved throughput remains at least 50 operations per second with no unexpected failures.
- Lifecycle atomicity, 100% → execute 1,000 mixed successful and injected-failure registration, assigned-Role deletion, and manager-transfer attempts over 10 minutes and assert every observed committed or rolled-back state preserves all access invariants.
- Revocation freshness, zero successful uses of removed authority → for 10 minutes, revoke or reassign authority before each of 1,000 protected attempts and assert zero post-change attempts succeed with removed authority.
- Authorization coverage, 100% → inspect all discovered user-accessible business handlers in the test run and assert every non-exempt handler has both an explicit Permission rule and a Warehouse-ownership strategy.

## CI placement

- On every pull request: unit, contract, component, and focused integration suites; architecture coverage and deterministic visual-regression checks.
- On protected branch or pre-release: full integration, e2e, and e2e-through-UI suites against ephemeral dependencies.
- On schedule and before release: concurrency scenarios and all load scenarios.

## Review decisions

- 2026-08-03 — Accepted the proposed level mapping: backend lifecycle criteria use unit, integration, contract, and end-to-end coverage as applicable; UI visibility and access-read criteria add component, visual-regression, and UI-driven end-to-end coverage; numeric NFRs add load validation.
