# Epic — users-management

> **Spec:** [spec.md](../spec.md) · **Design:** [sad.md](../sad.md) · **Data model:** [data-model.md](../data-model.md) · **API:** [openapi.yaml](../contracts/openapi.yaml) · **ADRs:** [adr/](../adr/) · **Design handoff:** [design-handoff.md](../design-handoff.md)

## Goal

Let a permissioned Warehouse Member grow their Warehouse's team beyond the single self-registered
Warehouse Manager — create, correct-email, reset-password, and delete a Warehouse Member — while
preserving the exactly-one-Manager, exactly-one-Role, and never-exceeds-creator's-Permissions
invariants (`spec.md` §2).

## Scope

- **In:** a new `users` server module (domain/usecases/rest), shared repository and security
  extensions, a Permission-catalogue migration, and a Members workspace replacing the placeholder
  `MemberRoleActions` in the existing Access Administration page — per `sad.md` §3.
- **Out:** self-service password change/reset, reversible deactivation, a profile/display-name
  field, forced password rotation, email-ownership re-verification, and credential delivery to the
  new member — per `spec.md` §3.

## Task map

```mermaid
flowchart LR
    subgraph Migration
        T1[T1 grant permissions - existing]
    end
    subgraph Domain
        T2[T2 promote shared credential security]
        T3[T3 users domain errors and predicates]
    end
    subgraph Infra
        T4[T4 MemberLifecycleRepository]
        T5[T5 AuthenticationRepository extension]
        T6[T6 test entity factories]
        T14[T14 access member-list email join]
    end
    subgraph Contracts
        T7[T7 users contracts and shared-types]
    end
    subgraph App
        T8[T8 grant permissions - future]
        T9[T9 CreateMemberCommand]
        T10[T10 ChangeMemberEmailCommand]
        T11[T11 ChangeMemberPasswordCommand]
        T12[T12 DeleteMemberCommand]
    end
    subgraph Ports
        T13[T13 UsersController and module wiring]
    end
    subgraph Tests
        T15[T15 load smoke test]
    end
    subgraph UI
        T16[T16 RTK Query slice and mutation hooks]
        T17[T17 Members list and tab, incl. delete]
        T18[T18 Create Member dialog]
        T19[T19 Edit-email and reset-password dialogs]
    end

    T7 --> T8
    T2 --> T9
    T3 --> T9
    T4 --> T9
    T5 --> T9
    T7 --> T9
    T2 --> T10
    T3 --> T10
    T4 --> T10
    T5 --> T10
    T7 --> T10
    T2 --> T11
    T3 --> T11
    T4 --> T11
    T5 --> T11
    T7 --> T11
    T3 --> T12
    T4 --> T12
    T5 --> T12
    T7 --> T12
    T7 --> T13
    T9 --> T13
    T10 --> T13
    T11 --> T13
    T12 --> T13
    T13 --> T15
    T7 --> T16
    T16 --> T17
    T14 --> T17
    T16 --> T18
    T16 --> T19
```

`T1`, `T2`, `T3`, `T4`, `T5`, `T6`, `T7`, and `T14` have no dependencies and can start in parallel on
day one; `T6` (test factories) has no arrows above only because nothing else names it explicitly in
`files_hint`, but every command task (`T9`–`T12`) and repository task (`T4`, `T5`) consumes it in
practice.

## Tasks

See [tracker.md](./tracker.md) for status. Machine contract: [tasks.json](../tasks.json).

| #   | Task                                                      | Layer     | Blocked by            | DoD (short)                                                                |
| --- | --------------------------------------------------------- | --------- | --------------------- | -------------------------------------------------------------------------- |
| T1  | Grant USERS:\* to existing Warehouse Managers (migration) | migration | —                     | Staged migration promotes, applies/reverts cleanly (AC-17)                 |
| T2  | Promote shared credential security (ADR-0001)             | domain    | —                     | email/password/hashing moved, `auth` suite stays green                     |
| T3  | Users domain errors and invariant predicates              | domain    | —                     | self-action/protected-Manager/exceeds-Permissions/reserved-Role unit tests |
| T4  | MemberLifecycleRepository                                 | infra     | —                     | lock/read/insert/delete repo integration tests                             |
| T5  | Extend AuthenticationRepository                           | infra     | —                     | identity-lifecycle + bulk-session repo integration tests                   |
| T6  | Persistence-entity test factories                         | infra     | —                     | Account/User/Membership/Session factories                                  |
| T7  | users contracts + shared-types                            | ports     | —                     | Zod schemas match openapi.yaml; PermissionId/ErrorCode extended            |
| T8  | Grant USERS:\* to future Warehouse Managers               | app       | T7                    | new-Warehouse integration test (AC-17)                                     |
| T9  | CreateMemberCommand                                       | app       | T2, T3, T4, T5, T7    | AC-01/02/05/09/12/16/20 command integration tests                          |
| T10 | ChangeMemberEmailCommand                                  | app       | T2, T3, T4, T5, T7    | AC-04/05/09/14/18/19 command integration tests                             |
| T11 | ChangeMemberPasswordCommand                               | app       | T2, T3, T4, T5, T7    | AC-06/07/09/14/18/19 command integration tests                             |
| T12 | DeleteMemberCommand                                       | app       | T3, T4, T5, T7        | AC-08/09/11/13/15 command integration tests, incl. race                    |
| T13 | UsersController + module wiring                           | ports     | T7, T9, T10, T11, T12 | REST contract tests, architecture scan, AppModule registration             |
| T14 | Access member-list email join                             | infra     | —                     | list-access-members returns email                                          |
| T15 | Load smoke test                                           | tests     | T13                   | ≥30 ops/s, p95 targets met                                                 |
| T16 | RTK Query slice + mutation hooks                          | ui        | T7                    | 4 mutations + invalidation tags + hook handlers                            |
| T17 | Members list + tab wiring, incl. delete                   | ui        | T16, T14              | list/row/chip/delete states per design handoff                             |
| T18 | Create Member dialog                                      | ui        | T16                   | create form + error states per design handoff                              |
| T19 | Edit-email / reset-password dialogs                       | ui        | T16                   | 2 dialogs + error states per design handoff                                |

**Total:** 19 tasks.

## Risks / Hard rules

- `users` never imports `access/*` or `auth/*` feature-owned files directly — only shared
  infrastructure (`sad.md` §4, §8 Authorization coverage). T13's architecture-scan DoD enforces this.
- Deletion must hard-delete `sessions` and `warehouse_memberships` before `accounts`/`users`, in the
  exact order `data-model.md` §"Deletion sequencing" specifies, or the `ON DELETE RESTRICT` foreign
  keys reject the transaction. T12 owns this.
- No schema/table/column/index change is in scope — only the Permission-catalogue migration (T1) and
  additive contract/enum changes (T7). Do not add a migration beyond the staged one.
- Every lifecycle action stays individually Permission-gated and Warehouse-scoped through the
  existing `SessionAuthGuard`/`WarehouseAccessGuard` composition — no new guard is introduced
  (`sad.md` §2).
- No self-service password change/reset, reversible deactivation, profile field, forced rotation,
  email re-verification, or credential-delivery channel — these are explicit non-goals (`spec.md`
  §3); do not let any task grow into one.
- The dormant `USERS:UPDATE` Permission stays dormant and unused — do not repurpose it for any of
  this feature's four new capabilities (`spec.md` §8, `sad.md` §11).
