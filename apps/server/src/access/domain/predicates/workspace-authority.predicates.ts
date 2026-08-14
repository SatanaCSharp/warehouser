/**
 * Named conditions for the Workspace authority level (AC-11a, AC-15, AC-16,
 * AC-17c, AC-18, AC-21a, AC-22, AC-25, AC-25a, AC-25c, AC-26a). Pure functions
 * only: no I/O, no mutation, no throwing. Mirrors
 * `users/domain/predicates/member-lifecycle.predicates.ts` and
 * `access/domain/services/role-deletion.service.ts`'s predicate usage.
 */

// AC-16 — the protected Workspace Owner Role is never renamed, deleted, or
// re-permissioned; AC-22 — it is never assigned/reassigned through ordinary
// Workspace Role assignment; AC-21a — its Member is never removed.
export const isProtectedWorkspaceOwnerRoleKind = (roleKind: string): boolean =>
  roleKind === 'workspace_owner';

// AC-18 — a submitted Workspace Permission must be `assignable`, not `reserved`.
export const isReservedWorkspacePermissionKind = (
  permissionKind: string,
): boolean => permissionKind === 'reserved';

// AC-18 — WORKSPACE_OWNER_ROLE:REASSIGN is reserved and can never reach a
// custom Workspace Role, independent of its catalogue `kind`.
export const isReservedWorkspaceOwnerReassignPermission = (
  permissionId: string,
): boolean => permissionId === 'WORKSPACE_OWNER_ROLE:REASSIGN';

// AC-18 — a submitted Workspace Permission identifier must exist in the
// system catalogue.
export const isKnownWorkspacePermission = (
  catalogueIds: string[],
  permissionId: string,
): boolean => catalogueIds.includes(permissionId);

// AC-15 — exact per-Workspace uniqueness; differently cased names are distinct.
export const isExactWorkspaceRoleNameConflict = (
  existingNames: string[],
  candidateName: string,
): boolean => existingNames.includes(candidateName);

// AC-17c — an assigned custom Workspace Role cannot be deleted when no
// *other* custom Workspace Role exists in the Workspace.
export const hasOtherCustomWorkspaceRole = (
  otherCustomRoleCount: number,
): boolean => otherCustomRoleCount > 0;

// AC-26a — the outgoing Owner must end a transfer holding exactly one custom
// Workspace Role, so at least one must exist to select.
export const hasAvailableCustomWorkspaceRole = (
  customRoleCount: number,
): boolean => customRoleCount > 0;

// AC-26a — the outgoing Owner ends the transfer holding exactly one
// Workspace Role, never zero and never more than one.
export const endsOwnerTransferWithExactlyOneRole = (
  selectedRoleCount: number,
): boolean => selectedRoleCount === 1;

// AC-11a — a Workspace always keeps at least one non-archived Warehouse.
export const keepsAtLeastOneNonArchivedWarehouse = (
  nonArchivedWarehouseCountAfterChange: number,
): boolean => nonArchivedWarehouseCountAfterChange > 0;

// AC-25 — membership assignment never grants the protected Warehouse Manager
// Role; AC-25c — its membership is never withdrawn through membership
// revocation.
export const isProtectedWarehouseManagerRoleKind = (
  roleKind: string,
): boolean => roleKind === 'warehouse_manager';

// AC-25 — a User holds at most one Role in any one Warehouse; membership
// assignment never grants a second membership for the same (User, Warehouse).
export const createsDuplicateWarehouseMembership = (
  existingMembership: { id: string } | null,
): boolean => existingMembership !== null;

// AC-25a — never grant the acting member a membership in an existing
// Warehouse; AC-25c — never withdraw the acting member's own membership.
export const isMembershipSelfTarget = (
  actorId: string,
  targetId: string,
): boolean => actorId === targetId;
