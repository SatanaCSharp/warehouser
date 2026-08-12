---
status: Draft
owner: 'QA'
reviewers: ['Backend Lead', 'Frontend Lead', 'Tech Lead']
updated_at: '2026-08-12'
feature_size: 'L'
---

# Test plan — workspaces

Insert the Workspace above the Warehouse as a second ownership and authorization level: the Workspace
owns the Warehouse lifecycle and Workspace membership, every Warehouse-scoped request names the
Warehouse it applies to, and authority is always the authority held in the named Warehouse.

## Levels

| Level             | Scope                                                                                                                                                                                                                                  | Strategy (generic — no tool names)                                                                                                                                      |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Unit              | Pure rules with no I/O: name rules, assignable-vs-reserved Permissions, protected-Role immutability, replacement/transfer/archiving preconditions, both guards' decisions, and static codebase rules.                                  | In-memory, no external dependency. Guards are exercised over a constructed request and a controlled authority reader; codebase rules are asserted over the source tree. |
| Integration       | A repository or use case against the real database it owns — composite keys, uniqueness of the sole Owner and sole Manager, same-Workspace constraints, selection referential behaviour, transaction participation, rollback.          | The real relational database the repository already runs, reached through the shared data source and gated by the existing integration flag. Never a mocked store.      |
| Contract          | The HTTP boundary between web and server — request/response schema, stable error mapping, non-enumeration, wrong-level Permission denial, cross-Workspace denial, and refusal of a Warehouse-scoped call that names no Warehouse.      | Drive the real handler and validate the real shape against the agreed shared schema; no hand-rolled stubs on either side.                                               |
| Component         | A web component, page, or guard exercised in isolation — props/state and held authority → rendered output, omitted controls, omitted navigation, cache keying, and interaction.                                                        | Render in a component harness with a fresh application store and an in-memory navigation history per test; assert output and behaviour, no full app boot.               |
| Load              | The numeric NFRs in `spec.md` §6.                                                                                                                                                                                                      | The load tool already in the repository, or e.g. k6 or Locust, against a running service instance and a seeded database.                                                |
| E2E               | <!-- N/A: the server has no booted-app harness; per the chosen strategy full-request flows are covered by contract at the HTTP boundary plus integration for atomicity and invariants, which is the split `sad.md` §10 prescribes. --> |                                                                                                                                                                         |
| E2E-through-UI    | <!-- N/A: `apps/web` has no browser-driven harness; every UI-observable acceptance criterion is covered at the component tier. -->                                                                                                     |                                                                                                                                                                         |
| Visual-regression | <!-- N/A: no baseline-image tooling in the repository; the approved Pencil handoff is a release gate, reviewed by a person, not diffed by a test. -->                                                                                  |                                                                                                                                                                         |

## AC coverage

