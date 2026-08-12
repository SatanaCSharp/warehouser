import dataSource from 'shared/database/data-source';
import { DbTransactionContext } from 'shared/database/db-transaction-context.service';
import { AccountEntity } from 'shared/domain/entities/account.entity';
import { RoleEntity } from 'shared/domain/entities/role.entity';
import { UserEntity } from 'shared/domain/entities/user.entity';
import { WarehouseEntity } from 'shared/domain/entities/warehouse.entity';
import { WarehouseMembershipEntity } from 'shared/domain/entities/warehouse-membership.entity';
import { WorkspaceEntity } from 'shared/domain/entities/workspace.entity';
import { WorkspaceMembershipEntity } from 'shared/domain/entities/workspace-membership.entity';
import { WorkspacePermissionEntity } from 'shared/domain/entities/workspace-permission.entity';
import { WorkspaceRoleEntity } from 'shared/domain/entities/workspace-role.entity';
import { WorkspaceRolePermissionEntity } from 'shared/domain/entities/workspace-role-permission.entity';
// `WorkspaceReadRepository` does not exist yet — this is the RED step (T9).
// The implementer creates it in the same location per
// docs/system/guides/creating-a-server-repository.md, exposing the
// projections data-model.md "Repository boundaries" names:
//   getWorkspace(workspaceId)
//   listWorkspaceRolesWithPermissions(workspaceId)
//   listWorkspacePermissionCatalogue()
//   listWorkspaceMembers(workspaceId)
//   listWorkspaceUsersWithWarehouses(workspaceId)
//   listWorkspaceWarehouses(workspaceId)
import { WorkspaceReadRepository } from 'shared/domain/repositories/workspace-read.repository';
import {
  buildWarehouse,
  buildWorkspace,
  buildWorkspaceMembership,
  buildWorkspacePermission,
  buildWorkspaceRole,
  persistWorkspaceGraph,
} from 'test/factories/entity-factories';
import type { Logger } from 'typeorm';

const describeIntegration =
  process.env.RUN_INTEGRATION === '1' ? describe : describe.skip;

const now = new Date('2026-08-12T12:00:00.000Z');

// The shape this RED step expects the implementer to expose (data-model.md
// "Repository boundaries", AC-32/AC-33). `WorkspaceReadRepository` is `error`
// -typed while its module does not exist yet, so every call below goes
// through this single cast rather than letting that `error` type leak into
// every assertion's own type-safety checking.
interface WorkspaceIdentityRead {
  readonly id: string;
  readonly name: string | null;
}
interface WorkspaceRoleWithPermissionsRead {
  readonly id: string;
  readonly workspaceId: string;
  readonly name: string;
  readonly kind: 'custom' | 'workspace_owner';
  readonly permissionIds: readonly string[];
  // T41/AC-14 — the Role's assigned-Member count, aggregated the same way
  // `AccessReadRepository.listRolesAndPermissions` aggregates it one level
  // down (access-read.repository.ts): `0` for an unassigned Role, never
  // counted across Workspaces.
  readonly assignedMemberCount: number;
}
interface WorkspacePermissionCatalogueRead {
  readonly id: string;
  readonly label: string;
  readonly kind: 'assignable' | 'reserved';
}
interface WorkspaceMemberRead {
  readonly userId: string;
  readonly workspaceRoleId: string;
  readonly workspaceRoleName: string;
  readonly workspaceRoleKind: 'custom' | 'workspace_owner';
  // T46 — the identifying email of `WorkspaceMember` in
  // contracts/openapi.yaml, read from `accounts.normalized_email` on the same
  // terms as the approved Warehouse member projection
  // (`AccessReadRepository.listMembersAndAssignments`).
  readonly email: string;
}
interface WorkspaceUserWithWarehousesRead {
  readonly userId: string;
  readonly warehouseIds: readonly string[];
  // T41/AC-33/AC-21 — derived from the existence of a `workspace_memberships`
  // row for the User alone, never from a Warehouse join, so it survives the
  // loss of every Warehouse membership (AC-21).
  readonly isWorkspaceMember: boolean;
  // T46 — the identifying email of `WorkspaceUser` in contracts/openapi.yaml.
  readonly email: string;
}
interface WorkspaceWarehouseRead {
  readonly id: string;
  readonly name: string;
  readonly archivedAt: Date | null;
}
interface WorkspaceReadRepositoryContract {
  getWorkspace(workspaceId: string): Promise<WorkspaceIdentityRead | null>;
  listWorkspaceRolesWithPermissions(
    workspaceId: string,
  ): Promise<WorkspaceRoleWithPermissionsRead[]>;
  listWorkspacePermissionCatalogue(): Promise<
    WorkspacePermissionCatalogueRead[]
  >;
  listWorkspaceMembers(workspaceId: string): Promise<WorkspaceMemberRead[]>;
  listWorkspaceUsersWithWarehouses(
    workspaceId: string,
  ): Promise<WorkspaceUserWithWarehousesRead[]>;
  listWorkspaceWarehouses(
    workspaceId: string,
  ): Promise<WorkspaceWarehouseRead[]>;
}

