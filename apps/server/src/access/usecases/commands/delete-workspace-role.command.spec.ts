import { ErrorCode } from '@warehouser/shared-types/enums';
import { ApplicationError, SystemError } from '@warehouser/shared-types/errors';
// RED for T56/AC-17b (review S1-07) — `WORKSPACE_ROLE_DELETION_UNAVAILABLE`
// is registered in `global-http-exception.filter.ts`'s `systemErrors` map
// (503) and documented by contracts/openapi.yaml, but no factory ever raised
// it: an infrastructure failure reassigning members or removing the Role
// propagated raw and the filter answered a generic 500. AC-17b promises the
// member that the Role and its assignments are unchanged when the deletion
// does not complete, which a generic 500 cannot say.
import { DeleteWorkspaceRoleCommand } from 'access/usecases/commands/delete-workspace-role.command';
import type { WorkspaceCurrentUser } from 'shared/access/workspace-current-user';

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
  lockRoleById: jest
    .fn()
    .mockResolvedValue({ id: roleId, workspaceId, kind: 'custom' }),
  countRoleMembers: jest.fn().mockResolvedValue(0),
  removeCustomRole: jest.fn().mockResolvedValue(undefined),
});

const deletionServiceDouble = () => ({
  replaceAssignments: jest.fn().mockResolvedValue(undefined),
});

const currentUserRepositoryDouble = () => ({
  resolveRequiredWorkspacePermission: jest
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
    'AC-17b: translates an infrastructure failure %s into the documented 503 SystemError, preserving the cause',
    async (_case, arrange) => {
      const { roleLifecycle, deletionService, failure } = arrange();
      const command = build(roleLifecycle, deletionService);

      const rejection = command.execute(currentUser(), {
        roleId,
        replacementRoleId,
      });

      await expect(rejection).rejects.toBeInstanceOf(SystemError);
      await expect(rejection).rejects.toMatchObject({
        code: ErrorCode.WORKSPACE_ROLE_DELETION_UNAVAILABLE,
        cause: failure,
      });
    },
  );

  // The unavailable outcome must not absorb the refusals this command owns:
  // AC-16's protected Owner Role and AC-17c's missing replacement are
  // permanent, and telling the member to try again later would be wrong
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
    'AC-17b: does not mask the business rejection for %s as an unavailable outcome',
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
