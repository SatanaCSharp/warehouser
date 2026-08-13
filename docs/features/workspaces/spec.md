---
status: Draft
owner: 'PM + Tech Lead'
reviewers: ['Tech Lead', 'Security Lead']
updated_at: '2026-08-11'
feature_size: 'L'
---

# Spec — workspaces

> **Glossary:** [CONTEXT](./CONTEXT.md), [access CONTEXT](../access/CONTEXT.md), [auth CONTEXT](../auth/CONTEXT.md)
> **Reference module / docs / channels used:** `docs/features/access/spec.md`, `docs/features/access/CONTEXT.md`, `docs/features/auth/spec.md`, `docs/features/users-management/spec.md`, `apps/server/src/shared/domain/entities/warehouse-membership.entity.ts`, `apps/server/src/shared/domain/entities/role.entity.ts`, `apps/server/src/shared/guards/warehouse-access.guard.ts`, `apps/server/src/access/usecases/commands/provision-initial-access.command.ts`, `apps/server/src/access/usecases/commands/transfer-warehouse-manager.command.ts`, `apps/web/src/modules/access/components/access-workspace/AccessWorkspace.tsx`, `docs/system/architecture-map.md`, `docs/system/sad.md`, `docs/system/server-architecture.md`, and `docs/system/frontend-architecture.md`.

## 1. Context

Warehouser currently makes the Warehouse the outermost ownership boundary. A User is created together with exactly one Warehouse at registration, belongs to exactly one Warehouse for their entire lifetime, and holds exactly one Role there. Registration is the only way a Warehouse can come into existence, so an organization that operates two sites has no way to represent that: it must register a second, entirely separate account whose members, Roles, and future stock are invisible to the first. Nothing in the product owns the Warehouse lifecycle — no one can add, rename, or withdraw a Warehouse after registration.

This is needed now because the Warehouse boundary is about to carry stock, Locations, and movement history, and every one of those features would inherit the one-Warehouse-per-organization ceiling. Correcting the boundary after stock exists means migrating operational history rather than an empty access model; the access model is the last moment at which this change is cheap.

The committed approach introduces the Workspace as a new ownership boundary above the Warehouse. Registration creates a Workspace whose registrant becomes both its Workspace Owner and the Warehouse Manager of the first Warehouse. The Workspace aggregates Warehouses and owns their entire lifecycle — creation, renaming, and reversible archiving — while the Warehouse feature gains no Workspace-aware behaviour of its own. A Warehouse Member may now hold a membership in several Warehouses of their Workspace, and every Warehouse-scoped request names the Warehouse it applies to; the Warehouse a member has selected is presentation state that never grants authority, so authority never travels with them, because each membership carries its own Role. Workspace authorization mirrors the approved Access model exactly one level up: a protected singleton Workspace Owner Role changed only through an atomic transfer, custom Workspace Roles assembled from a system-managed Workspace Permission catalogue, and exactly one Workspace Role per Workspace Member.

The requirements extend the approved Access model rather than replacing it. Warehouse Roles, Warehouse Permissions, the protected Warehouse Manager Role, and its transfer keep the behaviour Access specifies; what changes is that a Warehouse membership is now identified by the pair of User and Warehouse instead of by User alone, and that the Warehouse a request applies to becomes explicit rather than implied. Workspace names follow the Warehouse name rules already approved — trimmed to 1–100 user-perceived characters, rejecting control and format characters, preserving submitted Unicode without normalization, and not required to be unique — except that a Workspace is created without a name and is presented with a placeholder until one is set. The initial Workspace Owner Workspace Permission set is `WORKSPACE:RENAME`, `WORKSPACE_ROLES:WATCH`, `WORKSPACE_ROLES:CREATE`, `WORKSPACE_ROLES:UPDATE`, `WORKSPACE_ROLES:DELETE`, `WORKSPACE_ROLES:ASSIGN`, `WORKSPACE_MEMBERS:WATCH`, `WORKSPACE_MEMBERS:ADD`, `WORKSPACE_MEMBERS:REMOVE`, `WAREHOUSES:WATCH`, `WAREHOUSES:CREATE`, `WAREHOUSES:RENAME`, `WAREHOUSES:ARCHIVE`, `WAREHOUSE_MEMBERSHIPS:ASSIGN`, `WAREHOUSE_MEMBERSHIPS:REVOKE`, and `WORKSPACE_OWNER_ROLE:REASSIGN`; `WAREHOUSES:ARCHIVE` governs both withdrawing and restoring a Warehouse, and `WORKSPACE_OWNER_ROLE:REASSIGN` is reserved to the protected Workspace Owner Role and cannot be included in a custom Workspace Role. Two of these Workspace Permissions carry a deliberate read alongside the change they authorize, because the operand of that change lives at the other level or outside Workspace membership: `WAREHOUSE_MEMBERSHIPS:ASSIGN` carries a narrow read of the assignable custom Roles of a Warehouse of the actor's own Workspace, limited to their identifiers and names, so the assigner can choose one without holding authority inside that Warehouse; and `WORKSPACE_MEMBERS:WATCH` covers reading the Users of the Workspace and the Warehouses they belong to, not only the Users who are already Workspace Members, so the people that Workspace membership and Warehouse membership assignment act on can be found. This release supersedes the Access non-goal that excluded membership in multiple Warehouses; how that supersession is recorded against the approved Access artifacts is tracked in §8.

