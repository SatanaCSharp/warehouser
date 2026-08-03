---
status: Approved
owner: 'PM + Tech Lead'
reviewers: ['Tech Lead', 'Security Lead']
updated_at: '2026-08-03'
feature_size: 'M'
---

# Spec — access

> **Glossary:** [CONTEXT](./CONTEXT.md)
> **Reference module / docs / channels used:** `docs/features/auth/CONTEXT.md`, `docs/features/auth/spec.md`, `apps/server/src/auth/usecases/commands/register.command.ts`, `apps/server/src/auth/domain/services/auth-registration.service.ts`, `apps/server/src/shared/domain/entities/user.entity.ts`, `apps/server/src/shared/guards/session-auth.guard.ts`, `docs/system/architecture-map.md`, `docs/system/sad.md`, `docs/system/server-architecture.md`, and `docs/system/frontend-architecture.md`.

## 1. Context

Warehouser authenticates an Account Holder and identifies the linked User, but authentication deliberately grants no warehouse capability. The system currently has no durable authorization model that can determine which warehouse capabilities a member may use or prevent an otherwise authorized member from acting across Warehouse boundaries.

Access is needed now because registration must produce an immediately manageable Warehouse and future worker creation will depend on safe Role assignment. Without a shared authorization boundary, each new business capability could implement inconsistent access rules, expose controls that members cannot use, or accidentally treat authentication as permission.

The committed approach uses Warehouse-scoped custom Roles assembled from a system-managed Permission catalogue. Every authorization decision requires both the necessary Permission and matching Warehouse ownership; the single Warehouse Manager is protected through a dedicated atomic transfer, while deletion of an assigned custom Role atomically moves affected members to a chosen replacement. Adjacent products commonly provide either granular roles or team ownership, but the reviewed products did not document both invariant-preserving assigned-role replacement and atomic transfer of exactly one protected manager; the principal failure risk is checking Permission without also proving Warehouse ownership.

The requirements extend the existing authentication boundary: registration remains one indivisible outcome while adding creation of the named Warehouse and Warehouse Manager assignment. Warehouse names accept Ukrainian and other Unicode text, are trimmed to 1–100 user-perceived characters, reject control and format characters, preserve submitted Unicode without normalization, and need not be unique because Warehouse identity defines ownership. The initial Warehouse Manager Permission set is `USERS:CREATE`, `ROLES:ASSIGN`, `ROLES:CREATE`, `ROLES:UPDATE`, `ROLES:DELETE`, `USERS:UPDATE`, `USERS:WATCH`, `ROLES:WATCH`, and `WAREHOUSE_MANAGER_ROLE:REASSIGN`; later system releases may extend it. `WAREHOUSE_MANAGER_ROLE:REASSIGN` is reserved to the protected Warehouse Manager Role for this release and cannot be included in a custom Role; a future reserved Permission requires an explicit system-catalogue extension. Infrastructure-only resources remain outside authorization because users cannot invoke them as business capabilities.

## 2. Goals

- Establish one consistent authorization boundary for every user-accessible business capability outside authentication.
- Let authorized Warehouse Members define and maintain warehouse-specific custom Roles without changing the system Permission vocabulary.
- Preserve exactly one Role per Warehouse Member, exactly one Warehouse Manager per Warehouse, and strict Warehouse isolation through every lifecycle operation.

## 3. Non-goals

- Creating additional warehouse members is excluded because worker creation is a separate feature; Access only defines the Role assignment rule that feature must consume.
- Managing Locations is excluded because this release introduces only the Warehouse ownership boundary needed for future extension.
- Letting members create, rename, or delete Permission definitions is excluded because Permissions are system-managed vocabulary.
- Supporting membership in multiple Warehouses or multiple concurrent Roles is excluded because the approved model assigns each member to exactly one Warehouse and one Role.

## 4. User stories

### US-01: Establish warehouse ownership

**As a** Visitor
**I want** registration to create my Warehouse and assign me its Warehouse Manager Role
**So that** I can administer it immediately

### US-02: Create custom roles

**As a** Warehouse Member with role-creation permission
**I want** to create uniquely named custom Roles from system Permissions
**So that** warehouse members receive appropriate capabilities

