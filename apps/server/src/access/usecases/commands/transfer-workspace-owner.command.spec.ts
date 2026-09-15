import {
  ErrorCode,
  WorkspacePermissionId,
} from '@warehouser/shared-types/enums';
import { ApplicationError } from '@warehouser/shared-types/errors';
import { TransferWorkspaceOwnerCommand } from 'access/usecases/commands/transfer-workspace-owner.command';
import type { WorkspaceCurrentUser } from 'shared/access/workspace-current-user';
import { describe, expect, it, vi } from 'vitest';

const workspaceId = '00000000-0000-4000-8000-000000000001';
const ownerId = '00000000-0000-4000-8000-000000000002';
const recipientId = '00000000-0000-4000-8000-000000000003';
const ownerRoleId = '00000000-0000-4000-8000-000000000004';
const replacementRoleId = '00000000-0000-4000-8000-000000000005';

const currentUser = (): WorkspaceCurrentUser => ({
  userId: ownerId,
  workspaceId,
  workspaceRoleId: ownerRoleId,
  workspaceRoleKind: 'workspace_owner',
  permissionId: WorkspacePermissionId.WORKSPACE_OWNER_ROLE_REASSIGN,
});

const ownerTransferDouble = () => ({
  transfer: vi.fn().mockResolvedValue(true),
});

const membershipDouble = () => ({
  findMembershipWorkspaceId: vi.fn().mockResolvedValue(workspaceId),
});

const roleLifecycleDouble = () => ({
  findCustomRole: vi
    .fn()
    .mockResolvedValue({ id: replacementRoleId, workspaceId, kind: 'custom' }),
});

const build = (
  ownerTransfer = ownerTransferDouble(),
  membership = membershipDouble(),
  roleLifecycle = roleLifecycleDouble(),
): TransferWorkspaceOwnerCommand =>
  new TransferWorkspaceOwnerCommand(
    ownerTransfer as never,
    membership as never,
    roleLifecycle as never,
  );

const input = {
  recipientUserId: recipientId,
  currentOwnerReplacementRoleId: replacementRoleId,
};

describe('TransferWorkspaceOwnerCommand', () => {
  // RED for T58/AC-28 (review S1-09) — contracts/openapi.yaml documents ONE
  // generic 404 `workspace.target_unavailable` covering all three
  // unavailable-recipient cases: "The recipient is the actor, is not a
  // Workspace Member, or is a Workspace Member of another Workspace ... so
  // membership of another Workspace is never disclosed."
  //
  // Two divergences broke that. A self-target raised 409
  // `workspace.self_action_denied`, a code the route does not document. And
  // membership was tested with `findUserWorkspaceId`, which reads
  // `users.workspace_id` — a User can carry that column while holding no
  // `workspace_memberships` row at all (a Warehouse Member who is no
  // Workspace Member), so a permanently invalid recipient passed the check
  // and surfaced as 409 `workspace.concurrent_change`, telling the Owner to
  // retry something that can never succeed.
  it.each([
    [
      'the actor themself',
      (): TransferWorkspaceOwnerCommand => build(),
      {
        recipientUserId: ownerId,
        currentOwnerReplacementRoleId: replacementRoleId,
      },
    ],
    [
      'a User holding no Workspace membership',
      (): TransferWorkspaceOwnerCommand => {
        const membership = membershipDouble();
        membership.findMembershipWorkspaceId.mockResolvedValueOnce(null);
        return build(ownerTransferDouble(), membership);
      },
      input,
    ],
    [
      'a Workspace Member of another Workspace',
      (): TransferWorkspaceOwnerCommand => {
        const membership = membershipDouble();
        membership.findMembershipWorkspaceId.mockResolvedValueOnce(
          '00000000-0000-4000-8000-0000000000ff',
        );
        return build(ownerTransferDouble(), membership);
      },
      input,
    ],
  ])(
    'AC-28: answers one generic unavailable-recipient outcome for %s',
    async (_case, arrange, transferInput) => {
      const rejection = arrange().execute(currentUser(), transferInput);

      await expect(rejection).rejects.toBeInstanceOf(ApplicationError);
      await expect(rejection).rejects.toMatchObject({
        code: ErrorCode.WORKSPACE_TARGET_UNAVAILABLE,
      });
    },
  );

  // The membership test must read `workspace_memberships`, not
  // `users.workspace_id`: only the former proves the recipient can hold the
  // Owner Role at all.
  it('AC-28: tests recipient membership against the Workspace membership rows', async () => {
    const membership = membershipDouble();
    await build(ownerTransferDouble(), membership).execute(
      currentUser(),
      input,
    );

    expect(membership.findMembershipWorkspaceId).toHaveBeenCalledWith(
      recipientId,
    );
  });

  // An infrastructure failure performing the swap propagates untouched — the
  // command never reclassifies it — and the global exception filter is the
  // single boundary that maps it (server-error-handling.md §2 and §6).
  it('AC-26: propagates an infrastructure failure performing the swap unchanged', async () => {
    const ownerTransfer = ownerTransferDouble();
    const failure = new Error('connection terminated');
    ownerTransfer.transfer.mockRejectedValueOnce(failure);
    const command = build(ownerTransfer);

    await expect(command.execute(currentUser(), input)).rejects.toBe(failure);
  });

  // A lost race is a retriable business outcome with its own documented 409,
  // and a missing replacement Role is a permanent 400. Each keeps its own
  // code (server-error-handling.md §2).
  it.each([
    [
      'a losing concurrent transfer (AC-26)',
      (): TransferWorkspaceOwnerCommand => {
        const ownerTransfer = ownerTransferDouble();
        ownerTransfer.transfer.mockResolvedValueOnce(false);
        return build(ownerTransfer);
      },
      ErrorCode.WORKSPACE_CONCURRENT_CHANGE,
    ],
    [
      'no custom Role for the outgoing Owner (AC-26a)',
      (): TransferWorkspaceOwnerCommand => {
        const roleLifecycle = roleLifecycleDouble();
        roleLifecycle.findCustomRole.mockResolvedValueOnce(null);
        return build(ownerTransferDouble(), membershipDouble(), roleLifecycle);
      },
      ErrorCode.WORKSPACE_REPLACEMENT_ROLE_REQUIRED,
    ],
  ])(
    'AC-26: answers the business rejection for %s with its own code',
    async (_case, arrange, code) => {
      const rejection = arrange().execute(currentUser(), input);

      await expect(rejection).rejects.toBeInstanceOf(ApplicationError);
      await expect(rejection).rejects.toMatchObject({ code });
    },
  );
});