| AC (spec.md §5)                                            | Test name (intent-based)                                                                   | Level                          | Expected outcome                                                                                                                                                          |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------ | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| AC-01 registration bootstrap — happy                       | registration creates the whole access graph as one outcome                                 | integration + contract         | Account, User, unnamed Workspace, Owner Role and its assignment, Warehouse, Manager Role, Warehouse membership, and session all exist; access confirmed                   |
| AC-02 registration bootstrap — error                       | a failed registration leaves nothing behind                                                | integration                    | None of the objects or access rights exist; the Visitor is told registration did not complete                                                                             |
| AC-03 active Warehouse selection — happy                   | the selection follows the member, not the device, and never authorizes                     | integration + component        | Selection is stored against the member and survives a new sign-in; each action names its Warehouse and is authorized by the Role held there                               |
| AC-03b default selection — happy                           | a sole membership becomes the selection and several memberships do not                     | unit + component               | One membership → selected automatically; more than one → no selection until the member chooses                                                                            |
| AC-03a unnamed Warehouse — domain invariant                | a Warehouse-scoped request naming no Warehouse is refused                                  | unit + contract                | Refused, never resolved to the current selection or any default                                                                                                           |
| AC-04 no membership — authorization                        | a Warehouse the member does not belong to can be neither selected nor acted on             | unit + contract                | Denied; existing selection unchanged; nothing about that Warehouse disclosed                                                                                              |
| AC-05 authority per Warehouse — cross-context              | a Permission held in one Warehouse does not act in another                                 | unit + integration             | Denied; authority is that of the membership held in the Warehouse being acted on                                                                                          |
| AC-06 add a Warehouse — happy                              | adding a Warehouse also creates its Manager Role and the creator's membership              | integration + contract         | Warehouse, protected Manager Role, and creator membership created as one outcome; Warehouse selectable for the creator                                                    |
| AC-07 Manager on creation — domain invariant               | a Warehouse is not created when its Manager cannot be established                          | integration                    | No Warehouse exists; a Warehouse never has zero or more than one Manager                                                                                                  |
| AC-08 Warehouse-name rules — error                         | an invalid Warehouse name is rejected with the rule it broke                               | unit + contract                | Rejected, naming the rule; a valid name may duplicate another Warehouse's name                                                                                            |
| AC-09 rename a Warehouse — happy                           | a renamed Warehouse keeps its submitted Unicode                                            | unit + integration             | Trimmed name recorded without normalization and shown to that Warehouse's members                                                                                         |
| AC-10 rename/archive across Workspaces — cross-context     | a Warehouse of another Workspace cannot be renamed, archived, or restored                  | contract + integration         | Denied; the Warehouse's existence is not disclosed                                                                                                                        |
| AC-11 archive and restore — happy                          | archiving stops operation while the record and its edges stay administrable                | integration + component        | No resource operation; rename, restore, membership assignment/withdrawal, and Manager transfer still available; restore returns it intact                                 |
| AC-11a last Warehouse — domain invariant                   | the only non-archived Warehouse cannot be archived                                         | unit + integration             | Denied, explaining a Workspace always keeps one non-archived Warehouse                                                                                                    |
| AC-12 archived Warehouse — cross-context                   | an archived Warehouse authorizes no change to what it owns                                 | unit + integration             | Denied as archived; memberships, Roles, and other Warehouses unaffected; exactly one Manager retained                                                                     |
| AC-12a archived reads — happy                              | an archived Warehouse stays readable to a watch Permission                                 | unit + component               | Read allowed and the Warehouse marked archived                                                                                                                            |
| AC-13 archive/restore failure — error                      | a failed archive or restore changes nothing                                                | integration                    | Archived state, memberships, and Roles unchanged; the member is told it did not complete                                                                                  |
| AC-14 create a Workspace Role — happy                      | a custom Workspace Role becomes assignable in its Workspace                                | integration + contract         | Role available for assignment; the member receives confirmation                                                                                                           |
| AC-14a update a Workspace Role — happy                     | changed Permissions and names take effect on the next decision                             | integration + contract         | Change recorded, Unicode preserved, an empty Permission set accepted, new membership used for subsequent decisions                                                        |
| AC-15 Role-name uniqueness — domain invariant              | an exact Workspace Role name is not reused, differing case is                              | unit + integration             | Exact duplicate rejected with the uniqueness rule; differently cased names remain distinct                                                                                |
| AC-15a Role-name rules — error                             | an invalid Workspace Role name is rejected with the rule it broke                          | unit + contract                | Rejected, naming the rule                                                                                                                                                 |
| AC-16 protected Owner Role — domain invariant              | the Owner Role cannot be renamed, deleted, or repermissioned                               | unit + integration             | Rejected, explaining the protected Role is system-managed                                                                                                                 |
| AC-17 delete an assigned Role — happy                      | deleting an assigned Role moves its holders to the replacement as one outcome              | integration                    | Every affected member holds the replacement and the old Role is gone; nobody is left without exactly one Role                                                             |
| AC-17d deletion without assignment right — authorization   | deleting an assigned Role needs the assignment Permission too                              | unit + contract                | Denied, explaining the move is an assignment; deleting an unassigned Role stays available                                                                                 |
| AC-17a delete an unassigned Role — happy                   | an unassigned Role is deleted without touching assignments                                 | integration                    | Role deleted; no Workspace Role assignment changes                                                                                                                        |
| AC-17b deletion failure — error                            | a failed Role deletion changes neither Roles nor assignments                               | integration                    | Nothing changed; the member is told the deletion did not complete                                                                                                         |
| AC-17c only custom Role — domain invariant                 | the last custom Role cannot be deleted while assigned                                      | unit + integration             | Denied, explaining another custom Role must exist first                                                                                                                   |
| AC-18 Permission catalogue — error                         | an unknown, reserved, or edited Permission is refused                                      | unit + contract                | Rejected, explaining Permission definitions are system-managed                                                                                                            |
| AC-19 add a Workspace Member — happy                       | a Warehouse member of the Workspace becomes a Workspace Member with one Role               | integration + contract         | Candidate holds exactly that Role and its capabilities; the acting member receives confirmation                                                                           |
| AC-19a remove a Workspace Member — happy                   | removing Workspace membership keeps Warehouse membership                                   | integration                    | Every Warehouse membership and Role kept; all Workspace capabilities gone from the next decision onward                                                                   |
| AC-19b move to another Workspace Role — happy              | reassignment replaces authority on the next decision                                       | integration                    | Target holds exactly the new Role; the previous Role's capabilities stop applying; no Warehouse membership changes                                                        |
| AC-20 candidate outside the Workspace — cross-context      | someone with no Warehouse membership here cannot be added                                  | unit + integration             | Blocked, explaining only people already in a Warehouse of this Workspace can be added                                                                                     |
| AC-21 membership loss afterwards — domain invariant        | an existing Workspace Member keeps their Role when Warehouse memberships end               | integration                    | Workspace Role and capabilities remain in force until an explicit Workspace membership removal                                                                            |
| AC-22 assigning the Owner Role — authorization             | ordinary assignment cannot make or unmake the Owner                                        | unit + contract                | Denied, explaining Owner changes only through the protected transfer                                                                                                      |
| AC-21a removing the Owner — domain invariant               | the current Owner's Workspace membership cannot be removed                                 | unit + integration             | Denied, explaining Owner must be transferred first; exactly one Owner preserved                                                                                           |
| AC-23 assign a Warehouse membership — happy                | a Workspace Member places another User into a Warehouse with a custom Role                 | integration + contract         | Target holds exactly that Role there, keeps every prior membership, and the Warehouse becomes selectable for them                                                         |
| AC-23a read assignable Roles — cross-context               | choosing a Role exposes identifiers and names only                                         | contract + integration         | Read allowed, limited to Role identifier and name; no other capability inside that Warehouse and no cross-Workspace visibility                                            |
| AC-24 cross-Workspace placement — cross-context            | a User and a Warehouse of different Workspaces are never paired                            | integration + contract         | Denied; all of a User's Warehouse memberships belong to Warehouses of one Workspace                                                                                       |
| AC-25 Manager Role or second membership — domain invariant | membership assignment grants neither the Manager Role nor a duplicate                      | unit + integration             | Denied, explaining Manager changes only through the protected transfer and a User holds at most one Role per Warehouse                                                    |
| AC-25a self-assignment — authorization                     | a member cannot place themself into an existing Warehouse                                  | unit + contract                | Denied, explaining authority over an existing Warehouse is always granted by someone else                                                                                 |
| AC-25b withdraw a membership — happy                       | a withdrawn membership stops authorizing on the next decision                              | integration                    | Role and its Permissions gone from the next decision; that Warehouse no longer selectable; other memberships unaffected                                                   |
| AC-25c protected or own withdrawal — domain invariant      | neither the Manager's membership nor one's own can be withdrawn                            | unit + contract                | Denied, explaining Manager moves only through the protected transfer and a member never withdraws their own authority                                                     |
| AC-25d withdrawal across Workspaces — cross-context        | a membership in another Workspace's Warehouse cannot be withdrawn                          | contract + integration         | Denied; neither the Warehouse nor the membership is disclosed                                                                                                             |
| AC-26 transfer Workspace Owner — happy                     | promotion and the outgoing owner's new Role complete as one outcome                        | integration                    | Recipient is the sole Owner; former owner holds the selected custom Role                                                                                                  |
| AC-26a transfer with no custom Role — error                | Owner transfer needs a Role for the outgoing owner to land in                              | unit + integration             | Denied; exactly one Owner preserved; explains a custom Role must be created first                                                                                         |
| AC-27 transfer by a non-owner — authorization              | only the current Owner with the protected Permission may transfer                          | unit + contract                | Denied; exactly one Owner preserved                                                                                                                                       |
| AC-28 invalid transfer recipient — authorization           | self, a non-member, or another Workspace's member is not a valid recipient                 | unit + integration             | Denied; exactly one Owner preserved                                                                                                                                       |
| AC-29 name the Workspace — happy                           | setting or changing the Workspace name replaces the unnamed placeholder                    | unit + integration + component | Trimmed name recorded without normalization and shown in place of the placeholder; duplicates across Workspaces allowed                                                   |
| AC-29a Workspace-name rules — error                        | an invalid Workspace name is rejected with the rule it broke                               | unit + contract                | Rejected, naming the rule; existing name or unnamed state left as it was                                                                                                  |
| AC-30 capability without Permission — authorization        | the server refuses and the web omits the control and its navigation entry                  | contract + component           | Server explains access is not permitted; the control is absent, and a destination with no available capability is absent from navigation rather than shown empty          |
| AC-31 level confusion — cross-context                      | neither level's Permission substitutes for the other                                       | unit + contract                | Denied in both directions; Workspace and Warehouse authority stay separate                                                                                                |
| AC-32 review Roles and catalogue — happy                   | a Roles watcher sees their own Workspace's Roles and the Permission catalogue              | contract + component           | Custom Workspace Roles and the system Permission catalogue of their own Workspace are shown                                                                               |
| AC-33 review members and Warehouses — happy                | each watch Permission shows exactly the assignment candidates it governs                   | contract + component           | Members with Role assignments plus the Workspace's other Users and the Warehouses they belong to, or the Warehouses with archived state, according to the Permission held |
| AC-34 reads across Workspaces — cross-context              | another Workspace's configuration, and one's own without the watch Permission, stay hidden | contract + integration         | Read denied; the requested Workspace information is not disclosed                                                                                                         |
| AC-35 Permission catalogue release — happy                 | a released Permission reaches every Owner Role and no custom Role                          | integration                    | Non-reserved Permission becomes assignable and is added to every existing Owner Role; a reserved one stays exclusive; no custom Role changes                              |
| AC-36 transfer Warehouse Manager — happy                   | promotion and the outgoing Manager's new Role complete as one outcome                      | integration + contract         | Recipient's membership carries the Manager Role, the outgoing Manager's carries the selected custom Role, exactly one Manager remains, other Warehouses untouched         |
| AC-36a invalid Manager transfer — domain invariant         | Manager moves only between members of that same Warehouse                                  | unit + integration             | Denied for a non-member recipient, self, or a missing custom Role; exactly one Manager preserved                                                                          |

