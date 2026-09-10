import { randomUUID } from 'node:crypto';

import dataSource from 'shared/database/data-source';
import { DbTransactionService } from 'shared/database/db-transaction.service';
import { DbTransactionContext } from 'shared/database/db-transaction-context.service';
import { AccountEntity } from 'shared/domain/entities/account.entity';
import { CustomerEntity } from 'shared/domain/entities/customer.entity';
import { CustomerDeliveryAddressEntity } from 'shared/domain/entities/customer-delivery-address.entity';
import { UserEntity } from 'shared/domain/entities/user.entity';
import { WarehouseEntity } from 'shared/domain/entities/warehouse.entity';
import { WorkspaceEntity } from 'shared/domain/entities/workspace.entity';
// `CustomerDirectoryRepository` does not exist yet (T7) — this is the RED for the Customer-row
// half of `data-model.md` § "Repository boundaries": "answers name availability **and** returns the
// Customer list with each Customer's active-address count in one read, rather than exposing a
// table-shaped read per relation that every caller must combine".
import { CustomerDirectoryRepository } from 'shared/domain/repositories/customer-directory.repository';
import {
  buildWarehouse,
  buildWorkspace,
} from 'test/factories/entity-factories';
import { PostgresQueryRunner } from 'typeorm/driver/postgres/PostgresQueryRunner';
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

const now = new Date('2026-09-03T09:00:00.000Z');
const later = new Date('2026-09-03T12:00:00.000Z');

// The shape this RED step expects the implementer to expose. Cast through it because the module
// does not exist yet; persistence entities and persistence-oriented values only (`sad.md` §5).
interface CustomerDirectoryEntry {
  readonly customer: CustomerEntity;
  readonly mainDeliveryAddressId: string | null;
  readonly activeDeliveryAddressCount: number;
}

interface CustomerDirectoryRepositoryContract {
  findCustomerByName(
    warehouseId: string,
    name: string,
  ): Promise<CustomerEntity | null>;
  findCustomer(
    customerId: string,
    warehouseId: string,
  ): Promise<CustomerEntity | null>;
  listCustomers(
    warehouseId: string,
    filter?: { activeOnly?: boolean },
  ): Promise<CustomerDirectoryEntry[]>;
  recordCustomer(input: {
    customer: CustomerEntity;
    mainDeliveryAddress: CustomerDeliveryAddressEntity;
  }): Promise<CustomerEntity>;
  correctCustomerName(
    customerId: string,
    warehouseId: string,
    name: string,
    correctedAt: Date,
  ): Promise<'applied' | 'customer-unavailable'>;
  setCustomerDeactivation(
    customerId: string,
    warehouseId: string,
    deactivatedAt: Date | null,
    updatedAt: Date,
  ): Promise<'applied' | 'customer-unavailable'>;
}

const repository = new CustomerDirectoryRepository(
  dataSource,
) as unknown as CustomerDirectoryRepositoryContract;

const context = new DbTransactionContext(dataSource);
const transactions = new DbTransactionService(dataSource, context);

interface Seeded {
  readonly warehouseId: string;
  readonly userId: string;
}

// `accounts.user_id` / `users.account_id` are a deferred circular FK pair, so both inserts land in
// one transaction — the pattern every integration spec under this directory already uses.
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

const seed = async (): Promise<Seeded> => {
  const workspace = buildWorkspace();
  await dataSource.manager.getRepository(WorkspaceEntity).insert(workspace);
  const warehouse = buildWarehouse({ workspaceId: workspace.id! });
  await dataSource.manager.getRepository(WarehouseEntity).insert(warehouse);
  const userId = await seedUser(workspace.id!);

  return { warehouseId: warehouse.id!, userId };
};

const seedCustomer = async (
  seeded: Seeded,
  overrides: Partial<CustomerEntity> = {},
): Promise<string> => {
  const id = overrides.id ?? randomUUID();
  await dataSource.manager.getRepository(CustomerEntity).insert({
    id,
    warehouseId: seeded.warehouseId,
    name: `Acme Ltd ${id}`,
    deactivatedAt: null,
    recordedByUserId: seeded.userId,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  });
  return id;
};

const seedAddress = async (
  seeded: Seeded,
  customerId: string,
  overrides: Partial<CustomerDeliveryAddressEntity> = {},
): Promise<string> => {
  const id = overrides.id ?? randomUUID();
  await dataSource.manager.getRepository(CustomerDeliveryAddressEntity).insert({
    id,
    customerId,
    warehouseId: seeded.warehouseId,
    addressText: '1 Depot Road, Springfield',
    accessNotes: null,
    isMain: false,
    deactivatedAt: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  });
  return id;
};

