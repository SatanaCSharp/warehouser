import { ErrorCode } from '@warehouser/shared-types/enums';
import { ApplicationError } from '@warehouser/shared-types/errors';
// RED for T57/AC-19+AC-34 (review S1-08) — `input.workspaceRoleId` was never
// resolved before it was assigned. Only the composite foreign key to
// `workspace_roles(id, workspace_id, kind)` refused a nonexistent or
// cross-Workspace Workspace Role, and `QueryFailedError` is not registered in
// `global-http-exception.filter.ts`, so the route answered a generic 500
// where contracts/openapi.yaml documents 404 `workspace.target_unavailable`.
// AC-34 also requires the cross-Workspace Role to be indistinguishable from a
// missing one, which a persistence failure cannot promise.
import { AddWorkspaceMemberCommand } from 'access/usecases/commands/add-workspace-member.command';
import type { WorkspaceCurrentUser } from 'shared/access/workspace-current-user';

const workspaceId = '00000000-0000-4000-8000-000000000001';
const otherWorkspaceId = '00000000-0000-4000-8000-000000000009';
const actorId = '00000000-0000-4000-8000-000000000002';
const candidateId = '00000000-0000-4000-8000-000000000003';
const customRoleId = '00000000-0000-4000-8000-000000000004';
const ownerRoleId = '00000000-0000-4000-8000-000000000005';
const foreignRoleId = '00000000-0000-4000-8000-000000000006';
const missingRoleId = '00000000-0000-4000-8000-000000000007';

const currentUser = (): WorkspaceCurrentUser => ({
  userId: actorId,
  workspaceId,
  workspaceRoleId: '00000000-0000-4000-8000-000000000008',
  workspaceRoleKind: 'custom',
  permissionId: 'WORKSPACE_MEMBERS:ADD',
});

// The Workspace Roles the doubles resolve against: one custom Role of the
// actor's Workspace, the protected Owner Role of that same Workspace, and a
// custom Role of a different Workspace entirely.
const roles = [
  { id: customRoleId, workspaceId, kind: 'custom' },
  { id: ownerRoleId, workspaceId, kind: 'workspace_owner' },
  { id: foreignRoleId, workspaceId: otherWorkspaceId, kind: 'custom' },
];

// Mirrors `WorkspaceRoleLifecycleRepository.findCustomRole`'s SQL scope
// (`workspaceId` + `id` + `kind: 'custom'`), so a Role of another Workspace,
// a nonexistent Role and the protected Owner Role all resolve to `null` here
// exactly as they do in the database.
const roleLifecycleDouble = () => ({
  findCustomRole: jest.fn((scopedWorkspaceId: string, roleId: string) =>
    Promise.resolve(
      roles.find(
        (role) =>
          role.id === roleId &&
          role.workspaceId === scopedWorkspaceId &&
          role.kind === 'custom',
      ) ?? null,
    ),
  ),
});

const membershipDouble = () => ({
  findUserWorkspaceId: jest.fn().mockResolvedValue(workspaceId),
  lockMembership: jest.fn().mockResolvedValue(null),
  lockOwnerMembership: jest.fn().mockResolvedValue({
    userId: actorId,
    workspaceId,
    workspaceRoleId: ownerRoleId,
  }),
  hasWarehouseMembershipInWorkspace: jest.fn().mockResolvedValue(true),
  addMembership: jest.fn().mockResolvedValue(undefined),
});

const build = (
  membership = membershipDouble(),
  roleLifecycle = roleLifecycleDouble(),
): AddWorkspaceMemberCommand =>
  new AddWorkspaceMemberCommand(membership as never, roleLifecycle as never);

describe('AddWorkspaceMemberCommand', () => {
  it('AC-19: adds the candidate under a resolvable custom Workspace Role of the actor Workspace', async () => {
    const membership = membershipDouble();
    const command = build(membership);

    await expect(
      command.execute(currentUser(), {
        candidateUserId: candidateId,
        workspaceRoleId: customRoleId,
      }),
    ).resolves.toEqual({
      userId: candidateId,
      workspaceRoleId: customRoleId,
    });
    expect(membership.addMembership).toHaveBeenCalledWith({
      userId: candidateId,
      workspaceId,
      workspaceRoleId: customRoleId,
      workspaceRoleKind: 'custom',
    });
  });

  // AC-34 — a Workspace Role of another Workspace must be indistinguishable
  // from one that does not exist: the same code, and no write attempted.
  it.each([
    ['a nonexistent Workspace Role', missingRoleId],
    ['a Workspace Role of another Workspace', foreignRoleId],
  ])(
    'AC-34: refuses %s as an unavailable target without attempting the write',
    async (_case, workspaceRoleId) => {
      const membership = membershipDouble();
      const command = build(membership);

      const rejection = command.execute(currentUser(), {
        candidateUserId: candidateId,
        workspaceRoleId,
      });

      await expect(rejection).rejects.toBeInstanceOf(ApplicationError);
      await expect(rejection).rejects.toMatchObject({
        code: ErrorCode.WORKSPACE_TARGET_UNAVAILABLE,
      });
      expect(membership.addMembership).not.toHaveBeenCalled();
    },
  );

  // AC-22 — resolving the Role must not collapse the protected Owner Role
  // into the unavailable-target outcome: it exists, and the member is told it
  // changes only through the transfer action.
  it('AC-22: still refuses the protected Workspace Owner Role with the transfer-required code', async () => {
    const membership = membershipDouble();
    const command = build(membership);

    const rejection = command.execute(currentUser(), {
      candidateUserId: candidateId,
      workspaceRoleId: ownerRoleId,
    });

    await expect(rejection).rejects.toMatchObject({
      code: ErrorCode.WORKSPACE_OWNER_TRANSFER_REQUIRED,
    });
    expect(membership.addMembership).not.toHaveBeenCalled();
  });
});