const repository = new WorkspaceReadRepository(
  dataSource,
) as unknown as WorkspaceReadRepositoryContract;
// Installs the AsyncLocalStorage the repository's getEntityManager() reads
// from; no transaction is ever opened through it in this spec, so every call
// below falls through to dataSource.manager, exactly as a bare repository
// call outside a @Transactional() service does.
new DbTransactionContext(dataSource);

/**
 * Captures every SQL statement TypeORM sends while installed, so a test can
 * re-`EXPLAIN` the exact query the repository issued rather than a
 * hand-reconstructed approximation of it.
 */
class CapturingLogger implements Logger {
  readonly statements: Array<{ sql: string; parameters: unknown[] }> = [];
  logQuery(query: string, parameters?: unknown[]): void {
    this.statements.push({ sql: query, parameters: parameters ?? [] });
  }
  logQueryError(): void {}
  logQuerySlow(): void {}
  logSchemaBuild(): void {}
  logMigration(): void {}
  log(): void {}
}

const persistWorkspace = async (
  overrides: Partial<{ name: string | null }> = {},
): Promise<string> => {
  const workspace = buildWorkspace(overrides);
  await dataSource.manager.getRepository(WorkspaceEntity).insert(workspace);
  return workspace.id as string;
};

const persistUser = async (workspaceId: string): Promise<string> => {
  const userId = crypto.randomUUID();
  // accounts.user_id / users.account_id form a deferred circular FK pair, so
  // both inserts must land inside one transaction (see
  // member-lifecycle.repository.integration.spec.ts for the identical
  // pattern).
  await dataSource.transaction(async (trxManager) => {
    await trxManager.getRepository(AccountEntity).insert({
      id: userId,
      userId,
      normalizedEmail: `member.${userId}@example.test`,
      passwordHash: 'synthetic-hash',
      passwordHashAlgorithm: 'scrypt',
      passwordHashParameters: { cost: 1_024 },
      createdAt: now,
      updatedAt: now,
    });
    await trxManager.getRepository(UserEntity).insert({
      id: userId,
      accountId: userId,
      workspaceId,
      createdAt: now,
      updatedAt: now,
    });
  });
  return userId;
};

const insertWorkspaceRole = async (
  workspaceId: string,
  overrides: Partial<{
    name: string;
    kind: 'custom' | 'workspace_owner';
  }> = {},
): Promise<string> => {
  const role = buildWorkspaceRole({ workspaceId, ...overrides });
  await dataSource.manager.getRepository(WorkspaceRoleEntity).insert(role);
  return role.id as string;
};

