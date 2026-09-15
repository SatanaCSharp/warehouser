import { randomUUID } from 'node:crypto';

import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import {
  customerDetailSchema,
  customerSchema,
} from '@warehouser/contracts/customers';
import { AppModule } from 'app.module';
import { digestSessionSecret } from 'auth/domain/security/session-secret';
import { AUTH_SESSION_COOKIE } from 'auth/rest/auth-cookie';
import { ZodValidationPipe } from 'nestjs-zod';
import dataSource from 'shared/database/data-source';
import { AccountEntity } from 'shared/domain/entities/account.entity';
import { CustomerEntity } from 'shared/domain/entities/customer.entity';
import { CustomerDeliveryAddressEntity } from 'shared/domain/entities/customer-delivery-address.entity';
import { CustomerOrderEntity } from 'shared/domain/entities/customer-order.entity';
import { ItemEntity } from 'shared/domain/entities/item.entity';
import { PermissionEntity } from 'shared/domain/entities/permission.entity';
import { PurchaseDraftEntity } from 'shared/domain/entities/purchase-draft.entity';
import { PurchaseDraftLineEntity } from 'shared/domain/entities/purchase-draft-line.entity';
import { RoleEntity } from 'shared/domain/entities/role.entity';
import { RolePermissionEntity } from 'shared/domain/entities/role-permission.entity';
import { SessionEntity } from 'shared/domain/entities/session.entity';
import { UserEntity } from 'shared/domain/entities/user.entity';
import { WarehouseEntity } from 'shared/domain/entities/warehouse.entity';
import { WarehouseMembershipEntity } from 'shared/domain/entities/warehouse-membership.entity';
import { WorkspaceEntity } from 'shared/domain/entities/workspace.entity';
import { PurchaseDraftReadRepository } from 'shared/domain/repositories/purchase-draft-read.repository';
import { GlobalHttpExceptionFilter } from 'shared/errors/global-http-exception.filter';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

// T10 — the `/api/v1/warehouses/{warehouseId}/customers*` HTTP contract of
// `contracts/openapi.yaml` (AC-01, AC-02, AC-03, AC-04, AC-06, AC-06a, AC-07, AC-08, AC-09, AC-12,
// AC-23). Driven over real HTTP against the real Nest module graph, exactly as the
// `customer-orders` surface is, because the point is the composition — guards, the global Zod pipe,
// the use cases and the one exception filter — not any one of them in isolation.
//
// Per endpoint this proves: the declared Permission is required and sufficient; the shared schema
// is validated; the stable `customers.*` codes are mapped; every read survives archival and every
// mutation does not (AC-23); and no denial or refusal discloses a customer, an address, an access
// note or a count of any of them (AC-09, AC-12).
/* eslint-disable max-lines -- this file is one HTTP contract suite over the eight `customers`
   operations sharing one seeding closure; splitting it would duplicate that closure rather than
   shorten anything, matching `customer-orders-http-contract.integration.spec.ts` */

// Fixed clock for every seeded row: `chk_warehouses_archival_order` rejects
// `archivedAt < createdAt`, so seeding and archival share one instant.
const seededAt = new Date('2026-08-25T09:00:00.000Z');

const calendarDaysFromToday = (days: number): string =>
  new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

const workspaceId = '00000000-0000-4000-8000-000000000700';
const warehouseId = '00000000-0000-4000-8000-000000000701';
// A second Warehouse of the same Workspace the actor also holds a membership in. AC-12's
// non-disclosure comparison is made against a Customer that lives here.
const otherWarehouseId = '00000000-0000-4000-8000-000000000702';

const roleId = '00000000-0000-4000-8000-000000000801';
const otherWarehouseRoleId = '00000000-0000-4000-8000-000000000802';
// A second Role *of the acting Warehouse* that is never granted anything, so a permissionless actor
// cannot accidentally share the grants a test makes onto `roleId`.
const deniedRoleId = '00000000-0000-4000-8000-000000000803';

const CUSTOMERS_WATCH = 'CUSTOMERS:WATCH';
const CUSTOMERS_CREATE = 'CUSTOMERS:CREATE';
const CUSTOMERS_UPDATE = 'CUSTOMERS:UPDATE';
const CUSTOMERS_DEACTIVATE = 'CUSTOMERS:DEACTIVATE';

// The confidential values AC-09 and sad.md §8 keep out of every refusal.
const SECRET_ACCESS_NOTES = 'Gate code 4417; deliveries 09:00-17:00';
const SECRET_ADDRESS_TEXT = 'Test Address 1, Test City';

// R3/AC-06a — reads a frozen line's `customerDestination` projection the same way the Purchase
// Drafts surface does, so the address-book command's writes are proven against the real read path
// rather than against the entity columns alone.
const readRepository = new PurchaseDraftReadRepository(dataSource);

