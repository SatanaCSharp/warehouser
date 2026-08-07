# Users Management API sync report

## A. Field origins

| schema_path                            | origin                                                                                                                                        | confidence |
| -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| `createMember.email`                   | `data-model.md` → `accounts.normalized_email`; same rules as `packages/contracts/src/auth` `authCredentialsSchema.email`                      | high       |
| `createMember.password`                | `data-model.md` → `accounts.password_hash` (via shared hashing); same rules as `authCredentialsSchema.password`                               | high       |
| `createMember.roleId`                  | `data-model.md` → `warehouse_memberships.role_id`, validated via `RoleLifecycleRepository.findCustomRole`                                     | high       |
| `createMember.response.userId`         | `data-model.md` → `users.id` (== `accounts.id`)                                                                                               | high       |
| `createMember.response.email`          | `data-model.md` → `accounts.normalized_email`                                                                                                 | high       |
| `createMember.response.roleId`         | `data-model.md` → `warehouse_memberships.role_id`                                                                                             | high       |
| `changeMemberEmail.userId` (path)      | `data-model.md` → `warehouse_memberships.user_id`, locked via `MemberLifecycleRepository.lockMembership`                                      | high       |
| `changeMemberEmail.email`              | `data-model.md` → `accounts.normalized_email` (`AuthenticationRepository.updateEmail`)                                                        | high       |
| `changeMemberEmail.response.userId`    | `data-model.md` → `warehouse_memberships.user_id`                                                                                             | high       |
| `changeMemberEmail.response.email`     | `data-model.md` → `accounts.normalized_email`                                                                                                 | high       |
| `changeMemberPassword.userId` (path)   | `data-model.md` → `warehouse_memberships.user_id`                                                                                             | high       |
| `changeMemberPassword.password`        | `data-model.md` → `accounts.password_hash`/`password_hash_algorithm`/`password_hash_parameters` (`AuthenticationRepository.updateCredential`) | high       |
| `changeMemberPassword.response.userId` | `data-model.md` → `warehouse_memberships.user_id`                                                                                             | high       |
| `deleteMember.userId` (path)           | `data-model.md` → `warehouse_memberships.user_id`                                                                                             | high       |

## B. Drift findings

1. ✓ **Endpoint ↔ data-model (core)** — every operation reads or writes `warehouse_memberships`, `accounts`, `users`, or `sessions` exactly as `data-model.md`'s repository method table describes (`lockMembership`, `insertMembership`/`deleteMembership`, `createIdentity`/`updateEmail`/`updateCredential`/`deleteIdentity`, `revokeSessionsByAccountId`/`deleteSessionsByAccountId`).
2. ✓ **Error code ↔ repository definition (core, accepted ahead of implementation)** — `auth.invalid_input`, `auth.invalid_credentials`, `auth.email_already_registered`, `access.denied`, `access.role_unavailable`, and `access.target_unavailable` already exist in `packages/shared-types/src/enums/error-code.ts` and are reused unmodified, matching `sad.md` §4's instruction to reuse the guard/`access` denial shape rather than invent a new one. The four new `users.*` codes (`users.self_action_denied`, `users.manager_role_protected`, `users.permission_exceeded`, `users.reserved_role_selection`) and the three atomicity codes (`users.creation_unavailable`, `users.password_change_unavailable`, `users.deletion_unavailable`) map 1:1 to `sad.md` §4's four named predicate classes plus the established `*Unavailable` atomic-commit convention (`RegistrationUnavailable`/`RoleDeletionUnavailable`/`ManagerTransferUnavailable` in the `access` contract). These are intentional contract proposals; `packages/shared-types/src/enums/error-code.ts` gains them during implementation, exactly as `access.*` did for its own feature.
3. ✓ **Validation ↔ constraint (core)** — email (`minLength: 3, maxLength: 254, format: email`) and password (`minLength: 8, maxLength: 128`) bounds are copied byte-for-byte from `packages/contracts/src/auth/index.ts`'s `authCredentialsSchema`, per `spec.md` §5's closing note that this feature "reuses the exact rules already enforced at registration" and defines no separate policy. `roleId`/`userId` are UUIDs matching the entities' PK types in `data-model.md`.
4. ✓ **OpenAPI ↔ sequence (supporting)** — every `alt`/`else` branch in `sad.md` §6.1–§6.4 has a corresponding response: missing-Permission → 403, missing/cross-Warehouse target or Role → 404 (hidden, AC-09), reserved-Role/Permission-exceeded/self-action/protected-Manager → 409 (multi-example conflict responses, since each flow branches into several distinct 409 conditions that OpenAPI cannot express as separate top-level responses under one status code), invalid field → 400, duplicate email → 409, success → 201/200/204. §6.5 (list/gate) is intentionally out of contract — it reuses `access`'s existing `GET /api/v1/access/members` read path unchanged (`sad.md` §7).

