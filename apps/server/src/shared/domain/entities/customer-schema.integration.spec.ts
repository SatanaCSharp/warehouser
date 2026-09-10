import { randomUUID } from 'node:crypto';

import dataSource from 'shared/database/data-source.js';
import { AccountEntity } from 'shared/domain/entities/account.entity.js';
import { UserEntity } from 'shared/domain/entities/user.entity.js';
import { WarehouseEntity } from 'shared/domain/entities/warehouse.entity.js';
import { WorkspaceEntity } from 'shared/domain/entities/workspace.entity.js';
import {
  buildWarehouse,
  buildWorkspace,
} from 'test/factories/entity-factories.js';
import { QueryFailedError } from 'typeorm';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

/**
 * The RED for T1 —
 * `docs/features/delivery-addresses/tasks/create-customer-schema-migration.md`.
 *
 * `apps/server/AGENTS.md` forbids tests for migration classes, so — exactly as
 * `ordering-entities.integration.spec.ts` did for the ordering schema — the
 * constraint proofs the task's Definition of Done demands live here, against
 * the two relations `1786700000000-CreateCustomerSchema` creates, and assert
 * only observable database behaviour.
 *
 * The rows are written as raw SQL rather than through persistence entities on
 * purpose: `CustomerEntity` and `CustomerDeliveryAddressEntity` arrive with a
 * later task, and the schema is the only thing under test here.
 *
 * Covers AC-01, AC-03, AC-03a and the "exactly one Main" half of AC-05.
 * The concurrent second Main mark AC-05 also names is not expressible in this
 * tier — PGlite has one backend (`docs/system/server-architecture.md`,
 * "What this tier cannot test") — so the sequential second mark below is the
 * proof that the constraint, not a read-then-write, is the arbiter.
 */
const now = new Date('2026-09-02T09:00:00.000Z');
const later = new Date('2026-09-02T10:00:00.000Z');

interface SeededWarehouse {
  readonly warehouseId: string;
  readonly userId: string;
}

/**
 * `DataSource.query` is `any`-typed, so every call site would otherwise either
 * assert or silently lose its result type. One helper carries the single cast.
 */
const queryRows = async <TRow>(
  sql: string,
  parameters: unknown[] = [],
): Promise<TRow[]> => {
  const rows: unknown = await dataSource.query(sql, parameters);

  return rows as TRow[];
};

const seedWorkspace = async (): Promise<string> => {
  const workspace = buildWorkspace();
  await dataSource.manager.getRepository(WorkspaceEntity).insert(workspace);

  return workspace.id!;
};

/**
 * `accounts.user_id` / `users.account_id` are a deferred circular FK pair, so
 * both inserts must land in one transaction — the pattern every integration
 * spec under `shared/domain/` already uses.
 *
 * Pass `workspaceId` to place this Warehouse beside one already seeded; the
 * AC-03a case needs two Warehouses of *one* Workspace, which is the scenario
 * its Given names.
 */
const seedWarehouseAndMember = async (
  normalizedEmail: string,
  workspaceId?: string,
): Promise<SeededWarehouse> => {
  const owningWorkspaceId = workspaceId ?? (await seedWorkspace());
  const warehouse = buildWarehouse({ workspaceId: owningWorkspaceId });
  await dataSource.manager.getRepository(WarehouseEntity).insert(warehouse);

  const userId = randomUUID();
  await dataSource.transaction(async (manager) => {
    await manager.getRepository(AccountEntity).insert({
      id: userId,
      userId,
      normalizedEmail,
      passwordHash: 'synthetic-hash',
      passwordHashAlgorithm: 'scrypt',
      passwordHashParameters: { cost: 1_024 },
      createdAt: now,
      updatedAt: now,
    });
    await manager.getRepository(UserEntity).insert({
      id: userId,
      accountId: userId,
      workspaceId: owningWorkspaceId,
      createdAt: now,
      updatedAt: now,
    });
  });

  return { warehouseId: warehouse.id!, userId };
};

interface CustomerRow {
  readonly id: string;
  readonly warehouseId: string;
  readonly name: string;
  readonly recordedByUserId: string;
  readonly deactivatedAt: Date | null;
}

const insertCustomer = async (row: CustomerRow): Promise<void> => {
  await dataSource.query(
    `INSERT INTO customers
       (id, warehouse_id, name, deactivated_at, recorded_by_user_id,
        created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $6)`,
    [
      row.id,
      row.warehouseId,
      row.name,
      row.deactivatedAt,
      row.recordedByUserId,
      now,
    ],
  );
};

