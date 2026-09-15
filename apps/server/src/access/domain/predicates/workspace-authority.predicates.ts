import { isDefined } from '@warehouser/utils/predicates';

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

// AC-26a — the outgoing Owner must end a transfer holding exactly one custom
// Workspace Role, so at least one must exist to select.
export const hasAvailableCustomWorkspaceRole = (
  customRoleCount: number,
): boolean => customRoleCount > 0;

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
): boolean => isDefined(existingMembership);

// AC-25a — never grant the acting member a membership in an existing
// Warehouse; AC-25c — never withdraw the acting member's own membership.
export const isMembershipSelfTarget = (
  actorId: string,
  targetId: string,
): boolean => actorId === targetId;

// Whether deleting this Workspace Role would strand members: it still has some. Asked of the count
// rather than compared at each site, because the deletion command asks it twice — once to require a
// replacement Role, once to decide whether the reassignment Permission is needed at all — and the
// two must not be able to drift apart.
export const hasAssignedMembers = (assignedCount: number): boolean =>
  assignedCount > 0;

// AC-25b — the ordinary Role a Warehouse Manager transfer hands the outgoing manager, and the one a
// recipient must already hold to receive the Role. Named beside the two protected kinds it is
// defined against, so "which kinds exist" is one list.
export const isCustomRoleKind = (roleKind: string): boolean =>
  roleKind === 'custom';

// AC-17/AC-24 — a Role being replaced is never its own replacement. Reassigning a Role's members to
// the Role about to be deleted leaves them exactly where they were, so the replacement the caller
// named would silently do nothing.
export const isDistinctReplacementRole = (
  replacementRoleId: string,
  sourceRoleId: string,
): boolean => replacementRoleId !== sourceRoleId;

// AC-22 — the protected Workspace Owner Role is never reached through ordinary Workspace Role
// assignment. Asked of the submitted Role against the Owner's current membership, which is absent
// when there is no Owner to protect — and then nothing is being reassigned.
export const assignsTheOwnerRole = (
  submittedWorkspaceRoleId: string,
  ownerWorkspaceRoleId: string | undefined,
): boolean => submittedWorkspaceRoleId === ownerWorkspaceRoleId;

// AC-15/AC-15a — a rename that resolves to a Role is only a conflict when that Role is a different
// one. A Role matching its own current name is being renamed to what it already holds.
export const isTheSameRole = (
  matchingRoleId: string,
  roleId: string,
): boolean => matchingRoleId === roleId;

// AC-19 — every submitted Permission identifier resolved to a catalogue row. Compared against the
// **distinct** submitted identifiers, so a payload repeating one identifier is not read as naming
// two Permissions and then found one short.
export const resolvedEverySubmittedPermission = (
  resolved: { readonly length: number },
  submittedPermissionIds: readonly string[],
): boolean => resolved.length === new Set(submittedPermissionIds).size;

// AC-20 — the Workspace membership a candidate must already hold in some Warehouse before they can
// be added to the Workspace. A command-time-only precondition, deliberately not a database
// constraint (AC-21), so the question lives here rather than in the schema.
export const holdsWarehouseMembership = (hasMembership: boolean): boolean =>
  hasMembership;
