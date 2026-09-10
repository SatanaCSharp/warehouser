import { ErrorCode } from '@warehouser/shared-types/enums';
import { ApplicationError } from '@warehouser/shared-types/errors';
import { DeleteWorkspaceRoleCommand } from 'access/usecases/commands/delete-workspace-role.command';
import type { WorkspaceCurrentUser } from 'shared/access/workspace-current-user';
import { describe, expect, it, vi } from 'vitest';

const workspaceId = '00000000-0000-4000-8000-000000000001';
const actorId = '00000000-0000-4000-8000-000000000002';
const roleId = '00000000-0000-4000-8000-000000000003';
const replacementRoleId = '00000000-0000-4000-8000-000000000004';

const currentUser = (): WorkspaceCurrentUser => ({
  userId: actorId,
  workspaceId,
  workspaceRoleId: '00000000-0000-4000-8000-000000000005',
  workspaceRoleKind: 'custom',
  permissionId: 'WORKSPACE_ROLES:DELETE',
});

const roleLifecycleDouble = () => ({
  lockRoleById: vi
    .fn()
    .mockResolvedValue({ id: roleId, workspaceId, kind: 'custom' }),
  countRoleMembers: vi.fn().mockResolvedValue(0),
  removeCustomRole: vi.fn().mockResolvedValue(undefined),
});

const deletionServiceDouble = () => ({
  replaceAssignments: vi.fn().mockResolvedValue(undefined),
});

const currentUserRepositoryDouble = () => ({
  resolveRequiredWorkspacePermission: vi
    .fn()
    .mockResolvedValue({ granted: true }),
});

const build = (
  roleLifecycle = roleLifecycleDouble(),
  deletionService = deletionServiceDouble(),
  currentUserRepository = currentUserRepositoryDouble(),
): DeleteWorkspaceRoleCommand =>
  new DeleteWorkspaceRoleCommand(
    roleLifecycle as never,
    deletionService as never,
    currentUserRepository as never,
  );

describe('DeleteWorkspaceRoleCommand', () => {
  // An infrastructure failure reassigning members or removing the Role
  // propagates untouched — the command never reclassifies it — and the global
  // exception filter is the single boundary that maps it
  // (server-error-handling.md §2 and §6). The one transaction this command
  // runs in is what keeps AC-17b's promise true: the Role and its assignments
  // are unchanged.
  it.each([
    [
      'reassigning the affected members',
      (): {
        roleLifecycle: ReturnType<typeof roleLifecycleDouble>;
        deletionService: ReturnType<typeof deletionServiceDouble>;
        failure: Error;
      } => {
        const roleLifecycle = roleLifecycleDouble();
        const deletionService = deletionServiceDouble();
        const failure = new Error('connection terminated');
        deletionService.replaceAssignments.mockRejectedValueOnce(failure);
        return { roleLifecycle, deletionService, failure };
      },
    ],
    [
      'removing the Role row',
      (): {
        roleLifecycle: ReturnType<typeof roleLifecycleDouble>;
        deletionService: ReturnType<typeof deletionServiceDouble>;
        failure: Error;
      } => {
        const roleLifecycle = roleLifecycleDouble();
        const deletionService = deletionServiceDouble();
        const failure = new Error('connection terminated');
        roleLifecycle.removeCustomRole.mockRejectedValueOnce(failure);
        return { roleLifecycle, deletionService, failure };
      },
    ],
  ])(
    'AC-17b: propagates an infrastructure failure %s unchanged',
    async (_case, arrange) => {
      const { roleLifecycle, deletionService, failure } = arrange();
      const command = build(roleLifecycle, deletionService);

      await expect(
        command.execute(currentUser(), { roleId, replacementRoleId }),
      ).rejects.toBe(failure);
    },
  );

  // AC-16's protected Owner Role and AC-17c's missing replacement are
  // permanent refusals this command owns, each answered with its own code
  // (server-error-handling.md §2).
  it.each([
    [
      'the protected Workspace Owner Role (AC-16)',
      (roleLifecycle: ReturnType<typeof roleLifecycleDouble>): void => {
        roleLifecycle.lockRoleById.mockResolvedValueOnce({
          id: roleId,
          workspaceId,
          kind: 'workspace_owner',
        });
      },
      ErrorCode.WORKSPACE_PROTECTED_ROLE,
    ],
    [
      'an assigned Role with no replacement (AC-17c)',
      (roleLifecycle: ReturnType<typeof roleLifecycleDouble>): void => {
        roleLifecycle.countRoleMembers.mockResolvedValueOnce(3);
      },
      ErrorCode.WORKSPACE_REPLACEMENT_ROLE_REQUIRED,
    ],
  ])(
    'AC-17b: answers the business rejection for %s with its own code',
    async (_case, arrange, code) => {
      const roleLifecycle = roleLifecycleDouble();
      arrange(roleLifecycle);
      const command = build(roleLifecycle);

      const rejection = command.execute(currentUser(), { roleId });

      await expect(rejection).rejects.toBeInstanceOf(ApplicationError);
      await expect(rejection).rejects.toMatchObject({ code });
    },
  );
});
