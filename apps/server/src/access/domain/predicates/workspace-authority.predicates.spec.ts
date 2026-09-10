import {
  createsDuplicateWarehouseMembership,
  endsOwnerTransferWithExactlyOneRole,
  hasAvailableCustomWorkspaceRole,
  hasOtherCustomWorkspaceRole,
  isExactWorkspaceRoleNameConflict,
  isKnownWorkspacePermission,
  isMembershipSelfTarget,
  isProtectedWarehouseManagerRoleKind,
  isProtectedWorkspaceOwnerRoleKind,
  isReservedWorkspaceOwnerReassignPermission,
  isReservedWorkspacePermissionKind,
  keepsAtLeastOneNonArchivedWarehouse,
} from 'access/domain/predicates/workspace-authority.predicates';
import { describe, expect, it } from 'vitest';

// T4 — these predicates and the module they live in do not exist yet. Importing
// them is the legitimate RED for this task: the implementer adds
// `access/domain/predicates/workspace-authority.predicates.ts` to turn this
// green, mirroring `users/domain/predicates/member-lifecycle.predicates.ts`.

describe('isProtectedWorkspaceOwnerRoleKind', () => {
  // AC-16 (never renamed/deleted/re-permissioned), AC-22 (never ordinarily
  // assigned/reassigned), AC-21a (its Member never removed)
  it('is true for the protected Workspace Owner Role kind', () => {
    expect(isProtectedWorkspaceOwnerRoleKind('workspace_owner')).toBe(true);
  });

  it('is false for a custom Workspace Role kind', () => {
    expect(isProtectedWorkspaceOwnerRoleKind('custom')).toBe(false);
  });
});

describe('isReservedWorkspacePermissionKind', () => {
  // AC-18 — a submitted Workspace Permission must be `assignable`, not `reserved`
  it('is true for a reserved catalogue Permission', () => {
    expect(isReservedWorkspacePermissionKind('reserved')).toBe(true);
  });

  it('is false for an assignable catalogue Permission', () => {
    expect(isReservedWorkspacePermissionKind('assignable')).toBe(false);
  });
});

describe('isReservedWorkspaceOwnerReassignPermission', () => {
  // AC-18 — WORKSPACE_OWNER_ROLE:REASSIGN is reserved and can never reach a
  // custom Workspace Role even if its catalogue `kind` were mistakenly assignable
  it('is true for the reserved owner-transfer Permission identifier', () => {
    expect(
      isReservedWorkspaceOwnerReassignPermission(
        'WORKSPACE_OWNER_ROLE:REASSIGN',
      ),
    ).toBe(true);
  });

  it('is false for any other Permission identifier', () => {
    expect(
      isReservedWorkspaceOwnerReassignPermission('WORKSPACE_ROLES:ASSIGN'),
    ).toBe(false);
  });
});

describe('isKnownWorkspacePermission', () => {
  // AC-18 — a submitted identifier must exist in the system catalogue
  const catalogueIds = ['WORKSPACE:RENAME', 'WORKSPACE_ROLES:ASSIGN'];

  it('is true when the identifier exists in the catalogue', () => {
    expect(isKnownWorkspacePermission(catalogueIds, 'WORKSPACE:RENAME')).toBe(
      true,
    );
  });

  it('is false for an identifier absent from the catalogue', () => {
    expect(
      isKnownWorkspacePermission(catalogueIds, 'WORKSPACE:DOES_NOT_EXIST'),
    ).toBe(false);
  });
});

describe('isExactWorkspaceRoleNameConflict', () => {
  // AC-15 — exact per-Workspace uniqueness; differently cased names are distinct
  const existingNames = ['Auditor', 'Stock Clerk'];

  it('is true for an exact, byte-identical name already used in the Workspace', () => {
    expect(isExactWorkspaceRoleNameConflict(existingNames, 'Auditor')).toBe(
      true,
    );
  });

  it('is false for a differently cased name, which remains distinct', () => {
    expect(isExactWorkspaceRoleNameConflict(existingNames, 'auditor')).toBe(
      false,
    );
  });

  it('is false for a name not used in the Workspace', () => {
    expect(
      isExactWorkspaceRoleNameConflict(existingNames, 'Receiving Clerk'),
    ).toBe(false);
  });
});