const buildCustomer = (
  seeded: SeededWarehouse,
  overrides: Partial<CustomerRow> = {},
): CustomerRow => ({
  id: randomUUID(),
  warehouseId: seeded.warehouseId,
  name: 'Acme Manufacturing',
  recordedByUserId: seeded.userId,
  deactivatedAt: null,
  ...overrides,
});

interface AddressRow {
  readonly id: string;
  readonly customerId: string;
  readonly warehouseId: string;
  readonly addressText: string;
  readonly isMain: boolean;
  readonly deactivatedAt: Date | null;
}

const insertAddress = async (row: AddressRow): Promise<void> => {
  await dataSource.query(
    `INSERT INTO customer_delivery_addresses
       (id, customer_id, warehouse_id, address_text, access_notes, is_main,
        deactivated_at, created_at, updated_at)
     VALUES ($1, $2, $3, $4, NULL, $5, $6, $7, $7)`,
    [
      row.id,
      row.customerId,
      row.warehouseId,
      row.addressText,
      row.isMain,
      row.deactivatedAt,
      now,
    ],
  );
};

const buildAddress = (
  customer: CustomerRow,
  overrides: Partial<AddressRow> = {},
): AddressRow => ({
  id: randomUUID(),
  customerId: customer.id,
  warehouseId: customer.warehouseId,
  addressText: '12 Harbour Road, Unit 4',
  isMain: true,
  deactivatedAt: null,
  ...overrides,
});

interface DriverFailure {
  readonly driverError: { readonly code: string };
  readonly message: string;
}

const captureFailure = async (
  attempt: Promise<unknown>,
): Promise<DriverFailure> => {
  const failure: unknown = await attempt.catch((error: unknown) => error);

  expect(failure).toBeInstanceOf(QueryFailedError);

  return failure as QueryFailedError & DriverFailure;
};

const describeCustomerRecord = (): void => {
  describe('AC-01 — a recorded Customer and its Main Delivery Address', () => {
    it('stores the Customer active in its Warehouse with the member and time that recorded it', async () => {
      const seeded = await seedWarehouseAndMember('ac01@example.test');
      const customer = buildCustomer(seeded);

      await insertCustomer(customer);
      await insertAddress(buildAddress(customer));

      const [stored] = await queryRows<Record<string, unknown>>(
        'SELECT * FROM customers WHERE id = $1',
        [customer.id],
      );

      expect(stored).toMatchObject({
        warehouse_id: seeded.warehouseId,
        name: 'Acme Manufacturing',
        deactivated_at: null,
        recorded_by_user_id: seeded.userId,
      });
      // The recording time itself, not merely "a timestamp round-trips":
      // `insertCustomer` seeds `created_at` with `now`, so this is the only
      // form of the assertion that can fail if the column stops carrying it.
      expect(stored.created_at).toEqual(now);
    });

    it('stores that single address as the Customer’s Main one', async () => {
      const seeded = await seedWarehouseAndMember('ac01-main@example.test');
      const customer = buildCustomer(seeded);
      const address = buildAddress(customer);

      await insertCustomer(customer);
      await insertAddress(address);

      const [stored] = await queryRows<Record<string, unknown>>(
        'SELECT * FROM customer_delivery_addresses WHERE id = $1',
        [address.id],
      );

      expect(stored).toMatchObject({
        customer_id: customer.id,
        warehouse_id: seeded.warehouseId,
        address_text: '12 Harbour Road, Unit 4',
        is_main: true,
        deactivated_at: null,
      });
    });
  });
};

const describeNameUniqueness = (): void => {
  describe('AC-03 / AC-03a — a customer name identifies at most one Customer within a Warehouse', () => {
    it('refuses a second Customer with that name while the holder is active', async () => {
      const seeded = await seedWarehouseAndMember('ac03-active@example.test');
      await insertCustomer(buildCustomer(seeded, { name: 'Northwind Foods' }));

      const failure = await captureFailure(
        insertCustomer(buildCustomer(seeded, { name: 'Northwind Foods' })),
      );

      expect(failure.driverError.code).toEqual('23505');
      expect(failure.message).toContain('uq_customers_warehouse_name');
    });

    it('refuses it just the same once the holder is Inactive (the name stays taken)', async () => {
      const seeded = await seedWarehouseAndMember('ac03-inactive@example.test');
      await insertCustomer(
        buildCustomer(seeded, {
          name: 'Northwind Foods',
          deactivatedAt: later,
        }),
      );

      const failure = await captureFailure(
        insertCustomer(buildCustomer(seeded, { name: 'Northwind Foods' })),
      );

      expect(failure.driverError.code).toEqual('23505');
      expect(failure.message).toContain('uq_customers_warehouse_name');
    });

    it('accepts that same name in a sibling Warehouse of one Workspace as an unrelated Customer', async () => {
      // AC-03a's Given is "two Warehouses of one Workspace", so both are
      // seeded into the same Workspace rather than into two.
      const workspaceId = await seedWorkspace();
      const first = await seedWarehouseAndMember(
        'ac03a-first@example.test',
        workspaceId,
      );
      const second = await seedWarehouseAndMember(
        'ac03a-second@example.test',
        workspaceId,
      );
      const inFirst = buildCustomer(first, { name: 'Northwind Foods' });
      const inSecond = buildCustomer(second, { name: 'Northwind Foods' });

      await insertCustomer(inFirst);
      await insertCustomer(inSecond);

      const stored = await queryRows<{ id: string; warehouse_id: string }>(
        'SELECT id, warehouse_id FROM customers WHERE name = $1 ORDER BY id',
        ['Northwind Foods'],
      );

      expect(stored).toHaveLength(2);
      expect(new Set(stored.map((row) => row.warehouse_id))).toEqual(
        new Set([first.warehouseId, second.warehouseId]),
      );
    });
  });
};

