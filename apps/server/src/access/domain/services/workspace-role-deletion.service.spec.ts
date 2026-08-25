import { ErrorCode } from '@warehouser/shared-types/enums';
// `WorkspaceRoleDeletionService` does not exist yet (T17) — this is the RED
// for AC-17/AC-17b/AC-17c. Per the task card and sad.md §6.7, the
// implementer creates it in `workspaces/domain/services/`, mirroring
// `access/domain/services/role-deletion.service.ts` one level up:
//   - no-op when no replacement Role is requested;
//   - reject the source Role as its own replacement;
//   - reject an unavailable replacement (missing, or scoped to another
//     Workspace — `WorkspaceRoleLifecycleRepository.findCustomRole` already
//     scopes its read to `workspaceId`, so a cross-Workspace id resolves to
//     the same `null` as a missing one) with
//     `workspaceReplacementRoleRequiredError()` (AC-17c's "no other custom
//     Role exists" collapses into this same unavailable-replacement path,
//     exactly as the access precedent's "only Role" case does);
//   - otherwise move every affected Workspace Member to the replacement in
//     one repository call (AC-17).
import { WorkspaceRoleDeletionService } from 'access/domain/services/workspace-role-deletion.service';

const workspaceId = '00000000-0000-4000-8000-000000000001';
const sourceRoleId = '00000000-0000-4000-8000-000000000002';
const replacementRoleId = '00000000-0000-4000-8000-000000000003';

// The shape this RED step expects the implementer's service to depend on —
// `findCustomRole` and `replaceRoleAssignments` already exist on
// `WorkspaceRoleLifecycleRepository` (T10), so no repository change is
// required to satisfy this contract.
const repositoryDouble = () => ({
  findCustomRole: jest
    .fn()
    .mockResolvedValue({ id: replacementRoleId, workspaceId, kind: 'custom' }),
  replaceRoleAssignments: jest.fn().mockResolvedValue(undefined),
});

describe('WorkspaceRoleDeletionService', () => {
  it('replaces source Workspace Role assignments with a valid custom Workspace Role (AC-17)', async () => {
    const repository = repositoryDouble();
    const service = new WorkspaceRoleDeletionService(repository);

    await service.replaceAssignments(
      workspaceId,
      sourceRoleId,
      replacementRoleId,
    );

    expect(repository.findCustomRole).toHaveBeenCalledWith(
      workspaceId,
      replacementRoleId,
    );
    expect(repository.replaceRoleAssignments).toHaveBeenCalledWith(
      workspaceId,
      sourceRoleId,
      replacementRoleId,
    );
  });

  it('does nothing when no replacement Workspace Role is requested (AC-17a)', async () => {
    const repository = repositoryDouble();
    const service = new WorkspaceRoleDeletionService(repository);

    await service.replaceAssignments(workspaceId, sourceRoleId);

    expect(repository.findCustomRole).not.toHaveBeenCalled();
    expect(repository.replaceRoleAssignments).not.toHaveBeenCalled();
  });

  it('rejects the source Workspace Role as its own replacement', async () => {
    const repository = repositoryDouble();
    const service = new WorkspaceRoleDeletionService(repository);

    await expect(
      service.replaceAssignments(workspaceId, sourceRoleId, sourceRoleId),
    ).rejects.toMatchObject({
      code: ErrorCode.WORKSPACE_REPLACEMENT_ROLE_REQUIRED,
    });
    expect(repository.findCustomRole).not.toHaveBeenCalled();
  });

  it('rejects an unavailable replacement Workspace Role, which also covers the "only custom Role" case (AC-17c)', async () => {
    const repository = repositoryDouble();
    repository.findCustomRole.mockResolvedValue(null);
    const service = new WorkspaceRoleDeletionService(repository);

    await expect(
      service.replaceAssignments(workspaceId, sourceRoleId, replacementRoleId),
    ).rejects.toMatchObject({
      code: ErrorCode.WORKSPACE_REPLACEMENT_ROLE_REQUIRED,
    });
    expect(repository.replaceRoleAssignments).not.toHaveBeenCalled();
  });
});