Five boundaries this feature depends on are stated here so they are not re-derived downstream. First, the line between the two authority levels is the subject of the operation: an operation whose subject is the Warehouse record itself or a membership edge into it is a Workspace capability, while an operation whose subject is a resource the Warehouse owns — its Roles and, later, its stock, Locations, and movement history — is a Warehouse capability. Second, a User belongs to a Workspace through a relation established when that User is created — at registration for a registrant, and from the Workspace that owns the Warehouse they are created in for a member created by an authorized Warehouse Member — and never re-derived afterwards from their Warehouse memberships, so a Workspace Member who holds no Warehouse membership is still a User of that Workspace. Third, a newly created Warehouse holds only its protected Warehouse Manager Role, so placing anyone else into it requires that Warehouse's Warehouse Manager to create custom Roles there first. Fourth, no deployment carries Warehouse or membership data that must survive this change: the schema is rebuilt by rolling back every migration and running them again from the beginning, so this release preserves no pre-existing records. Fifth, the §6 targets assume an order of magnitude of roughly 50 Warehouses per Workspace, 50 Warehouse memberships per User, and 500 Workspace Members, at which the Workspace and Warehouse lists this feature presents are returned whole rather than in pages; outgrowing that scale is the explicit trigger to revisit §6 and introduce paging, not a silent regression against these targets.

## 2. Goals

- Establish the Workspace as one aggregation and isolation boundary above the Warehouse, so an organization can operate several Warehouses under a single identity.
- Give the Workspace level sole ownership of the Warehouse lifecycle and of Workspace membership, without introducing Workspace-aware behaviour into the Warehouse feature.
- Preserve every approved Warehouse guarantee while a member belongs to several Warehouses, so authority is always that of the membership held in the Warehouse being acted on.

## 3. Non-goals

- Permanently deleting a Warehouse is excluded because archiving is reversible and retains the Roles, memberships, and future operational records that inventory history depends on.
- Membership in more than one Workspace is excluded because the Workspace is the outer isolation boundary and a User resolving to two of them makes every scoped decision ambiguous.
- Letting members create, rename, or delete Workspace Permission definitions is excluded because, as with Warehouse Permissions, the catalogue is system-managed vocabulary.
- Workspace-level stock, reporting, and billing are excluded because this release introduces only the ownership boundary those capabilities will later attach to.
- Preserving pre-existing Warehouse, membership, and Role records is excluded because no deployment holds data that must survive this change; the schema is rebuilt by rolling back every migration and running them again from the beginning.

## 4. User stories

### US-01: Establish workspace ownership

**As a** Visitor
**I want** registration to create my Workspace alongside my first Warehouse and make me both its Workspace Owner and that Warehouse's Warehouse Manager
**So that** I can administer my organization and its first site immediately

### US-02: Choose the warehouse I work in

**As a** Warehouse Member
**I want** to see the Warehouses I hold a membership in and choose which one I am working in, with every action I take naming that Warehouse
**So that** my actions apply to the site I intend, with the Role I hold there

### US-03: Add a warehouse

**As a** Workspace Member with warehouse-creation permission
**I want** to add a Warehouse to my Workspace and become its Warehouse Manager
**So that** a new site can be administered from the moment it exists

### US-04: Rename a warehouse

**As a** Workspace Member with warehouse-rename permission
**I want** to rename a Warehouse of my Workspace
**So that** site names stay accurate as the organization changes

### US-05: Archive and restore a warehouse

**As a** Workspace Member with warehouse-archive permission
**I want** to withdraw a Warehouse from operation and later restore it
**So that** a closed site stops being usable without losing its members, Roles, or records

### US-06: Define workspace roles

**As a** Workspace Member with workspace-role permissions
**I want** to create, update, and delete custom Workspace Roles built from system Workspace Permissions
**So that** Workspace administration can be delegated without granting everything

### US-07: Manage workspace members

**As a** Workspace Member with member-add, member-remove, and workspace-role-assignment permissions
**I want** to add a Warehouse Member of my Workspace as a Workspace Member with a Workspace Role, to move an existing Workspace Member to a different Workspace Role, and to remove a Workspace Member again
**So that** Workspace administration is deliberately granted rather than inherited, adjusted as responsibilities change, and withdrawn when it is no longer needed

### US-08: Place a user in another warehouse

**As a** Workspace Member with membership-assign permission
**I want** to give another User of my Workspace a membership and Role in a Warehouse of that Workspace
**So that** people who work across sites do not need a second account

### US-08a: Withdraw a warehouse membership