## Coverage cross-check

| Source (`spec.md`)                                     | Contract coverage                                                                                                                        |
| ------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------- |
| US-01; AC-01, AC-02, AC-03, AC-05, AC-09, AC-16, AC-20 | `POST /api/v1/users`                                                                                                                     |
| US-02; AC-04, AC-05, AC-09, AC-10, AC-14, AC-18, AC-19 | `PATCH /api/v1/users/{userId}/email`                                                                                                     |
| US-03; AC-06, AC-07, AC-09, AC-10, AC-14, AC-18, AC-19 | `PATCH /api/v1/users/{userId}/password`                                                                                                  |
| US-04; AC-08, AC-09, AC-10, AC-11, AC-13, AC-15        | `DELETE /api/v1/users/{userId}`                                                                                                          |
| US-05; AC-12                                           | No runtime endpoint — reuses `auth`'s existing, unmodified sign-in flow (`sad.md` §6.6)                                                  |
| US-06; AC-13, AC-14, AC-15                             | `409` `managerRoleProtected` example on the email/password/delete responses                                                              |
| US-07; AC-16                                           | `409` `permissionExceeded` example on `POST /api/v1/users`                                                                               |
| US-08; AC-17                                           | No runtime endpoint — deploy-time Permission-catalogue migration (`data-model.md` `migrations/01-grant-users-management-permissions.ts`) |

Every `spec.md` §4 user story and §5 acceptance criterion is covered by an operation, a named example, or an explicit non-runtime note. None is left uncovered.

## Contract decisions

- Uses `SessionCookie`, matching the accepted auth ADR and the `access` feature's own contract, not the generic `BearerAuth` template.
- No `Idempotency-Key` is declared: none of `sad.md` §6.1–§6.4 shows a retry note or an async actor, matching the `access` contract's same conclusion.
- Three 409-status operations (`createMember`, `changeMemberEmail`, `changeMemberPassword`, `deleteMember`) each consolidate multiple distinct domain-invariant conditions into one response object using OpenAPI 3.1 `examples` (plural) rather than a single `example`, since a single status code cannot carry multiple named response objects in one operation. Each named example is traceable to exactly one AC.
- List/read access for the Members tab is deliberately **not** in this contract: `GET /api/v1/access/members` is unchanged and owned by `access` (`sad.md` §7). `data-model.md`'s "Non-schema follow-ups" note that this read must gain an `email` field (an `access`-owned join, no schema change) is a real gap for the Members workspace to render rows — tracked as a **Save-as-OQ, owner: `access`/`api access`, due: before the web Members workspace is implemented** — not something this contract can fix, since it does not own that endpoint.
- No events contract is produced: the specification and SAD introduce no queue, worker, or async interface.
- The four new `users.*` domain-invariant codes and the three `*_unavailable` atomicity codes remain documentation-only proposals until implementation extends `packages/shared-types/src/enums/error-code.ts` and `packages/shared-types/src/enums/permission-id.ts` (the latter already names the exact three new Permission IDs in `data-model.md`'s non-schema follow-ups: `USERS_EMAIL_UPDATE`, `USERS_PASSWORD_CHANGE`, `USERS_DELETE`).
