# Tracker — access

> Status of every task in the epic. `implement` updates `done` as it commits each task.
> States: `todo` · `in_progress` · `blocked` · `review` · `done`.

| #   | Task                                                         | Layer     | Owner         | Estimate | Blocked by                | Status |
| --- | ------------------------------------------------------------ | --------- | ------------- | -------- | ------------------------- | ------ |
| T1  | Promote the access schema and Permission catalogue migration | migration | Backend Lead  | M        | —                         | done   |
| T2  | Implement access domain invariants and Unicode names         | domain    | Backend Lead  | M        | —                         | done   |
| T3  | Implement access persistence entities and repositories       | infra     | Backend Lead  | L        | T1, T2                    | done   |
| T4  | Extend registration with atomic Warehouse provisioning       | app       | Backend Lead  | M        | T3                        | done   |
| T5  | Enforce fresh Warehouse-scoped authorization                 | wiring    | Security Lead | L        | T3                        | done   |
| T6  | Implement custom Role lifecycle commands                     | app       | Backend Lead  | M        | T3, T5                    | done   |
| T7  | Implement member assignment and atomic Role deletion         | app       | Backend Lead  | L        | T3, T5                    | done   |
| T8  | Implement atomic Warehouse Manager transfer                  | app       | Backend Lead  | M        | T3, T5                    | done   |
| T9  | Expose scoped access read endpoints                          | ports     | Backend Lead  | M        | T3, T5                    | done   |
| T10 | Expose access mutation endpoints and normalized failures     | ports     | Backend Lead  | L        | T6, T7, T8, T9            | done   |
| T11 | Add Warehouse registration to the approved sign-up UI        | ui        | Frontend Lead | M        | T4                        | done   |
| T12 | Build the approved access review workspace                   | ui        | Frontend Lead | L        | T9                        | done   |
| T13 | Build approved access administration workflows               | ui        | Frontend Lead | L        | T10, T12                  | done   |
| T14 | Gate access security, atomicity, and performance             | tests     | Security Lead | L        | T4, T5, T9, T10, T11, T13 | done   |

**Total:** 14 tasks, approximately 10 person-days.
