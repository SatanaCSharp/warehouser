import { ErrorCode } from '@warehouser/shared-types/enums';
import { SystemError } from '@warehouser/shared-types/errors';
import {
  workspaceArchivalUnavailableError,
  workspaceLastUnarchivedWarehouseError,
  workspaceManagerTransferRequiredError,
  workspaceMembershipExistsError,
  workspaceOwnerTransferRequiredError,
  workspaceProtectedRoleError,
  workspaceReplacementRoleRequiredError,
  workspaceRoleNameConflictError,
  workspaceSelfActionDeniedError,
  workspaceSystemManagedPermissionError,
  workspaceTargetUnavailableError,
  workspaceWarehouseCreationUnavailableError,
} from 'workspaces/domain/errors/workspace.errors';

// T4 — neither this error-factory module nor the `ErrorCode.WORKSPACE_*` entries
// it depends on exist yet (the latter land with T5, `packages/shared-types`,
// concurrently). Both are legitimate compile-time RED for this task: the
// implementer adds `workspaces/domain/errors/workspace.errors.ts` following the
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

  // AC-11a — a Workspace always keeps at least one non-archived Warehouse
  it('builds a stable, code-carrying error for the last non-archived Warehouse', () => {
    expect(workspaceLastUnarchivedWarehouseError()).toMatchObject({
      code: ErrorCode.WORKSPACE_LAST_UNARCHIVED_WAREHOUSE,
    });
  });

  // Cross-Workspace targeting: a target outside `principal.workspaceId` must be
  // indistinguishable from a missing target, so this is the one factory used for
  // both. This test proves that byte-identity structurally: it takes no
  // arguments that could leak which case triggered it, so two independent calls
  // from the two call sites always serialize identically — neither discloses
  // existence.
  it('produces a byte-identical error whether the target is missing or belongs to another Workspace', () => {
    const missingTargetError = workspaceTargetUnavailableError();
    const crossWorkspaceTargetError = workspaceTargetUnavailableError();

    expect(missingTargetError.code).toBe(
      ErrorCode.WORKSPACE_TARGET_UNAVAILABLE,
    );
    expect(JSON.stringify(missingTargetError)).toBe(
      JSON.stringify(crossWorkspaceTargetError),
    );
    expect(missingTargetError.message).toBe(crossWorkspaceTargetError.message);
    expect(missingTargetError.stack?.split('\n')[0]).toBe(
      crossWorkspaceTargetError.stack?.split('\n')[0],
    );
  });

  // AC-07/AC-13 — T43. server-error-handling.md §2 classifies "a known
  // infrastructure or technical failure" as a `SystemError`, not an
  // `ApplicationError`; `workspace.warehouse_creation_unavailable` /
  // `workspace.archival_unavailable` are registered only in
  // `global-http-exception.filter.ts`'s `systemErrors` map (503), mirroring
  // the live `AuthRegistrationUnavailableError` precedent
  // (auth/domain/errors/auth.errors.ts) — an `ApplicationError` with either
  // code would fall through `applicationErrors` (undefined) to the generic
  // 500, not the documented 503. Both factories must therefore construct a
  // `SystemError` and preserve the originating repository failure as `cause`
  // (§3 "Preserve an originating technical failure as `cause`").
  it('builds a SystemError for an unavailable Warehouse creation write, preserving the cause', () => {
    const cause = new Error('write timed out');
    const error = workspaceWarehouseCreationUnavailableError(cause);

    expect(error).toBeInstanceOf(SystemError);
    expect(error).toMatchObject({
      code: ErrorCode.WORKSPACE_WAREHOUSE_CREATION_UNAVAILABLE,
      cause,
    });
  });

  it('builds a SystemError for an unavailable archival/restoration write, preserving the cause', () => {
    const cause = new Error('connection reset');
    const error = workspaceArchivalUnavailableError(cause);

    expect(error).toBeInstanceOf(SystemError);
    expect(error).toMatchObject({
      code: ErrorCode.WORKSPACE_ARCHIVAL_UNAVAILABLE,
      cause,
    });
  });
});
