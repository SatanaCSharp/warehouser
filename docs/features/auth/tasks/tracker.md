# Tracker — auth

> Status of every task in the epic. `implement` updates `done` as it commits each task.
> States: `todo` · `in_progress` · `blocked` · `review` · `done`.

| #   | Task                                                                                          | Layer     | Owner                         | Estimate | Blocked by        | Status      |
| --- | --------------------------------------------------------------------------------------------- | --------- | ----------------------------- | -------- | ----------------- | ----------- |
| T1  | [Promote and verify the auth schema migration](./promote-auth-schema-migration.md)            | migration | Backend Lead                  | S        | —                 | done        |
| T2  | [Publish shared auth boundary schemas](./publish-auth-contracts.md)                           | ports     | Tech Lead                     | S        | —                 | done        |
| T3  | [Model auth domain invariants and repository ports](./model-auth-domain.md)                   | domain    | Backend Lead                  | M        | —                 | done        |
| T4  | [Implement credential and opaque-session security adapters](./implement-security-adapters.md) | infra     | Backend Lead + Security Lead  | M        | T3                | done        |
| T5  | [Implement TypeORM auth persistence adapters](./implement-auth-persistence.md)                | infra     | Backend Lead                  | M        | T1, T3            | done        |
| T6  | [Implement atomic registration use case](./implement-registration.md)                         | app       | Backend Lead                  | M        | T3, T4, T5        | done        |
| T7  | [Implement sign-in, restoration, and sign-out use cases](./implement-session-lifecycle.md)    | app       | Backend Lead                  | M        | T3, T4, T5        | done        |
| T8  | [Harden credentialed HTTP platform boundaries](./harden-http-platform.md)                     | wiring    | Backend Lead + Platform Owner | M        | T2                | done        |
| T9  | [Expose and wire the auth REST boundary](./expose-auth-rest.md)                               | ports     | Backend Lead                  | M        | T2, T6, T7, T8    | done        |
| T10 | [Build the credentialed web API and feedback boundary](./build-web-auth-boundary.md)          | infra     | Frontend Lead                 | M        | T2                | done        |
| T11 | [Replace mock auth state with session bootstrap and guards](./replace-auth-state.md)          | wiring    | Frontend Lead                 | M        | T9, T10           | done        |
| T12 | [Implement the approved create-account experience](./implement-sign-up-ui.md)                 | ui        | Frontend Lead                 | M        | T10, T11          | done        |
| T13 | [Implement the approved sign-in and sign-out experience](./implement-sign-in-out-ui.md)       | ui        | Frontend Lead                 | M        | T10, T11          | done        |
| T14 | [Verify auth journeys and release quality gates](./verify-auth-release.md)                    | tests     | Tech Lead + Security Lead     | 1d       | T9, T11, T12, T13 | in_progress |

**Total:** 14 tasks, approximately 9 person-days.