### Cross-cutting NFR checks (the non-numeric rows of spec.md §6)

These are conditions on the whole feature rather than on one criterion, so they are named here
instead of being folded into a single AC row.

| NFR (spec.md §6)                 | Test name (intent-based)                                               | Level              | Expected outcome                                                                                                                                                                                                               |
| -------------------------------- | ---------------------------------------------------------------------- | ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Lifecycle atomicity              | each protected lifecycle outcome survives an injected mid-flow failure | integration        | Registration bootstrap, Warehouse creation, assigned Role deletion, Owner transfer, and Manager transfer each leave every invariant intact or leave nothing at all                                                             |
| Revocation freshness             | removed authority is never usable after the change                     | integration        | Permission removal, Role reassignment, membership withdrawal, and archiving all take effect on the next decision; zero successful uses afterwards                                                                              |
| Authority staleness              | every decision re-reads authority from the store                       | unit + integration | No decision is made from a Role, Permission, or membership carried in a session or token; a change made between two requests is visible to the second                                                                          |
| Workspace authorization coverage | every user-accessible capability declares its rule and ownership check | unit               | Every handler outside authentication is classified; every Warehouse-scoped handler declares read or mutating; controllers call use cases only; `workspaces/domain` imports no framework; `access` does not import `workspaces` |

