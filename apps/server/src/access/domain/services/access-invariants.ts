import { assert } from '@warehouser/utils/asserts';
import { Role } from 'access/domain/entities/role';
import { WarehouseMembership } from 'access/domain/entities/warehouse-membership';

const sharesWarehouse = (
  left: WarehouseMembership | Role,
  right: WarehouseMembership | Role,
): boolean => left.warehouseId.equals(right.warehouseId);

export const assertAssignableRole = (
  membership: WarehouseMembership,
  role: Role,
): void => {
  assert(
    !role.isProtected,
    'Warehouse Manager changes require manager transfer',
  );
  assert(
    !membership.isManager,
    'Current manager changes require manager transfer',
  );
  assert(
    sharesWarehouse(membership, role),
    'Role assignment cannot cross Warehouses',
  );
};

export const assertRoleDeletion = (
  source: Role,
  assignmentCount: number,
  replacement?: Role,
): void => {
  assert(!source.isProtected, 'Warehouse Manager Role is system-managed');
  if (assignmentCount === 0) {
    return;
  }
  assert(replacement !== undefined, 'Assigned Role requires a replacement');
  assert(!replacement.isProtected, 'Replacement must be a custom Role');
  assert(!source.id.equals(replacement.id), 'Role cannot replace itself');
  assert(
    sharesWarehouse(source, replacement),
    'Replacement cannot cross Warehouses',
  );
};

export const assertManagerTransfer = (
  currentManager: WarehouseMembership,
  recipient: WarehouseMembership,
  formerManagerReplacement: Role,
): void => {
  assert(
    currentManager.isManager,
    'Only the current manager can transfer management',
  );
  assert(
    !currentManager.memberId.equals(recipient.memberId),
    'Manager transfer recipient must be different',
  );
  assert(
    sharesWarehouse(currentManager, recipient),
    'Manager transfer cannot cross Warehouses',
  );
  assert(
    sharesWarehouse(currentManager, formerManagerReplacement),
    'Former manager replacement cannot cross Warehouses',
  );
  assert(
    !formerManagerReplacement.isProtected,
    'Former manager replacement must be a custom Role',
  );
};