const describeSingleMainAddress = (): void => {
  describe('AC-05 — at most one Main Delivery Address among a Customer’s active addresses', () => {
    // `chk_customer_delivery_addresses_main_is_active` is what lets the partial
    // index use a bare `WHERE is_main` predicate and still mean "one Main among
    // ACTIVE addresses": an Inactive row can never carry the flag, so the index
    // needs no `deactivated_at` clause of its own. Both halves are proved here.
    it('refuses a second address marked Main for the same Customer', async () => {
      const seeded = await seedWarehouseAndMember('ac05-second@example.test');
      const customer = buildCustomer(seeded);
      await insertCustomer(customer);
      await insertAddress(buildAddress(customer));

      const failure = await captureFailure(
        insertAddress(buildAddress(customer, { addressText: '9 Depot Lane' })),
      );

      expect(failure.driverError.code).toEqual('23505');
      expect(failure.message).toContain(
        'uq_customer_delivery_addresses_customer_main',
      );
    });

    it('accepts any number of further addresses that are not Main', async () => {
      const seeded = await seedWarehouseAndMember('ac05-others@example.test');
      const customer = buildCustomer(seeded);
      await insertCustomer(customer);

      await insertAddress(buildAddress(customer));
      await insertAddress(
        buildAddress(customer, {
          addressText: '9 Depot Lane',
          isMain: false,
        }),
      );
      await insertAddress(
        buildAddress(customer, {
          addressText: '77 Quarry Street',
          isMain: false,
        }),
      );

      const stored = await queryRows<{ count: string }>(
        `SELECT count(*) FROM customer_delivery_addresses
         WHERE customer_id = $1 AND is_main`,
        [customer.id],
      );

      expect(stored).toEqual([{ count: '1' }]);
    });

    it('refuses an Inactive address that carries the Main mark', async () => {
      const seeded = await seedWarehouseAndMember('ac05-inactive@example.test');
      const customer = buildCustomer(seeded);
      await insertCustomer(customer);

      const failure = await captureFailure(
        insertAddress(
          buildAddress(customer, {
            addressText: '31 Old Wharf',
            deactivatedAt: later,
          }),
        ),
      );

      expect(failure.driverError.code).toEqual('23514');
      expect(failure.message).toContain(
        'chk_customer_delivery_addresses_main_is_active',
      );
    });

    it('accepts a Main address for a second Customer of the same Warehouse', async () => {
      const seeded = await seedWarehouseAndMember('ac05-peer@example.test');
      const first = buildCustomer(seeded, { name: 'Acme Manufacturing' });
      const second = buildCustomer(seeded, { name: 'Northwind Foods' });
      await insertCustomer(first);
      await insertCustomer(second);

      await insertAddress(buildAddress(first));
      await insertAddress(buildAddress(second));

      const stored = await queryRows<{ count: string }>(
        'SELECT count(*) FROM customer_delivery_addresses WHERE is_main',
      );

      expect(stored).toEqual([{ count: '2' }]);
    });
  });
};

describe('customers and customer_delivery_addresses', () => {
  beforeAll(async () => {
    await dataSource.initialize();
  });

  afterEach(async () => {
    await dataSource.query(
      'TRUNCATE customer_delivery_addresses, customers, warehouses, sessions, users, accounts, workspaces CASCADE',
    );
  });

  afterAll(async () => {
    await dataSource.destroy();
  });

  describeCustomerRecord();
  describeNameUniqueness();
  describeSingleMainAddress();
});