// eslint-disable-next-line max-lines-per-function -- one HTTP contract suite covering one surface is inherently long, matching the customer-orders and items precedents
describe('customers HTTP contract', () => {
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
      'TRUNCATE arrival_allocations, purchase_draft_demand_snapshots, purchase_draft_line_links, purchase_draft_lines, purchase_drafts, item_stock_adjustments, customer_orders, customer_delivery_addresses, customers, items, warehouse_memberships, role_permissions, roles, warehouses, workspaces, sessions, users, accounts, permissions CASCADE',
    );
  });

  afterAll(async () => {
    await dataSource.destroy();
    await app.close();
  });

  const grantPermissions = async (
    targetRoleId: string,
    permissionIds: readonly string[],
  ): Promise<void> => {
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
        roleId: targetRoleId,
        permissionId,
        roleKind: 'custom' as const,
        permissionKind: 'assignable' as const,
      })),
    );
  };

  const seedWarehouses = async (): Promise<void> => {
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
        createdAt: seededAt,
        updatedAt: seededAt,
      },
      {
        id: otherWarehouseId,
        workspaceId,
        name: 'Warehouse B',
        archivedAt: null,
        createdAt: seededAt,
        updatedAt: seededAt,
      },
    ]);
    await dataSource.manager.getRepository(RoleEntity).insert([
      {
        id: roleId,
        warehouseId,
        name: 'Custodian',
        kind: 'custom',
        createdAt: seededAt,
        updatedAt: seededAt,
      },
      {
        id: otherWarehouseRoleId,
        warehouseId: otherWarehouseId,
        name: 'Other Warehouse Role',
        kind: 'custom',
        createdAt: seededAt,
        updatedAt: seededAt,
      },
      {
        id: deniedRoleId,
        warehouseId,
        name: 'Observer Without Permissions',
        kind: 'custom',
        createdAt: seededAt,
        updatedAt: seededAt,
      },
    ]);
  };

  const setWarehouseArchived = async (
    id: string,
    archivedAt: Date | null,
  ): Promise<void> => {
    await dataSource.manager
      .getRepository(WarehouseEntity)
      .update({ id }, { archivedAt });
  };

  // `accounts.user_id` / `users.account_id` form a deferred circular FK pair, so both inserts must
  // run inside one transaction.
  const seedIdentity = async (
    userId: string,
    normalizedEmail: string,
  ): Promise<void> => {
    await dataSource.transaction(async (manager) => {
      await manager.getRepository(AccountEntity).insert({
        id: userId,
        userId,
        normalizedEmail,
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

  const seedMembership = async (
    userId: string,
    userWarehouseId: string,
    userRoleId: string,
  ): Promise<void> => {
    await dataSource.manager.getRepository(WarehouseMembershipEntity).insert({
      userId,
      warehouseId: userWarehouseId,
      workspaceId,
      roleId: userRoleId,
      roleKind: 'custom',
      createdAt: seededAt,
      updatedAt: seededAt,
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

  /** Seeds a Warehouse Member of `warehouseId` holding exactly `permissionIds`. */
  const seedActor = async (
    permissionIds: readonly string[],
  ): Promise<{ userId: string; cookie: string }> => {
    const userId = randomUUID();
    await seedIdentity(userId, `member.${userId}@example.test`);
    if (permissionIds.length > 0) {
      await grantPermissions(roleId, permissionIds);
    }
    await seedMembership(userId, warehouseId, roleId);
    return { userId, cookie: await seedSessionCookie(userId) };
  };

  /** A Warehouse Member of `warehouseId` on a Role carrying no Permission at all, who stays
   * permissionless even when the same test grants Permissions to the shared `roleId`. */
  const seedPermissionlessActor = async (): Promise<{
    userId: string;
    cookie: string;
  }> => {
    const userId = randomUUID();
    await seedIdentity(userId, `denied.${userId}@example.test`);
    await seedMembership(userId, warehouseId, deniedRoleId);
    return { userId, cookie: await seedSessionCookie(userId) };
  };

  const seedRecorder = async (): Promise<string> => {
    const userId = randomUUID();
    await seedIdentity(userId, `recorder.${userId}@example.test`);
    return userId;
  };

  const seedItem = async (
    overrides: Partial<{
      sku: string;
      description: string;
      unitOfMeasure: string;
    }> = {},
  ): Promise<string> => {
    const id = randomUUID();
    await dataSource.manager.getRepository(ItemEntity).insert({
      id,
      warehouseId,
      sku: overrides.sku ?? `TEST-SKU-${id.slice(0, 8)}`,
      description: overrides.description ?? 'Test Item',
      unitOfMeasure: overrides.unitOfMeasure ?? 'pieces',
      onHandQuantity: 0,
      deactivatedAt: null,
      createdAt: seededAt,
      updatedAt: seededAt,
    });
    return id;
  };

  interface SeededAddress {
    readonly id: string;
    readonly addressText: string;
    readonly accessNotes: string | null;
    readonly isMain: boolean;
    readonly deactivatedAt: Date | null;
  }

  /** A Customer with the addresses given, in the order given; the first one is Main unless the
   * fixture says otherwise. Written directly rather than through the API so a test can seed the
   * states a member cannot reach through one — an Inactive address, for instance. */
  const seedCustomer = async (
    overrides: Partial<{
      customerWarehouseId: string;
      name: string;
      deactivatedAt: Date | null;
      addresses: readonly Partial<SeededAddress>[];
      createdAt: Date;
    }> = {},
  ): Promise<{ id: string; addressIds: string[] }> => {
    const id = randomUUID();
    const recordedByUserId = await seedRecorder();
    const customerWarehouseId = overrides.customerWarehouseId ?? warehouseId;
    const createdAt = overrides.createdAt ?? seededAt;
    await dataSource.manager.getRepository(CustomerEntity).insert({
      id,
      warehouseId: customerWarehouseId,
      name: overrides.name ?? `Test Customer ${id.slice(0, 8)}`,
      deactivatedAt: overrides.deactivatedAt ?? null,
      recordedByUserId,
      createdAt,
      updatedAt: createdAt,
    });

    const fixtures = overrides.addresses ?? [{}];
    const addressIds: string[] = [];
    for (const [index, fixture] of fixtures.entries()) {
      const addressId = fixture.id ?? randomUUID();
      addressIds.push(addressId);
      await dataSource.manager
        .getRepository(CustomerDeliveryAddressEntity)
        .insert({
          id: addressId,
          customerId: id,
          warehouseId: customerWarehouseId,
          addressText: fixture.addressText ?? `${SECRET_ADDRESS_TEXT} ${index}`,
          accessNotes:
            fixture.accessNotes === undefined
              ? SECRET_ACCESS_NOTES
              : fixture.accessNotes,
          isMain: fixture.isMain ?? index === 0,
          deactivatedAt: fixture.deactivatedAt ?? null,
          // Ordered by creation time, so the seeded order is the read order.
          createdAt: new Date(createdAt.getTime() + index * 1_000),
          updatedAt: new Date(createdAt.getTime() + index * 1_000),
        });
    }

    return { id, addressIds };
  };

  const seedCustomerOrder = async (
    itemId: string,
    customerId: string,
    deliveryAddressId: string,
    overrides: Partial<{
      quantity: number;
      outstandingQuantity: number;
      neededBy: string;
      state: 'unfulfilled' | 'fulfilled' | 'cancelled';
    }> = {},
  ): Promise<string> => {
    const id = randomUUID();
    const quantity = overrides.quantity ?? 100;
    const state = overrides.state ?? 'unfulfilled';
    const cancelled = state === 'cancelled';
    const recordedByUserId = await seedRecorder();
    await dataSource.manager.getRepository(CustomerOrderEntity).insert({
      id,
      warehouseId,
      itemId,
      customerId,
      customerDeliveryAddressId: deliveryAddressId,
      customerName: null,
      quantity,
      outstandingQuantity:
        overrides.outstandingQuantity ?? (state === 'fulfilled' ? 0 : quantity),
      neededBy: overrides.neededBy ?? calendarDaysFromToday(30),
      state,
      cancellationReason: cancelled
        ? 'The customer no longer needs them'
        : null,
      recordedByUserId,
      cancelledByUserId: cancelled ? recordedByUserId : null,
      cancelledAt: cancelled ? seededAt : null,
      createdAt: seededAt,
      updatedAt: seededAt,
    });
    return id;
  };

  /** A frozen `direct_to_customer` Purchase Draft Line naming `customerDeliveryAddressId`, on a
   * Purchase Draft already in Ready for Ordering — the real row R3's AC-06a and AC-03b cases read
   * back after mutating the Customer or its address, following `ready-purchase-draft.command.
   * integration.spec.ts`'s seeding shape (frozen text written directly rather than produced by the
   * freeze command, because the point here is what a later Customer/address write does to an
   * already-frozen row, not the freeze itself). */
  const seedFrozenDirectLine = async (
    itemId: string,
    customerDeliveryAddressId: string,
    overrides: Partial<{
      frozenDeliveryAddressText: string;
      frozenAccessNotes: string | null;
      frozenCustomerName: string;
    }> = {},
  ): Promise<string> => {
    const draftId = randomUUID();
    const draftUserId = await seedRecorder();
    await dataSource.manager.getRepository(PurchaseDraftEntity).insert({
      id: draftId,
      warehouseId,
      state: 'ready_for_ordering',
      expectedArrivalDate: null,
      createdByUserId: draftUserId,
      readiedByUserId: draftUserId,
      readiedAt: seededAt,
      closedByUserId: null,
      closedAt: null,
      closureReason: null,
      arrivalConfirmedByUserId: null,
      arrivalConfirmedAt: null,
      discardedByUserId: null,
      discardedAt: null,
      createdAt: seededAt,
      updatedAt: seededAt,
    });
    const lineId = randomUUID();
    await dataSource.manager.getRepository(PurchaseDraftLineEntity).insert({
      id: lineId,
      purchaseDraftId: draftId,
      warehouseId,
      itemId,
      orderedQuantity: 40,
      packagingTypeId: null,
      valueAddingNote: null,
      deliveryMode: 'direct_to_customer',
      customerDeliveryAddressId,
      frozenDeliveryAddressText:
        overrides.frozenDeliveryAddressText ?? SECRET_ADDRESS_TEXT,
      frozenAccessNotes:
        overrides.frozenAccessNotes === undefined
          ? SECRET_ACCESS_NOTES
          : overrides.frozenAccessNotes,
      frozenCustomerName: overrides.frozenCustomerName ?? 'Test Customer North',
      endingQuantity: null,
      endingKind: null,
      endingRecordedByUserId: null,
      endingRecordedAt: null,
      createdAt: seededAt,
      updatedAt: seededAt,
    });
    return lineId;
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

  const customersPath = `/api/v1/warehouses/${warehouseId}/customers`;

  // -- GET /customers -- the list and the picker read (AC-06, AC-09, AC-23) --------------------

  describe('GET /api/v1/warehouses/:warehouseId/customers', () => {
    it('returns every Customer of the Warehouse ordered by name, each with its Delivery Addresses and which is Main', async () => {
      await seedWarehouses();
      const north = await seedCustomer({
        name: 'Test Customer North',
        addresses: [
          { addressText: 'Test Address 1, Test City', isMain: true },
          {
            addressText: 'Test Address 2, Test Town',
            accessNotes: null,
            isMain: false,
          },
        ],
      });
      const alpha = await seedCustomer({ name: 'Alpha Customer' });
      // A Customer of the other Warehouse, which this read never sees (AC-03a, AC-12).
      await seedCustomer({
        customerWarehouseId: otherWarehouseId,
        name: 'Another Warehouse Customer',
      });
      const actor = await seedActor([CUSTOMERS_WATCH]);

      const { status, body } = await request(
        'GET',
        customersPath,
        actor.cookie,
      );

      expect(status).toBe(200);
      // The shared schema is what the response is judged against, so a field the contract does not
      // carry — an active-address count, for instance — fails here rather than at review.
      const customers = customerSchema.array().parse(body);
      expect(customers.map((customer) => customer.name)).toEqual([
        'Alpha Customer',
        'Test Customer North',
      ]);
      expect(customers[1]).toMatchObject({
        id: north.id,
        deactivatedAt: null,
        mainDeliveryAddressId: north.addressIds[0],
      });
      expect(customers[1].deliveryAddresses).toEqual([
        expect.objectContaining({
          id: north.addressIds[0],
          customerId: north.id,
          addressText: 'Test Address 1, Test City',
          accessNotes: SECRET_ACCESS_NOTES,
          isMain: true,
          deactivatedAt: null,
        }),
        expect.objectContaining({
          id: north.addressIds[1],
          addressText: 'Test Address 2, Test Town',
          accessNotes: null,
          isMain: false,
        }),
      ]);
      expect(customers[0].id).toBe(alpha.id);
    });

    // AC-06 — the picker read. Without the filter an Inactive Customer is still listed, because a
    // Customer Order already naming it stays readable and keeps counting exactly as before.
    it('narrows to the Customers a picker may offer with active=true, and lists the Inactive ones without it (AC-06)', async () => {
      await seedWarehouses();
      const active = await seedCustomer({ name: 'Active Customer' });
      const inactive = await seedCustomer({
        name: 'Inactive Customer',
        deactivatedAt: new Date('2026-09-02T12:00:00.000Z'),
      });
      const actor = await seedActor([CUSTOMERS_WATCH]);

      const unfiltered = await request('GET', customersPath, actor.cookie);
      const picker = await request(
        'GET',
        `${customersPath}?active=true`,
        actor.cookie,
      );
      const explicitlyUnfiltered = await request(
        'GET',
        `${customersPath}?active=false`,
        actor.cookie,
      );

      expect(
        customerSchema
          .array()
          .parse(unfiltered.body)
          .map((c) => c.id),
      ).toEqual([active.id, inactive.id]);
      expect(
        customerSchema
          .array()
          .parse(picker.body)
          .map((c) => c.id),
      ).toEqual([active.id]);
      // `active=false` is not `active=true`, which `z.coerce.boolean()` would have made it.
      expect(
        customerSchema
          .array()
          .parse(explicitlyUnfiltered.body)
          .map((c) => c.id),
      ).toEqual([active.id, inactive.id]);
    });

    it('refuses an active filter that is neither true nor false', async () => {
      await seedWarehouses();
      const actor = await seedActor([CUSTOMERS_WATCH]);

      const { status } = await request(
        'GET',
        `${customersPath}?active=yes`,
        actor.cookie,
      );

      expect(status).toBe(400);
    });

    // AC-09 — "no name, no address, no quantity, no Item, and no count". The denial is the one
    // non-enumerating `access.denied`, and the Warehouse holding Customers is refused identically
    // to the one holding none.
    it('denies the list without CUSTOMERS:WATCH, disclosing no Customer, address, access note or count (AC-09)', async () => {
      await seedWarehouses();
      await seedCustomer({
        name: 'Test Customer North',
        addresses: [
          {
            addressText: SECRET_ADDRESS_TEXT,
            accessNotes: SECRET_ACCESS_NOTES,
          },
        ],
      });
      const actor = await seedActor([]);
      await seedMembership(
        actor.userId,
        otherWarehouseId,
        otherWarehouseRoleId,
      );

      const denied = await request('GET', customersPath, actor.cookie);
      const emptyWarehouse = await request(
        'GET',
        `/api/v1/warehouses/${otherWarehouseId}/customers`,
        actor.cookie,
      );

      expect(denied.status).toBe(403);
      expect(denied.body).toMatchObject({ code: 'access.denied' });

      const serialized = JSON.stringify(denied.body);
      expect(serialized).not.toContain('Test Customer North');
      expect(serialized).not.toContain(SECRET_ADDRESS_TEXT);
      expect(serialized).not.toContain(SECRET_ACCESS_NOTES);
      // No count, badge or total either — a count answers "does this exist" as effectively as the
      // record does (spec.md §6.1 "Customer disclosure through a count").
      expect(serialized).not.toMatch(/\d/u);

      expect(denied).toEqual(emptyWarehouse);
    });

    // AC-23 — the read keeps working after archival, and the member without the Permission is
    // refused exactly as before archiving.
    it('still lists the Customers of an archived Warehouse (AC-23)', async () => {
      await seedWarehouses();
      const customer = await seedCustomer({ name: 'Test Customer North' });
      const actor = await seedActor([CUSTOMERS_WATCH]);
      const withoutPermission = await seedPermissionlessActor();
      await setWarehouseArchived(warehouseId, seededAt);

      const read = await request('GET', customersPath, actor.cookie);
      const refused = await request(
        'GET',
        customersPath,
        withoutPermission.cookie,
      );

      expect(read.status).toBe(200);
      expect(
        customerSchema
          .array()
          .parse(read.body)
          .map((c) => c.id),
      ).toEqual([customer.id]);
      expect(refused.status).toBe(403);
      expect(refused.body).toMatchObject({ code: 'access.denied' });
    });
  });

  // -- POST /customers -- record (AC-01, AC-02, AC-03, AC-23) ----------------------------------

  describe('POST /api/v1/warehouses/:warehouseId/customers', () => {
    it('records the Customer active with its first address active and Main, attributed to the member (AC-01)', async () => {
      await seedWarehouses();
      const actor = await seedActor([CUSTOMERS_CREATE]);

      const { status, body } = await request(
        'POST',
        customersPath,
        actor.cookie,
        {
          name: 'Test Customer North',
          deliveryAddress: {
            addressText: SECRET_ADDRESS_TEXT,
            accessNotes: SECRET_ACCESS_NOTES,
          },
        },
      );

      expect(status).toBe(201);
      const customer = customerSchema.parse(body);
      expect(customer).toMatchObject({
        name: 'Test Customer North',
        deactivatedAt: null,
        recordedByUserId: actor.userId,
      });
      expect(customer.deliveryAddresses).toHaveLength(1);
      expect(customer.deliveryAddresses[0]).toMatchObject({
        addressText: SECRET_ADDRESS_TEXT,
        accessNotes: SECRET_ACCESS_NOTES,
        isMain: true,
        deactivatedAt: null,
      });
      expect(customer.mainDeliveryAddressId).toBe(
        customer.deliveryAddresses[0].id,
      );
    });

    // AC-02 — refused with nothing changed, and the refusal names the field and the rule without
    // ever echoing the submitted address text or access notes (sad.md §8).
    it.each([
      ['name', { name: '   ' }],
      [
        'deliveryAddress.addressText',
        { deliveryAddress: { addressText: '  ' } },
      ],
    ])(
      'refuses a blank %s and changes nothing (AC-02)',
      async (field, patch) => {
        await seedWarehouses();
        const actor = await seedActor([CUSTOMERS_CREATE]);

        const { status, body } = await request(
          'POST',
          customersPath,
          actor.cookie,
          {
            name: 'Test Customer North',
            deliveryAddress: { addressText: SECRET_ADDRESS_TEXT },
            ...patch,
          },
        );

        expect(status).toBe(400);
        expect(body).toMatchObject({
          code: 'customers.invalid_input',
          details: { field, rule: 'trimmed_non_empty' },
        });
        expect(JSON.stringify(body)).not.toContain(SECRET_ADDRESS_TEXT);
        expect(
          await dataSource.manager.getRepository(CustomerEntity).count(),
        ).toBe(0);
      },
    );

    // AC-03/AC-03a — the same name in this Warehouse is refused naming the holder, whether that
    // holder is active or Inactive; the same name in another Warehouse is never consulted.
    it('refuses a name this Warehouse already holds and permits it in another (AC-03, AC-03a)', async () => {
      await seedWarehouses();
      const holder = await seedCustomer({
        name: 'Test Customer North',
        deactivatedAt: new Date('2026-09-02T12:00:00.000Z'),
      });
      await seedCustomer({
        customerWarehouseId: otherWarehouseId,
        name: 'Elsewhere Customer',
      });
      const actor = await seedActor([CUSTOMERS_CREATE]);

      const refused = await request('POST', customersPath, actor.cookie, {
        name: 'Test Customer North',
        deliveryAddress: { addressText: SECRET_ADDRESS_TEXT },
      });
      const accepted = await request('POST', customersPath, actor.cookie, {
        name: 'Elsewhere Customer',
        deliveryAddress: { addressText: SECRET_ADDRESS_TEXT },
      });

      expect(refused.status).toBe(409);
      expect(refused.body).toMatchObject({
        code: 'customers.name_taken',
        details: { customerId: holder.id, name: 'Test Customer North' },
      });
      expect(accepted.status).toBe(201);
    });

    // AC-05 — the guard-ordering regression: the missing Permission is decided *before* archival,
    // so a permissionless member cannot learn from the refusal alone that the Warehouse is archived.
    it('refuses a member without the Permission identically before and after archival (AC-09, AC-23)', async () => {
      await seedWarehouses();
      const withoutPermission = await seedPermissionlessActor();
      const payload = {
        name: 'Test Customer North',
        deliveryAddress: { addressText: SECRET_ADDRESS_TEXT },
      };

      const before = await request(
        'POST',
        customersPath,
        withoutPermission.cookie,
        payload,
      );
      await setWarehouseArchived(warehouseId, seededAt);
      const after = await request(
        'POST',
        customersPath,
        withoutPermission.cookie,
        payload,
      );

      expect(before.status).toBe(403);
      expect(before.body).toMatchObject({ code: 'access.denied' });
      expect(after).toEqual(before);
    });

    it('refuses to record a Customer on an archived Warehouse (AC-23)', async () => {
      await seedWarehouses();
      const actor = await seedActor([CUSTOMERS_CREATE]);
      await setWarehouseArchived(warehouseId, seededAt);

      const { status, body } = await request(
        'POST',
        customersPath,
        actor.cookie,
        {
          name: 'Test Customer North',
          deliveryAddress: { addressText: SECRET_ADDRESS_TEXT },
        },
      );

      expect(status).toBe(409);
      expect(body).toMatchObject({ code: 'access.warehouse_archived' });
    });
  });

  // -- GET /customers/:id -- the awaiting list (AC-08, AC-06a, AC-12, AC-23) -------------------

  describe('GET /api/v1/warehouses/:warehouseId/customers/:customerId', () => {
    it('returns the Customer, its addresses and every Unfulfilled order with its Item and destination (AC-08)', async () => {
      await seedWarehouses();
      const customer = await seedCustomer({
        name: 'Test Customer North',
        addresses: [
          { addressText: 'Test Address 1, Test City' },
          {
            addressText: 'Test Address 2, Test Town',
            accessNotes: null,
            isMain: false,
          },
        ],
      });
      const cable = await seedItem({
        sku: 'TEST-SKU-0001',
        description: 'Test Item - 2 m cable',
        unitOfMeasure: 'metres',
      });
      const carton = await seedItem({ sku: 'TEST-SKU-0002' });
      const soonest = await seedCustomerOrder(
        cable,
        customer.id,
        customer.addressIds[0],
        { quantity: 40, neededBy: calendarDaysFromToday(5) },
      );
      const later = await seedCustomerOrder(
        carton,
        customer.id,
        customer.addressIds[1],
        { quantity: 70, neededBy: calendarDaysFromToday(20) },
      );
      // Neither counts: a Fulfilled order is waiting for nothing and a cancelled one ended (AC-08).
      await seedCustomerOrder(cable, customer.id, customer.addressIds[0], {
        quantity: 500,
        state: 'fulfilled',
      });
      await seedCustomerOrder(cable, customer.id, customer.addressIds[0], {
        quantity: 500,
        state: 'cancelled',
      });
      const actor = await seedActor([CUSTOMERS_WATCH]);

      const { status, body } = await request(
        'GET',
        `${customersPath}/${customer.id}`,
        actor.cookie,
      );

      expect(status).toBe(200);
      const detail = customerDetailSchema.parse(body);
      expect(detail.deliveryAddresses).toHaveLength(2);
      expect(detail.awaitingCustomerOrders).toEqual([
        {
          customerOrderId: soonest,
          itemId: cable,
          itemSku: 'TEST-SKU-0001',
          itemDescription: 'Test Item - 2 m cable',
          unitOfMeasure: 'metres',
          outstandingQuantity: 40,
          neededBy: calendarDaysFromToday(5),
          destination: {
            deliveryAddressId: customer.addressIds[0],
            addressText: 'Test Address 1, Test City',
            accessNotes: SECRET_ACCESS_NOTES,
            isMain: true,
            deactivatedAt: null,
          },
        },
        expect.objectContaining({
          customerOrderId: later,
          destination: expect.objectContaining({
            deliveryAddressId: customer.addressIds[1],
            isMain: false,
          }),
        }),
      ]);
    });

    // AC-06a — the order keeps naming an address made Inactive since, keeps counting exactly as
    // before, and the read says so.
    it('reports a destination that has since been made Inactive (AC-06a)', async () => {
      await seedWarehouses();
      const deactivatedAt = new Date('2026-09-02T12:30:00.000Z');
      const customer = await seedCustomer({
        addresses: [{ isMain: true }, { isMain: false, deactivatedAt }],
      });
      const itemId = await seedItem();
      await seedCustomerOrder(itemId, customer.id, customer.addressIds[1]);
      const actor = await seedActor([CUSTOMERS_WATCH]);

      const { body } = await request(
        'GET',
        `${customersPath}/${customer.id}`,
        actor.cookie,
      );

      const detail = customerDetailSchema.parse(body);
      expect(detail.awaitingCustomerOrders[0].destination).toMatchObject({
        deliveryAddressId: customer.addressIds[1],
        isMain: false,
        deactivatedAt: deactivatedAt.toISOString(),
      });
    });

    // AC-12 — a Customer of another Warehouse is **indistinguishable** from a missing one, and
    // neither refusal names anything.
    it('refuses a Customer of another Warehouse exactly as a missing one, disclosing nothing (AC-12)', async () => {
      await seedWarehouses();
      const elsewhere = await seedCustomer({
        customerWarehouseId: otherWarehouseId,
        name: 'Another Warehouse Customer',
        addresses: [
          {
            addressText: SECRET_ADDRESS_TEXT,
            accessNotes: SECRET_ACCESS_NOTES,
          },
        ],
      });
      const actor = await seedActor([CUSTOMERS_WATCH]);

      const crossWarehouse = await request(
        'GET',
        `${customersPath}/${elsewhere.id}`,
        actor.cookie,
      );
      const missing = await request(
        'GET',
        `${customersPath}/${randomUUID()}`,
        actor.cookie,
      );

      expect(crossWarehouse.status).toBe(404);
      expect(crossWarehouse.body).toMatchObject({
        code: 'customers.target_unavailable',
      });
      expect(crossWarehouse).toEqual(missing);
      const serialized = JSON.stringify(crossWarehouse.body);
      expect(serialized).not.toContain('Another Warehouse Customer');
      expect(serialized).not.toContain(SECRET_ADDRESS_TEXT);
      expect(serialized).not.toContain(SECRET_ACCESS_NOTES);
    });

    it('denies the read without CUSTOMERS:WATCH and still serves it on an archived Warehouse (AC-09, AC-23)', async () => {
      await seedWarehouses();
      const customer = await seedCustomer({ name: 'Test Customer North' });
      const actor = await seedActor([CUSTOMERS_WATCH]);
      const withoutPermission = await seedPermissionlessActor();
      await setWarehouseArchived(warehouseId, seededAt);

      const read = await request(
        'GET',
        `${customersPath}/${customer.id}`,
        actor.cookie,
      );
      const denied = await request(
        'GET',
        `${customersPath}/${customer.id}`,
        withoutPermission.cookie,
      );

      expect(read.status).toBe(200);
      expect(customerDetailSchema.parse(read.body).id).toBe(customer.id);
      expect(denied.status).toBe(403);
      expect(denied.body).toMatchObject({ code: 'access.denied' });
      expect(JSON.stringify(denied.body)).not.toContain(customer.id);
    });
  });

  // -- PATCH /customers/:id -- correct the name (AC-03b, AC-03c, AC-23) ------------------------

  describe('PATCH /api/v1/warehouses/:warehouseId/customers/:customerId', () => {
    it('records the correction and leaves the Customer Orders naming it untouched (AC-03b)', async () => {
      await seedWarehouses();
      const customer = await seedCustomer({ name: 'Test Customer North' });
      const itemId = await seedItem();
      const orderId = await seedCustomerOrder(
        itemId,
        customer.id,
        customer.addressIds[0],
      );
      // A frozen line carrying `frozen_customer_name` — the other half of AC-03b, unbacked before
      // R3: the captured name is a snapshot the correction deliberately does not touch.
      const frozenLineId = await seedFrozenDirectLine(
        itemId,
        customer.addressIds[0],
        { frozenCustomerName: 'Test Customer North' },
      );
      const actor = await seedActor([CUSTOMERS_UPDATE]);

      const { status, body } = await request(
        'PATCH',
        `${customersPath}/${customer.id}`,
        actor.cookie,
        { name: 'Test Customer North (Ltd)' },
      );

      expect(status).toBe(200);
      expect(customerSchema.parse(body)).toMatchObject({
        id: customer.id,
        name: 'Test Customer North (Ltd)',
      });
      // Nothing denormalizes the name: the order reaches it through `customer_id` and carries none.
      const order = await dataSource.manager
        .getRepository(CustomerOrderEntity)
        .findOneByOrFail({ id: orderId });
      expect(order.customerName).toBeNull();
      expect(order.customerId).toBe(customer.id);
      // The frozen line's captured name survives the correction, and the line still resolves to
      // the same Customer.
      const frozenLine = await dataSource.manager
        .getRepository(PurchaseDraftLineEntity)
        .findOneByOrFail({ id: frozenLineId });
      expect(frozenLine.frozenCustomerName).toBe('Test Customer North');
      const draft = await readRepository.readIdentifiedDraft(
        frozenLine.purchaseDraftId,
        warehouseId,
        'with_cause',
      );
      const draftLine = draft?.lines.find((line) => line.id === frozenLineId);
      expect(draftLine?.customerDestination?.customerId).toBe(customer.id);
    });

    it('refuses a name another Customer of this Warehouse already holds (AC-03c)', async () => {
      await seedWarehouses();
      const holder = await seedCustomer({ name: 'Test Customer North' });
      const corrected = await seedCustomer({ name: 'Test Customer South' });
      const actor = await seedActor([CUSTOMERS_UPDATE]);

      const { status, body } = await request(
        'PATCH',
        `${customersPath}/${corrected.id}`,
        actor.cookie,
        { name: 'Test Customer North' },
      );

      expect(status).toBe(409);
      expect(body).toMatchObject({
        code: 'customers.name_taken',
        details: { customerId: holder.id },
      });
    });

    it('denies the correction without CUSTOMERS:UPDATE and refuses it on an archived Warehouse (AC-23)', async () => {
      await seedWarehouses();
      const customer = await seedCustomer({ name: 'Test Customer North' });
      const withoutPermission = await seedPermissionlessActor();
      const actor = await seedActor([CUSTOMERS_UPDATE]);

      const denied = await request(
        'PATCH',
        `${customersPath}/${customer.id}`,
        withoutPermission.cookie,
        { name: 'Test Customer West' },
      );
      await setWarehouseArchived(warehouseId, seededAt);
      const archived = await request(
        'PATCH',
        `${customersPath}/${customer.id}`,
        actor.cookie,
        { name: 'Test Customer West' },
      );

      expect(denied.status).toBe(403);
      expect(denied.body).toMatchObject({ code: 'access.denied' });
      expect(archived.status).toBe(409);
      expect(archived.body).toMatchObject({
        code: 'access.warehouse_archived',
      });
    });
  });

  // -- POST and DELETE /customers/:id/deactivation (AC-06, AC-23) ------------------------------

  describe('the Customer deactivation sub-resource', () => {
    it('records the Customer Inactive without touching its addresses, and makes it active again (AC-06)', async () => {
      await seedWarehouses();
      const customer = await seedCustomer({
        name: 'Test Customer North',
        addresses: [{ isMain: true }, { isMain: false }],
      });
      const itemId = await seedItem();
      await seedCustomerOrder(itemId, customer.id, customer.addressIds[0]);
      const actor = await seedActor([CUSTOMERS_DEACTIVATE, CUSTOMERS_WATCH]);
      const path = `${customersPath}/${customer.id}/deactivation`;

      const deactivated = await request('POST', path, actor.cookie);
      const listedWhileInactive = await request(
        'GET',
        `${customersPath}?active=true`,
        actor.cookie,
      );
      const reactivated = await request('DELETE', path, actor.cookie);

      expect(deactivated.status).toBe(200);
      const inactive = customerSchema.parse(deactivated.body);
      expect(inactive.deactivatedAt).not.toBeNull();
      // "leaves every one of its Delivery Addresses in the state it was already in".
      expect(
        inactive.deliveryAddresses.map((address) => address.deactivatedAt),
      ).toEqual([null, null]);
      expect(inactive.mainDeliveryAddressId).toBe(customer.addressIds[0]);
      // The Customer stops being offered where demand is recorded.
      expect(
        customerSchema
          .array()
          .parse(listedWhileInactive.body)
          .map((c) => c.id),
      ).not.toContain(customer.id);

      expect(reactivated.status).toBe(200);
      expect(customerSchema.parse(reactivated.body).deactivatedAt).toBeNull();
    });

    // spec.md §6.1 — deactivation declares its own Permission: a member who may update a Customer
    // does not thereby withdraw it.
    it('is denied to a member holding only CUSTOMERS:UPDATE (spec.md §6.1)', async () => {
      await seedWarehouses();
      const customer = await seedCustomer();
      const actor = await seedActor([CUSTOMERS_UPDATE]);

      const { status, body } = await request(
        'POST',
        `${customersPath}/${customer.id}/deactivation`,
        actor.cookie,
      );

      expect(status).toBe(403);
      expect(body).toMatchObject({ code: 'access.denied' });
    });

    it.each(['POST', 'DELETE'])(
      'refuses %s on an archived Warehouse (AC-23)',
      async (method) => {
        await seedWarehouses();
        const customer = await seedCustomer();
        const actor = await seedActor([CUSTOMERS_DEACTIVATE]);
        await setWarehouseArchived(warehouseId, seededAt);

        const { status, body } = await request(
          method,
          `${customersPath}/${customer.id}/deactivation`,
          actor.cookie,
        );

        expect(status).toBe(409);
        expect(body).toMatchObject({ code: 'access.warehouse_archived' });
      },
    );
  });

  // -- the Delivery Address book (AC-04, AC-05, AC-06a, AC-06b, AC-07, AC-12, AC-23) -----------

  // eslint-disable-next-line max-lines-per-function -- the address book is five operations and eight rules over one seeding closure; splitting the block would duplicate `addressesPath` and the fixtures rather than shorten anything
  describe('the Customer Delivery Address book', () => {
    const addressesPath = (customerId: string): string =>
      `${customersPath}/${customerId}/delivery-addresses`;

    it('records a further address and, with main: true, moves the Main flag in one change (AC-04, AC-05)', async () => {
      await seedWarehouses();
      const customer = await seedCustomer();
      const actor = await seedActor([CUSTOMERS_UPDATE]);

      const { status, body } = await request(
        'POST',
        addressesPath(customer.id),
        actor.cookie,
        {
          addressText: 'Test Address 2, Test Town',
          accessNotes: 'Rear yard; call the site office on arrival',
          main: true,
        },
      );

      expect(status).toBe(201);
      const updated = customerSchema.parse(body);
      expect(updated.deliveryAddresses).toHaveLength(2);
      // Exactly one active address is Main at every instant.
      expect(
        updated.deliveryAddresses.filter((address) => address.isMain),
      ).toHaveLength(1);
      expect(updated.mainDeliveryAddressId).toBe(
        updated.deliveryAddresses[1].id,
      );
      expect(updated.deliveryAddresses[0].isMain).toBe(false);
    });

    it('records an added address as ordinary when main is not stated', async () => {
      await seedWarehouses();
      const customer = await seedCustomer();
      const actor = await seedActor([CUSTOMERS_UPDATE]);

      const { body } = await request(
        'POST',
        addressesPath(customer.id),
        actor.cookie,
        { addressText: 'Test Address 2, Test Town' },
      );

      const updated = customerSchema.parse(body);
      expect(updated.mainDeliveryAddressId).toBe(customer.addressIds[0]);
      expect(updated.deliveryAddresses[1]).toMatchObject({
        isMain: false,
        accessNotes: null,
      });
    });

    // T10 § "Reading inherited from T9" — PATCH declares no `CustomerDeliveryAddressConflict` in
    // openapi.yaml while `setMainCustomerDeliveryAddress` does. Correcting a typo on an address a
    // Customer Order still names is worth doing whether or not that address is still offered.
    it('corrects an address in place, an Inactive one included, and clears notes with null', async () => {
      await seedWarehouses();
      const customer = await seedCustomer({
        addresses: [
          { isMain: true },
          {
            isMain: false,
            deactivatedAt: new Date('2026-09-02T12:30:00.000Z'),
          },
        ],
      });
      const actor = await seedActor([CUSTOMERS_UPDATE]);

      const corrected = await request(
        'PATCH',
        `${addressesPath(customer.id)}/${customer.addressIds[1]}`,
        actor.cookie,
        { addressText: 'Test Address 2, Test Town, Unit 4', accessNotes: null },
      );

      expect(corrected.status).toBe(200);
      const updated = customerSchema.parse(corrected.body);
      expect(updated.deliveryAddresses[1]).toMatchObject({
        addressText: 'Test Address 2, Test Town, Unit 4',
        accessNotes: null,
        // Correcting it does not offer it again.
        deactivatedAt: '2026-09-02T12:30:00.000Z',
      });
    });

    it('refuses a correction submitting no property at all', async () => {
      await seedWarehouses();
      const customer = await seedCustomer();
      const actor = await seedActor([CUSTOMERS_UPDATE]);

      const { status } = await request(
        'PATCH',
        `${addressesPath(customer.id)}/${customer.addressIds[0]}`,
        actor.cookie,
        {},
      );

      expect(status).toBe(400);
    });

    it('marks an address Main idempotently and refuses an Inactive one (AC-05, AC-06b)', async () => {
      await seedWarehouses();
      const customer = await seedCustomer({
        addresses: [
          { isMain: true },
          { isMain: false },
          {
            isMain: false,
            deactivatedAt: new Date('2026-09-02T12:30:00.000Z'),
          },
        ],
      });
      const actor = await seedActor([CUSTOMERS_UPDATE]);

      const moved = await request(
        'PUT',
        `${addressesPath(customer.id)}/${customer.addressIds[1]}/main`,
        actor.cookie,
      );
      const again = await request(
        'PUT',
        `${addressesPath(customer.id)}/${customer.addressIds[1]}/main`,
        actor.cookie,
      );
      const inactive = await request(
        'PUT',
        `${addressesPath(customer.id)}/${customer.addressIds[2]}/main`,
        actor.cookie,
      );

      expect(moved.status).toBe(200);
      expect(customerSchema.parse(moved.body).mainDeliveryAddressId).toBe(
        customer.addressIds[1],
      );
      expect(again.status).toBe(200);
      expect(customerSchema.parse(again.body).mainDeliveryAddressId).toBe(
        customer.addressIds[1],
      );
      expect(inactive.status).toBe(409);
      expect(inactive.body).toMatchObject({
        code: 'customers.invalid_delivery_address',
      });
    });

    // AC-06b — deactivating the Main address makes a remaining active one Main in the same
    // transaction, and the response names which.
    it('deactivates the Main address and names the address that is Main now (AC-06a, AC-06b)', async () => {
      await seedWarehouses();
      const customer = await seedCustomer({
        addresses: [{ isMain: true }, { isMain: false }],
      });
      const itemId = await seedItem();
      const orderId = await seedCustomerOrder(
        itemId,
        customer.id,
        customer.addressIds[0],
      );
      // A frozen `direct_to_customer` line that names the address being deactivated — the other
      // half of AC-06a, unbacked before R3: the frozen line holds captured text and no reachable
      // reference, so deactivating the address it once named cannot touch it.
      const frozenLineId = await seedFrozenDirectLine(
        itemId,
        customer.addressIds[0],
      );
      const actor = await seedActor([CUSTOMERS_UPDATE]);

      const { status, body } = await request(
        'POST',
        `${addressesPath(customer.id)}/${customer.addressIds[0]}/deactivation`,
        actor.cookie,
      );

      expect(status).toBe(200);
      const updated = customerSchema.parse(body);
      expect(updated.deliveryAddresses[0].deactivatedAt).not.toBeNull();
      expect(updated.mainDeliveryAddressId).toBe(customer.addressIds[1]);
      // The order already naming it keeps naming it and keeps counting exactly as before (AC-06a).
      const order = await dataSource.manager
        .getRepository(CustomerOrderEntity)
        .findOneByOrFail({ id: orderId });
      expect(order.customerDeliveryAddressId).toBe(customer.addressIds[0]);
      expect(order.outstandingQuantity).toBe(100);
      // The frozen Purchase Draft Line reads and counts exactly as before: its captured text is
      // unchanged, and its `customerDestination` projection — read live from the frozen columns —
      // still reports the same statement.
      const frozenLine = await dataSource.manager
        .getRepository(PurchaseDraftLineEntity)
        .findOneByOrFail({ id: frozenLineId });
      expect(frozenLine.frozenDeliveryAddressText).toBe(SECRET_ADDRESS_TEXT);
      expect(frozenLine.frozenAccessNotes).toBe(SECRET_ACCESS_NOTES);
      const draft = await readRepository.readIdentifiedDraft(
        frozenLine.purchaseDraftId,
        warehouseId,
        'with_cause',
      );
      const draftLine = draft?.lines.find((line) => line.id === frozenLineId);
      expect(draftLine?.customerDestination).toMatchObject({
        addressText: SECRET_ADDRESS_TEXT,
        accessNotes: SECRET_ACCESS_NOTES,
        frozen: true,
      });
    });

    // AC-07 — the refusal names the rule and holds whether or not the Customer has Unfulfilled
    // orders. The two cases below prove both sides: no order at all, and an Unfulfilled order
    // naming the very address being deactivated. The refusal is identical either way, because
    // `assertDeliveryAddressDeactivatable` decides only over the locked address rows
    // (customer-address-book.service.ts) and never reads `customer_orders`.
    it('refuses to deactivate the only remaining active address (AC-07)', async () => {
      await seedWarehouses();
      const customer = await seedCustomer({
        addresses: [
          { isMain: true },
          {
            isMain: false,
            deactivatedAt: new Date('2026-09-02T12:30:00.000Z'),
          },
        ],
      });
      const actor = await seedActor([CUSTOMERS_UPDATE]);

      const { status, body } = await request(
        'POST',
        `${addressesPath(customer.id)}/${customer.addressIds[0]}/deactivation`,
        actor.cookie,
      );

      expect(status).toBe(409);
      expect(body).toMatchObject({
        code: 'customers.last_active_delivery_address',
      });
    });

    it('refuses identically when the Customer holds an Unfulfilled Customer Order against the address (AC-07)', async () => {
      await seedWarehouses();
      const customer = await seedCustomer({
        addresses: [
          { isMain: true },
          {
            isMain: false,
            deactivatedAt: new Date('2026-09-02T12:30:00.000Z'),
          },
        ],
      });
      const itemId = await seedItem();
      await seedCustomerOrder(itemId, customer.id, customer.addressIds[0]);
      const actor = await seedActor([CUSTOMERS_UPDATE]);

      const { status, body } = await request(
        'POST',
        `${addressesPath(customer.id)}/${customer.addressIds[0]}/deactivation`,
        actor.cookie,
      );

      expect(status).toBe(409);
      expect(body).toMatchObject({
        code: 'customers.last_active_delivery_address',
      });
    });

    it('makes an address active again as an ordinary one, never as a second Main one', async () => {
      await seedWarehouses();
      const customer = await seedCustomer({
        addresses: [
          { isMain: true },
          {
            isMain: false,
            deactivatedAt: new Date('2026-09-02T12:30:00.000Z'),
          },
        ],
      });
      const actor = await seedActor([CUSTOMERS_UPDATE]);

      const { status, body } = await request(
        'DELETE',
        `${addressesPath(customer.id)}/${customer.addressIds[1]}/deactivation`,
        actor.cookie,
      );

      expect(status).toBe(200);
      const updated = customerSchema.parse(body);
      expect(updated.deliveryAddresses[1]).toMatchObject({
        deactivatedAt: null,
        isMain: false,
      });
      expect(updated.mainDeliveryAddressId).toBe(customer.addressIds[0]);
    });

    // AC-12 — an address of another Customer, one of a Customer of another Warehouse and a missing
    // one are **one** outcome.
    it('refuses an address of another Customer exactly as a missing one (AC-12)', async () => {
      await seedWarehouses();
      const customer = await seedCustomer();
      const other = await seedCustomer({
        addresses: [
          {
            addressText: SECRET_ADDRESS_TEXT,
            accessNotes: SECRET_ACCESS_NOTES,
          },
        ],
      });
      const actor = await seedActor([CUSTOMERS_UPDATE]);

      const crossCustomer = await request(
        'PATCH',
        `${addressesPath(customer.id)}/${other.addressIds[0]}`,
        actor.cookie,
        { addressText: 'Test Address 9, Test City' },
      );
      const missing = await request(
        'PATCH',
        `${addressesPath(customer.id)}/${randomUUID()}`,
        actor.cookie,
        { addressText: 'Test Address 9, Test City' },
      );

      expect(crossCustomer.status).toBe(404);
      expect(crossCustomer.body).toMatchObject({
        code: 'customers.target_unavailable',
      });
      expect(crossCustomer).toEqual(missing);
      expect(JSON.stringify(crossCustomer.body)).not.toContain(
        SECRET_ACCESS_NOTES,
      );
    });

    it.each([
      ['POST', '', { addressText: 'Test Address 2, Test Town' }],
      ['PATCH', '/{address}', { addressText: 'Test Address 2, Test Town' }],
      ['PUT', '/{address}/main', undefined],
      ['POST', '/{address}/deactivation', undefined],
      ['DELETE', '/{address}/deactivation', undefined],
    ])(
      'denies %s %s without CUSTOMERS:UPDATE and refuses it on an archived Warehouse (AC-09, AC-23)',
      async (method, suffix, payload) => {
        await seedWarehouses();
        const customer = await seedCustomer({
          addresses: [{ isMain: true }, { isMain: false }],
        });
        const withoutPermission = await seedPermissionlessActor();
        const actor = await seedActor([CUSTOMERS_UPDATE]);
        const path = `${addressesPath(customer.id)}${suffix.replace(
          '{address}',
          customer.addressIds[1],
        )}`;

        const denied = await request(
          method,
          path,
          withoutPermission.cookie,
          payload,
        );
        await setWarehouseArchived(warehouseId, seededAt);
        const archived = await request(method, path, actor.cookie, payload);

        expect(denied.status).toBe(403);
        expect(denied.body).toMatchObject({ code: 'access.denied' });
        expect(archived.status).toBe(409);
        expect(archived.body).toMatchObject({
          code: 'access.warehouse_archived',
        });
      },
    );
  });
});
