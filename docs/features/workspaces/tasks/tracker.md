# Tracker — workspaces

> Status of every task in the epic. `implement` updates `done` as it commits each task.
> States: `todo` · `in_progress` · `blocked` · `review` · `done`.

| #   | Task                                                     | Layer     | Owner                        | Estimate | Blocked by                            | Status |
| --- | -------------------------------------------------------- | --------- | ---------------------------- | -------- | ------------------------------------- | ------ |
| T1  | Promote workspace authority schema migrations (01–03)    | migration | Backend Lead                 | M        | —                                     | done   |
| T2  | Promote re-key + selection migrations (04–05)            | migration | Backend Lead                 | M        | T1                                    | done   |
| T3  | Promote `AccessName` + add the Workspace name wrapper    | domain    | Backend Lead                 | S        | —                                     | done   |
| T4  | `workspaces` domain predicates, errors and invariants    | domain    | Backend Lead                 | L        | T3                                    | done   |
| T5  | `WorkspacePermissionId` + new stable error codes         | ports     | Backend Lead                 | M        | —                                     | done   |
| T6  | `packages/contracts/workspaces` schemas                  | ports     | Backend Lead                 | L        | T5                                    | done   |
| T7  | Workspace entities, changed entities, test factories     | infra     | Backend Lead                 | L        | T2                                    | done   |
| T8  | Guard-read repositories (both levels)                    | infra     | Backend Lead                 | M        | T7                                    | done   |
| T9  | `WorkspaceReadRepository`                                | infra     | Backend Lead                 | L        | T7                                    | done   |
| T10 | Workspace Role / membership / Owner-transfer repos       | infra     | Backend Lead                 | L        | T7                                    | done   |
| T11 | Warehouse lifecycle + membership repos                   | infra     | Backend Lead                 | L        | T7                                    | done   |
| T12 | Split provisioning; re-key existing Warehouse writes     | infra     | Backend Lead                 | M        | T7                                    | done   |
| T13 | `WorkspaceAccessGuard` + reworked `WarehouseAccessGuard` | ports     | Backend Lead + Security Lead | L        | T5, T8                                | done   |
| T14 | Registration bootstrap in `workspaces` provisioning      | app       | Backend Lead                 | M        | T4, T6, T12                           | done   |
| T15 | Workspace rename + configuration queries                 | app       | Backend Lead                 | L        | T4, T6, T9                            | done   |
| T16 | Workspace Role create + update                           | app       | Backend Lead                 | L        | T4, T6, T10                           | done   |
| T17 | Workspace Role deletion with replacement                 | app       | Backend Lead                 | L        | T4, T6, T10                           | done   |
| T18 | Workspace membership add / remove / reassign             | app       | Backend Lead                 | L        | T4, T6, T10                           | done   |
| T19 | Workspace Owner transfer                                 | app       | Backend Lead                 | M        | T4, T6, T10                           | done   |
| T20 | Warehouse create + rename                                | app       | Backend Lead                 | L        | T4, T6, T11, T12                      | done   |
| T21 | Warehouse archive + restore                              | app       | Backend Lead                 | L        | T4, T6, T11                           | done   |
| T22 | Warehouse membership assign / revoke + assignable Roles  | app       | Backend Lead                 | L        | T4, T6, T11                           | done   |
| T23 | Active Warehouse selection + actor-context query         | app       | Backend Lead                 | L        | T6, T9, T11                           | done   |
| T24 | Workspace-level REST controller + module wiring          | ports     | Backend Lead                 | L        | T6, T13, T15, T16, T17, T18, T19, T23 | done   |
| T25 | Warehouse-record and membership-edge REST routes         | ports     | Backend Lead                 | M        | T6, T13, T20, T21, T22                | done   |
| T26 | Re-shape the `access` REST surface                       | ports     | Backend Lead                 | L        | T12, T13                              | done   |
| T27 | Re-shape the `users` REST surface                        | ports     | Backend Lead                 | M        | T12, T13                              | done   |
| T28 | ADR 0003 + `sad.md` §8 classification reconciliation     | docs      | Tech Lead + Security Lead    | S        | —                                     | done   |
| T29 | Record the supersession of the two approved specs        | docs      | Tech Lead                    | S        | —                                     | done   |
| T30 | Two-level authorization-coverage architecture check      | tests     | Backend Lead + Security Lead | M        | T24, T25, T26, T27, T28               | done   |
| T31 | Workspace load smoke test + timing coverage              | tests     | Backend Lead                 | M        | T24, T25                              | done   |
| T32 | Missing shared icon components                           | ui        | Frontend Lead                | S        | —                                     | done   |
| T33 | Workspace actor-context API, capability hook, gate       | ui        | Frontend Lead                | M        | T6                                    | done   |
| T34 | Warehouse switcher in the application shell              | ui        | Frontend Lead                | L        | T32, T33                              | done   |
| T35 | `modules/workspace` route, page shell, tabs, i18n        | ui        | Frontend Lead                | L        | T32, T33                              | done   |
| T36 | Warehouses tab: list, detail pane, lifecycle dialogs     | ui        | Frontend Lead                | L        | T35                                   | done   |
| T37 | Warehouse access grant / withdrawal from the detail pane | ui        | Frontend Lead                | L        | T36                                   | done   |
| T38 | Workspace roles + Permissions tabs                       | ui        | Frontend Lead                | L        | T35, T41                              | done   |
| T39 | Workspace members tab + Owner transfer                   | ui        | Frontend Lead                | L        | T35, T41                              | done   |
| T40 | Migrate the Warehouse-scoped web surface                 | ui        | Frontend Lead                | L        | T26, T27, T33                         | done   |
| T41 | Workspace read projection gaps (counts + member flag)    | infra     | Backend Lead                 | S        | T9, T24                               | done   |
| T42 | Fix `CreateWarehouseCommand` Nest DI wiring              | ports     | Backend Lead                 | S        | —                                     | done   |
| T43 | Translate infra failures into the documented 503 codes   | app       | Backend Lead                 | S        | T20, T21                              | done   |
| T44 | Return the documented `Warehouse` body from archival     | app       | Backend Lead                 | S        | T21, T25                              | done   |
| T45 | Render the tab content in the administration panels      | ui        | Frontend Lead                | S        | T36                                   | done   |
| T46 | Carry the identifying email in the Workspace reads       | infra     | Backend Lead                 | S        | T9, T24                               | done   |

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

**Total:** 46 tasks (T41–T46 added during `implement` — see the task cards and the notes above), ~34 person-days (S ≈ ¼–½ day, M ≈ ½–¾ day, L ≈ 1 day; no task exceeds one
working day).
