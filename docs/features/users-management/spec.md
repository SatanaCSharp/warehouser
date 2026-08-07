---
status: Draft
owner: 'PM + Tech Lead'
reviewers: ['Tech Lead', 'Security Lead']
updated_at: '2026-08-06'
feature_size: 'M'
---

# Spec — users-management

> **Glossary:** [CONTEXT](./CONTEXT.md)
> **Reference module / docs / channels used:** `docs/features/access/CONTEXT.md`, `docs/features/access/spec.md`, `docs/features/auth/CONTEXT.md`, `docs/features/auth/spec.md`, `apps/server/migrations/1785859200000-CreateAccessSchema.ts`, `apps/server/src/access/rest/controllers/access.controller.ts`, `apps/server/src/access/usecases/commands/assign-member-role.command.ts`, `apps/server/src/access/usecases/commands/transfer-warehouse-manager.command.ts`, `apps/server/src/auth/usecases/commands/register.command.ts`, `apps/server/src/auth/domain/security/password.ts`, `apps/server/src/shared/domain/entities/user.entity.ts`, `apps/server/src/shared/domain/entities/account.entity.ts`.

## 1. Context

Today, registration is the only way a Warehouse comes into being, and it always creates exactly one Warehouse together with exactly one Warehouse Member holding its protected Warehouse Manager Role. There is no way for that Warehouse Manager — or anyone else — to add a second person, so any Warehouse is structurally capped at one person until this gap is closed. This affects every Warehouse Manager whose operation needs more than one set of hands.

This is needed now because the Access feature deliberately scoped out worker creation ("Creating additional warehouse members is excluded because worker creation is a separate feature; Access only defines the Role assignment rule that feature must consume") while building every invariant this feature depends on: exactly-one-Role-per-Member, exactly-one-Manager-per-Warehouse, and strict Warehouse isolation. Those invariants are now in place and enforced; this feature is the one the Access spec deferred.

