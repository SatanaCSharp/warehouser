import { randomUUID } from 'node:crypto';

import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AppModule } from 'app.module';
import { digestSessionSecret } from 'auth/domain/security/session-secret';
import { AUTH_SESSION_COOKIE } from 'auth/rest/auth-cookie';
import { ZodValidationPipe } from 'nestjs-zod';
import dataSource from 'shared/database/data-source';
import { AccountEntity } from 'shared/domain/entities/account.entity';
import { CustomerOrderEntity } from 'shared/domain/entities/customer-order.entity';
import { ItemEntity } from 'shared/domain/entities/item.entity';
import { PermissionEntity } from 'shared/domain/entities/permission.entity';
import { PurchaseDraftEntity } from 'shared/domain/entities/purchase-draft.entity';
import { PurchaseDraftLineEntity } from 'shared/domain/entities/purchase-draft-line.entity';
import { PurchaseDraftLineLinkEntity } from 'shared/domain/entities/purchase-draft-line-link.entity';
import { PurchaseDraftLineRejectionEntity } from 'shared/domain/entities/purchase-draft-line-rejection.entity';
import { RoleEntity } from 'shared/domain/entities/role.entity';
import { RolePermissionEntity } from 'shared/domain/entities/role-permission.entity';
import { SessionEntity } from 'shared/domain/entities/session.entity';
import { UserEntity } from 'shared/domain/entities/user.entity';
import { WarehouseEntity } from 'shared/domain/entities/warehouse.entity';
import { WarehouseMembershipEntity } from 'shared/domain/entities/warehouse-membership.entity';
import { WorkspaceEntity } from 'shared/domain/entities/workspace.entity';
import { GlobalHttpExceptionFilter } from 'shared/errors/global-http-exception.filter';

// T13 — the REST surface every rule the domain and the queries enforce reaches a member through:
// the two ending routes' condition payload, the amendment route, `RejectionReasonsController` and
// the closed-draft read's four legal shapes (sad.md §7, §6.3, §6.4, §6.5; AC-01a, AC-06, AC-20,
// AC-21, AC-22, AC-26).
//
// `RejectionReasonsController`, the amendment route and the two ending routes' forwarding of
// `rejections`/`preReceiptConformance` now exist and are proven below: each case that once
// documented a pre-T13 gap now names, in past tense, the defect it guards against a regression.

const seededAt = new Date('2026-08-25T09:00:00.000Z');

const workspaceId = randomUUID();
const warehouseId = randomUUID();
const otherWarehouseId = randomUUID();

const PURCHASE_DRAFTS_WATCH = 'PURCHASE_DRAFTS:WATCH';
const PURCHASE_DRAFTS_RECEIVE = 'PURCHASE_DRAFTS:RECEIVE';
const REJECTIONS_CREATE = 'REJECTIONS:CREATE';
const REJECTIONS_WATCH = 'REJECTIONS:WATCH';
const REJECTIONS_UPDATE = 'REJECTIONS:UPDATE';