**As a** Workspace Member with membership-revoke permission
**I want** to withdraw another User's membership in a Warehouse of my Workspace
**So that** access to a site can be taken back when someone stops working there

### US-09: Transfer workspace ownership

**As a** Workspace Owner
**I want** to transfer Workspace Owner to another Workspace Member while choosing my replacement Workspace Role
**So that** ownership changes without leaving zero or multiple Workspace Owners

### US-10: Understand my workspace access

**As a** Workspace Member
**I want** to name my Workspace, and to have Workspace capabilities I cannot use hidden and unauthorized attempts denied
**So that** the boundary between Workspace and Warehouse authority stays understandable

### US-11: Review workspace configuration

**As a** Workspace Member with the applicable watch permissions
**I want** to view my Workspace's Workspace Roles, Workspace Permission catalogue, Workspace Members, and Warehouses
**So that** I can understand and administer the Workspace without crossing Workspace boundaries

### US-12: Apply workspace permission updates

**As a** system maintainer releasing a new Workspace capability
**I want** the Workspace Permission catalogue updated by the release itself, with no person acting
**So that** every existing Workspace gains the new capability without anyone editing Workspace Permission definitions by hand

### US-13: Transfer warehouse management

**As a** Warehouse Manager
**I want** to transfer Warehouse Manager to another member of that same Warehouse and take a Role there myself
**So that** site administration changes hands without the Warehouse ever having zero or several Warehouse Managers

## 5. Acceptance criteria

### AC-01 (US-01) — happy

**Given** a Visitor provides valid unused registration credentials and a valid Warehouse name
**When** the Visitor registers
**Then** the system creates exactly one linked Account, User, unnamed Workspace, protected Workspace Owner Role, Workspace Role assignment, Warehouse belonging to that Workspace, protected Warehouse Manager Role, Warehouse membership, and initial session as one outcome and confirms immediate access

### AC-02 (US-01) — error

**Given** a Visitor provides otherwise acceptable registration information
**When** any part of the Account, User, Workspace, Workspace Owner assignment, Warehouse, Warehouse Manager assignment, or initial-session establishment cannot complete
**Then** none of those objects or access rights are created and the Visitor is told that registration did not complete

### AC-03 (US-02) — happy

**Given** a Warehouse Member holds memberships in more than one Warehouse of their Workspace and the chosen Warehouse is not archived
**When** the member selects one of those Warehouses as their Active Warehouse and then acts in it
**Then** the selection is retained for that member rather than for the device they used, so it is the same wherever they next sign in, persists until they change it, and determines what the member is shown, while each action they take names the Warehouse it applies to and is authorized by the Role they hold in that named Warehouse

### AC-03b (US-02) — happy

**Given** a Warehouse Member has never chosen an Active Warehouse
**When** the member is shown their Warehouses
**Then** the system selects the one Warehouse they hold a membership in when that is their only membership, and otherwise leaves them with no Active Warehouse until they choose one, without ever choosing between several memberships on their behalf

### AC-03a (US-02) — domain invariant

**Given** a Warehouse Member acts on a Warehouse-scoped capability
**When** the request does not unambiguously name exactly one Warehouse
**Then** the system refuses it rather than resolving it to the member's current selection or to any other default, so authority is never borrowed from another membership

### AC-04 (US-02) — authorization

**Given** a Warehouse Member holds no membership in a Warehouse of their Workspace
**When** the member attempts to make it their Active Warehouse or to act on it
**Then** the system denies the attempt, leaves their current selection unchanged, and does not disclose that Warehouse's contents

### AC-05 (US-02) — cross-context

**Given** a Warehouse Member holds a Permission through the Role of one Warehouse and a Role without that Permission in another Warehouse of the same Workspace
**When** the member attempts to use that capability while operating in the second Warehouse
**Then** the system denies the action because authority is always that of the membership held in the Warehouse being acted on

### AC-06 (US-03) — happy

**Given** a Workspace Member has warehouse-creation permission and provides a valid Warehouse name
**When** the member adds a Warehouse to their Workspace
**Then** the system creates the Warehouse in that Workspace, its protected Warehouse Manager Role, and a membership assigning that Role to the creating member as one outcome, and the Warehouse becomes selectable for them

### AC-07 (US-03) — domain invariant

**Given** a Workspace Member with warehouse-creation permission adds a Warehouse
**When** the Warehouse Manager Role or its assignment to the creator cannot be established
**Then** no Warehouse is created, because a Warehouse never exists with zero or more than one Warehouse Manager

### AC-08 (US-03, US-04) — error

**Given** a Workspace Member has the applicable warehouse-creation or warehouse-rename permission
**When** the submitted Warehouse name is empty after trimming, exceeds 100 user-perceived characters, or contains a control or format character
**Then** the system rejects the change and tells the member which Warehouse-name rule was not met, while a valid name may duplicate another Warehouse's name

### AC-09 (US-04) — happy