describe('hasOtherCustomWorkspaceRole', () => {
  // AC-17c — an assigned custom Role cannot be deleted when no *other* custom
  // Role exists in the Workspace
  it('is true when at least one other custom Workspace Role exists', () => {
    expect(hasOtherCustomWorkspaceRole(1)).toBe(true);
  });

  it('is false when the assigned Role is the only custom Workspace Role', () => {
    expect(hasOtherCustomWorkspaceRole(0)).toBe(false);
  });
});

describe('hasAvailableCustomWorkspaceRole', () => {
  // AC-26a — the outgoing Owner must end a transfer holding exactly one custom
  // Workspace Role, so at least one must exist to select
  it('is true when a custom Workspace Role exists for the outgoing Owner to receive', () => {
    expect(hasAvailableCustomWorkspaceRole(1)).toBe(true);
  });

  it('is false when the Workspace has no custom Workspace Role at all', () => {
    expect(hasAvailableCustomWorkspaceRole(0)).toBe(false);
  });
});

describe('endsOwnerTransferWithExactlyOneRole', () => {
  // AC-26a — the outgoing Owner ends the transfer holding exactly one Workspace
  // Role, never zero and never more than one
  it('is true when exactly one Workspace Role is selected for the outgoing Owner', () => {
    expect(endsOwnerTransferWithExactlyOneRole(1)).toBe(true);
  });

  it('is false when no Workspace Role is selected', () => {
    expect(endsOwnerTransferWithExactlyOneRole(0)).toBe(false);
  });
});

describe('keepsAtLeastOneNonArchivedWarehouse', () => {
  // AC-11a — a Workspace always keeps at least one non-archived Warehouse
  it('is true when at least one Warehouse remains non-archived after the change', () => {
    expect(keepsAtLeastOneNonArchivedWarehouse(1)).toBe(true);
  });

  it('is false when archiving would leave zero non-archived Warehouses', () => {
    expect(keepsAtLeastOneNonArchivedWarehouse(0)).toBe(false);
  });
});

describe('isProtectedWarehouseManagerRoleKind', () => {
  // AC-25 — membership assignment never grants the protected Warehouse Manager
  // Role; AC-25c — its membership is never withdrawn through membership revocation
  it('is true for the protected Warehouse Manager Role kind', () => {
    expect(isProtectedWarehouseManagerRoleKind('warehouse_manager')).toBe(true);
  });

  it('is false for a custom Warehouse Role kind', () => {
    expect(isProtectedWarehouseManagerRoleKind('custom')).toBe(false);
  });
});

describe('createsDuplicateWarehouseMembership', () => {
  // AC-25 — a User holds at most one Role in any one Warehouse; membership
  // assignment never grants a second membership for the same (User, Warehouse)
  it('is true when the target already holds a membership in that Warehouse', () => {
    expect(createsDuplicateWarehouseMembership({ id: 'existing' })).toBe(true);
  });

  it('is false when the target holds no membership in that Warehouse', () => {
    expect(createsDuplicateWarehouseMembership(null)).toBe(false);
  });
});

describe('isMembershipSelfTarget', () => {
  const actorId = '00000000-0000-4000-8000-000000000001';
  const targetId = '00000000-0000-4000-8000-000000000002';

  // AC-25a — never grant the acting member a membership in an existing
  // Warehouse; AC-25c — never withdraw the acting member's own membership
  it('is true when the acting member is the target', () => {
    expect(isMembershipSelfTarget(actorId, actorId)).toBe(true);
  });

  it('is false when the target is a different Warehouse Member', () => {
    expect(isMembershipSelfTarget(actorId, targetId)).toBe(false);
  });
});
