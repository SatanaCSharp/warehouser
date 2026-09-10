import { randomUUID } from 'node:crypto';

import { WorkspacePermissionId } from '@warehouser/shared-types/enums';
import dataSource from 'shared/database/data-source.js';
import { WarehouseEntity } from 'shared/domain/entities/warehouse.entity.js';
import {
  now,
  setupWarehouseHttpContractHarness,
} from 'test/harnesses/warehouse-http-contract.harness.js';
import { describe, expect, it } from 'vitest';

// T25 DoD — the Warehouse-record half of the `/api/v1/workspace/warehouses*`
// HTTP contract: `GET /`, `POST /`, `PATCH /:warehouseId`,
// `PUT /:warehouseId/archival`. These routes carry a `warehouseId` in their
// path yet are **Workspace**-scoped (spec.md §1, sad.md §7) — every AC-11
// case below proves that classification by exercising the route against an
// already-archived Warehouse. See `warehouse-http-contract.harness.ts` for
// the shared seeding/request vocabulary and
// `warehouse-membership-http-contract.integration.spec.ts` for the
// membership-edge half.
// eslint-disable-next-line max-lines-per-function -- an HTTP contract suite covering one surface is inherently long
describe('warehouse HTTP contract — Warehouse-record lifecycle', () => {
  const { request, seedWorkspace, seedSecondWarehouse, seedActor } =
    setupWarehouseHttpContractHarness();

  describe('GET /api/v1/workspace/warehouses', () => {
    it('lists the Workspace Warehouses with their archived state (AC-33)', async () => {
      const fixture = await seedWorkspace();
      await seedSecondWarehouse(fixture.workspaceId, now);
      const actor = await seedActor(fixture, [
        WorkspacePermissionId.WAREHOUSES_WATCH,
      ]);

      const { status, body } = await request(
        'GET',
        '/api/v1/workspace/warehouses',
        actor.cookie,
      );

      expect(status).toBe(200);
      expect(body).toEqual([
        {
          id: fixture.warehouseId,
          name: 'Test Warehouse North',
          archivedAt: null,
        },
        {
          id: expect.any(String),
          name: 'Test Warehouse South',
          archivedAt: '2026-08-12T12:00:00.000Z',
        },
      ]);
    });

    it('denies a read to an actor without WAREHOUSES:WATCH', async () => {
      const fixture = await seedWorkspace();
      const actor = await seedActor(fixture, []);

      const { status, body } = await request(
        'GET',
        '/api/v1/workspace/warehouses',
        actor.cookie,
      );

      expect(status).toBe(403);
      expect(body).toMatchObject({ code: 'workspace.denied' });
    });
  });

  describe('POST /api/v1/workspace/warehouses', () => {
    it('creates a Warehouse and returns 201 (AC-06)', async () => {
      const fixture = await seedWorkspace();
      const actor = await seedActor(fixture, [
        WorkspacePermissionId.WAREHOUSES_CREATE,
      ]);

      const { status, body } = await request(
        'POST',
        '/api/v1/workspace/warehouses',
        actor.cookie,
        { name: 'Test Warehouse East' },
      );

      expect(status).toBe(201);
      expect(body).toMatchObject({
        name: 'Test Warehouse East',
        archivedAt: null,
      });
    });

    it('rejects a request whose body is not the agreed schema (AC-08)', async () => {
      const fixture = await seedWorkspace();
      const actor = await seedActor(fixture, [
        WorkspacePermissionId.WAREHOUSES_CREATE,
      ]);

      const { status, body } = await request(
        'POST',
        '/api/v1/workspace/warehouses',
        actor.cookie,
        { name: '' },
      );

      expect(status).toBe(400);
      expect(body).toMatchObject({ code: 'workspace.invalid_input' });
    });
  });

  describe('PATCH /api/v1/workspace/warehouses/{warehouseId}', () => {
    it('renames a Warehouse (AC-09)', async () => {
      const fixture = await seedWorkspace();
      const actor = await seedActor(fixture, [
        WorkspacePermissionId.WAREHOUSES_RENAME,
      ]);

      const { status, body } = await request(
        'PATCH',
        `/api/v1/workspace/warehouses/${fixture.warehouseId}`,
        actor.cookie,
        { name: '  Renamed Warehouse  ' },
      );

      expect(status).toBe(200);
      expect(body).toEqual({
        id: fixture.warehouseId,
        name: 'Renamed Warehouse',
        archivedAt: null,
      });
    });

    // AC-11 — renaming is a Workspace capability over the Warehouse record
    // and stays available while that Warehouse is archived, because the
    // Workspace guard never consults archived state.
    it('renames an archived Warehouse (AC-11)', async () => {
      const fixture = await seedWorkspace();
      await dataSource.manager
        .getRepository(WarehouseEntity)
        .update({ id: fixture.warehouseId }, { archivedAt: now });
      const actor = await seedActor(fixture, [
        WorkspacePermissionId.WAREHOUSES_RENAME,
      ]);

      const { status, body } = await request(
        'PATCH',
        `/api/v1/workspace/warehouses/${fixture.warehouseId}`,
        actor.cookie,
        { name: 'Renamed While Archived' },
      );

      expect(status).toBe(200);
      expect(body).toEqual({
        id: fixture.warehouseId,
        name: 'Renamed While Archived',
        archivedAt: expect.any(String),
      });
    });

    // AC-10 — a Warehouse of another Workspace is denied without disclosing
    // that it exists: reported exactly as a missing Warehouse.
    it('reports a cross-Workspace Warehouse exactly as a missing one (AC-10)', async () => {
      const fixture = await seedWorkspace();
      const other = await seedWorkspace();
      const actor = await seedActor(fixture, [
        WorkspacePermissionId.WAREHOUSES_RENAME,
      ]);

      const crossWorkspace = await request(
        'PATCH',
        `/api/v1/workspace/warehouses/${other.warehouseId}`,
        actor.cookie,
        { name: 'Renamed' },
      );
      const missing = await request(
        'PATCH',
        `/api/v1/workspace/warehouses/${randomUUID()}`,
        actor.cookie,
        { name: 'Renamed' },
      );

      expect(crossWorkspace.status).toBe(404);
      expect(crossWorkspace.body).toMatchObject({
        code: 'workspace.target_unavailable',
      });
      expect(crossWorkspace).toEqual(missing);
    });

    it('names the broken Warehouse-name rule (AC-08)', async () => {
      const fixture = await seedWorkspace();
      const actor = await seedActor(fixture, [
        WorkspacePermissionId.WAREHOUSES_RENAME,
      ]);

      const { status, body } = await request(
        'PATCH',
        `/api/v1/workspace/warehouses/${fixture.warehouseId}`,
        actor.cookie,
        { name: `Test${String.fromCodePoint(0x00)}Warehouse` },
      );

      expect(status).toBe(400);
      expect(body).toMatchObject({ code: 'workspace.invalid_input' });
    });

    it('denies a rename to an actor without WAREHOUSES:RENAME', async () => {
      const fixture = await seedWorkspace();
      const actor = await seedActor(fixture, [
        WorkspacePermissionId.WAREHOUSES_WATCH,
      ]);

      const { status, body } = await request(
        'PATCH',
        `/api/v1/workspace/warehouses/${fixture.warehouseId}`,
        actor.cookie,
        { name: 'Renamed Warehouse' },
      );

      expect(status).toBe(403);
      expect(body).toMatchObject({ code: 'workspace.denied' });
    });
  });

  describe('PUT /api/v1/workspace/warehouses/{warehouseId}/archival', () => {
    it('archives a Warehouse (AC-11)', async () => {
      const fixture = await seedWorkspace();
      await seedSecondWarehouse(fixture.workspaceId);
      const actor = await seedActor(fixture, [
        WorkspacePermissionId.WAREHOUSES_ARCHIVE,
      ]);

      const { status, body } = await request(
        'PUT',
        `/api/v1/workspace/warehouses/${fixture.warehouseId}/archival`,
        actor.cookie,
        { archived: true },
      );

      expect(status).toBe(200);
      expect(body).toMatchObject({
        id: fixture.warehouseId,
        archivedAt: expect.any(String),
      });
    });

    // AC-11 — restoring is itself one of the operations that must remain
    // available while the Warehouse is archived, proving the archived-state
    // tolerance for this route directly.
    it('restores an already-archived Warehouse (AC-11)', async () => {
      const fixture = await seedWorkspace();
      await dataSource.manager
        .getRepository(WarehouseEntity)
        .update({ id: fixture.warehouseId }, { archivedAt: now });
      const actor = await seedActor(fixture, [
        WorkspacePermissionId.WAREHOUSES_ARCHIVE,
      ]);

      const { status, body } = await request(
        'PUT',
        `/api/v1/workspace/warehouses/${fixture.warehouseId}/archival`,
        actor.cookie,
        { archived: false },
      );

      expect(status).toBe(200);
      expect(body).toEqual({
        id: fixture.warehouseId,
        name: 'Test Warehouse North',
        archivedAt: null,
      });
    });

    it('refuses to archive the only non-archived Warehouse (AC-11a)', async () => {
      const fixture = await seedWorkspace();
      const actor = await seedActor(fixture, [
        WorkspacePermissionId.WAREHOUSES_ARCHIVE,
      ]);

      const { status, body } = await request(
        'PUT',
        `/api/v1/workspace/warehouses/${fixture.warehouseId}/archival`,
        actor.cookie,
        { archived: true },
      );

      expect(status).toBe(409);
      expect(body).toMatchObject({
        code: 'workspace.last_unarchived_warehouse',
      });
    });

    // AC-10 — archiving/restoring a Warehouse of another Workspace is denied
    // without disclosing that it exists.
    it('reports a cross-Workspace Warehouse exactly as a missing one (AC-10)', async () => {
      const fixture = await seedWorkspace();
      const other = await seedWorkspace();
      const actor = await seedActor(fixture, [
        WorkspacePermissionId.WAREHOUSES_ARCHIVE,
      ]);

      const crossWorkspace = await request(
        'PUT',
        `/api/v1/workspace/warehouses/${other.warehouseId}/archival`,
        actor.cookie,
        { archived: true },
      );
      const missing = await request(
        'PUT',
        `/api/v1/workspace/warehouses/${randomUUID()}/archival`,
        actor.cookie,
        { archived: true },
      );

      expect(crossWorkspace.status).toBe(404);
      expect(crossWorkspace.body).toMatchObject({
        code: 'workspace.target_unavailable',
      });
      expect(crossWorkspace).toEqual(missing);
    });

    it('rejects a request whose body is not the agreed schema', async () => {
      const fixture = await seedWorkspace();
      const actor = await seedActor(fixture, [
        WorkspacePermissionId.WAREHOUSES_ARCHIVE,
      ]);

      const { status } = await request(
        'PUT',
        `/api/v1/workspace/warehouses/${fixture.warehouseId}/archival`,
        actor.cookie,
        { archived: 'yes' },
      );

      expect(status).toBe(400);
    });

    it('denies an archival change to an actor without WAREHOUSES:ARCHIVE', async () => {
      const fixture = await seedWorkspace();
      const actor = await seedActor(fixture, [
        WorkspacePermissionId.WAREHOUSES_WATCH,
      ]);

      const { status, body } = await request(
        'PUT',
        `/api/v1/workspace/warehouses/${fixture.warehouseId}/archival`,
        actor.cookie,
        { archived: true },
      );

      expect(status).toBe(403);
      expect(body).toMatchObject({ code: 'workspace.denied' });
    });
  });
});