**Given** a Workspace Member has warehouse-rename permission and the Warehouse belongs to their Workspace
**When** the member renames it using a valid name
**Then** the system records the trimmed name, preserves its submitted Unicode without normalization, and the new name is what members of that Warehouse see

### AC-10 (US-04, US-05) — cross-context

**Given** a Workspace Member has warehouse-rename or warehouse-archive permission
**When** the member attempts to rename, archive, or restore a Warehouse belonging to another Workspace
**Then** the system denies the action because Workspace Permissions never override Workspace ownership, and does not disclose that the Warehouse exists

### AC-11 (US-05) — happy

**Given** a Workspace Member has warehouse-archive permission and the Warehouse belongs to their Workspace
**When** the member archives the Warehouse and later restores it
**Then** the archived Warehouse stops being selectable and stops accepting any operation whose subject is a resource it owns, while operations whose subject is the Warehouse record itself or a membership edge into it — renaming it, restoring it, assigning or withdrawing a membership in it, and the protected Warehouse Manager transfer — remain available to whoever holds the applicable authority, and its Roles, memberships, and records are retained and remain readable, so restoring it makes it selectable and operable again with those Roles and memberships intact

### AC-11a (US-05) — domain invariant

**Given** a Workspace Member has warehouse-archive permission and the Warehouse is the only one of their Workspace that is not already archived
**When** the member attempts to archive it
**Then** the system denies the archiving and explains that a Workspace always keeps at least one Warehouse that is not archived, so its members are never left without a site to work in

### AC-12 (US-05) — cross-context

**Given** a Warehouse is archived and a member holds a Warehouse membership and Permission in it
**When** the member attempts to change a resource that Warehouse owns
**Then** the system denies the change and explains that the Warehouse is archived, while the member's membership, Role, and any membership they hold in other Warehouses are unaffected, and the archived Warehouse keeps exactly one Warehouse Manager so it stays administrable when restored

### AC-12a (US-05) — happy

**Given** a Warehouse is archived and a member holds a Warehouse membership in it carrying the applicable watch Permission
**When** the member views that Warehouse's retained Roles, memberships, or records
**Then** the system allows the read and marks the Warehouse as archived, because archiving withdraws a Warehouse from operation without withdrawing the account of what happened in it

### AC-13 (US-05) — error

**Given** a Workspace Member with warehouse-archive permission attempts to archive or restore a Warehouse
**When** the change cannot complete
**Then** the Warehouse's archived state, memberships, and Roles are unchanged and the member is told that the change did not complete

### AC-14 (US-06) — happy

**Given** a Workspace Member has workspace-role-creation permission, selects a name not already used exactly in the Workspace, and chooses zero or more assignable system-defined Workspace Permissions
**When** the member creates the custom Workspace Role
**Then** the Workspace Role becomes available for assignment within that Workspace and the member receives confirmation

### AC-14a (US-06) — happy

**Given** a Workspace Member has workspace-role-update permission and the custom Workspace Role belongs to their Workspace
**When** the member changes its assignable system-defined Workspace Permission membership, including changing it to an empty set, or renames it using a valid name not already used exactly in that Workspace
**Then** the system records the change, preserves a submitted name's Unicode without normalization, and uses the new Workspace Permission membership for subsequent authorization decisions

### AC-15 (US-06) — domain invariant

**Given** a custom Workspace Role already uses an exact name in the Workspace
**When** a Workspace Member with workspace-role-creation or workspace-role-update permission attempts to give another Workspace Role that exact name
**Then** the system rejects it and explains that Workspace Role names must be unique within the Workspace, while differently cased names remain distinct

### AC-15a (US-06) — error

**Given** a Workspace Member has the applicable workspace-role-creation or workspace-role-update permission
**When** the submitted Workspace Role name is empty after trimming, exceeds 100 user-perceived characters, or contains a control or format character
**Then** the system rejects the change and tells the member which Workspace Role-name rule was not met

### AC-16 (US-06) — domain invariant

**Given** the protected Workspace Owner Role belongs to the Workspace
**When** any member attempts to rename it, delete it, or change any of its system-managed Workspace Permissions
**Then** the system rejects the change and explains that the protected Workspace Role is system-managed

### AC-17 (US-06) — happy

**Given** a custom Workspace Role is assigned to one or more Workspace Members and a valid replacement custom Workspace Role belongs to the same Workspace
**When** a Workspace Member holding both workspace-role-deletion and workspace-role-assignment permission deletes the assigned Workspace Role and selects the replacement
**Then** every affected Workspace Member moves to the replacement and the old Workspace Role is deleted as one outcome, so no Workspace Member is left without exactly one Workspace Role

### AC-17d (US-06) — authorization

**Given** a Workspace Member holds workspace-role-deletion permission but not workspace-role-assignment permission
**When** the member attempts to delete a custom Workspace Role that is assigned to at least one Workspace Member
**Then** the system denies the deletion and explains that moving the affected Workspace Members to a replacement is a Workspace Role assignment, which requires the workspace-role-assignment permission as well, while deleting an unassigned Workspace Role under AC-17a stays available to them

