import {
  accessProjectionSchema,
  managerTransferResultSchema,
  managerTransferSchema,
  memberPageSchema,
  permissionPageSchema,
  permissionPaginationSchema,
  roleAssignmentSchema,
  roleDeletionSchema,
  rolePageSchema,
  roleWriteSchema,
  uuidPaginationSchema,
} from 'access';

const id = (suffix: number): string =>
  `00000000-0000-4000-8000-${suffix.toString().padStart(12, '0')}`;

describe('access contracts', () => {
  it('applies bounded pagination defaults and rejects ambiguous cursors', () => {
    expect(uuidPaginationSchema.parse({})).toEqual({ limit: 20 });
    expect(uuidPaginationSchema.parse({ limit: '100', after: id(1) })).toEqual({
      limit: 100,
      after: id(1),
    });
    expect(
      uuidPaginationSchema.safeParse({ after: id(1), before: id(2) }).success,
    ).toBe(false);
    expect(uuidPaginationSchema.safeParse({ limit: '101' }).success).toBe(
      false,
    );
    expect(uuidPaginationSchema.safeParse({ extra: true }).success).toBe(false);
  });

  it('uses stable Permission identifiers as catalogue cursors', () => {
    expect(permissionPaginationSchema.parse({ before: 'USERS:WATCH' })).toEqual(
      { before: 'USERS:WATCH', limit: 20 },
    );
    expect(
      permissionPaginationSchema.safeParse({ after: 'not a permission' })
        .success,
    ).toBe(false);
  });

  it('accepts only web-safe current access projections', () => {
    expect(
      accessProjectionSchema.parse({
        warehouseId: id(1),
        roleId: id(2),
        roleKind: 'custom',
        permissionIds: ['ROLES:WATCH'],
      }),
    ).toEqual({
      warehouseId: id(1),
      roleId: id(2),
      roleKind: 'custom',
      permissionIds: ['ROLES:WATCH'],
    });
    expect(
      accessProjectionSchema.safeParse({
        warehouseId: id(1),
        roleId: id(2),
        roleKind: 'custom',
        permissionIds: ['ROLES:WATCH'],
        userId: id(3),
      }).success,
    ).toBe(false);
  });

  it('validates strict deterministic page projections', () => {
    const page = { hasNext: false, hasPrev: false, nextCursor: null };

    expect(
      rolePageSchema.safeParse({
        ...page,
        items: [
          {
            id: id(1),
            name: 'Operators',
            kind: 'custom',
            permissionIds: ['USERS:WATCH'],
          },
        ],
      }).success,
    ).toBe(true);
    expect(
      permissionPageSchema.safeParse({
        ...page,
        items: [
          { id: 'USERS:WATCH', label: 'View members', kind: 'assignable' },
        ],
      }).success,
    ).toBe(true);
    expect(
      memberPageSchema.safeParse({
        ...page,
        items: [{ userId: id(1), roleId: id(2), roleKind: 'custom' }],
      }).success,
    ).toBe(true);
    expect(
      memberPageSchema.safeParse({
        ...page,
        items: [
          {
            userId: id(1),
            roleId: id(2),
            roleKind: 'custom',
            warehouseId: id(3),
          },
        ],
      }).success,
    ).toBe(false);
  });

  it('validates every strict access mutation request', () => {
    expect(
      roleWriteSchema.parse({
        name: '  Оператори  ',
        permissionIds: ['USERS:WATCH'],
      }),
    ).toEqual({ name: 'Оператори', permissionIds: ['USERS:WATCH'] });
    expect(
      roleWriteSchema.safeParse({
        name: 'Operators',
        permissionIds: ['USERS:WATCH'],
        warehouseId: id(1),
      }).success,
    ).toBe(false);
    expect(roleAssignmentSchema.parse({ roleId: id(1) })).toEqual({
      roleId: id(1),
    });
    expect(roleDeletionSchema.parse({ replacementRoleId: null })).toEqual({
      replacementRoleId: null,
    });
    expect(
      managerTransferSchema.parse({
        recipientUserId: id(1),
        formerManagerRoleId: id(2),
      }),
    ).toEqual({ recipientUserId: id(1), formerManagerRoleId: id(2) });
  });

  it('validates only the safe manager-transfer response', () => {
    expect(
      managerTransferResultSchema.safeParse({
        managerUserId: id(1),
        formerManagerUserId: id(2),
        formerManagerRoleId: id(3),
      }).success,
    ).toBe(true);
    expect(
      managerTransferResultSchema.safeParse({
        managerUserId: id(1),
        formerManagerUserId: id(2),
        formerManagerRoleId: id(3),
        warehouseId: id(4),
      }).success,
    ).toBe(false);
  });
});
