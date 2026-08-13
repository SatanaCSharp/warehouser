import { ErrorCode } from '@warehouser/shared-types/enums';
import { ReadCurrentAccessQuery } from 'access/usecases/queries/read-current-access.query';
import { AccessCurrentUserRepository } from 'shared/domain/repositories/access-current-user.repository';

const userId = '00000000-0000-4000-8000-000000000001';
const warehouseId = '00000000-0000-4000-8000-000000000002';
const roleId = '00000000-0000-4000-8000-000000000003';
const archivedAt = new Date('2026-08-06T12:00:00.000Z');

const repositoryDouble = () => ({
  resolveCurrentAccess: jest.fn().mockResolvedValue({
    warehouseId,
    roleId,
    roleKind: 'custom' as const,
    permissionIds: ['ROLES:WATCH'],
    archivedAt: null,
  }),
});

describe('ReadCurrentAccessQuery', () => {
  it('resolves the actor membership of the Warehouse named in the request (AC-03a, AC-05)', async () => {
    const repository = repositoryDouble();
    const query = new ReadCurrentAccessQuery(
      repository as unknown as AccessCurrentUserRepository,
    );

    await expect(query.execute(userId, warehouseId)).resolves.toEqual({
      warehouseId,
      roleId,
      roleKind: 'custom',
      permissionIds: ['ROLES:WATCH'],
      archivedAt: null,
    });
    expect(repository.resolveCurrentAccess).toHaveBeenCalledWith(
      userId,
      warehouseId,
    );
  });

  it('serves an archived Warehouse and marks it archived (AC-12a)', async () => {
    const repository = repositoryDouble();
    repository.resolveCurrentAccess.mockResolvedValue({
      warehouseId,
      roleId,
      roleKind: 'custom' as const,
      permissionIds: [],
      archivedAt,
    });
    const query = new ReadCurrentAccessQuery(
      repository as unknown as AccessCurrentUserRepository,
    );

    await expect(query.execute(userId, warehouseId)).resolves.toMatchObject({
      warehouseId,
      archivedAt: archivedAt.toISOString(),
    });
  });

  it('denies without disclosure when the actor holds no membership in that Warehouse (AC-04)', async () => {
    const repository = repositoryDouble();
    repository.resolveCurrentAccess.mockResolvedValue(null);
    const query = new ReadCurrentAccessQuery(
      repository as unknown as AccessCurrentUserRepository,
    );

    await expect(query.execute(userId, warehouseId)).rejects.toMatchObject({
      code: ErrorCode.ACCESS_MEMBERSHIP_REQUIRED,
    });
  });
});
