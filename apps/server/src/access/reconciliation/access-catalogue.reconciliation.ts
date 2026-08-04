import { PermissionId } from '@warehouser/shared-types/enums';

type PermissionKind = 'assignable' | 'reserved';
type PermissionSnapshot = {
  readonly id: string;
  readonly kind: PermissionKind;
};
type ManagerRoleSnapshot = {
  readonly id: string;
  readonly permissionIds: readonly string[];
};
type CatalogueSnapshot = {
  readonly permissions: readonly PermissionSnapshot[];
  readonly managerRoles: readonly ManagerRoleSnapshot[];
};
type ReconciliationReport = {
  readonly healthy: boolean;
  readonly violations: readonly string[];
};

const releaseCatalogue = new Map<string, PermissionKind>(
  Object.values(PermissionId).map((id) => [
    id,
    id === PermissionId.WAREHOUSE_MANAGER_ROLE_REASSIGN
      ? 'reserved'
      : 'assignable',
  ]),
);

export class AccessCatalogueReconciliation {
  inspect(snapshot: CatalogueSnapshot): ReconciliationReport {
    const violations = [
      ...this.inspectPermissions(snapshot.permissions),
      ...this.inspectManagerRoles(snapshot.managerRoles),
    ];

    return { healthy: violations.length === 0, violations };
  }

  private inspectPermissions(
    permissions: readonly PermissionSnapshot[],
  ): string[] {
    const actual = new Map(permissions.map(({ id, kind }) => [id, kind]));
    const violations = permissions.flatMap(({ id, kind }) => {
      const expectedKind = releaseCatalogue.get(id);
      if (!expectedKind) {
        return [`unexpected permission ${id}`];
      }
      if (kind !== expectedKind) {
        return [`permission ${id} must be ${expectedKind}`];
      }
      return [];
    });

    return [
      ...violations,
      ...Object.values(PermissionId)
        .filter((id) => !actual.has(id))
        .map((id) => `missing permission ${id}`),
    ];
  }

  private inspectManagerRoles(
    managerRoles: readonly ManagerRoleSnapshot[],
  ): string[] {
    return managerRoles.flatMap((role) => {
      const grants = new Set(role.permissionIds);
      return Object.values(PermissionId)
        .filter((id) => !grants.has(id))
        .map((id) => `manager role ${role.id} is missing ${id}`);
    });
  }
}
