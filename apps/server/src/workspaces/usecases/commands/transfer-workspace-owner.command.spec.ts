import {
  ErrorCode,
  WorkspacePermissionId,
} from '@warehouser/shared-types/enums';
import { ApplicationError, SystemError } from '@warehouser/shared-types/errors';
import type { WorkspaceCurrentUser } from 'shared/access/workspace-current-user';
// RED for T56/AC-26 (review S1-07) —
// `WORKSPACE_OWNER_TRANSFER_UNAVAILABLE` is registered in
// `global-http-exception.filter.ts`'s `systemErrors` map (503) and documented
// by contracts/openapi.yaml, but no factory ever raised it: an infrastructure
// failure during the swap propagated raw and the filter answered a generic
// 500. The documented 503 carries what the member needs to know — exactly one
// current Workspace Owner is preserved.
import { TransferWorkspaceOwnerCommand } from 'workspaces/usecases/commands/transfer-workspace-owner.command';

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
  transfer: jest.fn().mockResolvedValue(true),
});

const membershipDouble = () => ({
  findMembershipWorkspaceId: jest.fn().mockResolvedValue(workspaceId),
});

const roleLifecycleDouble = () => ({
  findCustomRole: jest
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

  it('AC-26: translates an infrastructure failure performing the swap into the documented 503 SystemError, preserving the cause', async () => {
    const ownerTransfer = ownerTransferDouble();
    const failure = new Error('connection terminated');
    ownerTransfer.transfer.mockRejectedValueOnce(failure);
    const command = build(ownerTransfer);

    const rejection = command.execute(currentUser(), input);

    await expect(rejection).rejects.toBeInstanceOf(SystemError);
    await expect(rejection).rejects.toMatchObject({
      code: ErrorCode.WORKSPACE_OWNER_TRANSFER_UNAVAILABLE,
      cause: failure,
    });
  });

  // A lost race is a retriable business outcome with its own documented 409,
  // and a missing replacement Role is a permanent 400. Neither may be
  // reported as the 503 (server-error-handling.md §2).
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
    'AC-26: does not mask the business rejection for %s as an unavailable outcome',
    async (_case, arrange, code) => {
      const rejection = arrange().execute(currentUser(), input);

      await expect(rejection).rejects.toBeInstanceOf(ApplicationError);
      await expect(rejection).rejects.toMatchObject({ code });
    },
  );
});
