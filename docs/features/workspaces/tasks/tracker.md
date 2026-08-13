# Tracker — workspaces

> Status of every task in the epic. `implement` updates `done` as it commits each task.
> States: `todo` · `in_progress` · `blocked` · `review` · `done`.

| #   | Task                                                     | Layer     | Owner                        | Estimate | Blocked by                            | Status  |
| --- | -------------------------------------------------------- | --------- | ---------------------------- | -------- | ------------------------------------- | ------- |
| T1  | Promote workspace authority schema migrations (01–03)    | migration | Backend Lead                 | M        | —                                     | done    |
| T2  | Promote re-key + selection migrations (04–05)            | migration | Backend Lead                 | M        | T1                                    | done    |
| T3  | Promote `AccessName` + add the Workspace name wrapper    | domain    | Backend Lead                 | S        | —                                     | done    |
| T4  | `workspaces` domain predicates, errors and invariants    | domain    | Backend Lead                 | L        | T3                                    | done    |
| T5  | `WorkspacePermissionId` + new stable error codes         | ports     | Backend Lead                 | M        | —                                     | done    |
| T6  | `packages/contracts/workspaces` schemas                  | ports     | Backend Lead                 | L        | T5                                    | done    |
| T7  | Workspace entities, changed entities, test factories     | infra     | Backend Lead                 | L        | T2                                    | done    |
| T8  | Guard-read repositories (both levels)                    | infra     | Backend Lead                 | M        | T7                                    | done    |
| T9  | `WorkspaceReadRepository`                                | infra     | Backend Lead                 | L        | T7                                    | done    |
| T10 | Workspace Role / membership / Owner-transfer repos       | infra     | Backend Lead                 | L        | T7                                    | done    |
| T11 | Warehouse lifecycle + membership repos                   | infra     | Backend Lead                 | L        | T7                                    | done    |
| T12 | Split provisioning; re-key existing Warehouse writes     | infra     | Backend Lead                 | M        | T7                                    | done    |
| T13 | `WorkspaceAccessGuard` + reworked `WarehouseAccessGuard` | ports     | Backend Lead + Security Lead | L        | T5, T8                                | done    |
| T14 | Registration bootstrap in `workspaces` provisioning      | app       | Backend Lead                 | M        | T4, T6, T12                           | done    |
| T15 | Workspace rename + configuration queries                 | app       | Backend Lead                 | L        | T4, T6, T9                            | done    |
| T16 | Workspace Role create + update                           | app       | Backend Lead                 | L        | T4, T6, T10                           | done    |
| T17 | Workspace Role deletion with replacement                 | app       | Backend Lead                 | L        | T4, T6, T10                           | done    |
| T18 | Workspace membership add / remove / reassign             | app       | Backend Lead                 | L        | T4, T6, T10                           | done    |
| T19 | Workspace Owner transfer                                 | app       | Backend Lead                 | M        | T4, T6, T10                           | done    |
| T20 | Warehouse create + rename                                | app       | Backend Lead                 | L        | T4, T6, T11, T12                      | done    |
| T21 | Warehouse archive + restore                              | app       | Backend Lead                 | L        | T4, T6, T11                           | done    |
| T22 | Warehouse membership assign / revoke + assignable Roles  | app       | Backend Lead                 | L        | T4, T6, T11                           | done    |
| T23 | Active Warehouse selection + actor-context query         | app       | Backend Lead                 | L        | T6, T9, T11                           | done    |
| T24 | Workspace-level REST controller + module wiring          | ports     | Backend Lead                 | L        | T6, T13, T15, T16, T17, T18, T19, T23 | done    |
| T25 | Warehouse-record and membership-edge REST routes         | ports     | Backend Lead                 | M        | T6, T13, T20, T21, T22                | done    |
| T26 | Re-shape the `access` REST surface                       | ports     | Backend Lead                 | L        | T12, T13                              | done    |
| T27 | Re-shape the `users` REST surface                        | ports     | Backend Lead                 | M        | T12, T13                              | done    |
| T28 | ADR 0003 + `sad.md` §8 classification reconciliation     | docs      | Tech Lead + Security Lead    | S        | —                                     | done    |
| T29 | Record the supersession of the two approved specs        | docs      | Tech Lead                    | S        | —                                     | done    |
| T30 | Two-level authorization-coverage architecture check      | tests     | Backend Lead + Security Lead | M        | T24, T25, T26, T27, T28               | done    |
| T31 | Workspace load smoke test + timing coverage              | tests     | Backend Lead                 | M        | T24, T25                              | done    |
| T32 | Missing shared icon components                           | ui        | Frontend Lead                | S        | —                                     | done    |
| T33 | Workspace actor-context API, capability hook, gate       | ui        | Frontend Lead                | M        | T6                                    | done    |
| T34 | Warehouse switcher in the application shell              | ui        | Frontend Lead                | L        | T32, T33                              | done    |
| T35 | `modules/workspace` route, page shell, tabs, i18n        | ui        | Frontend Lead                | L        | T32, T33                              | done    |
| T36 | Warehouses tab: list, detail pane, lifecycle dialogs     | ui        | Frontend Lead                | L        | T35                                   | done    |
| T37 | Warehouse access grant / withdrawal from the detail pane | ui        | Frontend Lead                | L        | T36                                   | done    |
| T38 | Workspace roles + Permissions tabs                       | ui        | Frontend Lead                | L        | T35, T41                              | done    |
| T39 | Workspace members tab + Owner transfer                   | ui        | Frontend Lead                | L        | T35, T41                              | done    |
| T40 | Migrate the Warehouse-scoped web surface                 | ui        | Frontend Lead                | L        | T26, T27, T33                         | done    |
| T41 | Workspace read projection gaps (counts + member flag)    | infra     | Backend Lead                 | S        | T9, T24                               | done    |
| T42 | Fix `CreateWarehouseCommand` Nest DI wiring              | ports     | Backend Lead                 | S        | —                                     | done    |
| T43 | Translate infra failures into the documented 503 codes   | app       | Backend Lead                 | S        | T20, T21                              | done    |
| T44 | Return the documented `Warehouse` body from archival     | app       | Backend Lead                 | S        | T21, T25                              | done    |
| T45 | Render the tab content in the administration panels      | ui        | Frontend Lead                | S        | T36                                   | done    |
| T46 | Carry the identifying email in the Workspace reads       | infra     | Backend Lead                 | S        | T9, T24                               | done    |
| T47 | Realign the four stale integration specs to openapi.yaml | test      | Backend Lead                 | S        | —                                     | done    |
| T48 | Return the documented 200 owner-transfer result          | rest      | Backend Lead                 | S        | —                                     | done    |
| T49 | Restore the two documented access-tier outcomes          | app       | Backend Lead                 | M        | —                                     | blocked |
| T50 | Repair the workspaces load-smoke gate                    | test      | Backend Lead                 | S        | —                                     | done    |
| T51 | Report a cross-Workspace Warehouse as unavailable        | app       | Backend Lead                 | S        | —                                     | done    |
| T52 | Raise and surface the archival/creation 503s             | app       | Backend Lead                 | M        | —                                     | done    |
| T53 | Carry the Workspace bootstrap in the registration reply  | rest      | Backend Lead                 | M        | —                                     | done    |
| T54 | Give a member with no Active Warehouse a way forward     | ui        | Frontend Lead                | M        | —                                     | done    |
| T55 | Scope the three users current-access reads to Warehouse  | app       | Backend Lead                 | M        | —                                     | done    |
| T56 | Raise the two unreachable Workspace 503s                 | app       | Backend Lead                 | S        | —                                     | done    |
| T57 | Resolve `workspaceRoleId` before assigning it            | app       | Backend Lead                 | M        | —                                     | done    |
| T58 | One generic unavailable-recipient outcome for transfer   | app       | Backend Lead                 | S        | —                                     | done    |
| T59 | Admit `WORKSPACE:RENAME` to the watch-permission list    | ui        | Frontend Lead                | S        | —                                     | done    |
| T60 | Explain the empty replacement choice; map the refusal    | ui        | Frontend Lead                | M        | —                                     | done    |
| T61 | Agree the empty-name rule key between web and server     | ui        | Frontend Lead                | S        | —                                     | done    |
| T62 | Swap the two Owner memberships in ordered statements     | infra     | Backend Lead                 | S        | T58                                   | done    |
| T63 | Wire the integration tier into the default gate          | test      | Backend Lead                 | M        | —                                     | todo    |
| T64 | Map the two newly raisable Workspace 503s in the web     | ui        | Frontend Lead                | S        | —                                     | todo    |
| T65 | Restore the six deleted owner-transfer unit assertions   | test      | Backend Lead                 | S        | —                                     | todo    |
| T66 | Widen the AC-36a assertion to both legal interleavings   | test      | Backend Lead                 | S        | —                                     | todo    |
| T67 | Add a typecheck gate; clear the 42 spec type errors      | test      | Backend Lead                 | M        | T63                                   | todo    |
| T68 | Scope or remove `resolveAnyRequiredPermission`           | infra     | Backend Lead                 | S        | —                                     | todo    |
| T69 | Give the Warehouse name map a neutral server fallback    | ui        | Frontend Lead                | S        | —                                     | todo    |
| T70 | De-flake the Workspace members tab assertions            | test      | Frontend Lead                | S        | —                                     | todo    |
| T71 | Narrow `withUnavailableOutcome` to infrastructure only   | app       | Backend Lead                 | M        | —                                     | todo    |
| T72 | Prove `CreateWarehouseCommand` masks no rejection        | test      | Backend Lead                 | S        | T71                                   | todo    |
| T73 | Single-source the Warehouse access projection            | ports     | Backend Lead                 | S        | —                                     | todo    |
| T74 | Reconcile `tasks.json` and the tracker                   | infra     | Tech Lead                    | S        | —                                     | todo    |
| T75 | Clear the three residual accuracy gaps from the lane     | test      | Backend Lead                 | S        | —                                     | todo    |
| T76 | Enforce every declared Permission in both access guards  | ports     | Security Lead                | S        | —                                     | todo    |
| T77 | Stop the registration catch-all masking input errors     | app       | Backend Lead                 | S        | T71                                   | todo    |
| T78 | Prove membership before locking the selected Warehouse   | infra     | Security Lead                | M        | —                                     | todo    |
| T79 | Agree name length between the contract and the domain    | ports     | Backend Lead                 | M        | —                                     | todo    |
| T80 | Stop routing name rules by assertion-message matching    | app       | Backend Lead                 | M        | —                                     | todo    |
| T81 | Keep the integration harness out of the production build | infra     | Backend Lead                 | S        | —                                     | todo    |
| T82 | Feed the release gates real Workspace timing data        | app       | Backend Lead                 | M        | —                                     | todo    |
| T83 | Add the seven missing workspaces command unit specs      | test      | Backend Lead                 | M        | T63                                   | todo    |
| T84 | Stop the workspaces domain service invoking a use case   | app       | Backend Lead                 | M        | —                                     | todo    |
| T85 | Add the workspaces domain mappers the SAD assigns        | app       | Backend Lead                 | M        | —                                     | todo    |
| T86 | Move multi-repository orchestration into domain services | app       | Backend Lead                 | L        | T85                                   | todo    |
| T87 | Import the provisioning service, do not re-register it   | ports     | Backend Lead                 | S        | —                                     | todo    |
| T88 | Remove the contracts root barrel; map shared-types       | ports     | Backend Lead                 | S        | T73                                   | todo    |
| T89 | Replace the bare `Error` in the provisioning repository  | infra     | Backend Lead                 | S        | —                                     | todo    |
| T90 | Make the workspace authority predicates load-bearing     | app       | Backend Lead                 | S        | —                                     | todo    |
| T91 | Gate Warehouse controls on a capability hook             | ui        | Frontend Lead                | M        | —                                     | todo    |
| T92 | Restore the `components/` nesting level                  | ui        | Frontend Lead                | M        | —                                     | todo    |
| T93 | Declare plural forms for the workspace count keys        | ui        | Frontend Lead                | S        | —                                     | todo    |
| T94 | Key the list empty states on the filtered collection     | ui        | Frontend Lead                | S        | —                                     | todo    |
| T95 | Stop naming a non-hook helper with the `use` prefix      | ui        | Frontend Lead                | S        | —                                     | todo    |
| T96 | Reconcile switcher and refusal with the approved frames  | ui        | Frontend Lead                | M        | T64                                   | todo    |
| T97 | Close the seven approved-design fidelity findings        | ui        | Frontend Lead                | L        | T96                                   | todo    |
| T98 | Correct the app-level repository instruction             | infra     | Tech Lead                    | S        | —                                     | todo    |

