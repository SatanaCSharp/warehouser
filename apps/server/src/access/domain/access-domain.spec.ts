import { AssertionError } from '@warehouser/shared-types/errors';
import { Permission } from 'access/domain/entities/permission';
import { Role } from 'access/domain/entities/role';
import { WarehouseMembership } from 'access/domain/entities/warehouse-membership';
import {
  assertAssignableRole,
  assertManagerTransfer,
  assertRoleDeletion,
} from 'access/domain/services/access-invariants';
import { AccessName } from 'access/domain/value-objects/access-name';

const warehouseA = '00000000-0000-4000-8000-000000000001';
const warehouseB = '00000000-0000-4000-8000-000000000002';
const managerUser = '00000000-0000-4000-8000-000000000003';
const memberUser = '00000000-0000-4000-8000-000000000004';

describe('access domain', () => {
  it('trims names, counts graphemes, and preserves submitted Unicode', () => {
    expect(AccessName.create('  Café  ').value).toBe('Café');
    expect(AccessName.create('e\u0301').value).toBe('e\u0301');
    expect(AccessName.create('é'.repeat(100)).value).toHaveLength(100);
    expect(() => AccessName.create('é'.repeat(101))).toThrow(AssertionError);
    expect(() => AccessName.create('   ')).toThrow(AssertionError);
    expect(() => AccessName.create('hidden\u200Bformat')).toThrow(
      AssertionError,
    );
    expect(() => AccessName.create('control\nname')).toThrow(AssertionError);
  });

  it('keeps exact, case-sensitive, non-normalized name identity', () => {
    const existing = [AccessName.create('Café'), AccessName.create('Picker')];

    expect(AccessName.create('picker').conflictsWith(existing)).toBe(false);
    expect(AccessName.create('Cafe\u0301').conflictsWith(existing)).toBe(false);
    expect(AccessName.create('Café').conflictsWith(existing)).toBe(true);
  });

  it('allows custom roles to contain only assignable catalogue permissions', () => {
    const watch = Permission.assignable('ROLES:WATCH', 'View roles');
    const transfer = Permission.reserved(
      'WAREHOUSE_MANAGER_ROLE:REASSIGN',
      'Transfer warehouse management',
    );

    expect(Role.custom(warehouseA, 'Picker', [watch]).permissions).toEqual([
      watch,
    ]);
    expect(Role.custom(warehouseA, 'Empty', []).permissions).toEqual([]);
    expect(() => Role.custom(warehouseA, 'Invalid', [transfer])).toThrow(
      AssertionError,
    );
  });

  it('keeps the manager role protected from mutation', () => {
    const manager = Role.warehouseManager(warehouseA, []);

    expect(() => manager.rename('Renamed')).toThrow(AssertionError);
    expect(() => manager.changePermissions([])).toThrow(AssertionError);
    expect(() => assertRoleDeletion(manager, 0)).toThrow(AssertionError);
  });

  it('rejects protected and cross-warehouse ordinary assignments', () => {
    const manager = Role.warehouseManager(warehouseA, []);
    const custom = Role.custom(warehouseA, 'Picker', []);
    const foreign = Role.custom(warehouseB, 'Picker', []);
    const member = WarehouseMembership.create(memberUser, warehouseA, custom);
    const currentManager = WarehouseMembership.create(
      managerUser,
      warehouseA,
      manager,
    );

    expect(() => assertAssignableRole(member, manager)).toThrow(AssertionError);
    expect(() => assertAssignableRole(member, foreign)).toThrow(AssertionError);
    expect(() => assertAssignableRole(currentManager, custom)).toThrow(
      AssertionError,
    );
  });

  it('requires replacement for assigned deletion and validates manager transfer', () => {
    const manager = Role.warehouseManager(warehouseA, []);
    const source = Role.custom(warehouseA, 'Picker', []);
    const replacement = Role.custom(warehouseA, 'Receiver', []);
    const foreign = Role.custom(warehouseB, 'Foreign', []);
    const currentManager = WarehouseMembership.create(
      managerUser,
      warehouseA,
      manager,
    );
    const recipient = WarehouseMembership.create(
      memberUser,
      warehouseA,
      source,
    );

    expect(() => assertRoleDeletion(source, 1)).toThrow(AssertionError);
    expect(() => assertRoleDeletion(source, 1, source)).toThrow(AssertionError);
    expect(() => assertRoleDeletion(source, 1, foreign)).toThrow(
      AssertionError,
    );
    expect(() => assertRoleDeletion(source, 0)).not.toThrow();
    expect(() =>
      assertManagerTransfer(currentManager, recipient, replacement),
    ).not.toThrow();
    expect(() =>
      assertManagerTransfer(currentManager, currentManager, replacement),
    ).toThrow(AssertionError);
    expect(() =>
      assertManagerTransfer(
        currentManager,
        WarehouseMembership.create(memberUser, warehouseB, foreign),
        replacement,
      ),
    ).toThrow(AssertionError);
  });
});
