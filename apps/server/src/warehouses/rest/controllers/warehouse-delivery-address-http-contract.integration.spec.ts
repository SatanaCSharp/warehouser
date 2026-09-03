import { WorkspacePermissionId } from '@warehouser/shared-types/enums';
import dataSource from 'shared/database/data-source';
import { WarehouseEntity } from 'shared/domain/entities/warehouse.entity';
import { setupWarehouseHttpContractHarness } from 'test/harnesses/warehouse-http-contract.harness';

// T11/AC-10 — the Warehouse's own Delivery Address at
// `/api/v1/workspace/warehouses/{warehouseId}/delivery-address`. This is the
// one flow of the feature that does not resolve through the Warehouse-scoped
// authorization spine: its subject is the Warehouse *record*, so it is
// authorized by the **Workspace** Permission `WAREHOUSES:ADDRESS_UPDATE`
// through `WorkspaceAccessGuard`, beside renaming and archiving
// (sad.md §4, §7, workspaces ADR 0001, openapi.yaml
// `setWarehouseDeliveryAddress`).
// eslint-disable-next-line max-lines-per-function -- an HTTP contract suite covering one surface is inherently long
describe("warehouse HTTP contract — the Warehouse's own Delivery Address", () => {
  const {
    request,
    seedWorkspace,
    seedSecondWarehouse,
    seedActor,
    seedUser,
    seedWarehouseMembership,
    seedSessionCookie,
  } = setupWarehouseHttpContractHarness();

  const addressPath = (warehouseId: string): string =>
    `/api/v1/workspace/warehouses/${warehouseId}/delivery-address`;

  // The two columns as the Warehouse row carries them — the same columns a
  // Warehouse-scoped projection reads, with no Workspace relation in the
  // query at all. `id` is selected because TypeORM resolves no entity from a
  // projection that omits the primary key.
  const storedAddress = async (
    warehouseId: string,
  ): Promise<Pick<
    WarehouseEntity,
    'deliveryAddressText' | 'deliveryAccessNotes'
  > | null> => {
    const warehouse = await dataSource.manager
      .getRepository(WarehouseEntity)
      .findOne({
        where: { id: warehouseId },
        select: {
          id: true,
          deliveryAddressText: true,
          deliveryAccessNotes: true,
        },
      });
    return warehouse === null
      ? null
      : {
          deliveryAddressText: warehouse.deliveryAddressText,
          deliveryAccessNotes: warehouse.deliveryAccessNotes,
        };
  };

  describe('PUT /api/v1/workspace/warehouses/{warehouseId}/delivery-address', () => {
    it('AC-10: records the address and its access notes for a holder of WAREHOUSES:ADDRESS_UPDATE', async () => {
      const fixture = await seedWorkspace();
      const actor = await seedActor(fixture, [
        WorkspacePermissionId.WAREHOUSES_ADDRESS_UPDATE,
      ]);

      const { status, body } = await request(
        'PUT',
        addressPath(fixture.warehouseId),
        actor.cookie,
        {
          addressText: 'Test Warehouse North, Test Industrial Estate',
          accessNotes: 'Dock 3; deliveries 07:00-15:00',
        },
      );

      expect(status).toBe(200);
      expect(body).toEqual({
        warehouseId: fixture.warehouseId,
        addressText: 'Test Warehouse North, Test Industrial Estate',
        accessNotes: 'Dock 3; deliveries 07:00-15:00',
      });
      await expect(storedAddress(fixture.warehouseId)).resolves.toMatchObject({
        deliveryAddressText: 'Test Warehouse North, Test Industrial Estate',
        deliveryAccessNotes: 'Dock 3; deliveries 07:00-15:00',
      });
    });

    it('AC-10: denies the write to a Workspace Member without WAREHOUSES:ADDRESS_UPDATE, and records nothing', async () => {
      const fixture = await seedWorkspace();
      const actor = await seedActor(fixture, [
        WorkspacePermissionId.WAREHOUSES_RENAME,
      ]);

      const { status, body } = await request(
        'PUT',
        addressPath(fixture.warehouseId),
        actor.cookie,
        { addressText: 'Test Warehouse North, Test Industrial Estate' },
      );

      expect(status).toBe(403);
      expect(body).toMatchObject({ code: 'workspace.denied' });
      await expect(storedAddress(fixture.warehouseId)).resolves.toMatchObject({
        deliveryAddressText: null,
      });
    });

    it('AC-10: corrects the address in place, leaving exactly one address and no deactivated one behind', async () => {
      const fixture = await seedWorkspace();
      const actor = await seedActor(fixture, [
        WorkspacePermissionId.WAREHOUSES_ADDRESS_UPDATE,
      ]);

      await request('PUT', addressPath(fixture.warehouseId), actor.cookie, {
        addressText: 'Test Warehouse North, Test Industrial Estate',
        accessNotes: 'Dock 3',
      });
      const { status, body } = await request(
        'PUT',
        addressPath(fixture.warehouseId),
        actor.cookie,
        { addressText: 'Test Warehouse North, Test Riverside Estate' },
      );

      expect(status).toBe(200);
      expect(body).toEqual({
        warehouseId: fixture.warehouseId,
        addressText: 'Test Warehouse North, Test Riverside Estate',
        accessNotes: null,
      });
      await expect(storedAddress(fixture.warehouseId)).resolves.toEqual({
        deliveryAddressText: 'Test Warehouse North, Test Riverside Estate',
        deliveryAccessNotes: null,
      });
    });

    // AC-10 — "the member may correct it in place afterwards but never
    // deactivate it": no route withdraws the address, so the surface offers
    // no way to reach the state a freeze of a Via Warehouse line is refused
    // from once an address has been recorded (AC-16a).
    it('AC-10: offers no path that deactivates or withdraws the address', async () => {
      const fixture = await seedWorkspace();
      const actor = await seedActor(fixture, [
        WorkspacePermissionId.WAREHOUSES_ADDRESS_UPDATE,
      ]);
      await request('PUT', addressPath(fixture.warehouseId), actor.cookie, {
        addressText: 'Test Warehouse North, Test Industrial Estate',
      });

      const deletion = await request(
        'DELETE',
        addressPath(fixture.warehouseId),
        actor.cookie,
      );
      const deactivation = await request(
        'POST',
        `${addressPath(fixture.warehouseId)}/deactivation`,
        actor.cookie,
      );

      expect(deletion.status).toBe(404);
      expect(deactivation.status).toBe(404);
      await expect(storedAddress(fixture.warehouseId)).resolves.toMatchObject({
        deliveryAddressText: 'Test Warehouse North, Test Industrial Estate',
      });
    });

    it('AC-10: refuses an address that is empty after trimming, naming the field and the rule', async () => {
      const fixture = await seedWorkspace();
      const actor = await seedActor(fixture, [
        WorkspacePermissionId.WAREHOUSES_ADDRESS_UPDATE,
      ]);

      const { status, body } = await request(
        'PUT',
        addressPath(fixture.warehouseId),
        actor.cookie,
        { addressText: '   ' },
      );

      expect(status).toBe(400);
      expect(body).toMatchObject({
        code: 'workspace.invalid_input',
        details: { field: 'addressText', rule: 'trimmed_non_empty' },
      });
    });

    it('AC-10: reports a Warehouse of another Workspace as unavailable rather than disclosing it', async () => {
      const fixture = await seedWorkspace();
      const other = await seedWorkspace();
      const actor = await seedActor(fixture, [
        WorkspacePermissionId.WAREHOUSES_ADDRESS_UPDATE,
      ]);

      const { status, body } = await request(
        'PUT',
        addressPath(other.warehouseId),
        actor.cookie,
        { addressText: 'Test Warehouse North, Test Industrial Estate' },
      );

      expect(status).toBe(404);
      expect(body).toMatchObject({ code: 'workspace.target_unavailable' });
      await expect(storedAddress(other.warehouseId)).resolves.toMatchObject({
        deliveryAddressText: null,
      });
    });

    // Deliberately archived-tolerant: the subject is the Warehouse record,
    // which `workspaces` keeps writable while the Warehouse is archived,
    // alongside renaming it (openapi.yaml, AC-11, AC-23).
    it('AC-10: records the address of an archived Warehouse', async () => {
      const fixture = await seedWorkspace();
      const archivedWarehouseId = await seedSecondWarehouse(
        fixture.workspaceId,
        new Date('2026-08-12T12:00:00.000Z'),
      );
      const actor = await seedActor(fixture, [
        WorkspacePermissionId.WAREHOUSES_ADDRESS_UPDATE,
      ]);

      const { status } = await request(
        'PUT',
        addressPath(archivedWarehouseId),
        actor.cookie,
        { addressText: 'Test Warehouse South, Test Industrial Estate' },
      );

      expect(status).toBe(200);
    });
  });

  describe('GET /api/v1/workspace/warehouses/{warehouseId}/delivery-address', () => {
    it('AC-10: answers null until an address is recorded, then the recorded one', async () => {
      const fixture = await seedWorkspace();
      const actor = await seedActor(fixture, [
        WorkspacePermissionId.WAREHOUSES_ADDRESS_UPDATE,
      ]);

      const before = await request(
        'GET',
        addressPath(fixture.warehouseId),
        actor.cookie,
      );
      await request('PUT', addressPath(fixture.warehouseId), actor.cookie, {
        addressText: 'Test Warehouse North, Test Industrial Estate',
      });
      const after = await request(
        'GET',
        addressPath(fixture.warehouseId),
        actor.cookie,
      );

      expect(before.status).toBe(200);
      expect(before.body).toEqual({
        warehouseId: fixture.warehouseId,
        addressText: null,
        accessNotes: null,
      });
      expect(after.body).toEqual({
        warehouseId: fixture.warehouseId,
        addressText: 'Test Warehouse North, Test Industrial Estate',
        accessNotes: null,
      });
    });
  });

  // AC-10, sad.md §7 — the write is Workspace-gated; the *value* it records is
  // the operator's own premises data and carries no Workspace-scoped
  // ownership, so a member who prepares the dock while holding no Workspace
  // Role at all still reads it from the Warehouse-scoped projections.
  //
  // Those projections are `warehouseDestination` on a Via Warehouse Purchase
  // Draft Line (openapi.yaml `readPurchaseDraft`, `listPurchaseDraftLines`),
  // which T15/T16/T18/T19 build and which do not exist yet. What this case
  // pins today is the half T11 owns and the half a later task would otherwise
  // silently break: such a member is refused the Workspace-scoped write and
  // read, while the recorded address is a plain column on the Warehouse row
  // those projections join — reachable with no `workspace_memberships` row in
  // the picture at all.
  describe('a member holding no Workspace Role at all', () => {
    it('AC-10: is refused the Workspace-scoped write and read, while the address itself stays readable Warehouse-side', async () => {
      const fixture = await seedWorkspace();
      const author = await seedActor(fixture, [
        WorkspacePermissionId.WAREHOUSES_ADDRESS_UPDATE,
      ]);
      await request('PUT', addressPath(fixture.warehouseId), author.cookie, {
        addressText: 'Test Warehouse North, Test Industrial Estate',
        accessNotes: 'Dock 3; report to the gatehouse',
      });

      const dockWorkerId = await seedUser(fixture.workspaceId);
      await seedWarehouseMembership(
        dockWorkerId,
        fixture.workspaceId,
        fixture.warehouseId,
        fixture.warehouseManagerRoleId,
        'warehouse_manager',
      );
      const cookie = await seedSessionCookie(dockWorkerId);

      const write = await request(
        'PUT',
        addressPath(fixture.warehouseId),
        cookie,
        { addressText: 'Test Warehouse North, Test Riverside Estate' },
      );
      const read = await request(
        'GET',
        addressPath(fixture.warehouseId),
        cookie,
      );

      expect(write.status).toBe(403);
      expect(read.status).toBe(403);
      // Nothing about the stored value is Workspace-scoped: it is two columns
      // on the Warehouse this member belongs to, which is what makes it
      // readable under `PURCHASE_DRAFTS:WATCH` once T19 projects it.
      await expect(storedAddress(fixture.warehouseId)).resolves.toEqual({
        deliveryAddressText: 'Test Warehouse North, Test Industrial Estate',
        deliveryAccessNotes: 'Dock 3; report to the gatehouse',
      });
    });
  });
});
