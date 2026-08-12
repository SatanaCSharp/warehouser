import { ErrorCode } from '@warehouser/shared-types/enums';
import { ApplicationError } from '@warehouser/shared-types/errors';

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

// Cross-Workspace targeting: a target outside `principal.workspaceId` must
// be indistinguishable from a missing target, so this single, argument-free
// factory serves both call sites — two independent calls always serialize
// identically, so neither discloses existence (AC-10, AC-24, AC-25d, AC-34).
export const workspaceTargetUnavailableError = (): ApplicationError =>
  new ApplicationError(ErrorCode.WORKSPACE_TARGET_UNAVAILABLE);