const readCustomer = (id: string): Promise<CustomerEntity | null> =>
  dataSource.manager.getRepository(CustomerEntity).findOneBy({ id });

// Counts PostgreSQL round trips, excluding the transaction's own control statements by name rather
// than by a count, so the assertion does not drift if the transaction service changes how it opens
// one. This is the executable form of "in one read" (data-model.md § "Repository boundaries").
const countRoundTrips = async <T>(
  operation: () => Promise<T>,
): Promise<{ result: T; queryCount: number }> => {
  const spy = vi.spyOn(PostgresQueryRunner.prototype, 'query');
  const before = spy.mock.calls.length;
  const result = await operation();
  const queryCount = spy.mock.calls
    .slice(before)
    .map((call) => String(call[0]))
    .filter(
      (sql) =>
        !/^(?:START TRANSACTION|SET TRANSACTION|COMMIT|ROLLBACK|BEGIN)/u.test(
          sql,
        ),
    ).length;
  spy.mockRestore();
  return { result, queryCount };
};

// eslint-disable-next-line max-lines-per-function -- one suite covering one repository's whole persistence surface is inherently long, matching the other repository integration specs in this directory
describe('CustomerDirectoryRepository', () => {
  beforeAll(async () => {
    await dataSource.initialize();
  });

  afterEach(async () => {
    await dataSource.query(
      'TRUNCATE arrival_allocations, purchase_draft_demand_snapshots, purchase_draft_line_links, purchase_draft_lines, purchase_drafts, item_stock_adjustments, customer_orders, customer_delivery_addresses, customers, items, warehouse_memberships, roles, warehouses, sessions, users, accounts, workspaces CASCADE',
    );
  });

  afterAll(async () => {
    await dataSource.destroy();
  });

  describe('name availability', () => {
    // AC-03 — "a customer name identifies at most one Customer within a Warehouse, whether that
    // Customer is active or Inactive", and the refusal names the holder, so the row itself comes
    // back rather than a boolean.
    it('resolves the holder of a name whether it is active or Inactive', async () => {
      const seeded = await seed();
      const active = await seedCustomer(seeded, { name: 'Acme Ltd' });
      const inactive = await seedCustomer(seeded, {
        name: 'Beta Works',
        deactivatedAt: later,
      });

      expect(
        await repository.findCustomerByName(seeded.warehouseId, 'Acme Ltd'),
      ).toMatchObject({ id: active, name: 'Acme Ltd' });
      expect(
        await repository.findCustomerByName(seeded.warehouseId, 'Beta Works'),
      ).toMatchObject({ id: inactive, deactivatedAt: later });
    });

    // AC-03a — the same name in another Warehouse is not a conflict and is never consulted, so a
    // lookup in the second Warehouse resolves to nothing.
    it('never sees a name held in another Warehouse', async () => {
      const first = await seed();
      const second = await seed();
      await seedCustomer(first, { name: 'Acme Ltd' });

      expect(
        await repository.findCustomerByName(second.warehouseId, 'Acme Ltd'),
      ).toBeNull();
    });

    // `spec.md` §8 (seventh question) — case-sensitive and non-normalising, following the
    // `items.sku` precedent: "Acme Ltd" and "ACME LTD" are two Customers.
    it('compares the name case-sensitively', async () => {
      const seeded = await seed();
      await seedCustomer(seeded, { name: 'Acme Ltd' });

      expect(
        await repository.findCustomerByName(seeded.warehouseId, 'ACME LTD'),
      ).toBeNull();
    });
  });

  describe('listCustomers', () => {
    // data-model.md § "Repository boundaries" — the list and each Customer's active-address count
    // come back together. An implementation that listed the Customers and then counted addresses
    // per Customer would return the same figures and fail this, because it would take N+1 round
    // trips instead of one.
    it('returns the Customer list with its active-address counts in one read', async () => {
      const seeded = await seed();
      const north = await seedCustomer(seeded, { name: 'Acme North' });
      const south = await seedCustomer(seeded, { name: 'Acme South' });
      const mainAddressId = await seedAddress(seeded, north, { isMain: true });
      await seedAddress(seeded, north);
      await seedAddress(seeded, north, { deactivatedAt: later });
      await seedAddress(seeded, south);

      const { result, queryCount } = await countRoundTrips(() =>
        repository.listCustomers(seeded.warehouseId),
      );

      expect(queryCount).toBe(1);
      expect(result).toEqual([
        {
          customer: expect.objectContaining({ id: north, name: 'Acme North' }),
          mainDeliveryAddressId: mainAddressId,
          activeDeliveryAddressCount: 2,
        },
        {
          customer: expect.objectContaining({ id: south, name: 'Acme South' }),
          mainDeliveryAddressId: null,
          activeDeliveryAddressCount: 1,
        },
      ]);
    });

    // openapi.yaml `listCustomers` 200 — "ordered by name", which `uq_customers_warehouse_name`
    // already returns (data-model.md § Indexes).
    it('orders the Customers by name', async () => {
      const seeded = await seed();
      await seedCustomer(seeded, { name: 'Zeta Freight' });
      await seedCustomer(seeded, { name: 'Acme Ltd' });
      await seedCustomer(seeded, { name: 'Mercury Haulage' });

      const listed = await repository.listCustomers(seeded.warehouseId);

      expect(listed.map((entry) => entry.customer.name)).toEqual([
        'Acme Ltd',
        'Mercury Haulage',
        'Zeta Freight',
      ]);
    });

    // openapi.yaml `listCustomers?active=true` — the picker read used while recording demand
    // (AC-06). Without it, active and Inactive Customers come back alike.
    it('narrows to the selectable Customers when only active ones are asked for', async () => {
      const seeded = await seed();
      const active = await seedCustomer(seeded, { name: 'Acme Ltd' });
      await seedCustomer(seeded, { name: 'Beta Works', deactivatedAt: later });

      const everyCustomer = await repository.listCustomers(seeded.warehouseId);
      const selectable = await repository.listCustomers(seeded.warehouseId, {
        activeOnly: true,
      });

      expect(everyCustomer).toHaveLength(2);
      expect(selectable.map((entry) => entry.customer.id)).toEqual([active]);
    });

    // AC-09 / `spec.md` §6.1 "Customer disclosure through a count" — the read never leaves the
    // acting Warehouse, so another Warehouse's Customers contribute neither a row nor a count.
    it('never leaves the acting Warehouse', async () => {
      const first = await seed();
      const second = await seed();
      await seedCustomer(first, { name: 'Acme Ltd' });

      expect(await repository.listCustomers(second.warehouseId)).toEqual([]);
    });
  });

  describe('recordCustomer', () => {
    // AC-01 — one transaction writes the Customer as active and its first Delivery Address as
    // active and Main, together with the member who recorded it and when.
    it('writes the Customer and its first Main Delivery Address together', async () => {
      const seeded = await seed();
      const customerId = randomUUID();
      const addressId = randomUUID();

      const recorded = await transactions.executeInTransaction({}, () =>
        repository.recordCustomer({
          customer: {
            id: customerId,
            warehouseId: seeded.warehouseId,
            name: 'Acme Ltd',
            deactivatedAt: null,
            recordedByUserId: seeded.userId,
            createdAt: now,
            updatedAt: now,
          },
          mainDeliveryAddress: {
            id: addressId,
            customerId,
            warehouseId: seeded.warehouseId,
            addressText: '1 Depot Road, Springfield',
            accessNotes: 'Gate code on the intercom',
            isMain: true,
            deactivatedAt: null,
            createdAt: now,
            updatedAt: now,
          },
        }),
      );

      expect(recorded).toMatchObject({
        id: customerId,
        name: 'Acme Ltd',
        deactivatedAt: null,
        recordedByUserId: seeded.userId,
      });
      expect(await readCustomer(customerId)).toMatchObject({ id: customerId });
      expect(
        await dataSource.manager
          .getRepository(CustomerDeliveryAddressEntity)
          .findOneBy({ id: addressId }),
      ).toMatchObject({ customerId, isMain: true, deactivatedAt: null });
    });

    // `sad.md` §6.2 step 4 — "the per-Warehouse uniqueness constraint on the customer name is the
    // final arbiter under concurrency". The repository catches nothing: the violation propagates to
    // the universal error boundary, where the command names it (creating-a-server-repository.md
    // § "Transactions and errors").
    it('lets the per-Warehouse name constraint refuse a duplicate', async () => {
      const seeded = await seed();
      await seedCustomer(seeded, { name: 'Acme Ltd' });
      const customerId = randomUUID();

      await expect(
        transactions.executeInTransaction({}, () =>
          repository.recordCustomer({
            customer: {
              id: customerId,
              warehouseId: seeded.warehouseId,
              name: 'Acme Ltd',
              deactivatedAt: null,
              recordedByUserId: seeded.userId,
              createdAt: now,
              updatedAt: now,
            },
            mainDeliveryAddress: {
              id: randomUUID(),
              customerId,
              warehouseId: seeded.warehouseId,
              addressText: '1 Depot Road, Springfield',
              accessNotes: null,
              isMain: true,
              deactivatedAt: null,
              createdAt: now,
              updatedAt: now,
            },
          }),
        ),
      ).rejects.toThrow(/uq_customers_warehouse_name/u);
    });
  });

  describe('findCustomer', () => {
    // AC-09 / T8 — "a Customer of another Warehouse is refused **identically** to one that does not
    // exist", so the scope is in the query and never in the caller.
    it('resolves nothing for a Customer of another Warehouse', async () => {
      const first = await seed();
      const second = await seed();
      const customerId = await seedCustomer(first, { name: 'Acme Ltd' });

      expect(
        await repository.findCustomer(customerId, first.warehouseId),
      ).toMatchObject({ id: customerId });
      expect(
        await repository.findCustomer(customerId, second.warehouseId),
      ).toBeNull();
      expect(
        await repository.findCustomer(randomUUID(), first.warehouseId),
      ).toBeNull();
    });
  });

  describe('correctCustomerName', () => {
    // AC-03b — the correction rewrites the customer row alone; every Customer Order and every
    // frozen line names the identifier and is untouched.
    it('records the correction against a Customer of the acting Warehouse', async () => {
      const seeded = await seed();
      const customerId = await seedCustomer(seeded, { name: 'Acme Ltd' });

      const outcome = await transactions.executeInTransaction({}, () =>
        repository.correctCustomerName(
          customerId,
          seeded.warehouseId,
          'Acme Ltd (Holdings)',
          later,
        ),
      );

      expect(outcome).toBe('applied');
      expect(await readCustomer(customerId)).toMatchObject({
        name: 'Acme Ltd (Holdings)',
        updatedAt: later,
      });
    });

    // data-model.md § "Concurrency, locks and transactions" — "zero affected rows is a typed
    // concurrency refusal, never a silent no-op". A Customer of another Warehouse affects none.
    it('refuses rather than silently succeeding when it affects no row', async () => {
      const first = await seed();
      const second = await seed();
      const customerId = await seedCustomer(first, { name: 'Acme Ltd' });

      const outcome = await transactions.executeInTransaction({}, () =>
        repository.correctCustomerName(
          customerId,
          second.warehouseId,
          'Acme Ltd (Holdings)',
          later,
        ),
      );

      expect(outcome).toBe('customer-unavailable');
      expect(await readCustomer(customerId)).toMatchObject({
        name: 'Acme Ltd',
        updatedAt: now,
      });
    });
  });

  describe('setCustomerDeactivation', () => {
    // AC-06 — deactivation leaves every Delivery Address in the state it was already in and keeps
    // the name taken, and reactivation is the same operation inverted.
    it('deactivates and reactivates without touching the addresses or the name', async () => {
      const seeded = await seed();
      const customerId = await seedCustomer(seeded, { name: 'Acme Ltd' });
      const addressId = await seedAddress(seeded, customerId, { isMain: true });

      const deactivated = await transactions.executeInTransaction({}, () =>
        repository.setCustomerDeactivation(
          customerId,
          seeded.warehouseId,
          later,
          later,
        ),
      );

      expect(deactivated).toBe('applied');
      expect(await readCustomer(customerId)).toMatchObject({
        name: 'Acme Ltd',
        deactivatedAt: later,
      });
      expect(
        await dataSource.manager
          .getRepository(CustomerDeliveryAddressEntity)
          .findOneBy({ id: addressId }),
      ).toMatchObject({ isMain: true, deactivatedAt: null });

      const reactivated = await transactions.executeInTransaction({}, () =>
        repository.setCustomerDeactivation(
          customerId,
          seeded.warehouseId,
          null,
          later,
        ),
      );

      expect(reactivated).toBe('applied');
      expect(await readCustomer(customerId)).toMatchObject({
        deactivatedAt: null,
      });
    });

    // The conditional update is guarded on the prior activation state, so deactivating an already
    // Inactive Customer affects no row and is reported as a refusal rather than as success.
    it('refuses a transition the Customer is already in', async () => {
      const seeded = await seed();
      const customerId = await seedCustomer(seeded, {
        name: 'Acme Ltd',
        deactivatedAt: later,
      });

      const outcome = await transactions.executeInTransaction({}, () =>
        repository.setCustomerDeactivation(
          customerId,
          seeded.warehouseId,
          later,
          later,
        ),
      );

      expect(outcome).toBe('customer-unavailable');
    });
  });
});
