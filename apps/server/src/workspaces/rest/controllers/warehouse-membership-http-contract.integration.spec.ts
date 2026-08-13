import { randomUUID } from 'node:crypto';

import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { WorkspacePermissionId } from '@warehouser/shared-types/enums';
import { AppModule } from 'app.module';
import { digestSessionSecret } from 'auth/domain/security/session-secret';
import { AUTH_SESSION_COOKIE } from 'auth/rest/auth-cookie';
import { ZodValidationPipe } from 'nestjs-zod';
import dataSource from 'shared/database/data-source';
import { AccountEntity } from 'shared/domain/entities/account.entity';
import { SessionEntity } from 'shared/domain/entities/session.entity';
import { UserEntity } from 'shared/domain/entities/user.entity';
import { WarehouseEntity } from 'shared/domain/entities/warehouse.entity';
import { WorkspaceEntity } from 'shared/domain/entities/workspace.entity';
import { WorkspaceMembershipEntity } from 'shared/domain/entities/workspace-membership.entity';
import { WorkspacePermissionEntity } from 'shared/domain/entities/workspace-permission.entity';
import { WorkspaceRoleEntity } from 'shared/domain/entities/workspace-role.entity';
import { WorkspaceRolePermissionEntity } from 'shared/domain/entities/workspace-role-permission.entity';
import { WarehouseLifecycleRepository } from 'shared/domain/repositories/warehouse-lifecycle.repository';
import { GlobalHttpExceptionFilter } from 'shared/errors/global-http-exception.filter';
import {
  describeIntegration,
  now,
  setupWarehouseHttpContractHarness,
} from 'workspaces/rest/controllers/warehouse-http-contract.harness';