### AC-17a (US-06) — happy

**Given** an unassigned custom Workspace Role belongs to the Workspace and a Workspace Member has workspace-role-deletion permission
**When** the member deletes that Workspace Role without selecting a replacement
**Then** the Workspace Role is deleted and no Workspace Role assignment changes

### AC-17b (US-06) — error

**Given** a Workspace Member with workspace-role-deletion permission attempts to delete an assigned custom Workspace Role
**When** any affected Workspace Member cannot be moved to the selected replacement or the deletion cannot complete
**Then** no Workspace Role assignment and no Workspace Role changes, and the member is told that the deletion did not complete

### AC-17c (US-06) — domain invariant

**Given** an assigned custom Workspace Role is the only custom Workspace Role in the Workspace, so no replacement other than the protected Workspace Owner Role exists
**When** a Workspace Member with workspace-role-deletion permission attempts to delete it
**Then** the system denies the deletion and explains that another custom Workspace Role must exist first, because every Workspace Member holds exactly one Workspace Role and the protected Workspace Role is never assigned this way

### AC-18 (US-06) — error

**Given** a Workspace Member with workspace-role-creation or workspace-role-update permission supplies a Workspace Permission that is absent from the system catalogue, is reserved to the Workspace Owner Role, or attempts to change a Workspace Permission identifier or label
**When** the member attempts to save the custom Workspace Role
**Then** the system rejects the change and explains that Workspace Permission definitions are system-managed

### AC-19 (US-07) — happy

**Given** a Workspace Member has member-add permission and the candidate holds a Warehouse membership in a Warehouse of that Workspace and is not already a Workspace Member
**When** the member adds the candidate as a Workspace Member with a custom Workspace Role
**Then** the candidate holds exactly that one Workspace Role, gains the Workspace capabilities it grants, and the acting member receives confirmation

### AC-19a (US-07) — happy

**Given** a Workspace Member has member-remove permission and the target is a Workspace Member of the same Workspace who is not the current Workspace Owner
**When** the member removes the target's Workspace membership
**Then** the target keeps every Warehouse membership and Role they hold but loses every Workspace capability from the next authorization decision onward

### AC-19b (US-07) — happy

**Given** a Workspace Member has workspace-role-assignment permission and the target is a Workspace Member of the same Workspace who is not the current Workspace Owner
**When** the member moves the target to a different custom Workspace Role of that Workspace
**Then** the target holds exactly that one Workspace Role, the Workspace capabilities of the previous Workspace Role stop applying from the next authorization decision onward, and no Warehouse membership or Role changes

### AC-20 (US-07) — cross-context

**Given** a Workspace Member has member-add permission and a candidate holds no Warehouse membership in any Warehouse of that Workspace
**When** the member attempts to add that candidate as a Workspace Member
**Then** the system blocks the addition and explains that only people who already belong to a Warehouse of this Workspace can become Workspace Members

### AC-21 (US-07) — domain invariant

**Given** a User is already a Workspace Member and subsequently holds no Warehouse membership in any Warehouse of the Workspace
**When** the system evaluates their Workspace access
**Then** their Workspace Role and Workspace capabilities remain in force, because the Warehouse-membership requirement applies only when Workspace membership is granted and is removed only by an explicit Workspace membership removal

### AC-22 (US-07) — authorization

**Given** a Workspace Member has ordinary workspace-role-assignment permission
**When** the member attempts to assign the protected Workspace Owner Role, or to reassign the current Workspace Owner to a custom Workspace Role
**Then** the system denies the assignment and explains that Workspace Owner can change only through the protected transfer action

### AC-21a (US-07) — domain invariant

**Given** a Workspace Member has member-remove permission
**When** the member attempts to remove the Workspace membership of the current Workspace Owner
**Then** the system denies the removal and explains that Workspace Owner must first be transferred, so a Workspace is never left without exactly one Workspace Owner

### AC-23 (US-08) — happy

**Given** a Workspace Member has membership-assign permission, the target User belongs to that Workspace and is not the acting member, and both the target Warehouse and the chosen custom Role belong to that same Workspace and Warehouse
**When** the member gives the target User a membership in that Warehouse with that Role
**Then** the target User holds exactly that Role in that Warehouse, retains every membership they already held, and the Warehouse becomes selectable for them

### AC-23a (US-08) — cross-context

**Given** a Workspace Member has membership-assign permission and the Warehouse belongs to their Workspace
**When** the member reads that Warehouse's assignable custom Roles in order to choose one for the target User
**Then** the system allows the read, limited to those Roles' identifiers and names, and grants the member no other capability inside that Warehouse and no visibility into the Roles, members, or resources of a Warehouse belonging to another Workspace

### AC-24 (US-08) — cross-context

**Given** a Workspace Member has membership-assign permission
**When** the member attempts to place a User of another Workspace into one of their Warehouses, or to place a User of their Workspace into a Warehouse of another Workspace
**Then** the system denies the action because all of a User's Warehouse memberships belong to Warehouses of one Workspace