## Edge cases / error paths

Each error and authorization criterion above already holds its own row. These are the boundary and
failure cases the spec implies on top of them.

- A Warehouse-scoped request naming two different Warehouses (path and body disagree) → refused as
  ambiguous, exactly as one that names none.
- A Warehouse identifier that is well-formed but belongs to no Warehouse → the same refusal a
  Warehouse the actor does not belong to receives, so existence stays undisclosed.
- A name that is exactly 100 user-perceived characters, and one that is 100 code points but more
  than 100 user-perceived characters → accepted and rejected respectively, for Workspace, Workspace
  Role, and Warehouse names alike.
- A name that is non-empty but whitespace-only, and one whose only invalid content is a zero-width
  or bidirectional format character → rejected with the rule that was broken.
- Two members archiving the last two non-archived Warehouses of a Workspace concurrently → exactly
  one succeeds; a non-archived Warehouse always remains.
- Two members transferring Workspace Owner, or Warehouse Manager, concurrently → exactly one
  succeeds; exactly one Owner and exactly one Manager remain.
- Deleting an assigned Workspace Role while another member is being assigned that same Role → the
  outcome leaves every member holding exactly one existing Role.
- The member's selected Warehouse is archived, or their membership in it is withdrawn, between two
  requests → the next decision refuses the Warehouse-scoped action regardless of the stale
  selection, and the member is shown a coherent landing state rather than an empty one.