const insertWorkspacePermission = async (
  overrides: Partial<{ kind: 'assignable' | 'reserved'; label: string }> = {},
): Promise<string> => {
  const permission = buildWorkspacePermission(overrides);
  await dataSource.manager
    .getRepository(WorkspacePermissionEntity)
    .insert(permission);
  return permission.id as string;
};

const grantWorkspacePermission = (
  workspaceRoleId: string,
  workspaceRoleKind: 'custom' | 'workspace_owner',
  workspacePermissionId: string,
  workspacePermissionKind: 'assignable' | 'reserved',
): Promise<unknown> =>
  dataSource.manager.getRepository(WorkspaceRolePermissionEntity).insert({
    workspaceRoleId,
    workspacePermissionId,
    workspaceRoleKind,
    workspacePermissionKind,
  });

const insertWorkspaceMembership = (
  userId: string,
  workspaceId: string,
  workspaceRoleId: string,
  workspaceRoleKind: 'custom' | 'workspace_owner' = 'custom',
): Promise<unknown> =>
  dataSource.manager.getRepository(WorkspaceMembershipEntity).insert(
    buildWorkspaceMembership({
      userId,
      workspaceId,
      workspaceRoleId,
      workspaceRoleKind,
    }),
  );

const insertWarehouse = async (
  workspaceId: string,
  overrides: Partial<{ name: string; archivedAt: Date | null }> = {},
): Promise<string> => {
  const warehouse = buildWarehouse({ workspaceId, ...overrides });
  await dataSource.manager.getRepository(WarehouseEntity).insert(warehouse);
  return warehouse.id as string;
};

/**
 * Creates the protected Warehouse Manager Role a Warehouse membership's
 * composite foreign key requires, then the membership itself — mirroring
 * `persistWorkspaceGraphWithManager`'s shape in `entity-factories.ts`.
 */
const insertWarehouseMembership = async (
  userId: string,
  warehouseId: string,
  workspaceId: string,
): Promise<void> => {
  const roleId = crypto.randomUUID();
  await dataSource.manager.getRepository(RoleEntity).insert({
    id: roleId,
    warehouseId,
    name: `Warehouse Role ${roleId}`,
    kind: 'custom',
    createdAt: now,
    updatedAt: now,
  });
  await dataSource.manager.getRepository(WarehouseMembershipEntity).insert({
    userId,
    warehouseId,
    workspaceId,
    roleId,
    roleKind: 'custom',
    createdAt: now,
    updatedAt: now,
  });
};

/**
 * Runs `subject` while a `CapturingLogger` is installed, returns the last SQL
 * statement it issued, then re-`EXPLAIN`s that exact statement (with
 * `enable_seqscan` forced off, so a plan that legitimately does not qualify
 * for the target index still reports a Seq Scan instead of being masked by
 * fixture-scale cost preference) and returns the flattened plan text.
 */
const explainLastQuery = async (
  subject: () => Promise<unknown>,
): Promise<string> => {
  const originalLogger = dataSource.logger;
  const logger = new CapturingLogger();
  dataSource.logger = logger;
  await subject();
  dataSource.logger = originalLogger;

  const last = logger.statements.at(-1);
  if (!last) {
    throw new Error('no SQL statement was captured');
  }

  const rows = await dataSource.transaction(async (manager) => {
    await manager.query('SET LOCAL enable_seqscan = off');
    return manager.query<Array<Record<string, string>>>(
      `EXPLAIN ${last.sql}`,
      last.parameters as unknown[] | undefined,
    );
  });
  return rows.map((row) => Object.values(row)[0]).join('\n');
};

// Each `registerXTests` function is defined at module scope (not inline
// inside the outer `describe`) and only referenced from it, so its own line
// span — not the outer describe's — is what `max-lines-per-function`
// measures (docs/system/server-index.md's stated lint bar, no test
// override).

