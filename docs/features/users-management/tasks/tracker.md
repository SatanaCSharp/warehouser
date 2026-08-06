# Tracker — users-management

> Status of every task in the epic. `implement` updates `done` as it commits each task.
> States: `todo` · `in_progress` · `blocked` · `review` · `done`.

| #   | Task                                                      | Layer     | Owner         | Estimate | Blocked by            | Status |
| --- | --------------------------------------------------------- | --------- | ------------- | -------- | --------------------- | ------ |
| T1  | Grant USERS:\* to existing Warehouse Managers (migration) | migration | Backend Lead  | S        | —                     | done   |
| T2  | Promote shared credential security (ADR-0001)             | domain    | Backend Lead  | M        | —                     | todo   |
| T3  | Users domain errors and invariant predicates              | domain    | Backend Lead  | M        | —                     | todo   |
| T4  | MemberLifecycleRepository                                 | infra     | Backend Lead  | M        | —                     | todo   |
| T5  | Extend AuthenticationRepository                           | infra     | Backend Lead  | M        | —                     | todo   |
| T6  | Persistence-entity test factories                         | infra     | Backend Lead  | S        | —                     | todo   |
| T7  | users contracts + shared-types                            | ports     | Backend Lead  | S        | —                     | todo   |
| T8  | Grant USERS:\* to future Warehouse Managers               | app       | Backend Lead  | S        | T7                    | todo   |
| T9  | CreateMemberCommand                                       | app       | Backend Lead  | L        | T2, T3, T4, T5, T7    | todo   |
| T10 | ChangeMemberEmailCommand                                  | app       | Backend Lead  | M        | T2, T3, T4, T5, T7    | todo   |
| T11 | ChangeMemberPasswordCommand                               | app       | Backend Lead  | M        | T2, T3, T4, T5, T7    | todo   |
| T12 | DeleteMemberCommand                                       | app       | Backend Lead  | L        | T3, T4, T5, T7        | todo   |
| T13 | UsersController + module wiring                           | ports     | Backend Lead  | M        | T7, T9, T10, T11, T12 | todo   |
| T14 | Access member-list email join                             | infra     | Backend Lead  | S        | —                     | todo   |
| T15 | Load smoke test                                           | tests     | Backend Lead  | S        | T13                   | todo   |
| T16 | RTK Query slice + mutation hooks                          | ui        | Frontend Lead | M        | T7                    | todo   |
| T17 | Members list + tab wiring, incl. delete                   | ui        | Frontend Lead | L        | T16, T14              | todo   |
| T18 | Create Member dialog                                      | ui        | Frontend Lead | M        | T16                   | todo   |
| T19 | Edit-email / reset-password dialogs                       | ui        | Frontend Lead | M        | T16                   | todo   |

**Total:** 19 tasks, ~13 person-days (S≈0.3d, M≈0.6d, L≈1d).
