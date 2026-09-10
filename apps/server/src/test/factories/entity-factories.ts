import { randomBytes, randomUUID } from 'node:crypto';

import dataSource from 'shared/database/data-source.js';
import { AccountEntity } from 'shared/domain/entities/account.entity.js';
import { RoleEntity } from 'shared/domain/entities/role.entity.js';
import type { SessionEntity } from 'shared/domain/entities/session.entity.js';
import { UserEntity } from 'shared/domain/entities/user.entity.js';
import { WarehouseEntity } from 'shared/domain/entities/warehouse.entity.js';
import { WarehouseMembershipEntity } from 'shared/domain/entities/warehouse-membership.entity.js';
import { WorkspaceEntity } from 'shared/domain/entities/workspace.entity.js';
import { WorkspaceMembershipEntity } from 'shared/domain/entities/workspace-membership.entity.js';
import { WorkspacePermissionEntity } from 'shared/domain/entities/workspace-permission.entity.js';
import { WorkspaceRoleEntity } from 'shared/domain/entities/workspace-role.entity.js';
import { WorkspaceRolePermissionEntity } from 'shared/domain/entities/workspace-role-permission.entity.js';
import type { DeepPartial, EntityManager } from 'typeorm';

/**
 * Builds a valid `DeepPartial<AccountEntity>` for tests: a synthetic
 * `*.test` email, a scrypt-shaped (but not cryptographically real)
 * credential, and the `id === userId` identity-pairing invariant enforced by
 * `chk_accounts_user_identity_pair`.
 */
export const accountEntityFactory = (
  overrides: DeepPartial<AccountEntity> = {},
): DeepPartial<AccountEntity> => {
  const id = overrides.id ?? randomUUID();
  const now = new Date();

  return {
    normalizedEmail: `member.${randomUUID()}@example.test`,
    passwordHash: randomUUID().replace(/-/gu, ''),
    passwordHashAlgorithm: 'scrypt',
    passwordHashParameters: {
      cost: 131_072,
      blockSize: 8,
      parallelization: 1,
      keyLength: 32,
      maxMemory: 256 * 1024 * 1024,
      salt: randomUUID(),
    },
    createdAt: now,
    updatedAt: now,
    ...overrides,
    // Identity-pairing invariant (`chk_accounts_user_identity_pair`) always
    // holds — a caller may pin a specific identity via `overrides.id`, but
    // `userId` follows `id` and is never independently overridable.
    id,
    userId: id,
  };
};

/**
 * Builds a valid `DeepPartial<UserEntity>` deriving its identity from a
 * given `AccountEntity`, satisfying `chk_users_account_identity_pair`
 * (`UserEntity.id === UserEntity.accountId === AccountEntity.id`).
 */
export const userEntityFactory = (
  account: DeepPartial<AccountEntity>,
  overrides: DeepPartial<UserEntity> = {},
): DeepPartial<UserEntity> => {
  const now = new Date();

  return {
    createdAt: now,
    updatedAt: now,
    ...overrides,
    // Identity-pairing invariant (`chk_users_account_identity_pair`) is not
    // overridable: id === accountId === account.id always.
    id: account.id,
    accountId: account.id,
  };
};

/**
 * Builds a valid, `custom`-kind `DeepPartial<WarehouseMembershipEntity>`.
 * `roleKind` is always forced to `'custom'` (AC-20): a newly created member
 * is never granted the reserved `warehouse_manager` kind, even under an
 * explicit override attempt.
 */
export const warehouseMembershipEntityFactory = (
  overrides: DeepPartial<WarehouseMembershipEntity> &
    Pick<WarehouseMembershipEntity, 'userId' | 'warehouseId' | 'roleId'>,
): DeepPartial<WarehouseMembershipEntity> => {
  const now = new Date();

  return {
    createdAt: now,
    updatedAt: now,
    ...overrides,
    roleKind: 'custom',
  };
};

/**
 * Builds a valid, non-revoked `DeepPartial<SessionEntity>` for a given
 * `AccountEntity`.
 */
export const sessionEntityFactory = (
  account: DeepPartial<AccountEntity>,
  overrides: DeepPartial<SessionEntity> = {},
): DeepPartial<SessionEntity> => {
  const establishedAt = new Date();
  const expiresAt = new Date(establishedAt.getTime() + 60 * 60 * 1000);

  return {
    id: randomUUID(),
    // `chk_sessions_secret_digest_length` requires exactly 32 bytes
    // (`octet_length(secret_digest) = 32`), matching a real digest's size.
    secretDigest: randomBytes(32),
    establishedAt,
    expiresAt,
    revokedAt: null,
    ...overrides,
    accountId: account.id,
  };
};

/**
 * Builds a valid `DeepPartial<WorkspaceEntity>`, unnamed by default so the
 * AC-29 placeholder path ([data-model.md §Test
 * fixtures](../../../../docs/features/workspaces/data-model.md#test-fixtures))
 * is the default fixture shape.
 */