// eslint-disable-next-line max-lines-per-function -- one HTTP contract suite over one shared fixture, matching the sibling purchase-drafts contract suites
describe('purchase-draft rejections HTTP contract (T13)', () => {
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

    const address = app.getHttpServer().address();
    baseUrl = `http://127.0.0.1:${address.port}`;

    await dataSource.initialize();
  });

  afterEach(async () => {
    await dataSource.query(
      'TRUNCATE arrival_allocations, purchase_draft_demand_snapshots, purchase_draft_line_links, purchase_draft_line_rejections, purchase_draft_lines, purchase_drafts, item_stock_adjustments, customer_orders, items, warehouse_memberships, role_permissions, roles, warehouses, workspaces, sessions, users, accounts, permissions CASCADE',
    );
  });

  afterAll(async () => {
    await dataSource.destroy();
    await app.close();
  });

  const seedWorld = async (): Promise<void> => {
    await dataSource.manager.getRepository(WorkspaceEntity).insert({
      id: workspaceId,
      name: null,
      createdAt: seededAt,
      updatedAt: seededAt,
    });
    await dataSource.manager.getRepository(WarehouseEntity).insert([
      {
        id: warehouseId,
        workspaceId,
        name: 'Warehouse A',
        archivedAt: null,
        deliveryAddressText: 'Dock 4, Test Industrial Estate, Test City',
        deliveryAccessNotes: 'Report to the gatehouse; deliveries 07:00-15:00',
        createdAt: seededAt,
        updatedAt: seededAt,
      },
      {
        id: otherWarehouseId,
        workspaceId,
        name: 'Warehouse B',
        archivedAt: null,
        deliveryAddressText: 'Unit 12, Other Estate, Other City',
        deliveryAccessNotes: null,
        createdAt: seededAt,
        updatedAt: seededAt,
      },
    ]);
  };

  const seedIdentity = async (userId: string): Promise<void> => {
    await dataSource.transaction(async (manager) => {
      await manager.getRepository(AccountEntity).insert({
        id: userId,
        userId,
        normalizedEmail: `member.${userId}@example.test`,
        passwordHash: 'synthetic-hash',
        passwordHashAlgorithm: 'scrypt',
        passwordHashParameters: { cost: 1_024 },
        createdAt: seededAt,
        updatedAt: seededAt,
      });
      await manager.getRepository(UserEntity).insert({
        id: userId,
        accountId: userId,
        workspaceId,
        createdAt: seededAt,
        updatedAt: seededAt,
      });
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

  // Each actor gets its own Role, exactly as the sibling suites insist on: granting onto a shared
  // Role would make a denial assertion pass by accident once a second actor was seeded onto it.
  const seedActorIn = async (
    actorWarehouseId: string,
    permissionIds: readonly string[],
  ): Promise<string> => {
    const userId = randomUUID();
    const actorRoleId = randomUUID();
    await seedIdentity(userId);
    await dataSource.manager.getRepository(RoleEntity).insert({
      id: actorRoleId,
      warehouseId: actorWarehouseId,
      name: `Role ${actorRoleId}`,
      kind: 'custom',
      createdAt: seededAt,
      updatedAt: seededAt,
    });
    if (permissionIds.length > 0) {
      await dataSource.manager.getRepository(PermissionEntity).upsert(
        permissionIds.map((id) => ({
          id,
          label: id,
          kind: 'assignable' as const,
          createdAt: seededAt,
          updatedAt: seededAt,
        })),
        ['id'],
      );
      await dataSource.manager.getRepository(RolePermissionEntity).insert(
        permissionIds.map((permissionId) => ({
          roleId: actorRoleId,
          permissionId,
          roleKind: 'custom' as const,
          permissionKind: 'assignable' as const,
        })),
      );
    }
    await dataSource.manager.getRepository(WarehouseMembershipEntity).insert({
      userId,
      warehouseId: actorWarehouseId,
      workspaceId,
      roleId: actorRoleId,
      roleKind: 'custom',
      createdAt: seededAt,
      updatedAt: seededAt,
    });
    return seedSessionCookie(userId);
  };

  const seedActor = (permissionIds: readonly string[]): Promise<string> =>
    seedActorIn(warehouseId, permissionIds);

  const seedItem = async (
    ownerWarehouseId: string = warehouseId,
  ): Promise<string> => {
    const id = randomUUID();
    await dataSource.manager.getRepository(ItemEntity).insert({
      id,
      warehouseId: ownerWarehouseId,
      sku: `TEST-SKU-${id.slice(0, 8)}`,
      description: 'Test Item',
      unitOfMeasure: 'pieces',
      onHandQuantity: 0,
      deactivatedAt: null,
      createdAt: seededAt,
      updatedAt: seededAt,
    });
    return id;
  };

  // A line resolved Ready for Ordering so an ending may be recorded straight against it, mirroring
  // `purchase-draft-delivery-http-contract.integration.spec.ts`'s `seedDraftWithLine`.
  // `assertAdmitsEnding` (`isReadyForOrderingDraft`) refuses an ending on a draft still in Draft.
  const seedDraftWithLine = async (
    ownerWarehouseId: string = warehouseId,
  ): Promise<{
    draftId: string;
    lineId: string;
  }> => {
    const draftId = randomUUID();
    const lineId = randomUUID();
    const itemId = await seedItem(ownerWarehouseId);
    const createdByUserId = randomUUID();
    await seedIdentity(createdByUserId);

    await dataSource.manager.getRepository(PurchaseDraftEntity).insert({
      id: draftId,
      warehouseId: ownerWarehouseId,
      state: 'ready_for_ordering',
      expectedArrivalDate: null,
      closureReason: null,
      createdByUserId,
      readiedByUserId: createdByUserId,
      readiedAt: seededAt,
      closedByUserId: null,
      closedAt: null,
      arrivalConfirmedByUserId: null,
      arrivalConfirmedAt: null,
      discardedByUserId: null,
      discardedAt: null,
      createdAt: seededAt,
      updatedAt: seededAt,
    });
    await dataSource.manager.getRepository(PurchaseDraftLineEntity).insert({
      id: lineId,
      purchaseDraftId: draftId,
      warehouseId: ownerWarehouseId,
      itemId,
      orderedQuantity: 100,
      packagingTypeId: null,
      valueAddingNote: null,
      deliveryMode: 'via_warehouse',
      customerDeliveryAddressId: null,
      frozenDeliveryAddressText: 'Dock 4, Test Industrial Estate, Test City',
      frozenAccessNotes: 'Report to the gatehouse; deliveries 07:00-15:00',
      frozenCustomerName: null,
      endingQuantity: null,
      endingKind: null,
      endingRecordedByUserId: null,
      endingRecordedAt: null,
      createdAt: seededAt,
      updatedAt: seededAt,
    });
    return { draftId, lineId };
  };

  // A line whose ending has already been recorded, with one Rejection on it, so AC-20/AC-21/AC-22/
  // AC-26 have a Rejection to read or amend without driving the whole ending-recording flow again.
  // Built entirely in the owning Warehouse from the start — updating a draft's `warehouse_id` after
  // insert trips `fk_purchase_draft_lines_draft`'s composite `(id, warehouse_id)` reference.
  const seedClosedLineWithRejection = async (
    ownerWarehouseId: string = warehouseId,
  ): Promise<{ draftId: string; lineId: string; rejectionId: string }> => {
    const { draftId, lineId } = await seedDraftWithLine(ownerWarehouseId);
    const recordedByUserId = randomUUID();
    await seedIdentity(recordedByUserId);

    await dataSource.manager.getRepository(PurchaseDraftEntity).update(
      { id: draftId },
      {
        state: 'closed',
        closedByUserId: recordedByUserId,
        closedAt: seededAt,
      },
    );
    await dataSource.manager.getRepository(PurchaseDraftLineEntity).update(
      { id: lineId },
      {
        endingQuantity: 100,
        endingKind: 'arrival',
        endingRecordedByUserId: recordedByUserId,
        endingRecordedAt: seededAt,
        // `not_applicable`, not `null`: the mapper reads a `null` verdict as "no condition was ever
        // recorded" (a pre-release ending or one with nothing received, sad.md §7 "Existing
        // concepts that change") and would answer with `condition: null` for this fixture too — the
        // line was frozen with neither a Packaging Type nor a Value-adding Note, so `not_applicable`
        // is the legal verdict for it (AC-17).
        preReceiptConformance: 'not_applicable',
        preReceiptConformanceNote: null,
      },
    );
    const rejectionId = randomUUID();
    await dataSource.manager
      .getRepository(PurchaseDraftLineRejectionEntity)
      .insert({
        id: rejectionId,
        purchaseDraftLineId: lineId,
        warehouseId: ownerWarehouseId,
        deliveryMode: 'via_warehouse',
        rejectionReasonId: 'damaged_in_transit',
        quantity: 8,
        source: 'inspected',
        description: 'Pallet crushed in transit',
        disposition: 'undecided',
        raisedByUserId: recordedByUserId,
        amendedByUserId: null,
        amendedAt: null,
        createdAt: seededAt,
        updatedAt: seededAt,
      });
    return { draftId, lineId, rejectionId };
  };

  const request = async (
    method: string,
    path: string,
    cookie: string,
    body?: unknown,
  ): Promise<{ status: number; body: unknown }> => {
    const response = await fetch(`${baseUrl}${path}`, {
      method,
      headers: { 'content-type': 'application/json', cookie },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await response.text();
    return {
      status: response.status,
      body: text ? JSON.parse(text) : undefined,
    };
  };

  const draftsPath = `/api/v1/warehouses/${warehouseId}/purchase-drafts`;
  const rejectionReasonsPath = `/api/v1/warehouses/${warehouseId}/rejection-reasons`;

  // -- AC-01a/AC-01b — the ending route's two-Permission conditional rule --------------------------

  describe('POST .../lines/{lineId}/arrival carries the condition payload (AC-01a, AC-01b)', () => {
    it('declines a Rejection from a member holding PURCHASE_DRAFTS:RECEIVE without REJECTIONS:CREATE, and records no part of the ending (AC-01a)', async () => {
      await seedWorld();
      const { draftId, lineId } = await seedDraftWithLine();
      const cookie = await seedActor([PURCHASE_DRAFTS_RECEIVE]);

      const { status, body } = await request(
        'POST',
        `${draftsPath}/${draftId}/lines/${lineId}/arrival`,
        cookie,
        {
          receivedQuantity: 100,
          rejections: [
            {
              rejectionReasonId: 'damaged_in_transit',
              quantity: 8,
              source: 'inspected',
            },
          ],
        },
      );

      // Before T13 the controller dropped `rejections` before it reached the command, so this
      // submission silently succeeded (200) with no refusal recorded rather than being declined for
      // the missing capability. This case guards against that regression.
      expect(status).toBe(403);
      expect(body).toMatchObject({
        code: 'purchase_drafts.rejection_capability_required',
        details: { requiredPermissionId: REJECTIONS_CREATE },
      });

      const line = await dataSource.manager
        .getRepository(PurchaseDraftLineEntity)
        .findOneByOrFail({ id: lineId });
      expect(line.endingQuantity).toBeNull();
    });

    it('records a refusal-free ending for that same member (AC-01b)', async () => {
      await seedWorld();
      const { draftId, lineId } = await seedDraftWithLine();
      const cookie = await seedActor([PURCHASE_DRAFTS_RECEIVE]);

      const { status } = await request(
        'POST',
        `${draftsPath}/${draftId}/lines/${lineId}/arrival`,
        cookie,
        { receivedQuantity: 100 },
      );

      expect(status).toBe(200);
    });
  });

  // -- Obligation 3 (2026-09-08 review) — the allocation-exceeds-accepted nested violation shape ----
  //
  // Cheap now that T13's wiring exists: `openapi.yaml`'s `allocationExceedsAccepted` example
  // documented a flat `details` shape that `demand-allocation.errors.ts:8-20` never produced (fixed
  // by this review). Asserted over HTTP, not just at the service unit level, because this is exactly
  // the shape a client reads off the wire.
  describe('POST .../lines/{lineId}/arrival — the allocation bound narrows to the accepted figure', () => {
    it('names rule, receivedQuantity, rejectedQuantity, acceptedQuantity and allocatedQuantity together (AC-11)', async () => {
      await seedWorld();
      const { draftId, lineId } = await seedDraftWithLine();
      const orderId = randomUUID();
      const linkId = randomUUID();
      const recordedByUserId = randomUUID();
      await seedIdentity(recordedByUserId);
      await dataSource.manager.getRepository(CustomerOrderEntity).insert({
        id: orderId,
        warehouseId,
        itemId: await seedItem(),
        customerId: null,
        customerDeliveryAddressId: null,
        customerName: 'Test Buyer',
        quantity: 100,
        outstandingQuantity: 100,
        neededBy: '2099-01-01',
        state: 'unfulfilled',
        cancellationReason: null,
        recordedByUserId,
        cancelledByUserId: null,
        cancelledAt: null,
        createdAt: seededAt,
        updatedAt: seededAt,
      });
      await dataSource.manager
        .getRepository(PurchaseDraftLineLinkEntity)
        .insert({
          id: linkId,
          purchaseDraftLineId: lineId,
          purchaseDraftId: draftId,
          warehouseId,
          customerOrderId: orderId,
          statedQuantity: 100,
          createdAt: seededAt,
          updatedAt: seededAt,
        });
      const cookie = await seedActor([
        PURCHASE_DRAFTS_RECEIVE,
        REJECTIONS_CREATE,
      ]);

      const { status, body } = await request(
        'POST',
        `${draftsPath}/${draftId}/lines/${lineId}/arrival`,
        cookie,
        {
          receivedQuantity: 100,
          rejections: [
            {
              rejectionReasonId: 'damaged_in_transit',
              quantity: 8,
              source: 'inspected',
            },
          ],
          allocations: [
            { purchaseDraftLineLinkId: linkId, allocatedQuantity: 100 },
          ],
        },
      );

      expect(status).toBe(409);
      expect(body).toMatchObject({
        code: 'purchase_drafts.allocation_out_of_bounds',
        details: {
          violations: [
            {
              rule: 'allocations_exceed_accepted_quantity',
              receivedQuantity: 100,
              rejectedQuantity: 8,
              acceptedQuantity: 92,
              allocatedQuantity: 100,
            },
          ],
        },
      });
    });
  });

  // -- AC-21/AC-22 — the closed-draft read's cause-bearing and cause-withheld shapes ---------------

  describe('GET .../purchase-drafts/{id} carries the condition account (AC-21, AC-22)', () => {
    it('withholds every Rejection cause from a member without REJECTIONS:WATCH, keeping one total refused figure (AC-22)', async () => {
      await seedWorld();
      const { draftId, lineId } = await seedClosedLineWithRejection();
      const cookie = await seedActor([PURCHASE_DRAFTS_WATCH]);

      const { status, body } = await request(
        'GET',
        `${draftsPath}/${draftId}`,
        cookie,
      );

      expect(status).toBe(200);
      const line = (
        body as { lines: readonly { id: string; ending: unknown }[] }
      ).lines.find((candidate) => candidate.id === lineId)!;
      const condition = (line.ending as { condition: Record<string, unknown> })
        .condition;
      expect(condition).toMatchObject({
        acceptedQuantity: 92,
        rejectedQuantity: 8,
      });
      expect(condition).not.toHaveProperty('rejections');
    });

    it('serves the whole condition account, with every Rejection beside its cause, to a member holding REJECTIONS:WATCH (AC-21)', async () => {
      await seedWorld();
      const { draftId, lineId } = await seedClosedLineWithRejection();
      const cookie = await seedActor([PURCHASE_DRAFTS_WATCH, REJECTIONS_WATCH]);

      const { status, body } = await request(
        'GET',
        `${draftsPath}/${draftId}`,
        cookie,
      );

      expect(status).toBe(200);
      const line = (
        body as {
          lines: readonly {
            id: string;
            ending: { condition: { rejections?: readonly unknown[] } };
          }[];
        }
      ).lines.find((candidate) => candidate.id === lineId)!;
      // Before T13 the controller did not observe `REJECTIONS:WATCH`, so `ReadPurchaseDraftQuery`
      // never learned this actor's grant and always built the cause-withheld shape — `rejections`
      // would have been absent here even though this actor holds the Permission. This case guards
      // against that regression.
      expect(line.ending.condition.rejections).toHaveLength(1);
      expect(line.ending.condition.rejections![0]).toMatchObject({
        rejectionReasonId: 'damaged_in_transit',
        quantity: 8,
      });
    });
  });

  // -- AC-20/AC-26 — the amendment route --------------------------------------------------------

  describe('PATCH .../lines/{lineId}/rejections/{rejectionId} (AC-20, AC-26)', () => {
    // BLOCKING (2026-09-08 review) — the feature's only new mutating route had no 200 path tested
    // at any HTTP tier: `purchase-drafts.controller.ts`'s `amendPurchaseDraftLineRejection` builds
    // its response as a hand-written five-field object literal (`amendedAt.toISOString()`, five
    // field names) that no runtime schema ever parses — `rejectionAmendmentSchema` is a
    // compile-time type only. Asserting the exact key set, not just the values, is what would catch
    // an added key that echoes back the Reason, quantity or Source `openapi.yaml:2360-2380` and
    // `purchase-drafts-mutations.ts`'s `rejectionAmendmentSchema` comment say this shape exists to
    // withhold, or a `Date` leaking unserialized, or a wrong field name.
    it('permits a member holding REJECTIONS:UPDATE and answers with exactly the five-key RejectionAmendment (AC-18, AC-18b)', async () => {
      await seedWorld();
      const { draftId, lineId, rejectionId } =
        await seedClosedLineWithRejection();
      const cookie = await seedActor([REJECTIONS_UPDATE]);

      const { status, body } = await request(
        'PATCH',
        `${draftsPath}/${draftId}/lines/${lineId}/rejections/${rejectionId}`,
        cookie,
        {
          disposition: 'held_for_return',
          description: 'Corrected description',
        },
      );

      expect(status).toBe(200);
      expect(Object.keys(body as object).sort()).toEqual([
        'amendedAt',
        'amendedByUserId',
        'description',
        'disposition',
        'id',
      ]);
      expect(body).toMatchObject({
        id: rejectionId,
        description: 'Corrected description',
        disposition: 'held_for_return',
      });
      expect(
        typeof (body as { amendedByUserId: unknown }).amendedByUserId,
      ).toBe('string');
      expect(typeof (body as { amendedAt: unknown }).amendedAt).toBe('string');

      // The store, not just the wire, records the amendment — the sibling half of every other
      // mutating case in this suite.
      const rejection = await dataSource.manager
        .getRepository(PurchaseDraftLineRejectionEntity)
        .findOneByOrFail({ id: rejectionId });
      expect(rejection.disposition).toBe('held_for_return');
      expect(rejection.description).toBe('Corrected description');
      expect(rejection.amendedAt).not.toBeNull();
    });

    it('declines a member holding REJECTIONS:WATCH but not REJECTIONS:UPDATE, leaving the Disposition unchanged (AC-20)', async () => {
      await seedWorld();
      const { draftId, lineId, rejectionId } =
        await seedClosedLineWithRejection();
      const cookie = await seedActor([REJECTIONS_WATCH]);

      const { status, body } = await request(
        'PATCH',
        `${draftsPath}/${draftId}/lines/${lineId}/rejections/${rejectionId}`,
        cookie,
        { disposition: 'held_for_return' },
      );

      // Before T13 the route did not resolve, so this was Nest's own 404 rather than the
      // application's non-enumerating `access.denied` 403 AC-20 requires. This case guards against
      // that regression.
      expect(status).toBe(403);
      expect(body).toMatchObject({ code: 'access.denied' });

      // spec.md:267-271's second *Then* clause — the Disposition and the amendment attribution are
      // left exactly as they were.
      const rejection = await dataSource.manager
        .getRepository(PurchaseDraftLineRejectionEntity)
        .findOneByOrFail({ id: rejectionId });
      expect(rejection.disposition).toBe('undecided');
      expect(rejection.amendedAt).toBeNull();
    });

    it('refuses a Rejection of another Warehouse identically to one that does not exist (AC-26)', async () => {
      await seedWorld();
      const { rejectionId: otherWarehouseRejectionId } =
        await seedClosedLineWithRejection(otherWarehouseId);
      const { draftId, lineId } = await seedClosedLineWithRejection();
      const cookie = await seedActor([REJECTIONS_UPDATE]);

      const targetingOther = await request(
        'PATCH',
        `${draftsPath}/${draftId}/lines/${lineId}/rejections/${otherWarehouseRejectionId}`,
        cookie,
        { disposition: 'held_for_return' },
      );
      const targetingNothing = await request(
        'PATCH',
        `${draftsPath}/${draftId}/lines/${lineId}/rejections/${randomUUID()}`,
        cookie,
        { disposition: 'held_for_return' },
      );

      expect(targetingOther.status).toBe(404);
      expect(targetingOther.body).toMatchObject({
        code: 'purchase_drafts.target_unavailable',
      });
      // The heart of AC-26: the two responses disclose nothing about which case occurred, so they
      // must be identical, not merely both refusals.
      expect(targetingOther).toEqual(targetingNothing);
    });

    // spec.md:347 — the stronger claim: denial holds "even where they hold a membership and the
    // matching Permission there", i.e. in the **other** Warehouse. One member, two memberships —
    // `REJECTIONS:UPDATE` in both Warehouse A (the route acted through) and Warehouse B (the one the
    // Rejection actually belongs to) — proves the boundary is the route's own Warehouse, not merely
    // "this actor holds nothing elsewhere".
    it('refuses a Rejection of another Warehouse even when the actor holds a matching membership there (AC-26)', async () => {
      await seedWorld();
      const { rejectionId: otherWarehouseRejectionId } =
        await seedClosedLineWithRejection(otherWarehouseId);
      const { draftId, lineId } = await seedClosedLineWithRejection();

      const userId = randomUUID();
      await seedIdentity(userId);
      for (const membershipWarehouseId of [warehouseId, otherWarehouseId]) {
        const roleId = randomUUID();
        await dataSource.manager.getRepository(RoleEntity).insert({
          id: roleId,
          warehouseId: membershipWarehouseId,
          name: `Role ${roleId}`,
          kind: 'custom',
          createdAt: seededAt,
          updatedAt: seededAt,
        });
        await dataSource.manager.getRepository(PermissionEntity).upsert(
          {
            id: REJECTIONS_UPDATE,
            label: REJECTIONS_UPDATE,
            kind: 'assignable' as const,
            createdAt: seededAt,
            updatedAt: seededAt,
          },
          ['id'],
        );
        await dataSource.manager.getRepository(RolePermissionEntity).insert({
          roleId,
          permissionId: REJECTIONS_UPDATE,
          roleKind: 'custom' as const,
          permissionKind: 'assignable' as const,
        });
        await dataSource.manager
          .getRepository(WarehouseMembershipEntity)
          .insert({
            userId,
            warehouseId: membershipWarehouseId,
            workspaceId,
            roleId,
            roleKind: 'custom',
            createdAt: seededAt,
            updatedAt: seededAt,
          });
      }
      const cookie = await seedSessionCookie(userId);

      const { status, body } = await request(
        'PATCH',
        `${draftsPath}/${draftId}/lines/${lineId}/rejections/${otherWarehouseRejectionId}`,
        cookie,
        { disposition: 'held_for_return' },
      );

      expect(status).toBe(404);
      expect(body).toMatchObject({
        code: 'purchase_drafts.target_unavailable',
      });
    });

    // Obligation 4 (2026-09-08 review) — `rejectionAmendSchema` enumerates the four Dispositions,
    // so the Zod pipe refuses an unoffered value before the command's own
    // `purchaseDraftUnknownDispositionError` (openapi.yaml `unknownDisposition`,
    // `purchase_drafts.invalid_input` + `details.availableDispositions`) ever runs. The reachable
    // shape is the global validation envelope instead.
    it('refuses an unoffered Disposition through the wire schema, not through the command (AC-19 reconciled)', async () => {
      await seedWorld();
      const { draftId, lineId, rejectionId } =
        await seedClosedLineWithRejection();
      const cookie = await seedActor([REJECTIONS_UPDATE]);

      const { status, body } = await request(
        'PATCH',
        `${draftsPath}/${draftId}/lines/${lineId}/rejections/${rejectionId}`,
        cookie,
        { disposition: 'lost_by_the_supplier' },
      );

      expect(status).toBe(400);
      expect(body).toMatchObject({
        code: 'request.invalid',
        details: { fields: { disposition: 'invalid' } },
      });
      expect(body).not.toMatchObject({
        code: 'purchase_drafts.invalid_input',
      });
      expect(JSON.stringify(body)).not.toContain('availableDispositions');
    });

    it('rejects an unknown property under z.strictObject, alongside a genuinely invalid field', async () => {
      await seedWorld();
      const { draftId, lineId, rejectionId } =
        await seedClosedLineWithRejection();
      const cookie = await seedActor([REJECTIONS_UPDATE]);

      // A bare unrecognized key alone carries no Zod issue `path` (`unrecognized_keys` reports
      // `path: []`), so it names no field in `details.fields` by itself. `disposition` is stated
      // invalid too, so this case can assert a real field path was named alongside the structural
      // 400 the excess `quantity` property causes.
      const { status, body } = await request(
        'PATCH',
        `${draftsPath}/${draftId}/lines/${lineId}/rejections/${rejectionId}`,
        cookie,
        { disposition: 'not_a_real_disposition', quantity: 999 },
      );

      expect(status).toBe(400);
      expect(body).toMatchObject({
        code: 'request.invalid',
        details: { fields: { disposition: 'invalid' } },
      });
    });

    it('refuses the amendment against an archived Warehouse', async () => {
      await seedWorld();
      const { draftId, lineId, rejectionId } =
        await seedClosedLineWithRejection();
      const cookie = await seedActor([REJECTIONS_UPDATE]);
      await dataSource.manager
        .getRepository(WarehouseEntity)
        .update({ id: warehouseId }, { archivedAt: seededAt });

      const { status, body } = await request(
        'PATCH',
        `${draftsPath}/${draftId}/lines/${lineId}/rejections/${rejectionId}`,
        cookie,
        { disposition: 'held_for_return' },
      );

      expect(status).toBe(409);
      expect(body).toMatchObject({ code: 'access.warehouse_archived' });
    });
  });

  // -- AC-06 — the Rejection Reason catalogue -----------------------------------------------------

  describe('GET /rejection-reasons (AC-06)', () => {
    it('serves the ten-row catalogue whole, at its own top-level segment', async () => {
      await seedWorld();
      const cookie = await seedActor([PURCHASE_DRAFTS_WATCH]);

      const { status, body } = await request(
        'GET',
        rejectionReasonsPath,
        cookie,
      );

      expect(status).toBe(200);
      expect(body).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: 'damaged_in_transit',
            requiresDescription: false,
          }),
          expect.objectContaining({
            id: 'unfit_other',
            requiresDescription: true,
          }),
        ]),
      );
      expect((body as unknown[]).length).toBe(10);
    });

    it('is archived-tolerant, serving the catalogue against an archived Warehouse', async () => {
      await seedWorld();
      const cookie = await seedActor([PURCHASE_DRAFTS_WATCH]);
      await dataSource.manager
        .getRepository(WarehouseEntity)
        .update({ id: warehouseId }, { archivedAt: seededAt });

      const { status } = await request('GET', rejectionReasonsPath, cookie);

      expect(status).toBe(200);
    });

    it('denies a member without PURCHASE_DRAFTS:WATCH', async () => {
      await seedWorld();
      const cookie = await seedActor([]);

      const { status, body } = await request(
        'GET',
        rejectionReasonsPath,
        cookie,
      );

      expect(status).toBe(403);
      expect(body).toMatchObject({ code: 'access.denied' });
    });
  });

  // -- Obligation 6 (2026-09-08 review) — regression guards owed by test-plan.md, not RED -----------
  //
  // test-plan.md:56 (AC-03), :90 (AC-14) and the sibling AC-15b row already pass today through the
  // existing `@warehouser/contracts` Zod schemas, wired into the two ending routes since T12. They
  // are recorded here as regression guards — proving the shared schema, not this task's own new
  // behaviour — the same way T10's AC-01b and AC-12 contract cases are labelled, rather than as RED.
  describe('shared ending schema regression guards (AC-03, AC-14, AC-15b)', () => {
    it('rejects a fractional refused quantity before the command ever runs (AC-03)', async () => {
      await seedWorld();
      const { draftId, lineId } = await seedDraftWithLine();
      const cookie = await seedActor([
        PURCHASE_DRAFTS_RECEIVE,
        REJECTIONS_CREATE,
      ]);

      const { status, body } = await request(
        'POST',
        `${draftsPath}/${draftId}/lines/${lineId}/arrival`,
        cookie,
        {
          receivedQuantity: 100,
          rejections: [
            {
              rejectionReasonId: 'damaged_in_transit',
              quantity: 1.5,
              source: 'inspected',
            },
          ],
        },
      );

      expect(status).toBe(400);
      expect(body).toMatchObject({
        code: 'request.invalid',
        details: { fields: { 'rejections.0.quantity': 'invalid' } },
      });
    });

    // test-plan.md:56 names both halves of the bound — "fractional **or non-positive**" — and the
    // case above only exercises the fractional half.
    it('rejects a non-positive refused quantity before the command ever runs (AC-03)', async () => {
      await seedWorld();
      const { draftId, lineId } = await seedDraftWithLine();
      const cookie = await seedActor([
        PURCHASE_DRAFTS_RECEIVE,
        REJECTIONS_CREATE,
      ]);

      const { status, body } = await request(
        'POST',
        `${draftsPath}/${draftId}/lines/${lineId}/arrival`,
        cookie,
        {
          receivedQuantity: 100,
          rejections: [
            {
              rejectionReasonId: 'damaged_in_transit',
              quantity: 0,
              source: 'inspected',
            },
          ],
        },
      );

      expect(status).toBe(400);
      expect(body).toMatchObject({
        code: 'request.invalid',
        details: { fields: { 'rejections.0.quantity': 'tooSmall' } },
      });
    });

    it('rejects a Rejection description beyond one thousand characters before the command ever runs (AC-14)', async () => {
      await seedWorld();
      const { draftId, lineId } = await seedDraftWithLine();
      const cookie = await seedActor([
        PURCHASE_DRAFTS_RECEIVE,
        REJECTIONS_CREATE,
      ]);

      const { status, body } = await request(
        'POST',
        `${draftsPath}/${draftId}/lines/${lineId}/arrival`,
        cookie,
        {
          receivedQuantity: 100,
          rejections: [
            {
              rejectionReasonId: 'damaged_in_transit',
              quantity: 8,
              source: 'inspected',
              description: 'x'.repeat(1001),
            },
          ],
        },
      );

      expect(status).toBe(400);
      expect(body).toMatchObject({
        code: 'request.invalid',
        details: { fields: { 'rejections.0.description': 'invalid' } },
      });
    });

    it('rejects a Pre-receipt Conformance note beyond one thousand characters before the command ever runs (AC-15b)', async () => {
      await seedWorld();
      const { draftId, lineId } = await seedDraftWithLine();
      const cookie = await seedActor([PURCHASE_DRAFTS_RECEIVE]);

      const { status, body } = await request(
        'POST',
        `${draftsPath}/${draftId}/lines/${lineId}/arrival`,
        cookie,
        {
          receivedQuantity: 100,
          preReceiptConformance: { verdict: 'not_met', note: 'x'.repeat(1001) },
        },
      );

      expect(status).toBe(400);
      expect(body).toMatchObject({
        code: 'request.invalid',
        details: { fields: { 'preReceiptConformance.note': 'invalid' } },
      });
    });
  });
});
