import { PermissionId } from '@warehouser/shared-types/enums';
import { AccessCatalogueReconciliation } from 'access/reconciliation/access-catalogue.reconciliation';

describe('AccessCatalogueReconciliation', () => {
  const reconciliation = new AccessCatalogueReconciliation();

  it('accepts the release catalogue and complete manager grants', () => {
    const permissionIds = Object.values(PermissionId);

    expect(
      reconciliation.inspect({
        permissions: permissionIds.map((id) => ({
          id,
          kind:
            id === PermissionId.WAREHOUSE_MANAGER_ROLE_REASSIGN
              ? 'reserved'
              : 'assignable',
        })),
        managerRoles: [{ id: 'manager-role', permissionIds }],
      }),
    ).toEqual({ healthy: true, violations: [] });
  });

  it('reports missing, misclassified, unexpected, and incomplete catalogue state', () => {
    expect(
      reconciliation.inspect({
        permissions: [
          { id: PermissionId.ROLES_CREATE, kind: 'reserved' },
          { id: 'INVENTORY:WATCH', kind: 'assignable' },
        ],
        managerRoles: [
          { id: 'manager-role', permissionIds: [PermissionId.ROLES_CREATE] },
        ],
      }),
    ).toEqual({
      healthy: false,
      violations: expect.arrayContaining([
        'permission ROLES:CREATE must be assignable',
        'unexpected permission INVENTORY:WATCH',
        'manager role manager-role is missing ROLES:WATCH',
        'missing permission WAREHOUSE_MANAGER_ROLE:REASSIGN',
      ]),
    });
  });
});
