import { ErrorCode } from '@warehouser/shared-types/enums';
import { RoleDeletionService } from 'access/domain/services/role-deletion.service';
import { RoleLifecycleRepository } from 'shared/domain/repositories/role-lifecycle.repository';

const warehouseId = '00000000-0000-4000-8000-000000000001';
const sourceRoleId = '00000000-0000-4000-8000-000000000002';
const replacementRoleId = '00000000-0000-4000-8000-000000000003';

const repositoryDouble = () => ({
  lockCustomRole: jest.fn().mockResolvedValue({ id: replacementRoleId }),
  replaceRoleAssignments: jest.fn().mockResolvedValue(undefined),
});

describe('RoleDeletionService', () => {
  it('replaces source Role assignments with a valid custom Role', async () => {
    const repository = repositoryDouble();
    const service = new RoleDeletionService(
      repository as unknown as RoleLifecycleRepository,
    );

    await service.replaceAssignments(
      warehouseId,
      sourceRoleId,
      replacementRoleId,
    );

    expect(repository.lockCustomRole).toHaveBeenCalledWith(
      warehouseId,
      replacementRoleId,
    );
    expect(repository.replaceRoleAssignments).toHaveBeenCalledWith(
      warehouseId,
      sourceRoleId,
      replacementRoleId,
    );
  });

  it('does nothing when no replacement Role is requested', async () => {
    const repository = repositoryDouble();
    const service = new RoleDeletionService(
      repository as unknown as RoleLifecycleRepository,
    );

    await service.replaceAssignments(warehouseId, sourceRoleId);

    expect(repository.lockCustomRole).not.toHaveBeenCalled();
    expect(repository.replaceRoleAssignments).not.toHaveBeenCalled();
  });

  it('rejects the source Role as its own replacement', async () => {
    const repository = repositoryDouble();
    const service = new RoleDeletionService(
      repository as unknown as RoleLifecycleRepository,
    );

    await expect(
      service.replaceAssignments(warehouseId, sourceRoleId, sourceRoleId),
    ).rejects.toMatchObject({ code: ErrorCode.ACCESS_REPLACEMENT_REQUIRED });
    expect(repository.lockCustomRole).not.toHaveBeenCalled();
  });

  it('rejects an unavailable replacement Role', async () => {
    const repository = repositoryDouble();
    repository.lockCustomRole.mockResolvedValue(null);
    const service = new RoleDeletionService(
      repository as unknown as RoleLifecycleRepository,
    );

    await expect(
      service.replaceAssignments(warehouseId, sourceRoleId, replacementRoleId),
    ).rejects.toMatchObject({ code: ErrorCode.ACCESS_REPLACEMENT_REQUIRED });
    expect(repository.replaceRoleAssignments).not.toHaveBeenCalled();
  });
});