- The Permission catalogue release runs twice → the second run adds nothing and changes no Role.
- The database is unavailable mid-operation → the operation fails closed: nothing is partially
  written, no authority is granted, and the member is told the change did not complete.

## Test data

- **Seed strategy:** the factories named in `data-model.md` "Test fixtures" —
  `buildWorkspace` (unnamed by default, so the placeholder path is the default), `buildWorkspacePermission`
  (assignable by default, reserved explicit), `buildWorkspaceRole`, `buildWorkspaceMembership`,
  `buildWarehouse`, `buildWarehouseMembership`, and `persistWorkspaceGraph` for the composite-key,
  sole-Owner, sole-Manager, and selection-clearing checks. Identities use `example.test` addresses and
  synthetic UUIDs; no real-looking personal data reaches a fixture, seed, or migration.
- **Integration dependency:** the real relational database the repository already runs, reached
  through the shared data source and gated by the existing integration flag — never a mocked store.
  Suites that need a Workspace graph build it through `persistWorkspaceGraph` rather than reusing
  another suite's rows.
- **Cleanup boundary:** per-test. Each integration test runs inside a transaction that is rolled back,
  or removes exactly the rows it created, so ordering never matters and a failing test cannot poison
  the next one. Component tests get a fresh application store and navigation history per test.
- **Migrations** are verified by applying and reverting them against the development database, not by
  tests — with the exception of AC-35, whose catalogue effect is asserted as an integration check.

## NFR validation (load)

Run with the load tool already in the repository, or e.g. k6 or Locust, against one running service
instance and a database seeded with a Workspace of several Warehouses and members.

- **Workspace authorization p95 ≤ 50 ms** → sustain 50 protected Workspace operations per second for
  10 minutes; assert the authorization stage p95 ≤ 50 ms.
- **Warehouse authorization p95 ≤ 50 ms, independent of membership count** → run the same 50 requests
  per second for 10 minutes twice, once for a member holding 1 Warehouse membership and once for a
  member holding 25; assert the authorization stage p95 ≤ 50 ms in both and that the second p95 does
  not exceed the first by more than 10%.
- **Workspace read p95 ≤ 250 ms** → sustain 50 read operations per second for 10 minutes; assert
  server-side p95 ≤ 250 ms, excluding client network time.
- **Workspace mutation p95 ≤ 500 ms** → sustain 10 mutations per second for 10 minutes; assert
  server-side p95 ≤ 500 ms, excluding client network time.
- **Warehouse selection p95 ≤ 250 ms** → sustain 10 selection changes per second for 10 minutes;
  assert p95 ≤ 250 ms from selection to that Warehouse's context being served.
- **Protected-operation throughput ≥ 50 ops/s per instance** → sustain 50 Workspace operations per
  second against one instance for 10 minutes; assert the rate is held with no error-rate regression.

## CI placement

- **On every pull request:** unit, contract, and component — the fast suites, plus the codebase-rule
  checks behind the authorization-coverage NFR.
- **On every pull request where the database is available, and always before merge:** integration,
  behind the existing integration flag.
- **On schedule / pre-release:** load, and the migration apply-and-revert run against the development
  database.
- **Release gates, not suites:** the security review required by `spec.md` §6.1 and the approved
  Pencil design handoff.