function registerGetWorkspaceTests(): void {
  it('returns the exact column set for an unnamed Workspace', async () => {
    const workspaceId = await persistWorkspace({ name: null });

    const result = await repository.getWorkspace(workspaceId);

    expect(result && Object.keys(result).sort()).toEqual(['id', 'name']);
    expect(result).toEqual({ id: workspaceId, name: null });
  });

  it('returns a set name once one has been stored', async () => {
    const workspaceId = await persistWorkspace({ name: 'Acme Logistics' });

    const result = await repository.getWorkspace(workspaceId);

    expect(result).toEqual({ id: workspaceId, name: 'Acme Logistics' });
  });

  it('returns null for a missing Workspace identifier, same as any other unavailable target', async () => {
    const result = await repository.getWorkspace(crypto.randomUUID());

    expect(result).toBeNull();
  });
}

function registerRolesAndCatalogueTests(): void {
  it('lists custom Workspace Roles with their Permission membership, ordered by name', async () => {
    const workspaceId = await persistWorkspace();
    const grantedPermissionId = await insertWorkspacePermission({
      kind: 'assignable',
    });
    const betaRoleId = await insertWorkspaceRole(workspaceId, {
      name: 'Beta Role',
    });
    const alphaRoleId = await insertWorkspaceRole(workspaceId, {
      name: 'Alpha Role',
    });
    await grantWorkspacePermission(
      alphaRoleId,
      'custom',
      grantedPermissionId,
      'assignable',
    );

    const rows =
      await repository.listWorkspaceRolesWithPermissions(workspaceId);

    expect(rows).toHaveLength(2);
    expect(rows[0] && Object.keys(rows[0]).sort()).toEqual(
      [
        'assignedMemberCount',
        'id',
        'kind',
        'name',
        'permissionIds',
        'workspaceId',
      ].sort(),
    );
    expect(rows.map((row) => row.name)).toEqual(['Alpha Role', 'Beta Role']);
    expect(rows[0]).toMatchObject({
      id: alphaRoleId,
      workspaceId,
      kind: 'custom',
      permissionIds: [grantedPermissionId],
    });
    expect(rows[1]).toMatchObject({ id: betaRoleId, permissionIds: [] });
  });

  // T41/AC-14 — `assignedMemberCount` counts exactly the memberships
  // carrying each Workspace Role, is `0` for an unassigned Role (present in
  // the result, not absent), and never counts a membership of another
  // Workspace even when that other Workspace happens to use a Role with the
  // same id-adjacent shape.
  it('aggregates assignedMemberCount per Workspace Role, 0 for an unassigned Role, never across Workspaces (T41)', async () => {
    const workspaceId = await persistWorkspace();
    const assignedRoleId = await insertWorkspaceRole(workspaceId, {
      name: 'Assigned Role',
    });
    const unassignedRoleId = await insertWorkspaceRole(workspaceId, {
      name: 'Unassigned Role',
    });
    const memberA = await persistUser(workspaceId);
    const memberB = await persistUser(workspaceId);
    await insertWorkspaceMembership(memberA, workspaceId, assignedRoleId);
    await insertWorkspaceMembership(memberB, workspaceId, assignedRoleId);

    // A second Workspace whose own Role must never contribute to the first
    // Workspace's counts.
    const otherWorkspaceId = await persistWorkspace();
    const otherRoleId = await insertWorkspaceRole(otherWorkspaceId, {
      name: 'Assigned Role',
    });
    const otherMember = await persistUser(otherWorkspaceId);
    await insertWorkspaceMembership(otherMember, otherWorkspaceId, otherRoleId);

    const rows =
      await repository.listWorkspaceRolesWithPermissions(workspaceId);

    const byId = Object.fromEntries(
      rows.map((row) => [row.id, row.assignedMemberCount]),
    );
    expect(byId[assignedRoleId]).toBe(2);
    expect(byId[unassignedRoleId]).toBe(0);
  });

  it('lists the Workspace Permission catalogue with its assignable/reserved classification, ordered by kind then id', async () => {
    const assignableId = await insertWorkspacePermission({
      kind: 'assignable',
      label: 'Assignable fixture',
    });
    const reservedId = await insertWorkspacePermission({
      kind: 'reserved',
      label: 'Reserved fixture',
    });

    const rows = await repository.listWorkspacePermissionCatalogue();

    expect(rows).toHaveLength(2);
    expect(rows[0] && Object.keys(rows[0]).sort()).toEqual(
      ['id', 'kind', 'label'].sort(),
    );
    // 'assignable' sorts before 'reserved' lexicographically.
    expect(rows.map((row) => row.id)).toEqual([assignableId, reservedId]);
    expect(rows[0]?.kind).toBe('assignable');
    expect(rows[1]?.kind).toBe('reserved');
  });
}