### US-03: Update role permissions

**As a** Warehouse Member with role-update permission
**I want** to change a custom Role’s Permissions
**So that** responsibilities can evolve

### US-04: Assign member roles

**As a** Warehouse Member
**I want** to assign custom Roles when I have role-assignment permission
**So that** each member has the correct access

### US-05: Replace assigned roles

**As a** Warehouse Member with role-deletion permission
**I want** to delete a custom Role while moving its members to a replacement
**So that** no member becomes roleless

### US-06: Transfer warehouse management

**As a** Warehouse Manager
**I want** to transfer Warehouse Manager to another member while selecting my replacement Role
**So that** ownership changes without leaving zero or multiple managers

### US-07: Understand available access

**As a** Warehouse Member
**I want** unavailable capabilities hidden and unauthorized actions denied
**So that** warehouse access remains understandable and isolated

### US-08: Receive permission updates

**As a** Warehouse Manager
**I want** system Permission updates applied predictably
**So that** new capabilities can be administered without manually changing Permission definitions

### US-09: Review warehouse access

**As a** Warehouse Member with access-read permission
**I want** to view the Warehouse's Roles, Permission catalogue, members, and Role assignments allowed by my Permissions
**So that** I can understand and administer access without crossing Warehouse boundaries

## 5. Acceptance criteria

### AC-01 (US-01) — happy

**Given** a Visitor provides valid unused registration credentials and a valid Warehouse name
**When** the Visitor registers
**Then** the system creates exactly one linked Account, User, Warehouse, protected Warehouse Manager Role, Role assignment, and initial session as one outcome and confirms immediate access

### AC-02 (US-01) — error

**Given** a Visitor provides otherwise acceptable registration information
**When** any part of Account, User, Warehouse, manager assignment, or initial-session establishment cannot complete
**Then** none of those objects or access rights are created and the Visitor is told that registration did not complete

### AC-02a (US-01) — validation

**Given** a Visitor provides a Warehouse name
**When** the trimmed name is empty, exceeds 100 user-perceived characters, or contains a control or format character
**Then** registration does not complete and the Visitor is told which Warehouse-name rule was not met, while a valid name may duplicate another Warehouse's name

### AC-03 (US-02) — happy

**Given** a Warehouse Member has role-creation permission, selects a name not already used exactly in the Warehouse, and chooses zero or more assignable system-defined Permissions
**When** the member creates the custom Role
**Then** the Role becomes available for assignment within that Warehouse and the member receives confirmation

### AC-04 (US-02) — domain invariant

**Given** a custom Role already uses an exact name in the Warehouse
**When** a Warehouse Member with role-creation permission attempts to create another custom Role with that exact name
**Then** the system rejects it and explains that Role names must be unique within the Warehouse, while differently cased names remain distinct

### AC-05 (US-02) — error

**Given** a Warehouse Member with role-creation or role-update permission supplies a Permission that is absent from the system catalogue, reserved to the Warehouse Manager Role, or attempts to change a Permission identifier or label
**When** the member attempts to save the custom Role
**Then** the system rejects the change and explains that Permission definitions are system-managed

### AC-06 (US-03) — happy

**Given** a Warehouse Member has role-update permission and the custom Role belongs to the member's Warehouse
**When** the member changes its assignable system-defined Permission membership, including changing it to an empty set
**Then** the system records the new membership and uses it for subsequent authorization decisions

### AC-06a (US-03) — rename

**Given** a Warehouse Member has role-update permission and a custom Role belongs to the member's Warehouse
**When** the member renames it using a valid name not already used exactly in that Warehouse
**Then** the system records the trimmed name, preserves its submitted Unicode without normalization, and keeps differently cased names distinct

### AC-06b (US-03) — name validation

**Given** a Warehouse Member has the applicable role-creation or role-update permission
**When** the member creates or renames a custom Role using a trimmed name that is empty, exceeds 100 user-perceived characters, contains a control or format character, or exactly duplicates another Role name in the Warehouse
**Then** the system rejects the change and explains which Role-name rule was not met

