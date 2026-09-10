import { ErrorCode } from '@warehouser/shared-types/enums';
import {
  workspaceManagerTransferRequiredError,
  workspaceMembershipExistsError,
  workspaceOwnerTransferRequiredError,
  workspaceProtectedRoleError,
  workspaceReplacementRoleRequiredError,
  workspaceRoleNameConflictError,
  workspaceSelfActionDeniedError,
  workspaceSystemManagedPermissionError,
} from 'access/domain/errors/workspace-access.errors.js';
import { describe, expect, it } from 'vitest';

// T4 — neither this error-factory module nor the `ErrorCode.WORKSPACE_*` entries
// it depends on exist yet (the latter land with T5, `packages/shared-types`,
// concurrently). Both are legitimate compile-time RED for this task: the
// implementer adds `access/domain/errors/workspace-access.errors.ts` following the
// named-factory convention in `access/domain/errors/access.errors.ts`.

describe('workspace domain error factories', () => {
  // AC-16 — the protected Workspace Owner Role is never renamed, deleted, or
  // re-permissioned
  it('builds a stable, code-carrying error for the protected Owner Role', () => {
    expect(workspaceProtectedRoleError()).toMatchObject({
      code: ErrorCode.WORKSPACE_PROTECTED_ROLE,
    });
  });

  // AC-18 — an unknown, reserved, or edited Workspace Permission is refused
  it('builds a stable, code-carrying error for a system-managed Permission violation', () => {
    expect(workspaceSystemManagedPermissionError()).toMatchObject({
      code: ErrorCode.WORKSPACE_SYSTEM_MANAGED_PERMISSION,
    });
  });

  // AC-15 — exact per-Workspace Workspace Role name uniqueness
  it('builds a stable, code-carrying error for a Workspace Role name conflict', () => {
    expect(workspaceRoleNameConflictError()).toMatchObject({
      code: ErrorCode.WORKSPACE_ROLE_NAME_CONFLICT,
    });
  });

  // AC-17c (no other custom Role to replace the deleted one) and AC-26a (no
  // custom Role for the outgoing Owner to receive) share this factory, mirroring
  // the single `workspace.replacement_role_required` code in the API contract
  it('builds a stable, code-carrying error for a missing replacement/available custom Role', () => {
    expect(workspaceReplacementRoleRequiredError()).toMatchObject({
      code: ErrorCode.WORKSPACE_REPLACEMENT_ROLE_REQUIRED,
    });
  });

  // AC-21a (Owner's Workspace membership never removed) and AC-22 (Owner never
  // assigned/reassigned through ordinary Role assignment) share this factory
  it('builds a stable, code-carrying error for an Owner-transfer-required violation', () => {
    expect(workspaceOwnerTransferRequiredError()).toMatchObject({
      code: ErrorCode.WORKSPACE_OWNER_TRANSFER_REQUIRED,
    });
  });

  // AC-25a (self-assignment) and AC-25c (own withdrawal) share this factory
  it('builds a stable, code-carrying error for a self-action violation', () => {
    expect(workspaceSelfActionDeniedError()).toMatchObject({
      code: ErrorCode.WORKSPACE_SELF_ACTION_DENIED,
    });
  });

  // AC-25 (Manager Role never granted through membership assignment) and AC-25c
  // (Manager's membership never withdrawn through membership revocation) share
  // this factory
  it('builds a stable, code-carrying error for a protected Manager-transfer violation', () => {
    expect(workspaceManagerTransferRequiredError()).toMatchObject({
      code: ErrorCode.WORKSPACE_MANAGER_TRANSFER_REQUIRED,
    });
  });

  // AC-25 — a User holds at most one Role in any one Warehouse
  it('builds a stable, code-carrying error for a duplicate Warehouse membership', () => {
    expect(workspaceMembershipExistsError()).toMatchObject({
      code: ErrorCode.WORKSPACE_MEMBERSHIP_EXISTS,
    });
  });
});