### AC-25 (US-08) — domain invariant

**Given** a Workspace Member has membership-assign permission
**When** the member attempts to grant a membership carrying the protected Warehouse Manager Role, or to grant a second membership in a Warehouse the target User already belongs to
**Then** the system denies the action and explains that Warehouse Manager changes only through the protected Warehouse transfer and that a User holds at most one Role in any one Warehouse

### AC-25a (US-08) — authorization

**Given** a Workspace Member has membership-assign permission
**When** the member attempts to grant themself a membership in a Warehouse that already exists
**Then** the system denies the action and explains that a member cannot place themself into an existing Warehouse, so authority over a Warehouse that already has members is always granted by someone else; adding a Warehouse under AC-06 is the one exception, because a Warehouse at the moment of its creation has no other member who could grant it

### AC-25b (US-08a) — happy

**Given** a Workspace Member has membership-revoke permission and the target User holds a membership carrying a custom Role in a Warehouse of that Workspace
**When** the member withdraws that membership
**Then** the target User loses that Warehouse's Role and every Permission it granted from the next authorization decision onward, that Warehouse stops being selectable for them, and every other membership they hold is unaffected

### AC-25c (US-08a) — domain invariant

**Given** a Workspace Member has membership-revoke permission
**When** the member attempts to withdraw the membership carrying the protected Warehouse Manager Role, or their own membership in a Warehouse
**Then** the system denies the action and explains that Warehouse Manager changes only through the protected Warehouse transfer, so a Warehouse is never left without exactly one Warehouse Manager, and that a member never withdraws their own Warehouse authority

### AC-25d (US-08a) — cross-context

**Given** a Workspace Member has membership-revoke permission
**When** the member attempts to withdraw a membership in a Warehouse belonging to another Workspace
**Then** the system denies the action and does not disclose that the Warehouse or the membership exists

### AC-26 (US-09) — happy

**Given** the current Workspace Owner has the protected owner-transfer Workspace Permission, the recipient is a different Workspace Member of the same Workspace, and a custom Workspace Role is selected for the current owner
**When** the current owner transfers Workspace Owner
**Then** the recipient becomes the sole Workspace Owner and the former owner receives the selected custom Workspace Role as one outcome

### AC-26a (US-09) — error

**Given** the current Workspace Owner has the protected owner-transfer Workspace Permission and the Workspace has no custom Workspace Role for the outgoing owner to receive
**When** the owner attempts to transfer Workspace Owner
**Then** the system denies the transfer, preserves exactly one current Workspace Owner, and explains that a custom Workspace Role must be created first, because the outgoing owner must end the transfer holding exactly one Workspace Role

### AC-27 (US-09) — authorization

**Given** an actor is not the current Workspace Owner or lacks the protected owner-transfer Workspace Permission
**When** the actor attempts to transfer Workspace Owner
**Then** the system denies the transfer and preserves exactly one current Workspace Owner

### AC-28 (US-09) — authorization

**Given** the current Workspace Owner has the protected owner-transfer Workspace Permission
**When** the owner selects themself, a User who is not a Workspace Member of that Workspace, or a Workspace Member of another Workspace as the recipient
**Then** the system denies the transfer and preserves exactly one current Workspace Owner

### AC-29 (US-10) — happy

**Given** a Workspace has no name yet and a Workspace Member has workspace-rename permission
**When** the member sets or later changes the Workspace name using a valid name
**Then** the system records the trimmed name, preserves its submitted Unicode without normalization, and presents it to Workspace Members in place of the unnamed-Workspace placeholder, while a valid name may duplicate another Workspace's name

### AC-29a (US-10) — error

**Given** a Workspace Member has workspace-rename permission
**When** the submitted Workspace name is empty after trimming, exceeds 100 user-perceived characters, or contains a control or format character
**Then** the system rejects the change, tells the member which Workspace-name rule was not met, and leaves the Workspace's existing name or unnamed state as it was

### AC-30 (US-10) — authorization

**Given** a User lacks the Workspace Permission required for a Workspace capability in their own Workspace, including a Warehouse Member who is not a Workspace Member at all
**When** that User attempts to use the capability
**Then** the server explains that access is not permitted, while the web omits the control for that capability and also omits any navigation entry or destination whose every capability is unavailable to that User, rather than presenting either in an unusable or empty state

### AC-31 (US-10) — cross-context

**Given** a User holds Workspace Permissions in their Workspace and Permissions through a Warehouse membership
**When** they attempt to use a Workspace Permission to act inside a Warehouse, or a Warehouse Permission to act on the Workspace
**Then** the system denies the action because Workspace and Warehouse authority are separate and neither substitutes for the other

### AC-32 (US-11) — happy

**Given** a Workspace Member has `WORKSPACE_ROLES:WATCH`
**When** the member reviews Workspace access configuration
**Then** the member can view the custom Workspace Roles and the system Workspace Permission catalogue of their own Workspace

### AC-33 (US-11) — happy