// T25 DoD — the membership-edge half of the `/api/v1/workspace/warehouses*`
// HTTP contract: `GET /:warehouseId/assignable-roles`,
// `POST /:warehouseId/memberships`, `DELETE /:warehouseId/memberships/:userId`.
// These routes carry a `warehouseId` in their path yet are
// **Workspace**-scoped (spec.md §1, sad.md §7) — every AC-11 case below
// proves that classification by exercising the route against an
// already-archived Warehouse. See `warehouse-http-contract.harness.ts` for
// the shared seeding/request vocabulary and
// `warehouse-record-http-contract.integration.spec.ts` for the
// Warehouse-record half.
// eslint-disable-next-line max-lines-per-function -- one suite covering a membership-edge surface plus its own unavailable-outcome branches is inherently long
describeIntegration('warehouse HTTP contract — membership edges', () => {
  const {
    request,
    seedWorkspace,
    seedCustomWarehouseRole,
    seedUser,
    seedWarehouseMembership,
    seedActor,
  } = setupWarehouseHttpContractHarness();

  describe('GET /api/v1/workspace/warehouses/{warehouseId}/assignable-roles', () => {
    it('returns identifiers and names only (AC-23a)', async () => {
      const fixture = await seedWorkspace();
      const pickerRoleId = await seedCustomWarehouseRole(
        fixture.warehouseId,
        'Picker',
      );
      const actor = await seedActor(fixture, [
        WorkspacePermissionId.WAREHOUSE_MEMBERSHIPS_ASSIGN,
      ]);

      const { status, body } = await request(
        'GET',
        `/api/v1/workspace/warehouses/${fixture.warehouseId}/assignable-roles`,
        actor.cookie,
      );

      expect(status).toBe(200);
      expect(body).toEqual([{ id: pickerRoleId, name: 'Picker' }]);
    });

    // AC-11 — the narrow read stays available on an archived Warehouse.
    it('reads assignable Roles of an archived Warehouse (AC-11)', async () => {
      const fixture = await seedWorkspace();
      await dataSource.manager
        .getRepository(WarehouseEntity)
        .update({ id: fixture.warehouseId }, { archivedAt: now });
      const pickerRoleId = await seedCustomWarehouseRole(
        fixture.warehouseId,
        'Picker',
      );
      const actor = await seedActor(fixture, [
        WorkspacePermissionId.WAREHOUSE_MEMBERSHIPS_ASSIGN,
      ]);

      const { status, body } = await request(
        'GET',
        `/api/v1/workspace/warehouses/${fixture.warehouseId}/assignable-roles`,
        actor.cookie,
      );

      expect(status).toBe(200);
      expect(body).toEqual([{ id: pickerRoleId, name: 'Picker' }]);
    });

    // openapi.yaml documents 404 TargetUnavailable for this route: the read
    // of a Warehouse of another Workspace (or a missing one) must fail
    // identically, disclosing neither (mirrors AC-10/AC-24's non-enumeration
    // for the other Workspace-scoped Warehouse routes).
    it('reports a cross-Workspace Warehouse exactly as a missing one', async () => {
      const fixture = await seedWorkspace();
      const other = await seedWorkspace();
      const actor = await seedActor(fixture, [
        WorkspacePermissionId.WAREHOUSE_MEMBERSHIPS_ASSIGN,
      ]);

      const crossWorkspace = await request(
        'GET',
        `/api/v1/workspace/warehouses/${other.warehouseId}/assignable-roles`,
        actor.cookie,
      );
      const missing = await request(
        'GET',
        `/api/v1/workspace/warehouses/${randomUUID()}/assignable-roles`,
        actor.cookie,
      );

      expect(crossWorkspace.status).toBe(404);
      expect(crossWorkspace.body).toMatchObject({
        code: 'workspace.target_unavailable',
      });
      expect(crossWorkspace).toEqual(missing);
    });

    it('denies a read to an actor without WAREHOUSE_MEMBERSHIPS:ASSIGN', async () => {
      const fixture = await seedWorkspace();
      const actor = await seedActor(fixture, [
        WorkspacePermissionId.WAREHOUSES_WATCH,
      ]);

      const { status, body } = await request(
        'GET',
        `/api/v1/workspace/warehouses/${fixture.warehouseId}/assignable-roles`,
        actor.cookie,
      );

      expect(status).toBe(403);
      expect(body).toMatchObject({ code: 'workspace.denied' });
    });
  });

  describe('POST /api/v1/workspace/warehouses/{warehouseId}/memberships', () => {
    it('assigns a membership and returns 201 (AC-23)', async () => {
      const fixture = await seedWorkspace();
      const pickerRoleId = await seedCustomWarehouseRole(fixture.warehouseId);
      const actor = await seedActor(fixture, [
        WorkspacePermissionId.WAREHOUSE_MEMBERSHIPS_ASSIGN,
      ]);
      const targetId = await seedUser(fixture.workspaceId);

      const { status, body } = await request(
        'POST',
        `/api/v1/workspace/warehouses/${fixture.warehouseId}/memberships`,
        actor.cookie,
        { userId: targetId, roleId: pickerRoleId },
      );

      expect(status).toBe(201);
      expect(body).toEqual({
        userId: targetId,
        warehouseId: fixture.warehouseId,
        roleId: pickerRoleId,
        roleKind: 'custom',
      });
    });

    // AC-11 — assigning a membership is a Workspace capability over a
    // membership edge and stays available on an archived Warehouse.
    it('assigns a membership on an archived Warehouse (AC-11)', async () => {
      const fixture = await seedWorkspace();
      const pickerRoleId = await seedCustomWarehouseRole(fixture.warehouseId);
      await dataSource.manager
        .getRepository(WarehouseEntity)
        .update({ id: fixture.warehouseId }, { archivedAt: now });
      const actor = await seedActor(fixture, [
        WorkspacePermissionId.WAREHOUSE_MEMBERSHIPS_ASSIGN,
      ]);
      const targetId = await seedUser(fixture.workspaceId);

      const { status, body } = await request(
        'POST',
        `/api/v1/workspace/warehouses/${fixture.warehouseId}/memberships`,
        actor.cookie,
        { userId: targetId, roleId: pickerRoleId },
      );

      expect(status).toBe(201);
      expect(body).toMatchObject({
        userId: targetId,
        warehouseId: fixture.warehouseId,
      });
    });

    it('rejects a request whose body is not the agreed schema', async () => {
      const fixture = await seedWorkspace();
      const actor = await seedActor(fixture, [
        WorkspacePermissionId.WAREHOUSE_MEMBERSHIPS_ASSIGN,
      ]);

      const { status } = await request(
        'POST',
        `/api/v1/workspace/warehouses/${fixture.warehouseId}/memberships`,
        actor.cookie,
        { userId: 'not-a-uuid', roleId: 'not-a-uuid' },
      );

      expect(status).toBe(400);
    });

    // AC-24/AC-25 — the protected Warehouse Manager Role can never be an
    // assignment destination.
    it('refuses to assign the protected Warehouse Manager Role', async () => {
      const fixture = await seedWorkspace();
      const actor = await seedActor(fixture, [
        WorkspacePermissionId.WAREHOUSE_MEMBERSHIPS_ASSIGN,
      ]);
      const targetId = await seedUser(fixture.workspaceId);

      const { status, body } = await request(
        'POST',
        `/api/v1/workspace/warehouses/${fixture.warehouseId}/memberships`,
        actor.cookie,
        { userId: targetId, roleId: fixture.warehouseManagerRoleId },
      );

      expect(status).toBe(409);
      expect(body).toMatchObject({
        code: 'workspace.manager_transfer_required',
      });
    });

    // AC-24 — the target User, the Warehouse and the Role must all belong to
    // the actor's own Workspace; a cross-Workspace target and a missing one
    // fail identically without disclosing which.
    it('reports a cross-Workspace target User exactly as a missing one', async () => {
      const fixture = await seedWorkspace();
      const pickerRoleId = await seedCustomWarehouseRole(fixture.warehouseId);
      const other = await seedWorkspace();
      const otherUserId = await seedUser(other.workspaceId);
      const actor = await seedActor(fixture, [
        WorkspacePermissionId.WAREHOUSE_MEMBERSHIPS_ASSIGN,
      ]);

      const crossWorkspace = await request(
        'POST',
        `/api/v1/workspace/warehouses/${fixture.warehouseId}/memberships`,
        actor.cookie,
        { userId: otherUserId, roleId: pickerRoleId },
      );
      const missing = await request(
        'POST',
        `/api/v1/workspace/warehouses/${fixture.warehouseId}/memberships`,
        actor.cookie,
        { userId: randomUUID(), roleId: pickerRoleId },
      );

      expect(crossWorkspace.status).toBe(404);
      expect(crossWorkspace.body).toMatchObject({
        code: 'workspace.target_unavailable',
      });
      expect(crossWorkspace).toEqual(missing);
    });

    // AC-25a — a member never grants themself a membership in an existing
    // Warehouse; authority over a Warehouse that already has members is
    // always granted by someone else.
    it('refuses to grant the acting member a membership in their own Workspace (AC-25a)', async () => {
      const fixture = await seedWorkspace();
      const pickerRoleId = await seedCustomWarehouseRole(fixture.warehouseId);
      const actor = await seedActor(fixture, [
        WorkspacePermissionId.WAREHOUSE_MEMBERSHIPS_ASSIGN,
      ]);

      const { status, body } = await request(
        'POST',
        `/api/v1/workspace/warehouses/${fixture.warehouseId}/memberships`,
        actor.cookie,
        { userId: actor.userId, roleId: pickerRoleId },
      );

      expect(status).toBe(409);
      expect(body).toMatchObject({ code: 'workspace.self_action_denied' });
    });

    // AC-25 — a User holds at most one Role in any one Warehouse.
    it('refuses a second membership in the same Warehouse for the same User (AC-25)', async () => {
      const fixture = await seedWorkspace();
      const pickerRoleId = await seedCustomWarehouseRole(
        fixture.warehouseId,
        'Picker',
      );
      const supervisorRoleId = await seedCustomWarehouseRole(
        fixture.warehouseId,
        'Site Supervisor',
      );
      const actor = await seedActor(fixture, [
        WorkspacePermissionId.WAREHOUSE_MEMBERSHIPS_ASSIGN,
      ]);
      const targetId = await seedUser(fixture.workspaceId);
      await seedWarehouseMembership(
        targetId,
        fixture.workspaceId,
        fixture.warehouseId,
        pickerRoleId,
      );

      const { status, body } = await request(
        'POST',
        `/api/v1/workspace/warehouses/${fixture.warehouseId}/memberships`,
        actor.cookie,
        { userId: targetId, roleId: supervisorRoleId },
      );

      expect(status).toBe(409);
      expect(body).toMatchObject({ code: 'workspace.membership_exists' });
    });

    it('denies a grant to an actor without WAREHOUSE_MEMBERSHIPS:ASSIGN', async () => {
      const fixture = await seedWorkspace();
      const pickerRoleId = await seedCustomWarehouseRole(fixture.warehouseId);
      const actor = await seedActor(fixture, [
        WorkspacePermissionId.WAREHOUSES_WATCH,
      ]);
      const targetId = await seedUser(fixture.workspaceId);

      const { status, body } = await request(
        'POST',
        `/api/v1/workspace/warehouses/${fixture.warehouseId}/memberships`,
        actor.cookie,
        { userId: targetId, roleId: pickerRoleId },
      );

      expect(status).toBe(403);
      expect(body).toMatchObject({ code: 'workspace.denied' });
    });
  });

  describe('DELETE /api/v1/workspace/warehouses/{warehouseId}/memberships/{userId}', () => {
    it('withdraws a membership with 204 (AC-25b)', async () => {
      const fixture = await seedWorkspace();
      const pickerRoleId = await seedCustomWarehouseRole(fixture.warehouseId);
      const actor = await seedActor(fixture, [
        WorkspacePermissionId.WAREHOUSE_MEMBERSHIPS_REVOKE,
      ]);
      const targetId = await seedUser(fixture.workspaceId);
      await seedWarehouseMembership(
        targetId,
        fixture.workspaceId,
        fixture.warehouseId,
        pickerRoleId,
      );

      const { status } = await request(
        'DELETE',
        `/api/v1/workspace/warehouses/${fixture.warehouseId}/memberships/${targetId}`,
        actor.cookie,
      );

      expect(status).toBe(204);
    });

    // AC-11 — withdrawing a membership stays available on an archived
    // Warehouse.
    it('withdraws a membership on an archived Warehouse (AC-11)', async () => {
      const fixture = await seedWorkspace();
      const pickerRoleId = await seedCustomWarehouseRole(fixture.warehouseId);
      const actor = await seedActor(fixture, [
        WorkspacePermissionId.WAREHOUSE_MEMBERSHIPS_REVOKE,
      ]);
      const targetId = await seedUser(fixture.workspaceId);
      await seedWarehouseMembership(
        targetId,
        fixture.workspaceId,
        fixture.warehouseId,
        pickerRoleId,
      );
      await dataSource.manager
        .getRepository(WarehouseEntity)
        .update({ id: fixture.warehouseId }, { archivedAt: now });

      const { status } = await request(
        'DELETE',
        `/api/v1/workspace/warehouses/${fixture.warehouseId}/memberships/${targetId}`,
        actor.cookie,
      );

      expect(status).toBe(204);
    });

    // AC-25d — withdrawing a membership in a Warehouse of another Workspace
    // is denied without disclosing that the Warehouse or the membership
    // exists: reported exactly as a missing membership.
    it('reports a cross-Workspace membership exactly as a missing one (AC-25d)', async () => {
      const fixture = await seedWorkspace();
      const other = await seedWorkspace();
      const targetId = await seedUser(other.workspaceId);
      await seedWarehouseMembership(
        targetId,
        other.workspaceId,
        other.warehouseId,
        other.warehouseManagerRoleId,
        'warehouse_manager',
      );
      const actor = await seedActor(fixture, [
        WorkspacePermissionId.WAREHOUSE_MEMBERSHIPS_REVOKE,
      ]);

      const crossWorkspace = await request(
        'DELETE',
        `/api/v1/workspace/warehouses/${other.warehouseId}/memberships/${targetId}`,
        actor.cookie,
      );
      const missing = await request(
        'DELETE',
        `/api/v1/workspace/warehouses/${fixture.warehouseId}/memberships/${randomUUID()}`,
        actor.cookie,
      );

      expect(crossWorkspace.status).toBe(404);
      expect(crossWorkspace.body).toMatchObject({
        code: 'workspace.target_unavailable',
      });
      expect(crossWorkspace).toEqual(missing);
    });

    // AC-25c — the membership carrying the protected Warehouse Manager Role
    // is never withdrawn through ordinary revocation.
    it('refuses to withdraw the protected Warehouse Manager membership (AC-25c)', async () => {
      const fixture = await seedWorkspace();
      const actor = await seedActor(fixture, [
        WorkspacePermissionId.WAREHOUSE_MEMBERSHIPS_REVOKE,
      ]);
      const managerId = await seedUser(fixture.workspaceId);
      await seedWarehouseMembership(
        managerId,
        fixture.workspaceId,
        fixture.warehouseId,
        fixture.warehouseManagerRoleId,
        'warehouse_manager',
      );

      const { status, body } = await request(
        'DELETE',
        `/api/v1/workspace/warehouses/${fixture.warehouseId}/memberships/${managerId}`,
        actor.cookie,
      );

      expect(status).toBe(409);
      expect(body).toMatchObject({
        code: 'workspace.manager_transfer_required',
      });
    });

    // AC-25c — a member never withdraws their own Warehouse authority.
    it("refuses to withdraw the actor's own membership (AC-25c)", async () => {
      const fixture = await seedWorkspace();
      const pickerRoleId = await seedCustomWarehouseRole(fixture.warehouseId);
      const actor = await seedActor(fixture, [
        WorkspacePermissionId.WAREHOUSE_MEMBERSHIPS_REVOKE,
      ]);
      await seedWarehouseMembership(
        actor.userId,
        fixture.workspaceId,
        fixture.warehouseId,
        pickerRoleId,
      );

      const { status, body } = await request(
        'DELETE',
        `/api/v1/workspace/warehouses/${fixture.warehouseId}/memberships/${actor.userId}`,
        actor.cookie,
      );

      expect(status).toBe(409);
      expect(body).toMatchObject({ code: 'workspace.self_action_denied' });
    });

    it('denies a withdrawal to an actor without WAREHOUSE_MEMBERSHIPS:REVOKE', async () => {
      const fixture = await seedWorkspace();
      const pickerRoleId = await seedCustomWarehouseRole(fixture.warehouseId);
      const actor = await seedActor(fixture, [
        WorkspacePermissionId.WAREHOUSES_WATCH,
      ]);
      const targetId = await seedUser(fixture.workspaceId);
      await seedWarehouseMembership(
        targetId,
        fixture.workspaceId,
        fixture.warehouseId,
        pickerRoleId,
      );

      const { status, body } = await request(
        'DELETE',
        `/api/v1/workspace/warehouses/${fixture.warehouseId}/memberships/${targetId}`,
        actor.cookie,
      );

      expect(status).toBe(403);
      expect(body).toMatchObject({ code: 'workspace.denied' });
    });
  });
});

