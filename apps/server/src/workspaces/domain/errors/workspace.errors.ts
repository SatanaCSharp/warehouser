import { ErrorCode } from '@warehouser/shared-types/enums';
import { ApplicationError, SystemError } from '@warehouser/shared-types/errors';

// AC-16 — the protected Workspace Owner Role is never renamed, deleted, or
// re-permissioned.
export const workspaceProtectedRoleError = (): ApplicationError =>
  new ApplicationError(ErrorCode.WORKSPACE_PROTECTED_ROLE);

// AC-18 — an unknown, reserved, or edited Workspace Permission is refused.
export const workspaceSystemManagedPermissionError = (): ApplicationError =>
  new ApplicationError(ErrorCode.WORKSPACE_SYSTEM_MANAGED_PERMISSION);

// AC-15 — exact per-Workspace Workspace Role name uniqueness.
export const workspaceRoleNameConflictError = (): ApplicationError =>
  new ApplicationError(ErrorCode.WORKSPACE_ROLE_NAME_CONFLICT);

// AC-17c (no other custom Role to replace the deleted one) and AC-26a (no
// custom Role for the outgoing Owner to receive) share this factory,
// mirroring the single `workspace.replacement_role_required` code.
export const workspaceReplacementRoleRequiredError = (): ApplicationError =>
  new ApplicationError(ErrorCode.WORKSPACE_REPLACEMENT_ROLE_REQUIRED);

// AC-21a (Owner's Workspace membership never removed) and AC-22 (Owner never
// assigned/reassigned through ordinary Role assignment) share this factory.
export const workspaceOwnerTransferRequiredError = (): ApplicationError =>
  new ApplicationError(ErrorCode.WORKSPACE_OWNER_TRANSFER_REQUIRED);

// AC-25a (self-assignment) and AC-25c (own withdrawal) share this factory.
export const workspaceSelfActionDeniedError = (): ApplicationError =>
  new ApplicationError(ErrorCode.WORKSPACE_SELF_ACTION_DENIED);

// AC-25 (Manager Role never granted through membership assignment) and
// AC-25c (Manager's membership never withdrawn through membership
// revocation) share this factory.
export const workspaceManagerTransferRequiredError = (): ApplicationError =>
  new ApplicationError(ErrorCode.WORKSPACE_MANAGER_TRANSFER_REQUIRED);

// AC-25 — a User holds at most one Role in any one Warehouse.
export const workspaceMembershipExistsError = (): ApplicationError =>
  new ApplicationError(ErrorCode.WORKSPACE_MEMBERSHIP_EXISTS);

// AC-11a — a Workspace always keeps at least one non-archived Warehouse.
export const workspaceLastUnarchivedWarehouseError = (): ApplicationError =>
  new ApplicationError(ErrorCode.WORKSPACE_LAST_UNARCHIVED_WAREHOUSE);

// AC-17d — deleting an *assigned* Workspace Role requires
// `WORKSPACE_ROLES:ASSIGN` in addition to `WORKSPACE_ROLES:DELETE`, since
// moving every affected Member is itself an assignment; an unassigned Role
// stays deletable with `WORKSPACE_ROLES:DELETE` alone.
export const workspaceRoleAssignmentRequiredError = (): ApplicationError =>
  new ApplicationError(ErrorCode.WORKSPACE_ROLE_ASSIGNMENT_REQUIRED);

// AC-19/F-3 — a candidate who already holds a Workspace membership is
// refused with this cause-specific code, distinct from AC-20's
// `workspaceWarehouseMembershipRequiredError`.
export const workspaceMemberExistsError = (): ApplicationError =>
  new ApplicationError(ErrorCode.WORKSPACE_MEMBER_EXISTS);

// AC-20 — a candidate with no Warehouse membership in any Warehouse of this
// Workspace is refused with this cause-specific code, distinct from the
// already-a-Member case above (F-3).
export const workspaceWarehouseMembershipRequiredError = (): ApplicationError =>
  new ApplicationError(ErrorCode.WORKSPACE_WAREHOUSE_MEMBERSHIP_REQUIRED);

// AC-26 — the database's `uq_workspace_memberships_one_owner` constraint and
// `WorkspaceOwnerTransferRepository.transfer`'s own precondition recheck are
// the final arbiters when two Owner transfers race; the loser is mapped to
// this stable, retriable code rather than an opaque persistence failure.
export const workspaceConcurrentChangeError = (): ApplicationError =>
  new ApplicationError(ErrorCode.WORKSPACE_CONCURRENT_CHANGE);

// AC-07/AC-13 — T43. The Warehouse row write (creation) fails for a known
// infrastructure/technical reason (server-error-handling.md §2), not a
// business rejection, so this is a `SystemError`, matching openapi.yaml's
// documented 503 `workspace.warehouse_creation_unavailable` and mirroring
// `global-http-exception.filter.ts`'s `systemErrors` registration for this
// code (an `ApplicationError` would fall through to the generic 500).
export const workspaceWarehouseCreationUnavailableError = (
  cause: unknown,
): SystemError =>
  new SystemError(ErrorCode.WORKSPACE_WAREHOUSE_CREATION_UNAVAILABLE, cause);

// AC-13 — the archival/restoration write fails for a known
// infrastructure/technical reason (server-error-handling.md §2), so this is
// a `SystemError`, matching openapi.yaml's documented 503
// `workspace.archival_unavailable` and mirroring
// `global-http-exception.filter.ts`'s `systemErrors` registration for this
// code (an `ApplicationError` would fall through to the generic 500).
export const workspaceArchivalUnavailableError = (
  cause: unknown,
): SystemError =>
  new SystemError(ErrorCode.WORKSPACE_ARCHIVAL_UNAVAILABLE, cause);

// AC-17b — the Role deletion (reassigning every affected Member, then
// removing the Role) fails for a known infrastructure/technical reason
// (server-error-handling.md §2), so this is a `SystemError`, matching
// openapi.yaml's documented 503 `workspace.role_deletion_unavailable`. AC-17b
// promises that the Role and its assignments are then unchanged — one
// transaction guarantees it, and the generic 500 this replaces could not say
// so.
export const workspaceRoleDeletionUnavailableError = (
  cause: unknown,
): SystemError =>
  new SystemError(ErrorCode.WORKSPACE_ROLE_DELETION_UNAVAILABLE, cause);

// AC-26 — the Owner swap fails for a known infrastructure/technical reason
// (server-error-handling.md §2), so this is a `SystemError`, matching
// openapi.yaml's documented 503 `workspace.owner_transfer_unavailable`.
// Distinct from `workspaceConcurrentChangeError()`: a lost race is a
// retriable *business* outcome with its own 409, while this names a
// technical failure of the attempt itself. Exactly one current Workspace
// Owner survives either way.
export const workspaceOwnerTransferUnavailableError = (
  cause: unknown,
): SystemError =>
  new SystemError(ErrorCode.WORKSPACE_OWNER_TRANSFER_UNAVAILABLE, cause);