The committed approach keeps every user-lifecycle action — create, change email, change password, delete — individually permissioned and Warehouse-scoped, reusing the existing authorization boundary and the existing Account/User identity model rather than inventing a parallel one. Adjacent products (e.g. warehouse-management admin panels, and precedents like Slack's owner-transfer-before-removal rule) confirm that protecting the sole owner/manager role until it is explicitly transferred away is an established pattern, which this feature adopts directly; the reviewed products, however, favor reversible deactivation over permanent deletion as their default removal path, and a hard-delete-only design forgoes that audit trail and undo capability — a trade-off accepted here as a deliberate, explicit scope decision (see §3) because the approved requirement is complete removal, not because the risk was overlooked. Two sharp risks surfaced during review. First, a member holding only a narrow permission (e.g. only user-creation) could otherwise mint a new account with far more power than themselves by assigning it a permissive Role; this is closed by capping every created member's Role at the creator's own current Permissions. Second, a member holding the password-change or email-update Permission could otherwise reset the Warehouse Manager's own credentials and sign in as them, seizing the account outright and bypassing the existing protected-transfer requirement entirely; this is closed the same way deletion already is — credential changes against a target holding the Warehouse Manager Role are refused until that Role is transferred away. Third, the same credential-change Permission could let a member seize a non-Manager peer's account whose Role holds more Permissions than their own; this is closed the same way creation already is — credential changes are refused against any target whose Role's Permissions exceed the actor's own. Success is measured by whether Warehouses actually grow past one person once this ships (see §7).

## 2. Goals

- Let a permissioned Warehouse Member grow their Warehouse's team beyond the single self-registered Warehouse Manager, with no self-service sign-up path for new members.
- Keep every user-lifecycle action individually permissioned and Warehouse-isolated, consistent with the existing authorization boundary rather than introducing a parallel one.
- Preserve the "exactly one Warehouse Manager per Warehouse," "exactly one Role per Warehouse Member," and "a member never grants more power than its creator holds" invariants through every lifecycle operation.

## 3. Non-goals

- Self-service password change and any forgot-password/reset flow are excluded because they are a separate, already-identified future feature; this feature only covers manager-driven credential actions.
- Reversible deactivation or suspension of a Warehouse Member is excluded because the approved requirement is permanent removal; a future release may reconsider this trade-off.
- A display name or any other profile field is excluded because no such field exists anywhere in the system today; members stay identified by email only, consistent with the current model.
- Forced password rotation on first sign-in is excluded because it depends on a self-service password-change capability that does not exist yet, which is out of scope here.
- Email-ownership re-verification on a manager-driven email change is excluded, consistent with the system's existing no-verification posture for sign-up; whether disputes should later trigger mandatory verification is governed by the existing cross-feature open question on email-ownership disputes (see §8), not decided separately for this feature.
- Delivering or communicating a newly created member's initial credential to that member (e.g. an invite email or a chat message) is excluded; the creating actor is responsible for out-of-band delivery, and no automated delivery channel is built by this feature.

## 4. User stories

### US-01: Onboard a new team member

**As a** Warehouse Member with user-creation permission
**I want** to create a new Warehouse Member with an email, an initial password, and an existing Role
**So that** they can start using the system with the right capabilities right away

### US-02: Correct a member's email

**As a** Warehouse Member with email-update permission
**I want** to change another Warehouse Member's email address
**So that** their sign-in identity stays accurate

### US-03: Reset a member's password

**As a** Warehouse Member with password-change permission
**I want** to set a new password for another Warehouse Member
**So that** they regain access when their credential is forgotten or compromised

### US-04: Offboard a former team member

**As a** Warehouse Member with user-deletion permission
**I want** to permanently remove a Warehouse Member who no longer belongs
**So that** they have no further access or presence in the system

### US-05: Start working with an assigned identity

**As a** newly created Warehouse Member
**I want** to sign in immediately with my initial email and password
**So that** I can start working with the capabilities of my assigned Role

### US-06: Keep the Warehouse Manager protected

**As a** Warehouse Manager
**I want** the system to refuse deletion of whoever currently holds my Role
**So that** the Warehouse is never left without a manager

### US-07: Prevent minting a more powerful account than my own

**As a** Warehouse Member with user-creation permission but limited other permissions
**I want** the system to refuse a Role assignment that exceeds my own Permissions
**So that** I cannot create an account more powerful than mine

### US-08: Gain the new capabilities without a separate step

**As a** Warehouse Manager whose Warehouse was created before this feature shipped
**I want** to receive the new user-creation, email-update, password-change, and user-deletion Permissions automatically
**So that** I can manage my team the moment this feature is available, without any extra setup

## 5. Acceptance criteria

### AC-01 (US-01) — happy path

**Given** an authorized Warehouse Member holds the user-creation Permission and selects an existing custom Role in their own Warehouse whose Permissions do not exceed their own
**When** they create a new Warehouse Member with an unused email and an initial password
**Then** the system creates the new Warehouse Member with that Role and confirms the creation to the actor

### AC-02 (US-01) — error

**Given** an authorized Warehouse Member submits an invalid email or a password outside the accepted length for a new Warehouse Member
**When** they attempt the creation
**Then** the system creates no Warehouse Member and explains which field is invalid and why

### AC-03 (US-01) — authorization

**Given** a Warehouse Member who does not hold the user-creation Permission
**When** they attempt to create a new Warehouse Member
**Then** the system denies the request and explains that the required Permission is missing

### AC-04 (US-02) — happy path

**Given** an authorized Warehouse Member holds the email-update Permission and a target Warehouse Member in their own Warehouse who does not hold the Warehouse Manager Role
**When** they change the target's email to a valid, unused address
**Then** the system records the new email, leaves the target's existing sessions active, and confirms the change to the actor

### AC-05 (US-01, US-02) — cross-context

**Given** the submitted email — whether for a new Warehouse Member or a target's changed email — already belongs to another authentication identity anywhere in the system, a rule owned by the authentication bounded context rather than this feature
**When** an authorized Warehouse Member attempts the creation or the email change with that address
**Then** the system creates or changes nothing and explains that the email is already registered, regardless of which Warehouse (if any) the colliding identity belongs to — this global-uniqueness disclosure is independent of the target-existence hiding rule in AC-09, which governs the target identifier used to select whom to act on, not the submitted email value

### AC-06 (US-03) — happy path

**Given** an authorized Warehouse Member holds the password-change Permission and a target Warehouse Member in their own Warehouse who does not hold the Warehouse Manager Role
**When** they set a new password within the accepted length for the target
**Then** the system records the new password, ends the target's existing sessions, and confirms the change to the actor

### AC-07 (US-03) — error

**Given** an authorized Warehouse Member submits a password outside the accepted length for a target Warehouse Member
**When** they attempt the change
**Then** the system makes no change and explains that the password length is invalid

### AC-08 (US-04) — happy path

**Given** an authorized Warehouse Member holds the user-deletion Permission and a target Warehouse Member in their own Warehouse who does not hold the Warehouse Manager Role
**When** they delete the target
**Then** the system permanently removes the target's presence from the system together with its linked authentication identity, frees the target's email for reuse by a future Warehouse Member, ends any of the target's existing sessions, and confirms the removal to the actor

### AC-09 (US-01, US-02, US-03, US-04) — cross-context

**Given** a Warehouse Member holds a Permission required by a lifecycle action but targets a Warehouse Member who belongs to a different Warehouse, a boundary owned by the authorization bounded context rather than this feature
**When** they attempt any create, email-change, password-change, or delete action against that target
**Then** the system denies the request without revealing whether such a Warehouse Member exists

### AC-10 (US-02, US-03, US-04) — authorization

**Given** a Warehouse Member lacks the Permission required for a specific lifecycle action against another Warehouse Member
**When** they attempt an email change, password change, or deletion without the matching Permission
**Then** the system denies the action and leaves the target Warehouse Member unchanged

### AC-11 (US-04) — domain invariant

**Given** an authorized Warehouse Member attempts to delete themselves
**When** they submit the deletion
**Then** the system blocks it and explains that a Warehouse Member can never delete their own record

### AC-12 (US-05) — happy path

**Given** a Warehouse Member was just created with an initial email, password, and Role
**When** they sign in with that email and initial password
**Then** the system authenticates them and grants exactly the capabilities of their assigned Role

### AC-13 (US-06) — domain invariant

**Given** a target Warehouse Member currently holds the Warehouse Manager Role
**When** an authorized Warehouse Member attempts to delete that target
**Then** the system blocks the deletion and explains that the Warehouse Manager Role must be transferred to someone else first

### AC-14 (US-06) — domain invariant

**Given** a target Warehouse Member currently holds the Warehouse Manager Role
**When** an authorized Warehouse Member attempts to change that target's email or password
**Then** the system blocks the change and explains that the Warehouse Manager Role must be transferred to someone else first

### AC-15 (US-06) — domain invariant

**Given** a Warehouse Manager Role transfer to a new holder is underway at the same time as a deletion attempt against either the outgoing or the incoming holder
**When** both are attempted
**Then** the transfer is allowed to complete and any deletion targeting either the outgoing or the incoming holder during that window is refused, ensuring the Warehouse is never left without exactly one Warehouse Manager

### AC-16 (US-07) — domain invariant

**Given** an authorized Warehouse Member selects a Role whose Permissions include at least one Permission the actor does not currently hold
**When** they attempt to create a new Warehouse Member with that Role
**Then** the system blocks the creation and explains that a new member's Role can never exceed the creator's own Permissions

### AC-17 (US-08) — happy path

**Given** this feature's Permission catalogue update is applied
**When** it takes effect
**Then** every existing Warehouse Manager Role directly gains and holds the user-creation, email-update, password-change, and user-deletion Permissions — not merely Permissions available for inclusion in a custom Role — consistent with how the system already extends every existing Warehouse Manager Role's held Permission set when a non-reserved Permission is introduced

### AC-18 (US-02, US-03) — domain invariant

**Given** an authorized Warehouse Member attempts to change their own email or password through this feature's manager-driven action
**When** they submit the change against their own record
**Then** the system blocks it and explains that a Warehouse Member can never change their own email or password through this action

### AC-19 (US-02, US-03) — domain invariant

**Given** an authorized Warehouse Member holds the email-update or password-change Permission and a target Warehouse Member in their own Warehouse whose current Role's Permissions include at least one Permission the actor does not currently hold
**When** they attempt to change that target's email or password
**Then** the system blocks the change and explains that a target holding more Permissions than the actor cannot have their credentials changed by that actor

### AC-20 (US-01) — domain invariant

**Given** an authorized Warehouse Member attempts to create a new Warehouse Member and selects the system-reserved Warehouse Manager Role instead of a custom Role
**When** they submit the creation
**Then** the system blocks the creation and explains that the Warehouse Manager Role can only be obtained through the existing manager-transfer capability, never through creation

**Note:** Email format and password length validation throughout this section (AC-02, AC-06, AC-07) reuse the exact rules already enforced at registration; this feature defines no separate credential policy.

## 6. Non-functional requirements

| Aspect                            | Target                                                                                                                   | Measurement                    |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | ------------------------------ |
| Creation latency p95              | ≤ 400 ms, excluding client network time                                                                                  | Structured server timing logs  |
| Email/password change latency p95 | ≤ 300 ms, excluding client network time                                                                                  | Structured server timing logs  |
| Deletion latency p95              | ≤ 500 ms, excluding client network time                                                                                  | Structured server timing logs  |
| Throughput                        | ≥ 30 operations per second per running service instance for 10 minutes                                                   | Automated load smoke test¹     |
| Lifecycle atomicity               | 100% of create/email-change/password-change/delete outcomes preserve exactly-one-Manager and exactly-one-Role invariants | Integration checks             |
| Authorization coverage            | 100% of the four lifecycle capabilities have an explicit Permission rule and Warehouse-ownership check                   | Automated integration coverage |

¹ `tests/users/release-gates.mjs` currently validates the threshold-evaluation
logic (latency-percentile math, the throughput formula, the terminal-outcome
check) against hand-supplied sample data — it does not yet drive real
concurrent load against a running service instance. Treat the Throughput
target as pending a real load driver (e.g. k6/Locust, per `test-plan.md`
§NFR validation) until one is wired in; do not read a green
`release-gates.spec.mjs` run as evidence the target has been met in
production-like conditions.

## 6.1 Security / privacy

- **Data classification:** confidential — email addresses and password credentials enable identification or account access.
- **Personal data touched:** normalized email address (new or changed), password credential (new or changed) — both on the existing Account entity.
- **AuthZ/AuthN impact:** introduces four individually-gated capabilities (user-creation Permission reused, plus three new Permissions for email change, password change, and deletion), each combined with the existing Warehouse-ownership check; creation additionally checks that the assigned Role never exceeds the creator's own Permissions.
- **Abuse cases:**
  - Cross-Warehouse targeting: deny and hide existence, even with the matching Permission (AC-09).
  - Privilege escalation at creation: deny any Role assignment exceeding the creator's own Permissions (AC-16).
  - Warehouse Manager minting at creation: deny assigning the system-reserved Warehouse Manager Role to a newly created member (AC-20).
  - Warehouse Manager removal: deny deletion while the target holds that Role; require transfer first (AC-13).
  - Warehouse Manager credential takeover: deny email or password changes against the target while they hold that Role; require transfer first (AC-14).
  - Peer credential takeover: deny email or password changes against a target whose Role holds more Permissions than the actor's own (AC-19).
  - Self-credential-change: deny an actor changing their own email or password through this manager-driven action (AC-18).
  - Transfer/delete race: never leave a Warehouse without exactly one Warehouse Manager under concurrent transfer and deletion (AC-15).
  - Self-deletion: deny an actor deleting their own record (AC-11).
  - Duplicate-email disclosure: revealing "already registered" on collision is an intentional, system-wide disclosure already accepted for sign-up; this feature keeps that same behavior rather than introducing an inconsistent one.
- **Security review:** Required — the feature introduces four new authorization-gated capabilities and manager-driven credential handling.

## 7. Metrics / KPIs

- **Warehouses with ≥2 members** — baseline: 0% (only self-registered, single-member Warehouses exist today); target: ≥ 10% of eligible Warehouses reach ≥ 2 members within 30 days of release.
- **Access-invariant violations from user lifecycle operations** — baseline: 0; target: 0 members created, updated, or deleted without exactly one Role, and 0 Warehouses left without exactly one Warehouse Manager, at all times.
- **Valid lifecycle operation success rate** — baseline: 0 production operations; target: ≥ 99% of valid create/email-change/password-change/delete operations complete successfully during the first 30 days.

## 8. Open questions

- [ ] Should a future module's records that reference a deleted Warehouse Member's identifier (e.g. an audit or created-by field) block deletion or survive it? Default now: no such module exists yet, so no conflict exists today; each future module must define its own answer when it adds such a reference. — owner: Tech Lead, due: before that future module's data-model stage.
- [ ] Should the existing, currently-unused `USERS:UPDATE` Permission be repurposed, deprecated, or left dormant now that email and password changes each have their own dedicated Permission? Default now: leave it dormant and unused. — owner: Tech Lead, due: before `tasks users-management`.
- [ ] Should manager-set initial and reset passwords eventually require rotation once a self-service change-password capability ships? Default now: no rotation requirement this release. — owner: PM, due: when self-service password change is specified.
- [ ] Should the existing auth open question on email-ownership-dispute-triggered verification also govern manager-driven email changes, not just sign-up? Default now: yes, treated as the same policy question, not decided separately here. — owner: PM + Security Lead, due: same trigger as the auth open question (disputes exceed 0.5% of new Accounts in a rolling 30-day window).