// openapi.yaml documents a 503 `workspace.warehouse_creation_unavailable` /
// `workspace.archival_unavailable` branch on `POST /warehouses` and
// `PUT /warehouses/{warehouseId}/archival` (both Warehouse-record routes):
// "the change could not complete" (AC-07, AC-13). Neither failure is
// reachable through ordinary seeded state — it names an *infrastructure*
// failure of the write itself, not a business precondition — so this suite
// forces it by overriding the concrete repository the command calls, in its
// own app instance kept separate from the harness above (it is not part of
// either route's Warehouse-record or membership-edge behavioural coverage,
// so it stays colocated with this file rather than duplicating the harness
// setup for one repository override). This is expected to surface a real gap
// once Docker is available: neither `CreateWarehouseCommand` nor
// `ArchiveWarehouseCommand` currently catches and translates a
// repository-layer failure into the documented `ApplicationError`
// (`workspaces/domain/errors/workspace.errors.ts` defines no such factory
// yet), so today this failure would propagate as the generic unknown-error
// 500 the global filter falls back to, not the documented 503 + stable code.
// That gap belongs to the command layer (T20/T21), not this REST surface,
// but it is a documented contract branch this suite must still encode so CI
// catches it once it is closed.
describeIntegration(
  'warehouse HTTP contract — unavailable-outcome branches',
  () => {
    let app: INestApplication;
    let baseUrl: string;

    const request = async (
      method: string,
      path: string,
      cookie?: string,
      body?: unknown,
    ): Promise<{ status: number; body: unknown }> => {
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

    const bootAppWithFailingRepository = async (): Promise<void> => {
      const moduleRef = await Test.createTestingModule({
        imports: [AppModule],
      })
        .overrideProvider(WarehouseLifecycleRepository)
        .useValue({
          createWarehouse: (): Promise<never> =>
            Promise.reject(new Error('synthetic infrastructure failure')),
          lockWarehouse: (): Promise<never> =>
            Promise.reject(new Error('synthetic infrastructure failure')),
          renameWarehouse: (): Promise<never> =>
            Promise.reject(new Error('synthetic infrastructure failure')),
          setArchivedAt: (): Promise<never> =>
            Promise.reject(new Error('synthetic infrastructure failure')),
          lockWorkspaceAndCountNonArchivedWarehouses: (): Promise<never> =>
            Promise.reject(new Error('synthetic infrastructure failure')),
        })
        .compile();

      app = moduleRef.createNestApplication();
      app.useGlobalPipes(new ZodValidationPipe());
      app.useGlobalFilters(new GlobalHttpExceptionFilter());
      await app.init();
      await app.listen(0);

      const address = app.getHttpServer().address();
      baseUrl = `http://127.0.0.1:${address.port}`;

      await dataSource.initialize();
    };

    afterEach(async () => {
      await dataSource.query(
        'TRUNCATE workspace_role_permissions, workspace_memberships, workspace_roles, workspace_permissions, warehouse_memberships, roles, warehouses, sessions, users, accounts, workspaces CASCADE',
      );
      await dataSource.destroy();
      await app.close();
    });

    const seedActor = async (): Promise<{
      readonly userId: string;
      readonly cookie: string;
      readonly workspaceId: string;
      readonly warehouseId: string;
    }> => {
      const workspaceId = randomUUID();
      const customWorkspaceRoleId = randomUUID();
      const warehouseId = randomUUID();
      const userId = randomUUID();

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
      await dataSource.manager.getRepository(WorkspacePermissionEntity).upsert(
        [
          WorkspacePermissionId.WAREHOUSES_CREATE,
          WorkspacePermissionId.WAREHOUSES_ARCHIVE,
        ].map((id) => ({
          id,
          label: id,
          kind: 'assignable' as const,
          createdAt: now,
          updatedAt: now,
        })),
        ['id'],
      );
      await dataSource.manager
        .getRepository(WorkspaceRolePermissionEntity)
        .insert(
          [
            WorkspacePermissionId.WAREHOUSES_CREATE,
            WorkspacePermissionId.WAREHOUSES_ARCHIVE,
          ].map((workspacePermissionId) => ({
            workspaceRoleId: customWorkspaceRoleId,
            workspacePermissionId,
            workspaceRoleKind: 'custom' as const,
            workspacePermissionKind: 'assignable' as const,
          })),
        );
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
      await dataSource.manager.getRepository(WorkspaceMembershipEntity).insert({
        userId,
        workspaceId,
        workspaceRoleId: customWorkspaceRoleId,
        workspaceRoleKind: 'custom',
        createdAt: now,
        updatedAt: now,
      });
      const secret = randomUUID();
      const establishedAt = new Date();
      await dataSource.manager.getRepository(SessionEntity).insert({
        id: randomUUID(),
        accountId: userId,
        secretDigest: digestSessionSecret(secret),
        establishedAt,
        expiresAt: new Date(establishedAt.getTime() + 60 * 60 * 1000),
        revokedAt: null,
      });

      return {
        userId,
        workspaceId,
        warehouseId,
        cookie: `${AUTH_SESSION_COOKIE}=${secret}`,
      };
    };

    it('answers 503 workspace.warehouse_creation_unavailable when the write cannot complete (AC-07)', async () => {
      await bootAppWithFailingRepository();
      const actor = await seedActor();

      const { status, body } = await request(
        'POST',
        '/api/v1/workspace/warehouses',
        actor.cookie,
        { name: 'Test Warehouse East' },
      );

      expect(status).toBe(503);
      expect(body).toMatchObject({
        code: 'workspace.warehouse_creation_unavailable',
      });
    });

    it('answers 503 workspace.archival_unavailable when the change cannot complete (AC-13)', async () => {
      await bootAppWithFailingRepository();
      const actor = await seedActor();

      const { status, body } = await request(
        'PUT',
        `/api/v1/workspace/warehouses/${actor.warehouseId}/archival`,
        actor.cookie,
        { archived: true },
      );

      expect(status).toBe(503);
      expect(body).toMatchObject({ code: 'workspace.archival_unavailable' });
    });
  },
);