function registerMembersTests(): void {
  it('lists Workspace Members with their Role assignment, ordered by userId', async () => {
    const workspaceId = await persistWorkspace();
    const roleId = await insertWorkspaceRole(workspaceId, {
      name: 'Custom Role',
    });
    const userA = await persistUser(workspaceId);
    const userB = await persistUser(workspaceId);
    const [firstUserId, secondUserId] = [userA, userB].sort();
    await insertWorkspaceMembership(userA, workspaceId, roleId);
    await insertWorkspaceMembership(userB, workspaceId, roleId);

    const rows = await repository.listWorkspaceMembers(workspaceId);

    expect(rows).toHaveLength(2);
    expect(rows[0] && Object.keys(rows[0]).sort()).toEqual(
      [
        'userId',
        'workspaceRoleId',
        'workspaceRoleKind',
        'workspaceRoleName',
        // T46 — the identifying email of `WorkspaceMember` in
        // contracts/openapi.yaml, read from `accounts.normalized_email` the
        // way the approved Warehouse member projection reads it.
        'email',
      ].sort(),
    );
    expect(rows.map((row) => row.userId)).toEqual([firstUserId, secondUserId]);
    expect(rows[0]).toMatchObject({
      workspaceRoleId: roleId,
      workspaceRoleName: 'Custom Role',
      workspaceRoleKind: 'custom',
      email: `member.${firstUserId}@example.test`,
    });
  });
}

function registerUsersWithWarehousesTests(): void {
  it('projects Warehouses per User with no Warehouse Role at all, and includes Users who are not Workspace Members', async () => {
    const workspaceId = await persistWorkspace();
    const warehouseA = await insertWarehouse(workspaceId, {
      name: 'Warehouse A',
    });
    const warehouseB = await insertWarehouse(workspaceId, {
      name: 'Warehouse B',
    });

    const memberUserId = await persistUser(workspaceId);
    const workspaceRoleId = await insertWorkspaceRole(workspaceId);
    await insertWorkspaceMembership(memberUserId, workspaceId, workspaceRoleId);
    await insertWarehouseMembership(memberUserId, warehouseA, workspaceId);

    const nonMemberUserId = await persistUser(workspaceId);
    await insertWarehouseMembership(nonMemberUserId, warehouseA, workspaceId);
    await insertWarehouseMembership(nonMemberUserId, warehouseB, workspaceId);

    const userWithNoWarehouse = await persistUser(workspaceId);

    const rows = await repository.listWorkspaceUsersWithWarehouses(workspaceId);

    expect(rows).toHaveLength(3);
    expect(rows[0] && Object.keys(rows[0]).sort()).toEqual(
      // T46 adds `email` — the identifying email of `WorkspaceUser` in
      // contracts/openapi.yaml. AC-33's boundary is unchanged: still no
      // Warehouse Role, asserted exhaustively here and again below.
      ['isWorkspaceMember', 'userId', 'warehouseIds', 'email'].sort(),
    );
    for (const row of rows) {
      expect(row).not.toHaveProperty('roleId');
      expect(row).not.toHaveProperty('role');
      expect(row.email).toBe(`member.${row.userId}@example.test`);
    }
    const byUserId = Object.fromEntries(
      rows.map((row) => [row.userId, row.warehouseIds]),
    );
    expect(byUserId[nonMemberUserId]?.slice().sort()).toEqual(
      [warehouseA, warehouseB].sort(),
    );
    expect(byUserId[memberUserId]).toEqual([warehouseA]);
    expect(byUserId[userWithNoWarehouse]).toEqual([]);
  });

  // T41/AC-33/AC-21 — isWorkspaceMember is true for a User holding a
  // Workspace membership, false for a User of the Workspace who holds none,
  // and — the AC-21 domain invariant — stays true for a Workspace Member who
  // has since lost every Warehouse membership, because the flag is derived
  // from Workspace membership alone and never from a Warehouse join.
  it('derives isWorkspaceMember from Workspace membership alone, surviving the loss of every Warehouse membership (AC-21)', async () => {
    const workspaceId = await persistWorkspace();
    const workspaceRoleId = await insertWorkspaceRole(workspaceId);

    const memberWithoutWarehouse = await persistUser(workspaceId);
    await insertWorkspaceMembership(
      memberWithoutWarehouse,
      workspaceId,
      workspaceRoleId,
    );
    // AC-21: this Workspace Member holds no Warehouse membership at all.

    const nonMemberUserId = await persistUser(workspaceId);
    const warehouseId = await insertWarehouse(workspaceId);
    await insertWarehouseMembership(nonMemberUserId, warehouseId, workspaceId);

    const rows = await repository.listWorkspaceUsersWithWarehouses(workspaceId);

    const byUserId = Object.fromEntries(
      rows.map((row) => [row.userId, row.isWorkspaceMember]),
    );
    expect(byUserId[memberWithoutWarehouse]).toBe(true);
    expect(byUserId[nonMemberUserId]).toBe(false);
  });
}

