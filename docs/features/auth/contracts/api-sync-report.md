---
status: Draft
owner: 'Backend Lead'
reviewers: ['Security Lead', 'Frontend Lead']
updated_at: '2026-07-25'
feature_size: 'M'
---

# API sync report — auth

## Contract basis

- Interface kind: REST/OpenAPI, selected from `sad.md` frontmatter
  `target_surfaces: ['web-frontend', 'backend-service']` and the repository architecture map.
- Authentication scheme: `SessionCookie`, overriding the API template's default bearer scheme per
  ADR-0001.
- Source model: `data-model.md`; the staged TypeORM migration confirms its PostgreSQL constraints.
- Runtime source: `sad.md` §6.1–§6.5.
- Story and outcome source: `spec.md` §4–§5.
- Async flows: none; `events.md` is not applicable.

## Field origins

| schema_path                             | origin                                                                                                                                                                 | confidence |
| --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| `signUp.email`                          | `data-model.md` → `accounts.normalized_email` (`VARCHAR(254)`, unique, normalized); `spec.md` authentication input rule supplies the accepted pre-normalization syntax | high       |
| `signUp.password`                       | `data-model.md` → `accounts.password_hash`; `spec.md` authentication input rule supplies the 8–128 code-point boundary and exact-preservation rule                     | high       |
| `signUp.response.user.id`               | `data-model.md` → `users.id` (UUID PK)                                                                                                                                 | high       |
| `signUp.response.Set-Cookie`            | ADR-0001 decision outcome; persisted digest maps to `sessions.secret_digest` and expiry maps to `sessions.expires_at`                                                  | high       |
| `signIn.email`                          | `data-model.md` → `accounts.normalized_email` (`VARCHAR(254)`, unique, normalized); `spec.md` authentication input rule supplies the accepted pre-normalization syntax | high       |
| `signIn.password`                       | `data-model.md` → `accounts.password_hash`; `spec.md` authentication input rule supplies the 8–128 code-point boundary and exact-preservation rule                     | high       |
| `signIn.response.user.id`               | `data-model.md` → `users.id` (UUID PK)                                                                                                                                 | high       |
| `signIn.response.Set-Cookie`            | ADR-0001 decision outcome; persisted digest maps to `sessions.secret_digest` and expiry maps to `sessions.expires_at`                                                  | high       |
| `getCurrentSession.cookie`              | ADR-0001 opaque cookie; digest maps to `sessions.secret_digest`                                                                                                        | high       |
| `getCurrentSession.response.user.id`    | `data-model.md` → `users.id` (UUID PK)                                                                                                                                 | high       |
| `getCurrentSession.response.Set-Cookie` | ADR-0001 cookie expiry behavior for invalid/expired sessions                                                                                                           | high       |
| `signOut.cookie`                        | ADR-0001 opaque cookie; digest maps to `sessions.secret_digest`                                                                                                        | high       |
| `signOut.response.Set-Cookie`           | ADR-0001 current-cookie expiry behavior                                                                                                                                | high       |

## Story and acceptance-criteria coverage

| Operation           | User story | Acceptance criteria / runtime outcomes                                                                 |
| ------------------- | ---------- | ------------------------------------------------------------------------------------------------------ |
| `signUp`            | US-01      | AC-01 → `201`; AC-01b → `503`; AC-02 → `400`; AC-03 → `409`                                            |
| `signIn`            | US-02      | AC-04 → `200`; AC-05 → `401`; shared input rules → `400`; SAD §6.2 session-persistence failure → `503` |
| `getCurrentSession` | US-03      | AC-07 → `200`; AC-08 → `204`                                                                           |
| `signOut`           | US-04      | AC-09 → `204`; SAD §6.4 revocation-persistence failure → `503`                                         |

US-05 / AC-10 and AC-11 constrain every protected capability and prohibit cross-Account auth
operations. They do not create an auth-owned endpoint: the authentication guard supplies only the
linked `userId`, and each capability-owning contract must define its own `401`/`403` responses.

## Bidirectional drift check

1. ✓ **Endpoint ↔ data-model (core)** — all four operations read or write Account, User, or Session
   state defined in `data-model.md`; each operation maps to a §4 story and at least one §5 AC.
2. ✓ **Error code ↔ repo error definition (core, proposal state)** — the accepted server-error ADR
   places shared codes in `packages/shared-types/src`, but no central code registry exists yet.
   `auth.invalid_input`, `auth.email_already_registered`, `auth.registration_unavailable`,
   `auth.invalid_credentials`, `auth.session_unavailable`, and `auth.sign_out_unavailable` are the
   contract proposals to add during implementation and reconcile once that registry exists.
3. ✓ **Validation ↔ constraint (core)** — email length/normalization matches
   `accounts.normalized_email`; password request limits come from the spec and map to the derived
   password hash fields; UUID and session constraints match the model and migration.
4. ✓ **OpenAPI ↔ sequence (supporting)** — sign-up, sign-in, restoration, and sign-out success and
   alternative branches map to contract responses. The §6.5 authorization flow is intentionally a
   cross-cutting guard/capability constraint rather than a fifth auth endpoint.

## Notes

- `POST /api/v1/auth/sign-up` is not automatically retried. The SAD explicitly says a lost success
  response after commit is indeterminate and registration must not be replayed automatically, so
  the contract does not accept `Idempotency-Key`.
- The safe User projection contains only `users.id`; credential, Account, Session, and
  authorization data are not exposed.
- `GET /api/v1/auth/session` uses `204` for the anonymous branch so an implementation does not need
  to invent a response-only authentication-status field.
- The contract does not add generic unexpected-failure responses absent from the feature
  sequences. The global exception filter remains responsible for its repository-wide safe
  fallback.