**Given** a Workspace Member has `WORKSPACE_MEMBERS:WATCH` or `WAREHOUSES:WATCH`
**When** the member reviews Workspace membership or the Workspace's Warehouses
**Then** the member can view the Workspace Members and their Workspace Role assignments together with the other Users of that Workspace and the Warehouses each of them belongs to, so the candidates that Workspace membership and Warehouse membership assignment act on can be found, or the Warehouses of that Workspace together with their archived state, according to the watch permission held

### AC-34 (US-11) — cross-context

**Given** a Workspace Member holds a watch Workspace Permission
**When** the member attempts to view another Workspace's Workspace Roles, Workspace Members, or Warehouses, or lacks the applicable watch Workspace Permission in their own Workspace
**Then** the system denies the read and does not disclose the requested Workspace information

### AC-35 (US-12) — happy

**Given** a system release introduces a new Workspace Permission
**When** that release's application migration runs, without any person acting
**Then** a non-reserved Workspace Permission becomes available for custom Workspace Roles and is added to every existing Workspace Owner Role automatically, while a Workspace Permission explicitly classified as reserved remains exclusive to the protected Workspace Owner Role and no existing custom Workspace Role changes

### AC-36 (US-13) — happy

**Given** a Warehouse Manager, a recipient who already holds a membership in that same Warehouse, and a custom Role of that same Warehouse selected for the outgoing Manager
**When** the Warehouse Manager transfers Warehouse Manager to the recipient
**Then** the recipient's membership in that Warehouse carries the protected Warehouse Manager Role, the outgoing Manager's membership in that same Warehouse carries the selected custom Role as one outcome, the Warehouse ends with exactly one Warehouse Manager, and every membership either of them holds in another Warehouse is unaffected

### AC-36a (US-13) — domain invariant

**Given** a Warehouse Manager attempts to transfer Warehouse Manager
**When** the chosen recipient holds no membership in that Warehouse, is the outgoing Manager themself, or no custom Role of that Warehouse is selected for the outgoing Manager
**Then** the system denies the transfer, preserves exactly one current Warehouse Manager, and explains that Warehouse Manager moves only between members of that same Warehouse and that the outgoing Manager must end the transfer holding exactly one Role there

## 6. Non-functional requirements

| Aspect                             | Target                                                                                                                                                                                                                     | Measurement                                            |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| Workspace authorization evaluation | Authorization stage p95 ≤ 50 ms per protected Workspace operation                                                                                                                                                          | Structured server timing logs                          |
| Warehouse authorization evaluation | Authorization stage p95 ≤ 50 ms per protected Warehouse operation, and that stage does not grow with the number of Warehouses a member belongs to                                                                          | Structured server timing logs                          |
| Workspace read latency             | p95 ≤ 250 ms, excluding client network time                                                                                                                                                                                | Structured server timing logs                          |
| Workspace mutation latency         | p95 ≤ 500 ms, excluding client network time                                                                                                                                                                                | Structured server timing logs                          |
| Warehouse selection latency        | p95 ≤ 250 ms from selecting a Warehouse to that Warehouse's context being shown                                                                                                                                            | Structured server timing logs                          |
| Protected-operation throughput     | ≥ 50 Workspace operations per second per running service instance for 10 minutes                                                                                                                                           | Automated load smoke test                              |
| Lifecycle atomicity                | 100% of registration bootstrap, Warehouse creation, assigned Workspace Role deletion, Workspace Owner transfer, and Warehouse Manager transfer outcomes preserve all invariants                                            | Integration checks                                     |
| Revocation freshness               | Workspace Permission removal, Workspace Role reassignment, Warehouse membership withdrawal, and archiving affect the next authorization decision; 0 successful uses of removed authority                                   | Integration checks and structured server log review    |
| Authority staleness                | 0 authorization decisions made from Workspace Roles, Workspace Permissions, or Warehouse memberships held outside the request being authorized — each decision re-reads them from the store, never from a session or token | Automated architecture checks and integration checks   |
| Workspace authorization coverage   | 100% of user-accessible Workspace capabilities have an explicit Workspace Permission rule and Workspace ownership check                                                                                                    | Automated architecture and integration coverage checks |

## 6.1 Security / privacy

