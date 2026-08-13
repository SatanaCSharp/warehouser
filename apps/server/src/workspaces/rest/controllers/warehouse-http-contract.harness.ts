import { randomUUID } from 'node:crypto';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';

import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AppModule } from 'app.module';
import { digestSessionSecret } from 'auth/domain/security/session-secret';
import { AUTH_SESSION_COOKIE } from 'auth/rest/auth-cookie';
import { ZodValidationPipe } from 'nestjs-zod';
import dataSource from 'shared/database/data-source';
import { AccountEntity } from 'shared/domain/entities/account.entity';
import { RoleEntity } from 'shared/domain/entities/role.entity';
import { SessionEntity } from 'shared/domain/entities/session.entity';
import { UserEntity } from 'shared/domain/entities/user.entity';
import { WarehouseEntity } from 'shared/domain/entities/warehouse.entity';
import { WarehouseMembershipEntity } from 'shared/domain/entities/warehouse-membership.entity';
import { WorkspaceEntity } from 'shared/domain/entities/workspace.entity';
import { WorkspaceMembershipEntity } from 'shared/domain/entities/workspace-membership.entity';
import { WorkspacePermissionEntity } from 'shared/domain/entities/workspace-permission.entity';
import { WorkspaceRoleEntity } from 'shared/domain/entities/workspace-role.entity';
import { WorkspaceRolePermissionEntity } from 'shared/domain/entities/workspace-role-permission.entity';
import { GlobalHttpExceptionFilter } from 'shared/errors/global-http-exception.filter';

export const describeIntegration =
  process.env.RUN_INTEGRATION === '1' ? describe : describe.skip;

export const now = new Date('2026-08-12T12:00:00.000Z');

export interface Actor {
  readonly userId: string;
  readonly cookie: string;
}

export interface WorkspaceFixture {
  readonly workspaceId: string;
  readonly customWorkspaceRoleId: string;
  readonly warehouseId: string;
  readonly warehouseManagerRoleId: string;
}

export interface HttpContractResponse {
  readonly status: number;
  readonly body: unknown;
}

export interface WarehouseHttpContractHarness {
  readonly request: (
    method: string,
    path: string,
    cookie?: string,
    body?: unknown,
  ) => Promise<HttpContractResponse>;
  readonly seedWorkspace: () => Promise<WorkspaceFixture>;
  readonly seedSecondWarehouse: (
    workspaceId: string,
    archivedAt?: Date | null,
  ) => Promise<string>;
  readonly seedCustomWarehouseRole: (
    warehouseId: string,
    name?: string,
  ) => Promise<string>;
  readonly seedUser: (workspaceId: string) => Promise<string>;
  readonly seedWarehouseMembership: (
    userId: string,
    workspaceId: string,
    warehouseId: string,
    roleId: string,
    roleKind?: 'custom' | 'warehouse_manager',
  ) => Promise<void>;
  readonly seedActor: (
    fixture: WorkspaceFixture,
    permissionIds: readonly string[],
  ) => Promise<Actor>;
}

// This suite boots the real Nest module graph and drives every
// `/api/v1/workspace/warehouses*` operation of `contracts/openapi.yaml` over
// actual HTTP. These routes carry a `warehouseId` in their path yet are
// **Workspace**-scoped, because their subject is the Warehouse record or a
// membership edge into it rather than a resource the Warehouse owns
// (spec.md §1, sad.md §7). T25's `it` coverage is split across two colocated
// spec files by subject — the Warehouse-record lifecycle and the
// membership-edge routes — because one file covering the whole surface
// exceeds the repository's line-count limit; both files share this one
// seeding and request vocabulary instead of maintaining two copies of it.
/** Boots one Nest application per calling spec file and truncates fixture tables between tests.
 * Call this synchronously inside a `describeIntegration(...)` block; it registers that block's
 * `beforeAll`/`afterEach`/`afterAll` hooks itself and returns the shared seeding/request
 * vocabulary the `it` blocks use. */