**T46 — projection gap found during `implement` (T38/T39 run).** `contracts/openapi.yaml` documents `email` on both
`WorkspaceMember` ("carried so the reader can tell Workspace Members apart. Present on the same terms as the approved
Warehouse member projection") and `WorkspaceUser`, and both contract schemas already allowed it — but neither server
read projected it, so `grep -rn email apps/server/src/workspaces` returned nothing. The Members tab would have rendered
raw UUIDs where the approved frames (`edPx9`, `VrGa3`) show a person. The web already degraded gracefully
(`user.email ?? user.userId`), so nothing crashed and no web test caught it; the Warehouses tab's own spec had been
papering over it with a fixture that supplied an email the server never sends. Fixed server-side by joining the account
that owns the address, mirroring the Access-level member projection the contract names as the precedent. Registered as
its own task rather than absorbed into T39, whose `files_hint` is web-only.

**T45 — tab panels.** Registered here after the fact: the T45 commit (`88d1549`) predates this row and was never added
to the tracker.

**T42 — defect found during `implement`.** `CreateWarehouseCommand` injects `ProvisionInitialAccessDelegate`, a
TypeScript **interface**, which erases at runtime so Nest emits `Object` as its token and cannot resolve it
(`Nest can't resolve dependencies of the CreateWarehouseCommand (WarehouseLifecycleRepository, ?, Object)`).
The command is an eagerly-instantiated provider of `WorkspacesUsecaseModule`, reachable from `AppModule` via
`WorkspacesRestModule`, so **the server fails to boot**. It escaped T20's gate because every test constructs the
command with `new` and a hand-made double, never through Nest DI. Fixed alongside T25, which owns
`usecase.module.ts`; the fix follows the existing `useFactory` + `inject` pattern in
`auth/usecases/usecase.module.ts`, and adds a non-Docker-gated DI resolution test so the class of defect cannot
recur silently.

**T43 — gap found during `implement`.** Neither `CreateWarehouseCommand` nor `ArchiveWarehouseCommand` /
`RestoreWarehouseCommand` translates an infrastructure failure into the 503 `ApplicationError`s documented in
`contracts/openapi.yaml` (`workspace.warehouse_creation_unavailable`, `workspace.archival_unavailable`);
`workspace.errors.ts` defines no such factory, so those branches currently fall through to a generic 500.
T25's contract tests encode both branches and are Docker-gated, so they are NON-red locally and will fail in CI
until this lands. Deliberately left outside T25's `files_hint` rather than silently absorbed.

**T44 — cross-lane contract break found during `implement`.** `contracts/openapi.yaml` documents
`PUT /workspace/warehouses/{warehouseId}/archival` as `200` with a full `Warehouse` body, and T36's web client
implements it that way — `setWarehouseArchival: build.mutation<Warehouse, …>` with
`extraOptions: { schema: warehouseSchema }`, which Zod-validates the response. But `ArchiveWarehouseCommand` and
`RestoreWarehouseCommand` return only `{ warehouseId }`, so T25's handler answers `204 No Content` rather than
fabricate an `archivedAt` no command confirmed. Server and web therefore disagree at runtime: an empty 204 body
fails the client's schema validation. The contract is the arbiter, so the fix belongs on the server — widen the
two commands to return the full record and restore the documented `200`. `renameWarehouse` has the same shape
problem (`RenameWarehouseCommand` returns `{ id, name }` with no `archivedAt`, so its return type was narrowed to
`Pick<Warehouse, 'id' | 'name'>`). Deliberately left outside T25's `files_hint`. **Blocks ship** — neither lane's
tests catch it, because each is green in isolation and the contract tier that would catch it is Docker-gated.

**T40 — two DoD items NOT delivered, deliberately reported rather than quietly dropped.** (1) The
authority-lost-mid-session (`OD62T`) UI is not wired: the underlying cache-refresh-on-denial behaviour is proven by
`access-api.spec.ts`, but there is no dedicated UI test and no specific toast copy — that state currently falls back
to the shared generic error toast, and the draft `authorityLost.*` locale keys were removed rather than shipped
unused. (2) Archived-Warehouse disabling reaches the create actions and the Role editor, but **not** the row-level
member actions (edit email, reset password, delete member, assign-Role trigger), which stay enabled on an archived
Warehouse. No RED test covers them, so disabling them would have been speculative. Both need a follow-up decision
before ship — neither is covered by a passing test today.

**T36 — one architecture deviation, accepted but worth re-reading at review.** `WarehousesTab` derives every
capability from a single `useCurrentWorkspaceContext()` call and drills `canCreateWarehouse` three hops
(`WarehousesTab → WarehouseDetailPane → WarehouseLifecycleActions → AddWarehouseAction`), exceeding the two-hop prop
budget in `docs/system/guides/writing-web-components.md`. The stated reason is a **request-ordering assertion in the
spec**: a leaf calling its own context hook races the tab's Warehouse-list query, because React fires child effects
before parent effects. That is a test constraining component structure rather than behaviour, so the deviation is
a symptom worth questioning at review — the right fix may be to relax the ordering assertion, not to keep the
drilling. Documented in code comments.

**Note on worktree isolation.** `.heroui-docs/` is gitignored, so it does not exist in a `git worktree`. T36's
implementer could not read the HeroUI v3 doc files its manifest required and substituted the installed
`@heroui/react` package source under `node_modules`, which is arguably more authoritative. The same class of gap
produced a false "pre-existing build error" report on the server lane (stale `packages/contracts/dist`). Any future
worktree-isolated run should build `packages/contracts` first and expect gitignored reference material to be absent.

## Review remediation — T47–T62 (registered 2026-08-13)

The 2026-08-13 review (`_review/review-2026-08-13.md`) returned **CHANGES REQUESTED** on thirteen
stage-1 findings. T47–T62 register them one lane per finding; S1-01 splits into four (T47–T50)
because its twelve integration failures have four independent causes.

**The gate hole is the root cause and is NOT yet closed.** `pnpm test` does not set
`RUN_INTEGRATION=1`, so 46/46 tasks were marked done over a red integration tier. Every task above
was re-gated with the tier explicitly enabled:

```sh
DATABASE_NAME=warehouser_test RUN_INTEGRATION=1 pnpm --filter @warehouser/server exec jest --runInBand
```

`DATABASE_NAME` must be pinned — these specs `TRUNCATE ... CASCADE` whatever database they reach,
and the `.env.example` default is the development database. Wiring the tier into the default gate is
review finding S2-06 (stage 2), still open.

Baseline at the start of remediation: **12 failed / 852 passed, 7 suites**. After T47, T48, T50,
T51-T62 (all but T49): **1 failed / 888 passed, 105/106 suites** — confirmed by the 2026-08-13
re-review's own run. The single remaining failure is T49 sub-item (b); sub-item (a) is green because
the contract was restated in `8c9989e`.

**T50 changes how long the tier takes.** The load smoke defaults to
`WORKSPACE_LOAD_DURATION_SECONDS=600`, and it previously errored in milliseconds, so nobody paid
that cost. Now that it measures, a default `RUN_INTEGRATION=1` run takes ~11 minutes. Local runs
should set a short duration; the release gate wants the full 600s. Decide where that override lives
when wiring S2-06.

**T49 was blocked on two artifact disagreements. Both were decided on 2026-08-13 (second review
pass); T49 splits accordingly.**

1. **(a) — decided: the `access` code is right.** `PATCH`/`DELETE /warehouses/{id}/access/roles/{roleId}`
   for a Role of another Workspace answers 404 `access.role_unavailable`, as
   `docs/features/access/contracts/openapi.yaml:521` documents. The `access` contract defines two
   distinct responses — `RoleUnavailable` for routes whose target **is** the Role, and
   `MemberOrRoleUnavailable` for routes targeting a member _or_ a Role. These two routes carry the
   Role as sole target, so the workspaces reference was a transcription slip, not a decision. The
   re-shape was declared behaviour-preserving, so changing the server would have been an undeclared
   behaviour change to an approved feature; no consumer keys on either string and non-disclosure is
   identical. `8c9989e` restated the workspaces contract accordingly — **done**. Process note carried
   as review finding R-05: that edit landed _before_ this ratification, while the tracker still read
   `blocked`.
2. **(b) — decided: widen the test, do not change the contract.** See **T66**. AC-36a
   (`spec.md:464-468`) promises the transfer is denied and exactly one Manager is preserved; it
   mandates no status code. The test **passes 3 runs of 3 in isolation** and fails only in the full
   suite, where the loser gets `[200, 403]`. Both outcomes are documented for the route: the loser
   reaching the database first sees the one-Manager constraint (409), and the loser whose guard read
   lands after the winner commits genuinely no longer holds `WAREHOUSE_MANAGER_ROLE:REASSIGN` (403).
   Exactly one Manager survives either way, and the load-bearing assertion for that already exists in
   the test. No guard-then-command ordering can make the interleaving deterministic without holding a
   lock across the guard, which is worse than the problem. Raised separately with the feature owner: a
   lost race surfacing as 403 reads to the outgoing Manager as "you are not allowed" for something
   they _were_ allowed to do a moment earlier — a UX wrinkle, not a contract violation.

**Three findings turned out to be more than the review could confirm.** S1-06 was reported as an
ambiguous resolution; it is a working privilege escalation. `findOneBy({userId})` resolves through
the `(user_id, warehouse_id)` key, so the membership it returns is the actor's _lowest_ warehouse
id — not random, but attacker-influenceable, since a member with a Role in a Warehouse whose id
sorts first has that Role's Permissions used as their ceiling everywhere. The pre-fix
`CreateMemberCommand` created a member holding `USERS:DELETE` for an actor who did not hold it in
the Warehouse they were acting in. `warehouseId` is now a required parameter, so the omission cannot
recur. S1-13's duplicate-key was
reproduced deterministically, not just argued: seeding the recipient's membership row physically
first makes the planner reach it before the outgoing Owner's, and the single `UPDATE ... CASE`
raises `duplicate key value violates unique constraint "uq_workspace_memberships_one_owner"`. And
S1-12's fix exposed a second defect the review did not name — `runWorkspaceMutation` resolves
`workspaceRoleFieldErrorsByCode` _before_ the rule map runs, so the map also sees already-resolved
keys; the original `?? rule` passthrough was load-bearing for AC-15's name conflict.

## Re-review remediation — T63–T98 (registered 2026-08-13, second pass)

The re-review ([`_review/review-2026-08-13b.md`](../_review/review-2026-08-13b.md)) returned
**CHANGES REQUESTED** again. T47–T62 did real work — the integration tier went **12 failed → 1
failed / 888 passed**, twelve of the thirteen stage-1 findings closed with non-tautological tests,
and no realigned spec was weakened to match wrong code. Three things block ship, and one pattern
recurs.

**Blocking (stage 1):** **T64** (R-01) — T56 made two 503s raisable without mapping them in the web,
recreating the exact defect shape that made S1-03 stage-1. **T65** (R-02) — the owner-transfer unit
spec went 10 tests → 2, deleting both AC-27 defense-in-depth denials, the AC-26 payload pin, the
AC-26a ordering test and the `@Transactional()` pin; the guarded code still exists, so this is
coverage loss, and the permission-less-Owner case is now covered nowhere. **T66** (T49b) — the tier
is not green.

**The recurring pattern is unwired gates, and it is why the first review happened.** **T63** (S2-06)
was named as the root cause on 2026-08-13, accepted "Fix now", and is still unwired: `RUN_INTEGRATION=1`
is set by no script and no turbo task, and the repository has **no CI at all**. **T67** (R-03) is the
same failure in a second gate — `tsc --noEmit` reports **42 errors, every one in a spec file, none in
production code**, invisible because lint does not typecheck, ts-jest runs transpile-only under
`isolatedModules`, and the build excludes specs. One of those errors had already silently reverted the
S1-06 security fix at its own test site: `resolveCurrentAccess(newMemberId)` drops the `undefined`
`warehouseId` in TypeORM and degrades to the unscoped lookup the fix removed, so the test passes by
accident. Until both gates run, a green local run is not evidence this feature works. **T63 first.**

**T50 changed how long the tier takes**, and T63 must answer it: the load smoke defaults to
`WORKSPACE_LOAD_DURATION_SECONDS=600` and now actually measures, so a default `RUN_INTEGRATION=1` run
takes ~11 minutes. The short duration belongs in the developer gate and the full 600s only in the
release-gate invocation — never the reverse.

**T68–T98 discharge the backlog the first record said was resolved.** The 2026-08-13 review recorded
every stage-2/3 and design group as "Fix now", but only the thirteen stage-1 findings received lanes.
At HEAD that left **14 of 21 stage-2/3 findings still open, 4 partially fixed, 3 fixed**, and all
seven design findings untouched — plus S3-12 and S3-13, newly identified in the second pass. Those
are now registered rather than left implicit, so the next gate cannot read their absence from the
tracker as resolution.

**Total:** 98 tasks (T41–T46 added during `implement`; T47–T62 from the 2026-08-13 review; T63–T98
from the 2026-08-13 re-review), ~34 person-days delivered through T62 and ~28 remaining
(S ≈ ¼–½ day, M ≈ ½–¾ day, L ≈ 1 day; no task exceeds one working day).

> **Note (R-13):** `tasks.json` carries no `status` field, so the `todo`/`done`/`blocked` state above
> is prose-only and not machine-readable, and **T45 is absent from `tasks.json`** entirely — the table
> lists 98 tasks where `tasks.json` holds 97. **T74** reconciles both.