function registerWarehousesTests(): void {
  it('lists Warehouses with archived state, ordered by name then id', async () => {
    const workspaceId = await persistWorkspace();
    const betaId = await insertWarehouse(workspaceId, { name: 'Beta' });
    const alphaId = await insertWarehouse(workspaceId, {
      name: 'Alpha',
      // `createdAt` comes from the same frozen clock as `archivedAt`: the
      // factory would otherwise stamp it from the real clock, and
      // `chk_warehouses_archival_order` rejects an archival that predates
      // creation once wall time passes the fixture's timestamp.
      createdAt: now,
      archivedAt: now,
    });

    const rows = await repository.listWorkspaceWarehouses(workspaceId);

    expect(rows).toHaveLength(2);
    expect(rows[0] && Object.keys(rows[0]).sort()).toEqual(
      ['archivedAt', 'id', 'name'].sort(),
    );
    expect(rows.map((row) => row.id)).toEqual([alphaId, betaId]);
    expect(rows[0]).toMatchObject({ id: alphaId, archivedAt: now });
    expect(rows[1]).toMatchObject({ id: betaId, archivedAt: null });
  });
}

function registerCrossWorkspaceTests(): void {
  it('never returns a row of another Workspace, and a cross-Workspace identifier is as empty as a missing one', async () => {
    const graphA = await persistWorkspaceGraph();
    const graphB = await persistWorkspaceGraph();

    const rolesA = await repository.listWorkspaceRolesWithPermissions(
      graphA.workspaceId,
    );
    expect(rolesA.map((role) => role.workspaceId)).not.toContain(
      graphB.workspaceId,
    );

    const membersA = await repository.listWorkspaceMembers(graphA.workspaceId);
    expect(membersA.map((member) => member.userId)).not.toContain(
      graphB.ownerUserId,
    );

    const usersA = await repository.listWorkspaceUsersWithWarehouses(
      graphA.workspaceId,
    );
    expect(usersA.map((user) => user.userId)).not.toContain(
      graphB.memberUserId,
    );

    const warehousesA = await repository.listWorkspaceWarehouses(
      graphA.workspaceId,
    );
    expect(warehousesA.map((warehouse) => warehouse.id)).not.toContain(
      graphB.activeWarehouseId,
    );

    // A cross-Workspace identifier (a real Workspace, just not the one
    // named) and a structurally-valid but never-persisted identifier are
    // indistinguishable to every projection: both yield the empty result,
    // never graphB's or graphA's rows.
    const missingWorkspaceId = crypto.randomUUID();
    expect(
      await repository.listWorkspaceRolesWithPermissions(missingWorkspaceId),
    ).toEqual([]);
    expect(await repository.listWorkspaceMembers(missingWorkspaceId)).toEqual(
      [],
    );
    expect(
      await repository.listWorkspaceUsersWithWarehouses(missingWorkspaceId),
    ).toEqual([]);
    expect(
      await repository.listWorkspaceWarehouses(missingWorkspaceId),
    ).toEqual([]);
  });
}