export const setupWarehouseHttpContractHarness =
  // eslint-disable-next-line max-lines-per-function -- one factory bundling every seeding/request helper both split spec files share is the whole point of extracting it
  (): WarehouseHttpContractHarness => {
    let app: INestApplication;
    let baseUrl: string;

    beforeAll(async () => {
      const moduleRef = await Test.createTestingModule({
        imports: [AppModule],
      }).compile();

      app = moduleRef.createNestApplication();
      app.useGlobalPipes(new ZodValidationPipe());
      app.useGlobalFilters(new GlobalHttpExceptionFilter());
      await app.init();
      await app.listen(0);

      const address = (app.getHttpServer() as Server).address() as AddressInfo;
      baseUrl = `http://127.0.0.1:${address.port}`;

      await dataSource.initialize();
    });

    afterEach(async () => {
      await dataSource.query(
        'TRUNCATE workspace_role_permissions, workspace_memberships, workspace_roles, workspace_permissions, warehouse_memberships, roles, warehouses, sessions, users, accounts, workspaces CASCADE',
      );
    });

    afterAll(async () => {
      await dataSource.destroy();
      await app.close();
    });

    const seedWorkspace = async (): Promise<WorkspaceFixture> => {
      const workspaceId = randomUUID();
      const customWorkspaceRoleId = randomUUID();
      const warehouseId = randomUUID();
      const warehouseManagerRoleId = randomUUID();

      await dataSource.manager.getRepository(WorkspaceEntity).insert({
        id: workspaceId,
        name: 'Test Workspace',
        createdAt: now,
        updatedAt: now,
      });
      await dataSource.manager.getRepository(WorkspaceRoleEntity).insert({
        id: customWorkspaceRoleId,
        workspaceId,
        name: 'Site Administrator',
        kind: 'custom',
        createdAt: now,
        updatedAt: now,
      });
      await dataSource.manager.getRepository(WarehouseEntity).insert({
        id: warehouseId,
        workspaceId,
        name: 'Test Warehouse North',
        archivedAt: null,
        createdAt: now,
        updatedAt: now,
      });
      await dataSource.manager.getRepository(RoleEntity).insert({
        id: warehouseManagerRoleId,
        warehouseId,
        name: 'Warehouse Manager',
        kind: 'warehouse_manager',
        createdAt: now,
        updatedAt: now,
      });

      return {
        workspaceId,
        customWorkspaceRoleId,
        warehouseId,
        warehouseManagerRoleId,
      };
    };

    // A second, non-archived Warehouse of the same Workspace so AC-11a never
    // blocks an archive test that is not itself exercising the last-Warehouse
    // invariant.
    const seedSecondWarehouse = async (
      workspaceId: string,
      archivedAt: Date | null = null,
    ): Promise<string> => {
      const warehouseId = randomUUID();
      await dataSource.manager.getRepository(WarehouseEntity).insert({
        id: warehouseId,
        workspaceId,
        name: 'Test Warehouse South',
        archivedAt,
        createdAt: now,
        updatedAt: now,
      });
      return warehouseId;
    };

    const seedCustomWarehouseRole = async (
      warehouseId: string,
      name = 'Picker',
    ): Promise<string> => {
      const roleId = randomUUID();
      await dataSource.manager.getRepository(RoleEntity).insert({
        id: roleId,
        warehouseId,
        name,
        kind: 'custom',
        createdAt: now,
        updatedAt: now,
      });
      return roleId;
    };

    const grantWorkspacePermissions = async (
      workspaceRoleId: string,
      permissionIds: readonly string[],
    ): Promise<void> => {
      await dataSource.manager.getRepository(WorkspacePermissionEntity).upsert(
        permissionIds.map((permissionId) => ({
          id: permissionId,
          label: permissionId,
          kind: 'assignable' as const,
          createdAt: now,
          updatedAt: now,
        })),
        ['id'],
      );
      await dataSource.manager
        .getRepository(WorkspaceRolePermissionEntity)
        .insert(
          permissionIds.map((workspacePermissionId) => ({
            workspaceRoleId,
            workspacePermissionId,
            workspaceRoleKind: 'custom' as const,
            workspacePermissionKind: 'assignable' as const,
          })),
        );
    };

    // `accounts.user_id` / `users.account_id` form a deferred circular FK pair,
    // so both inserts must run inside one transaction.
    const seedUser = async (workspaceId: string): Promise<string> => {
      const userId = randomUUID();
      await dataSource.transaction(async (manager) => {
        await manager.getRepository(AccountEntity).insert({
          id: userId,
          userId,
          normalizedEmail: `member.${userId}@example.test`,
          passwordHash: 'synthetic-hash',
          passwordHashAlgorithm: 'scrypt',
          passwordHashParameters: { cost: 1_024 },
          createdAt: now,
          updatedAt: now,
        });
        await manager.getRepository(UserEntity).insert({
          id: userId,
          accountId: userId,
          workspaceId,
          createdAt: now,
          updatedAt: now,
        });
      });
      return userId;
    };

    const seedWorkspaceMembership = async (
      userId: string,
      workspaceId: string,
      workspaceRoleId: string,
    ): Promise<void> => {
      await dataSource.manager.getRepository(WorkspaceMembershipEntity).insert({
        userId,
        workspaceId,
        workspaceRoleId,
        workspaceRoleKind: 'custom',
        createdAt: now,
        updatedAt: now,
      });
    };

    const seedWarehouseMembership = async (
      userId: string,
      workspaceId: string,
      warehouseId: string,
      roleId: string,
      roleKind: 'custom' | 'warehouse_manager' = 'custom',
    ): Promise<void> => {
      await dataSource.manager.getRepository(WarehouseMembershipEntity).insert({
        userId,
        warehouseId,
        workspaceId,
        roleId,
        roleKind,
        createdAt: now,
        updatedAt: now,
      });
    };

    const seedSessionCookie = async (accountId: string): Promise<string> => {
      const secret = randomUUID();
      const establishedAt = new Date();
      await dataSource.manager.getRepository(SessionEntity).insert({
        id: randomUUID(),
        accountId,
        secretDigest: digestSessionSecret(secret),
        establishedAt,
        expiresAt: new Date(establishedAt.getTime() + 60 * 60 * 1000),
        revokedAt: null,
      });
      return `${AUTH_SESSION_COOKIE}=${secret}`;
    };

    /** A Workspace Member of `fixture` holding exactly the given Workspace Permissions, with a
     * Warehouse Manager membership in `fixture.warehouseId` (so self-target rules in the membership
     * routes never accidentally trip on a target lacking one). */
    const seedActor = async (
      fixture: WorkspaceFixture,
      permissionIds: readonly string[],
    ): Promise<Actor> => {
      const userId = await seedUser(fixture.workspaceId);
      await grantWorkspacePermissions(
        fixture.customWorkspaceRoleId,
        permissionIds,
      );
      await seedWorkspaceMembership(
        userId,
        fixture.workspaceId,
        fixture.customWorkspaceRoleId,
      );
      return { userId, cookie: await seedSessionCookie(userId) };
    };

    const request = async (
      method: string,
      path: string,
      cookie?: string,
      body?: unknown,
    ): Promise<HttpContractResponse> => {
      const response = await fetch(`${baseUrl}${path}`, {
        method,
        headers: {
          'content-type': 'application/json',
          ...(cookie ? { cookie } : {}),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const text = await response.text();
      return {
        status: response.status,
        body: text ? JSON.parse(text) : undefined,
      };
    };

    return {
      request,
      seedWorkspace,
      seedSecondWarehouse,
      seedCustomWarehouseRole,
      seedUser,
      seedWarehouseMembership,
      seedActor,
    };
  };
