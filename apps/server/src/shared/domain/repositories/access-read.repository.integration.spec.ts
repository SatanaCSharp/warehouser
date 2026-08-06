import dataSource from 'shared/database/data-source';
import { AccountEntity } from 'shared/domain/entities/account.entity';
import { RoleEntity } from 'shared/domain/entities/role.entity';
import { UserEntity } from 'shared/domain/entities/user.entity';
import { WarehouseEntity } from 'shared/domain/entities/warehouse.entity';
import { WarehouseMembershipEntity } from 'shared/domain/entities/warehouse-membership.entity';
import { AccessReadRepository } from 'shared/domain/repositories/access-read.repository';

const describeIntegration =
  process.env.RUN_INTEGRATION === '1' ? describe : describe.skip;

const now = new Date('2026-08-06T12:00:00.000Z');

const warehouseId = '00000000-0000-4000-8000-000000000401';
const roleId = '00000000-0000-4000-8000-000000000402';
const memberUserId = '00000000-0000-4000-8000-000000000403';
const memberEmail = 'member@example.test';

describeIntegration('AccessReadRepository.listMembersAndAssignments', () => {
  const repository = new AccessReadRepository(dataSource);

  beforeAll(async () => {
    await dataSource.initialize();
  });

  afterEach(async () => {
    await dataSource.query(
      'TRUNCATE warehouse_memberships, role_permissions, roles, warehouses, sessions, users, accounts CASCADE',
    );
  });

  afterAll(async () => {
    await dataSource.destroy();
  });

  it("returns each member's normalized email via the accounts.user_id join", async () => {
    const manager = dataSource.manager;
    await manager.getRepository(WarehouseEntity).insert({
      id: warehouseId,
      name: 'Warehouse A',
      createdAt: now,
      updatedAt: now,
    });
    await manager.getRepository(RoleEntity).insert({
      id: roleId,
      warehouseId,
      name: 'Custom Role',
      kind: 'custom',
      createdAt: now,
      updatedAt: now,
    });
    // `accounts.user_id` / `users.account_id` form a deferred circular FK
    // pair, so both inserts must run inside one transaction (see
    // member-lifecycle.repository.integration.spec.ts for the same pattern).
    await dataSource.transaction(async (trxManager) => {
      await trxManager.getRepository(AccountEntity).insert({
        id: memberUserId,
        userId: memberUserId,
        normalizedEmail: memberEmail,
        passwordHash: 'synthetic-hash',
        passwordHashAlgorithm: 'scrypt',
        passwordHashParameters: { cost: 1_024 },
        createdAt: now,
        updatedAt: now,
      });
      await trxManager.getRepository(UserEntity).insert({
        id: memberUserId,
        accountId: memberUserId,
        createdAt: now,
        updatedAt: now,
      });
    });
    await manager.getRepository(WarehouseMembershipEntity).insert({
      userId: memberUserId,
      warehouseId,
      roleId,
      roleKind: 'custom',
      createdAt: now,
      updatedAt: now,
    });

    const rows = await repository.listMembersAndAssignments(warehouseId, 10);

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      userId: memberUserId,
      email: memberEmail,
    });
  });
});
