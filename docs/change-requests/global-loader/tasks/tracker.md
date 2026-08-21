# Tracker — change-request: global-loader

> Status of every task in the epic. `implement` updates `done` as it commits each task.
> States: `todo` · `in_progress` · `blocked` · `review` · `done`.

| #   | Task                                                          | Layer  | Owner  | Estimate | Blocked by                       | Status      |
| --- | ------------------------------------------------------------- | ------ | ------ | -------- | -------------------------------- | ----------- |
| T1  | Declare the pending and error contract on the three routes    | wiring | YuriiH | M        | —                                | in_progress |
| T2  | Single-source the access Permission sets, apply the widening  | ui     | YuriiH | S        | —                                | done        |
| T3  | Add the access Workspace-administration dataset loader        | ui     | YuriiH | M        | —                                | in_progress |
| T4  | Add `loadWorkspaceAdministration`, wire `workspaceRoute`      | ui     | YuriiH | M        | T1, T3                           | todo        |
| T5  | Add `loadAccessSurface`, wire `accessRoute`                   | ui     | YuriiH | M        | T1, T2                           | todo        |
| T6  | Force-mount every admitted tab panel                          | ui     | YuriiH | S        | T4, T5                           | todo        |
| T7  | Pin route readiness across the four routes                    | tests  | YuriiH | L        | T4, T5, T6                       | todo        |
| T8  | Pin loader and hook Permission parity in both directions      | tests  | YuriiH | M        | T2, T4, T5                       | todo        |
| T9  | Remove `DatasetCard`'s loading contract, update three callers | ui     | YuriiH | M        | T7                               | todo        |
| T10 | Delete the two skeletons and the Warehouses-side branches     | ui     | YuriiH | M        | T7                               | todo        |
| T11 | Drop the four Workspace-administration tab readiness arms     | ui     | YuriiH | S        | T7                               | todo        |
| T12 | Give `WorkspaceAdministration` a route-scoped projection      | ui     | YuriiH | M        | T7                               | todo        |
| T13 | Remove `AccessPage`'s loading branch                          | ui     | YuriiH | S        | T7                               | todo        |
| T14 | Carry the unresolved actor in the type                        | ui     | YuriiH | M        | T7                               | todo        |
| T15 | Collapse the `RolesTab` and `MembersTab` guards               | ui     | YuriiH | S        | T2, T7                           | todo        |
| T16 | Remove the seven readiness fields from the five contracts     | ui     | YuriiH | M        | T9, T10, T11, T12, T13, T14, T15 | todo        |
| T17 | Remove the fourteen orphaned translation keys                 | ui     | YuriiH | S        | T16                              | todo        |
| T18 | Add the readiness-removal repository scan                     | tests  | YuriiH | M        | T16, T17                         | todo        |
| T19 | Reconcile the nine `docs/system` rows                         | docs   | YuriiH | M        | T18                              | todo        |

**Total:** 19 tasks, ~16.5 person-days.

**Merge blockers** (`change.md` §6's abort threshold): T14 (CR-RG-01), T8 (CR-RG-02),
T1 + T7 (CR-RG-04). Any of the three that cannot be pinned by a test aborts the change.

**Phase gate:** T7. No task from T9 onward may start until it is `done`.