function registerQueryPlanTests(): void {
  it('listWorkspaceMembers is compatible with idx_workspace_memberships_workspace_user', async () => {
    const workspaceId = await persistWorkspace();
    const roleId = await insertWorkspaceRole(workspaceId);
    const userId = await persistUser(workspaceId);
    await insertWorkspaceMembership(userId, workspaceId, roleId);

    const plan = await explainLastQuery(() =>
      repository.listWorkspaceMembers(workspaceId),
    );

    expect(plan.toLowerCase()).toContain(
      'idx_workspace_memberships_workspace_user',
    );
  });

  it('listWorkspaceUsersWithWarehouses is compatible with idx_warehouse_memberships_workspace_user', async () => {
    const workspaceId = await persistWorkspace();
    const warehouseId = await insertWarehouse(workspaceId);
    const userId = await persistUser(workspaceId);
    await insertWarehouseMembership(userId, warehouseId, workspaceId);

    const plan = await explainLastQuery(() =>
      repository.listWorkspaceUsersWithWarehouses(workspaceId),
    );

    expect(plan.toLowerCase()).toContain(
      'idx_warehouse_memberships_workspace_user',
    );
  });

  it('listWorkspaceWarehouses is compatible with idx_warehouses_workspace_name', async () => {
    const workspaceId = await persistWorkspace();
    await insertWarehouse(workspaceId, { name: 'Warehouse A' });

    const plan = await explainLastQuery(() =>
      repository.listWorkspaceWarehouses(workspaceId),
    );

    expect(plan.toLowerCase()).toContain('idx_warehouses_workspace_name');
  });
}

describeIntegration('WorkspaceReadRepository', () => {
  beforeAll(async () => {
    await dataSource.initialize();
  });

  afterEach(async () => {
    await dataSource.query(
      'TRUNCATE warehouse_memberships, workspace_role_permissions, workspace_memberships, workspace_roles, workspace_permissions, roles, warehouses, workspaces, sessions, users, accounts CASCADE',
    );
  });

  afterAll(async () => {
    await dataSource.destroy();
  });

  describe(
    'getWorkspace — identity and name (including the unset state)',
    registerGetWorkspaceTests,
  );

  describe(
    'listWorkspaceRolesWithPermissions and listWorkspacePermissionCatalogue (AC-32)',
    registerRolesAndCatalogueTests,
  );

  describe(
    'listWorkspaceMembers — Members with their Workspace Role assignments (AC-33)',
    registerMembersTests,
  );

  describe(
    'listWorkspaceUsersWithWarehouses — other Users of the Workspace with the Warehouses each belongs to (AC-33)',
    registerUsersWithWarehousesTests,
  );

  describe(
    "listWorkspaceWarehouses — the Workspace's Warehouses with archived state (AC-33)",
    registerWarehousesTests,
  );

  describe('cross-Workspace isolation (AC-34)', registerCrossWorkspaceTests);

  describe(
    'query plans use the data-model.md §Indexes reads',
    registerQueryPlanTests,
  );
});
