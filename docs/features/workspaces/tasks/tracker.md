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
| T24 | Workspace-level REST controller + module wiring          | ports     | Backend Lead                 | L        | T6, T13, T15, T16, T17, T18, T19, T23 | todo   |
| T25 | Warehouse-record and membership-edge REST routes         | ports     | Backend Lead                 | M        | T6, T13, T20, T21, T22                | todo   |
| T26 | Re-shape the `access` REST surface                       | ports     | Backend Lead                 | L        | T12, T13                              | todo   |
| T27 | Re-shape the `users` REST surface                        | ports     | Backend Lead                 | M        | T12, T13                              | done   |
| T28 | ADR 0003 + `sad.md` §8 classification reconciliation     | docs      | Tech Lead + Security Lead    | S        | —                                     | done   |
| T29 | Record the supersession of the two approved specs        | docs      | Tech Lead                    | S        | —                                     | done   |
| T30 | Two-level authorization-coverage architecture check      | tests     | Backend Lead + Security Lead | M        | T24, T25, T26, T27, T28               | todo   |
| T31 | Workspace load smoke test + timing coverage              | tests     | Backend Lead                 | M        | T24, T25                              | todo   |
| T32 | Missing shared icon components                           | ui        | Frontend Lead                | S        | —                                     | done   |
| T33 | Workspace actor-context API, capability hook, gate       | ui        | Frontend Lead                | M        | T6                                    | done   |
| T34 | Warehouse switcher in the application shell              | ui        | Frontend Lead                | L        | T32, T33                              | todo   |
| T35 | `modules/workspace` route, page shell, tabs, i18n        | ui        | Frontend Lead                | L        | T32, T33                              | todo   |
| T36 | Warehouses tab: list, detail pane, lifecycle dialogs     | ui        | Frontend Lead                | L        | T35                                   | todo   |
| T37 | Warehouse access grant / withdrawal from the detail pane | ui        | Frontend Lead                | L        | T36                                   | todo   |
| T38 | Workspace roles + Permissions tabs                       | ui        | Frontend Lead                | L        | T35                                   | todo   |
| T39 | Workspace members tab + Owner transfer                   | ui        | Frontend Lead                | L        | T35                                   | todo   |
| T40 | Migrate the Warehouse-scoped web surface                 | ui        | Frontend Lead                | L        | T26, T27, T33                         | todo   |

**Total:** 40 tasks, ~34 person-days (S ≈ ¼–½ day, M ≈ ½–¾ day, L ≈ 1 day; no task exceeds one
working day).