- **Data classification:** internal — Workspace, Workspace Role, and membership data is not personal data, but it reveals organizational structure and controls access to every Warehouse below it.
- **Personal data touched:** none newly introduced; the feature relates existing User identifiers to Workspace, Workspace Role, and additional Warehouse membership records.
- **AuthZ/AuthN impact:** introduces a second authorization boundary above the existing Warehouse one. Every user-accessible Workspace capability checks both a Workspace Permission and Workspace ownership; every Warehouse capability additionally becomes explicit about which Warehouse it applies to and is authorized by the membership held in that Warehouse. Authentication continues to grant no Workspace or Warehouse authority by itself.
- **Abuse cases:**
  - Cross-Workspace reach: deny any action when actor and target Workspace ownership differ, even when the actor holds the matching Workspace Permission, and do not disclose that the target exists.
  - Level confusion: a Workspace Permission never authorizes an operation inside a Warehouse and a Warehouse Permission never authorizes a Workspace capability.
  - Warehouse confusion: a request that does not unambiguously identify the Warehouse it applies to is refused rather than resolved to the actor's current selection or any other default, so authority is never borrowed from another membership. The selected Warehouse is presentation state and is never an input to an authorization decision.
  - Self-escalation through membership assignment: membership assignment into an existing Warehouse never targets the acting member, never grants the protected Warehouse Manager Role, and never creates a second Role for the same User in one Warehouse, so authority over a Warehouse that already has members is always granted by someone else. Adding a Warehouse is the one place a member takes Warehouse authority directly, because a Warehouse at the moment of its creation has no other member who could grant it; that path is bounded by requiring `WAREHOUSES:CREATE` and by the new Warehouse holding nothing.
  - Ownerless Workspace: removing a Workspace membership never removes the current Workspace Owner, who must be transferred first.
  - Owner-transfer split-brain: transfer completes only when promotion and former-owner reassignment together preserve exactly one Workspace Owner.
  - Operating in an archived Warehouse: an archived Warehouse authorizes nothing, regardless of retained memberships and Permissions.
  - Stale selection: a withdrawn membership or a newly archived Warehouse stops authorizing on the next decision even when it is still the actor's current selection, because every decision re-reads authority from the store rather than from a session or token.
  - Irreversible Warehouse access: a Warehouse membership granted through membership assignment can be withdrawn again through membership revocation, so granting site access is never a one-way door short of deleting the User.
- **Security review:** Required because the feature adds an ownership boundary above the existing authorization boundary and changes how Warehouse authority is resolved.

## 7. Metrics / KPIs

- **Cross-Workspace access incidents** — baseline: 0 under the new boundary; target: 0 at all times.
- **Workspace-invariant violations** — baseline: 0 under the new model; target: 0 Workspaces without exactly one Workspace Owner, 0 Workspace Members without exactly one Workspace Role, and 0 Warehouses without exactly one Warehouse Manager at all times.
- **Workspaces operating several Warehouses** — baseline: 0% of Workspaces contain more than one Warehouse; target: ≥10% of Workspaces contain 2 or more non-archived Warehouses within 30 days of release.
- **Valid Workspace-management completion** — baseline: 0 production operations; target: ≥99% of valid Workspace and Warehouse-lifecycle operations complete successfully during the first 30 days.
- **Visible-but-inaccessible Workspace capabilities** — baseline: not measured; target: 0 automated UI coverage failures in which a Workspace capability is presented to a User who lacks the Workspace Permission for it, and 0 support reports of the same during the first 30 days. Counted from coverage-check results and support reports, because the repository adds no telemetry.

## 8. Open questions

- [x] The approved Access spec excludes membership in multiple Warehouses as a non-goal and states one Warehouse per member as an invariant, both of which this feature reverses; the approved Users-management spec creates a User inside a Warehouse without establishing the Workspace relation that §1 now requires. Is that recorded as change requests against Access and Users-management, or amended in those artifacts in place? ~~Default now: raise a change request against each so the approved specs are superseded rather than silently edited.~~ — owner: Tech Lead, due: before `design`

      **Answer (2026-08-12):** amended **in place** with explicit, dated supersession notes, not through two change-request pipelines. A change request exists to alter intended behaviour of a feature that stays as it is; here neither approved feature is being re-implemented — `workspaces` **is** the change, and it carries the spec, design, ADRs, contract and tasks for it. Two parallel pipelines would have duplicated that record and left the question of which artifact is authoritative. The original wording is struck through rather than deleted in both specs, so the history stays readable: [`access/spec.md` §2 and §3](../access/spec.md#3-non-goals) (with [ADR 0002](./adr/0002-parallel-workspace-authority-tables.md) explaining how every approved Warehouse constraint was preserved rather than weakened) and [`users-management/spec.md` AC-01](../users-management/spec.md#ac-01-us-01--happy-path). Closes `contracts/api-sync-report.md` **F-4**.

- [x] What is a member shown as their selection when the Warehouse they had selected is archived or their membership in it is withdrawn? This is presentation only — the selection carries no authority — but the member must land somewhere coherent. ~~Default now: fall back to another membership they hold, and otherwise show them no selected Warehouse with an explanation.~~ — owner: PM, due: before `design-ui`

      **Answer (2026-08-12):** the `THE SELECTION ENDED` state on `mXHZS` (`pUVt0`), recorded in [`design-handoff.md` §Resolved here](./design-handoff.md#resolved-here). The member is told the Warehouse is no longer available to them, is left with **no** selection, is offered the switcher, and is told their other access is unchanged. This deliberately **replaces** the looser default above: the effective-selection derivation is the stored selection, else AC-03b's sole-live-membership rule, else none — falling back to "another membership they hold" when they hold several is exactly what AC-03b forbids, because it picks on the member's behalf.