export const buildWorkspace = (
  overrides: DeepPartial<WorkspaceEntity> = {},
): DeepPartial<WorkspaceEntity> => {
  const now = new Date();

  return {
    id: randomUUID(),
    name: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
};

/**
 * Produces a synthetic, catalogue-shaped identifier matching
 * `chk_workspace_permissions_identifier`
 * (`^[A-Z][A-Z0-9_]*:[A-Z][A-Z0-9_]*$`) without colliding with the real
 * seeded catalogue.
 */
const syntheticWorkspacePermissionId = (): string =>
  `WORKSPACE_PERMISSIONS_FIXTURE:F${randomUUID().replace(/-/gu, '').toUpperCase()}`;

/**
 * Builds a valid `DeepPartial<WorkspacePermissionEntity>`, `assignable` by
 * default; `reserved` is explicit via `overrides.kind`.
 */
export const buildWorkspacePermission = (
  overrides: DeepPartial<WorkspacePermissionEntity> = {},
): DeepPartial<WorkspacePermissionEntity> => {
  const now = new Date();

  return {
    id: syntheticWorkspacePermissionId(),
    label: 'Synthetic Workspace Permission fixture',
    kind: 'assignable',
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
};

/**
 * Builds a valid, Workspace-scoped `DeepPartial<WorkspaceRoleEntity>`; the
 * `custom` kind is the default and `workspace_owner` is explicit via
 * `overrides.kind`. `workspaceId` has no safe default (it must reference an
 * already-persisted Workspace), so it is required.
 */
export const buildWorkspaceRole = (
  overrides: DeepPartial<WorkspaceRoleEntity> &
    Pick<WorkspaceRoleEntity, 'workspaceId'>,
): DeepPartial<WorkspaceRoleEntity> => {
  const now = new Date();

  return {
    id: randomUUID(),
    name: `Custom Workspace Role ${randomUUID()}`,
    kind: 'custom',
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
};

/**
 * Pairs a User with a same-Workspace Workspace Role. Every composite-key
 * field (`userId`, `workspaceId`, `workspaceRoleId`) has no safe default and
 * is required; `workspaceRoleKind` defaults to `custom`.
 */
export const buildWorkspaceMembership = (
  overrides: DeepPartial<WorkspaceMembershipEntity> &
    Pick<
      WorkspaceMembershipEntity,
      'userId' | 'workspaceId' | 'workspaceRoleId'
    >,
): DeepPartial<WorkspaceMembershipEntity> => {
  const now = new Date();

  return {
    workspaceRoleKind: 'custom',
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
};

/**
 * Builds a valid `DeepPartial<WarehouseEntity>`, `archivedAt: null` by
 * default. `workspaceId` has no safe default (it must reference an
 * already-persisted Workspace), so it is required.
 */
export const buildWarehouse = (
  overrides: DeepPartial<WarehouseEntity> &
    Pick<WarehouseEntity, 'workspaceId'>,
): DeepPartial<WarehouseEntity> => {
  const now = new Date();

  return {
    id: randomUUID(),
    name: `Warehouse ${randomUUID()}`,
    archivedAt: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
};

/**
 * Builds a valid `DeepPartial<WarehouseMembershipEntity>`, keyed by (User,
 * Warehouse) and carrying `workspaceId`. Every composite/reference field
 * (`userId`, `warehouseId`, `workspaceId`, `roleId`) has no safe default and
 * is required; `roleKind` defaults to `custom`.
 */
export const buildWarehouseMembership = (
  overrides: DeepPartial<WarehouseMembershipEntity> &
    Pick<
      WarehouseMembershipEntity,
      'userId' | 'warehouseId' | 'workspaceId' | 'roleId'
    >,
): DeepPartial<WarehouseMembershipEntity> => {
  const now = new Date();

  return {
    roleKind: 'custom',
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
};

/**
 * Inserts a synthetic, `example.test`-addressed Account+User identity pair
 * inside the given (already-open) transaction manager. `accounts.user_id` /
 * `users.account_id` form a deferred circular FK pair, so both inserts must
 * land inside the same transaction — see every other integration spec under
 * this directory for the identical pattern.
 */
const persistIdentity = async (
  manager: EntityManager,
  userId: string,
  workspaceId: string,
  normalizedEmail: string,
): Promise<void> => {
  const now = new Date();
  await manager.getRepository(AccountEntity).insert(
    accountEntityFactory({
      id: userId,
      userId,
      normalizedEmail,
      createdAt: now,
      updatedAt: now,
    }),
  );
  await manager.getRepository(UserEntity).insert({
    id: userId,
    accountId: userId,
    workspaceId,
    createdAt: now,
    updatedAt: now,
  });
};

export interface PersistedWorkspaceGraph {
  readonly workspaceId: string;
  readonly ownerRoleId: string;
  readonly ownerUserId: string;
  readonly memberUserId: string;
  readonly activeWarehouseId: string;
  readonly archivedWarehouseId: string;
  readonly archivedWarehouseManagerUserId: string;
}

const persistWorkspaceGraphWithManager = async (
  overrides: DeepPartial<WorkspaceEntity>,
  manager: EntityManager,
): Promise<PersistedWorkspaceGraph> => {
  const now = new Date();

  const workspace = buildWorkspace(overrides);
  await manager.getRepository(WorkspaceEntity).insert(workspace);
  const workspaceId = workspace.id as string;

  const ownerRole = buildWorkspaceRole({
    workspaceId,
    kind: 'workspace_owner',
    name: 'Workspace Owner',
  });
  await manager.getRepository(WorkspaceRoleEntity).insert(ownerRole);

  // A synthetic grant, not the real seeded catalogue: other tests in this
  // suite truncate `workspace_permissions` in their own `afterEach`, so this
  // fixture must not depend on the migration-seeded rows surviving.
  const ownerGrant = buildWorkspacePermission();
  await manager.getRepository(WorkspacePermissionEntity).insert(ownerGrant);
  await manager.getRepository(WorkspaceRolePermissionEntity).insert({
    workspaceRoleId: ownerRole.id as string,
    workspacePermissionId: ownerGrant.id as string,
    workspaceRoleKind: 'workspace_owner',
    workspacePermissionKind: ownerGrant.kind,
  });

  const activeWarehouse = buildWarehouse({ workspaceId, createdAt: now });
  const archivedWarehouse = buildWarehouse({
    workspaceId,
    createdAt: now,
    archivedAt: now,
  });
  await manager
    .getRepository(WarehouseEntity)
    .insert([activeWarehouse, archivedWarehouse]);
  const activeWarehouseId = activeWarehouse.id as string;
  const archivedWarehouseId = archivedWarehouse.id as string;

  const activeManagerRoleId = randomUUID();
  const activeCustomRoleId = randomUUID();
  const archivedManagerRoleId = randomUUID();
  await manager.getRepository(RoleEntity).insert([
    {
      id: activeManagerRoleId,
      warehouseId: activeWarehouseId,
      name: 'Warehouse Manager',
      kind: 'warehouse_manager',
      createdAt: now,
      updatedAt: now,
    },
    {
      id: activeCustomRoleId,
      warehouseId: activeWarehouseId,
      name: 'Custom Warehouse Role',
      kind: 'custom',
      createdAt: now,
      updatedAt: now,
    },
    {
      id: archivedManagerRoleId,
      warehouseId: archivedWarehouseId,
      name: 'Warehouse Manager',
      kind: 'warehouse_manager',
      createdAt: now,
      updatedAt: now,
    },
  ]);

  const ownerUserId = randomUUID();
  const memberUserId = randomUUID();
  const archivedWarehouseManagerUserId = randomUUID();
  await persistIdentity(
    manager,
    ownerUserId,
    workspaceId,
    `workspace.owner.${randomUUID()}@example.test`,
  );
  await persistIdentity(
    manager,
    memberUserId,
    workspaceId,
    `workspace.member.${randomUUID()}@example.test`,
  );
  await persistIdentity(
    manager,
    archivedWarehouseManagerUserId,
    workspaceId,
    `workspace.archived-manager.${randomUUID()}@example.test`,
  );

  await manager.getRepository(WorkspaceMembershipEntity).insert(
    buildWorkspaceMembership({
      userId: ownerUserId,
      workspaceId,
      workspaceRoleId: ownerRole.id as string,
      workspaceRoleKind: 'workspace_owner',
    }),
  );

  await manager.getRepository(WarehouseMembershipEntity).insert([
    buildWarehouseMembership({
      userId: ownerUserId,
      warehouseId: activeWarehouseId,
      workspaceId,
      roleId: activeManagerRoleId,
      roleKind: 'warehouse_manager',
    }),
    buildWarehouseMembership({
      userId: memberUserId,
      warehouseId: activeWarehouseId,
      workspaceId,
      roleId: activeCustomRoleId,
    }),
    buildWarehouseMembership({
      userId: archivedWarehouseManagerUserId,
      warehouseId: archivedWarehouseId,
      workspaceId,
      roleId: archivedManagerRoleId,
      roleKind: 'warehouse_manager',
    }),
  ]);

  return {
    workspaceId,
    ownerRoleId: ownerRole.id as string,
    ownerUserId,
    memberUserId,
    activeWarehouseId,
    archivedWarehouseId,
    archivedWarehouseManagerUserId,
  };
};

/**
 * Persists a Workspace, its protected Owner Role and grants, two Warehouses
 * (one archived) with their Roles, and Warehouse memberships for several
 * Users — the fixture graph [data-model.md §Test
 * fixtures](../../../../docs/features/workspaces/data-model.md#test-fixtures)
 * specifies. Runs inside the given (already-open) transaction manager when
 * one is supplied, so a caller retains ownership of commit/rollback; opens
 * its own transaction otherwise, since the identity pairs it seeds require
 * one regardless.
 */
export const persistWorkspaceGraph = (
  overrides: DeepPartial<WorkspaceEntity> = {},
  manager?: EntityManager,
): Promise<PersistedWorkspaceGraph> => {
  if (manager) {
    return persistWorkspaceGraphWithManager(overrides, manager);
  }
  return dataSource.transaction((transactionManager) =>
    persistWorkspaceGraphWithManager(overrides, transactionManager),
  );
};