### AC-07 (US-03) — domain invariant

**Given** the protected Warehouse Manager Role belongs to the Warehouse
**When** any member attempts to rename it, delete it, or change any of its system-managed Permissions
**Then** the system rejects the change and explains that the protected Role is system-managed

### AC-08 (US-04) — happy

**Given** a Warehouse Member has role-assignment permission and both the target member and custom Role belong to the same Warehouse
**When** the member assigns or reassigns the target member to that custom Role
**Then** the target member holds exactly that Role and the system confirms the assignment

### AC-09 (US-04) — authorization

**Given** a Warehouse Member has ordinary role-assignment permission
**When** the member attempts to assign the protected Warehouse Manager Role
**Then** the system denies the assignment and explains that Warehouse Manager can change only through the protected transfer action

### AC-09a (US-04) — protected current manager

**Given** a Warehouse Member has ordinary role-assignment permission
**When** the member attempts to reassign the current Warehouse Manager to a custom Role
**Then** the system denies the assignment and explains that the current Warehouse Manager can change only through the protected transfer action

### AC-10 (US-04) — cross-context

**Given** a Warehouse Member has role-assignment permission
**When** the member attempts to assign a Role or target member from another Warehouse
**Then** the system denies the action because Role assignments cannot cross Warehouse boundaries

### AC-11 (US-05) — happy

**Given** a custom Role is assigned to one or more members and a valid replacement custom Role belongs to the same Warehouse
**When** a Warehouse Member with role-deletion permission deletes the assigned Role and selects the replacement
**Then** every affected member moves to the replacement and the old Role is deleted as one outcome

### AC-12 (US-05) — error

**Given** a Warehouse Member with role-deletion permission attempts to delete an assigned custom Role
**When** any affected member cannot be moved to the selected replacement or deletion cannot complete
**Then** no member assignment or Role changes and the member is told that deletion did not complete

### AC-12a (US-05) — unassigned role

**Given** an unassigned custom Role belongs to the Warehouse and a Warehouse Member has role-deletion permission
**When** the member deletes that Role without selecting a replacement
**Then** the Role is deleted and no member assignment changes

### AC-13 (US-06) — happy

**Given** the current Warehouse Manager has the protected manager-transfer Permission, the recipient is a different member of the same Warehouse, and a custom Role is selected for the current manager
**When** the current manager transfers Warehouse Manager
**Then** the recipient becomes the sole Warehouse Manager and the former manager receives the selected custom Role as one outcome

### AC-14 (US-06) — authorization

**Given** an actor is not the current Warehouse Manager or lacks the protected manager-transfer Permission
**When** the actor attempts to transfer Warehouse Manager
**Then** the system denies the transfer and preserves exactly one current Warehouse Manager

### AC-14a (US-06) — invalid recipient

**Given** the current Warehouse Manager has the protected manager-transfer Permission
**When** the manager selects themself or a member of another Warehouse as the transfer recipient
**Then** the system denies the transfer and preserves exactly one current Warehouse Manager

### AC-15 (US-07) — authorization

**Given** a Warehouse Member lacks the Permission required for a same-Warehouse business capability
**When** the member attempts to use that capability
**Then** the server explains that access is not permitted, while the web does not present that capability as available

### AC-16 (US-07) — cross-context

**Given** a Warehouse Member has a Permission required by a business capability
**When** the member attempts to use it against a resource owned by another Warehouse
**Then** the system denies the action because Permission never overrides Warehouse ownership

### AC-17 (US-07) — domain invariant

**Given** a resource is exposed as a user-accessible business capability outside authentication
**When** a Warehouse Member attempts to use it
**Then** the system evaluates its explicit Permission and Warehouse ownership rules, while infrastructure-only resources remain exempt

### AC-18 (US-08) — happy

**Given** a system release introduces a new Permission
**When** its access update is applied
**Then** a non-reserved Permission becomes available for custom Roles and is added to every existing Warehouse Manager Role as defined by that update, while a Permission explicitly classified as reserved remains exclusive to the protected Role and existing custom Roles remain unchanged unless that update explicitly changes them

### AC-19 (US-02, US-03, US-05) — authorization

