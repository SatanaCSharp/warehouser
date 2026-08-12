import {
  ErrorCode,
  WorkspacePermissionId,
} from '@warehouser/shared-types/enums';
import type { WorkspaceCurrentUser } from 'shared/access/workspace-current-user';
import {
  TRANSACTIONAL_KEY,
  type TransactionalMetadata,
} from 'shared/decorators/transactional.decorator';
import type { WorkspaceMembershipRepository } from 'shared/domain/repositories/workspace-membership.repository';
import type { WorkspaceOwnerTransferRepository } from 'shared/domain/repositories/workspace-owner-transfer.repository';
import type { WorkspaceRoleLifecycleRepository } from 'shared/domain/repositories/workspace-role-lifecycle.repository';
// `TransferWorkspaceOwnerCommand` does not exist yet (T19) — this is the RED
// for the command-level half of AC-27 (spec.md): only the current Workspace
// Owner holding the protected `WORKSPACE_OWNER_ROLE:REASSIGN` Permission may
// ever reach `WorkspaceOwnerTransferRepository.transfer`, mirroring
// `TransferWarehouseManagerCommand`'s `currentUser.roleKind` guard one level
// down (access/usecases/commands/transfer-warehouse-manager.command.ts).
// `WorkspaceAccessGuard` already enforces the decorated Permission at the
// REST boundary (unit-tested there, contract-tested at the endpoint), so
// this command-level check is the defense-in-depth half appropriate for a
// protected-Role transfer (data-model.md "Repository boundaries": Owner
// transfer split-brain is named as an abuse case in spec.md §6.1). AC-26,
// AC-26a and AC-28 all need real persisted rows to prove atomicity and
// cross-Workspace targeting, so those are covered at integration level per
// test-plan.md's chosen level for those rows.
import { TransferWorkspaceOwnerCommand } from 'workspaces/usecases/commands/transfer-workspace-owner.command';

const workspaceId = '00000000-0000-4000-8000-000000000001';
const actorId = '00000000-0000-4000-8000-000000000002';
const ownerRoleId = '00000000-0000-4000-8000-000000000003';
const customRoleId = '00000000-0000-4000-8000-000000000004';
const recipientId = '00000000-0000-4000-8000-000000000005';
const replacementRoleId = '00000000-0000-4000-8000-000000000006';

const ownerCurrentUser = (
  permissionId: WorkspacePermissionId = WorkspacePermissionId.WORKSPACE_OWNER_ROLE_REASSIGN,
): WorkspaceCurrentUser => ({
  userId: actorId,
  workspaceId,
  workspaceRoleId: ownerRoleId,
  workspaceRoleKind: 'workspace_owner',
  permissionId,
});

const nonOwnerCurrentUser = (): WorkspaceCurrentUser => ({
  userId: actorId,
  workspaceId,
  workspaceRoleId: customRoleId,
  workspaceRoleKind: 'custom',
  // Reserved Permissions never reach a custom Role in practice (AC-18), but
  // the command must not rely on that invariant alone for its own denial —
  // it re-checks `workspaceRoleKind` itself, exactly as
  // `TransferWarehouseManagerCommand` re-checks `roleKind` one level down.
  permissionId: WorkspacePermissionId.WORKSPACE_OWNER_ROLE_REASSIGN,
});

// Doubles default to the fully valid AC-26 arrangement: the selected
// replacement Role is a custom Role of this Workspace, the recipient is a
// User of this same Workspace, and the locked repository transfer applies.
// Each denial test below invalidates exactly one of those, so the assertion
// it makes is the only reason the transfer is refused.
const repositoryDoubles = () => ({
  ownerTransferRepository: {
    transfer: jest.fn().mockResolvedValue(true),
  } as unknown as WorkspaceOwnerTransferRepository,
  membershipRepository: {
    findUserWorkspaceId: jest.fn().mockResolvedValue(workspaceId),
    lockMembership: jest.fn(),
    lockOwnerMembership: jest.fn(),
  } as unknown as WorkspaceMembershipRepository,
  roleLifecycleRepository: {
    findCustomRole: jest.fn().mockResolvedValue({
      id: replacementRoleId,
      workspaceId,
      kind: 'custom',
    }),
  } as unknown as WorkspaceRoleLifecycleRepository,
});

const validInput = {
  recipientUserId: recipientId,
  currentOwnerReplacementRoleId: replacementRoleId,
};

describe('TransferWorkspaceOwnerCommand', () => {
  it('AC-27: denies an actor who is not the current Workspace Owner, never reaching the repository transfer', async () => {
    const repos = repositoryDoubles();
    const command = new TransferWorkspaceOwnerCommand(
      repos.ownerTransferRepository,
      repos.membershipRepository,
      repos.roleLifecycleRepository,
    );

    await expect(
      command.execute(nonOwnerCurrentUser(), {
        recipientUserId: recipientId,
        currentOwnerReplacementRoleId: replacementRoleId,
      }),
    ).rejects.toMatchObject({ code: ErrorCode.WORKSPACE_DENIED });

    expect(repos.ownerTransferRepository.transfer).not.toHaveBeenCalled();
  });

  it('AC-27: denies the current Owner when they lack WORKSPACE_OWNER_ROLE:REASSIGN, never reaching the repository transfer', async () => {
    const repos = repositoryDoubles();
    const command = new TransferWorkspaceOwnerCommand(
      repos.ownerTransferRepository,
      repos.membershipRepository,
      repos.roleLifecycleRepository,
    );

    await expect(
      command.execute(
        ownerCurrentUser(WorkspacePermissionId.WORKSPACE_MEMBERS_ADD),
        {
          recipientUserId: recipientId,
          currentOwnerReplacementRoleId: replacementRoleId,
        },
      ),
    ).rejects.toMatchObject({ code: ErrorCode.WORKSPACE_DENIED });

    expect(repos.ownerTransferRepository.transfer).not.toHaveBeenCalled();
  });

  it('AC-26: hands the locked repository transfer the current Owner, the recipient and both Roles, and reports the recipient as the new Owner', async () => {
    const repos = repositoryDoubles();
    const command = new TransferWorkspaceOwnerCommand(
      repos.ownerTransferRepository,
      repos.membershipRepository,
      repos.roleLifecycleRepository,
    );

    await expect(
      command.execute(ownerCurrentUser(), validInput),
    ).resolves.toEqual({ ownerId: recipientId });

    // Promotion and reassignment are one repository operation, never two
    // calls this command could half-apply (spec.md §6.1's owner-transfer
    // split-brain abuse case).
    expect(repos.ownerTransferRepository.transfer).toHaveBeenCalledTimes(1);
    expect(repos.ownerTransferRepository.transfer).toHaveBeenCalledWith({
      workspaceId,
      currentOwnerUserId: actorId,
      currentOwnerReplacementRoleId: replacementRoleId,
      recipientUserId: recipientId,
      ownerRoleId,
    });
  });

  it('AC-26a: denies the transfer when no custom Workspace Role of this Workspace is selectable for the outgoing Owner, never reaching the repository transfer', async () => {
    const repos = repositoryDoubles();
    // `findCustomRole` is scoped to `(workspaceId, roleId, kind: 'custom')`,
    // so `null` covers a Workspace with no custom Role at all, a Role of
    // another Workspace, and the protected Owner Role — all of which leave
    // the outgoing Owner without exactly one custom Role to land in.
    (
      repos.roleLifecycleRepository.findCustomRole as jest.Mock
    ).mockResolvedValue(null);
    const command = new TransferWorkspaceOwnerCommand(
      repos.ownerTransferRepository,
      repos.membershipRepository,
      repos.roleLifecycleRepository,
    );

    await expect(
      command.execute(ownerCurrentUser(), validInput),
    ).rejects.toMatchObject({
      code: ErrorCode.WORKSPACE_REPLACEMENT_ROLE_REQUIRED,
    });

    expect(repos.roleLifecycleRepository.findCustomRole).toHaveBeenCalledWith(
      workspaceId,
      replacementRoleId,
    );
    expect(repos.ownerTransferRepository.transfer).not.toHaveBeenCalled();
  });

  it('AC-26a: is refused for the missing custom Role before the recipient is even considered, because a Workspace with no custom Role has no eligible recipient either', async () => {
    const repos = repositoryDoubles();
    (
      repos.roleLifecycleRepository.findCustomRole as jest.Mock
    ).mockResolvedValue(null);
    (
      repos.membershipRepository.findUserWorkspaceId as jest.Mock
    ).mockResolvedValue(null);
    const command = new TransferWorkspaceOwnerCommand(
      repos.ownerTransferRepository,
      repos.membershipRepository,
      repos.roleLifecycleRepository,
    );

    // Every Workspace membership carries exactly one Workspace Role, so a
    // Workspace holding only the protected Owner Role has no non-Owner
    // Member to receive ownership. AC-26a is reachable at all only when the
    // replacement-Role precondition is checked ahead of recipient targeting,
    // which is what this pins.
    await expect(
      command.execute(ownerCurrentUser(), validInput),
    ).rejects.toMatchObject({
      code: ErrorCode.WORKSPACE_REPLACEMENT_ROLE_REQUIRED,
    });

    expect(repos.ownerTransferRepository.transfer).not.toHaveBeenCalled();
  });

  it('AC-28: denies the Owner selecting themself as the recipient, never reaching the repository transfer', async () => {
    const repos = repositoryDoubles();
    const command = new TransferWorkspaceOwnerCommand(
      repos.ownerTransferRepository,
      repos.membershipRepository,
      repos.roleLifecycleRepository,
    );

    await expect(
      command.execute(ownerCurrentUser(), {
        ...validInput,
        recipientUserId: actorId,
      }),
    ).rejects.toMatchObject({ code: ErrorCode.WORKSPACE_SELF_ACTION_DENIED });

    expect(repos.ownerTransferRepository.transfer).not.toHaveBeenCalled();
  });

  it('AC-28: denies a recipient who is no Workspace Member at all, never reaching the repository transfer', async () => {
    const repos = repositoryDoubles();
    (
      repos.membershipRepository.findUserWorkspaceId as jest.Mock
    ).mockResolvedValue(null);
    const command = new TransferWorkspaceOwnerCommand(
      repos.ownerTransferRepository,
      repos.membershipRepository,
      repos.roleLifecycleRepository,
    );

    await expect(
      command.execute(ownerCurrentUser(), validInput),
    ).rejects.toMatchObject({ code: ErrorCode.WORKSPACE_TARGET_UNAVAILABLE });

    expect(repos.ownerTransferRepository.transfer).not.toHaveBeenCalled();
  });

  it('AC-28: denies a recipient belonging to another Workspace with the same code as a missing one, never reaching the repository transfer', async () => {
    const repos = repositoryDoubles();
    (
      repos.membershipRepository.findUserWorkspaceId as jest.Mock
    ).mockResolvedValue('00000000-0000-4000-8000-0000000000ff');
    const command = new TransferWorkspaceOwnerCommand(
      repos.ownerTransferRepository,
      repos.membershipRepository,
      repos.roleLifecycleRepository,
    );

    // Indistinguishable from the nonmember case above: a cross-Workspace
    // recipient must not be disclosed to exist (spec.md §6.1).
    await expect(
      command.execute(ownerCurrentUser(), validInput),
    ).rejects.toMatchObject({ code: ErrorCode.WORKSPACE_TARGET_UNAVAILABLE });

    expect(repos.ownerTransferRepository.transfer).not.toHaveBeenCalled();
  });

  it('maps a losing concurrent transfer to the stable concurrency error rather than reporting a new Owner', async () => {
    const repos = repositoryDoubles();
    // The repository re-checks both memberships' composite Role relations
    // under its own locks and reports `false` when a racing transfer already
    // moved them; exactly one Owner survives either way.
    (repos.ownerTransferRepository.transfer as jest.Mock).mockResolvedValue(
      false,
    );
    const command = new TransferWorkspaceOwnerCommand(
      repos.ownerTransferRepository,
      repos.membershipRepository,
      repos.roleLifecycleRepository,
    );

    await expect(
      command.execute(ownerCurrentUser(), validInput),
    ).rejects.toMatchObject({ code: ErrorCode.WORKSPACE_CONCURRENT_CHANGE });
  });

  it('runs inside its own transaction boundary (server-architecture.md: the command owning the complete atomic operation)', () => {
    expect(
      Reflect.getMetadata(
        TRANSACTIONAL_KEY,
        TransferWorkspaceOwnerCommand.prototype.execute,
      ) as TransactionalMetadata | undefined,
    ).toBeDefined();
  });
});