**Given** a Warehouse Member lacks the Permission required to create, update, rename, or delete a custom Role
**When** the member attempts that Role operation
**Then** the system denies the operation and leaves Roles and member assignments unchanged

### AC-20 (US-09) — role access reads

**Given** a Warehouse Member has `ROLES:WATCH`
**When** the member reviews access configuration
**Then** the member can view custom Roles and the system Permission catalogue for the member's Warehouse but cannot view another Warehouse's access configuration

### AC-21 (US-09) — member access reads

**Given** a Warehouse Member has `USERS:WATCH`
**When** the member reviews Warehouse membership
**Then** the member can view members and their Role assignments in the member's Warehouse but cannot view another Warehouse's membership

### AC-22 (US-09) — authorization

**Given** a Warehouse Member lacks the applicable access-read Permission
**When** the member attempts to view Roles, Permissions, members, or Role assignments governed by that Permission
**Then** the system denies the read and does not disclose the requested access information

## 6. Non-functional requirements

| Aspect                           | Target                                                                                                                              | Measurement                                            |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| Authorization evaluation latency | Added p95 ≤ 50 ms per protected operation                                                                                           | Structured server timing logs                          |
| Role read latency                | p95 ≤ 250 ms, excluding client network time                                                                                         | Structured server timing logs                          |
| Role mutation latency            | p95 ≤ 500 ms, excluding client network time                                                                                         | Structured server timing logs                          |
| Protected-operation throughput   | ≥ 50 operations per second per running service instance for 10 minutes                                                              | Automated load smoke test                              |
| Lifecycle atomicity              | 100% of registration, assigned-Role deletion, and manager-transfer outcomes preserve all access invariants                          | Integration checks and production reconciliation       |
| Revocation freshness             | Permission removal or Role reassignment affects the next authorization decision; 0 successful uses of removed authority             | Integration checks and security-log review             |
| Authorization coverage           | 100% of user-accessible business capabilities outside authentication have an explicit Permission rule and Warehouse ownership check | Automated architecture and integration coverage checks |

## 6.1 Security / privacy

- **Data classification:** internal — Role and Permission data is not personal data, but assignments reveal internal responsibilities and control access.
- **Personal data touched:** none newly introduced; the feature relates existing User identifiers to Warehouse and Role records.
- **AuthZ/AuthN impact:** introduces the shared authorization boundary; every user-accessible business capability outside authentication checks both Permission and Warehouse ownership, while infrastructure-only resources remain exempt.
- **Abuse cases:**
  - Cross-Warehouse access: deny any action when actor and target Warehouse ownership differ, even if the actor has the matching Permission.
  - Reserved-Role escalation: ordinary Role assignment never assigns Warehouse Manager or reproduces its protected transfer.
  - Manager transfer split-brain: transfer completes only when promotion and former-manager reassignment both preserve exactly one manager.
  - Stale authority: removed Permissions and replaced Roles stop authorizing the next decision, regardless of an existing authenticated session.
  - Authorization coverage drift: a new user-facing capability cannot ship without an explicit Permission and Warehouse ownership rule.
- **Security review:** Required because the feature introduces the application-wide authorization and Warehouse-isolation boundary.

## 7. Metrics / KPIs

- **Unauthorized cross-Warehouse access incidents** — baseline: 0 under the new boundary; target: 0 at all times.
- **Access-invariant violations** — baseline: 0 under the new model; target: 0 members without exactly one Role and 0 Warehouses without exactly one Warehouse Manager at all times.
- **Authorization coverage** — baseline: 0 capabilities enforced by this boundary; target: 100% before release and continuously afterward.
- **Valid Role-management completion** — baseline: 0 production operations; target: ≥99% of valid operations complete successfully during the first 30 days.
- **Visible-but-inaccessible web capabilities** — baseline: not measured; target: fewer than 1% of capability interactions during the first 30 days, measured through automated UI coverage and support reports without adding telemetry.

## 8. Open questions

- [x] No existing production Users require migration into a new Warehouse and Role assignment. Approved default; verify as a deployment precondition before staging schema changes. — owner: Tech Lead, resolved: 2026-08-03
