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
// `CustomerAddressBookRepository` does not exist yet (T7) — this is the RED for `data-model.md`
// § "Repository boundaries": it "owns the address set, the Main-address transition and the
// last-active-address condition **under lock** as one operation — the whole point being that the
// condition and the write cannot be separated by another transaction".
import { CustomerAddressBookRepository } from 'shared/domain/repositories/customer-address-book.repository';
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

type DeliveryAddressWriteOutcome = 'applied' | 'delivery-address-unavailable';

// The shape this RED step expects the implementer to expose. Persistence entities and
// persistence-oriented values only (`sad.md` §5): the last-active-address *decision* is a
// `customers` domain predicate (T6) evaluated over the rows this repository returns locked.
interface CustomerAddressBookRepositoryContract {
  listDeliveryAddresses(
    customerId: string,
  ): Promise<CustomerDeliveryAddressEntity[]>;
  lockDeliveryAddresses(
    customerId: string,
  ): Promise<CustomerDeliveryAddressEntity[]>;
  addDeliveryAddress(
    address: CustomerDeliveryAddressEntity,
  ): Promise<CustomerDeliveryAddressEntity>;
  reviseDeliveryAddress(
    deliveryAddressId: string,
    customerId: string,
    changes: {
      addressText: string;
      accessNotes: string | null;
      revisedAt: Date;
    },
  ): Promise<DeliveryAddressWriteOutcome>;
  setMainDeliveryAddress(
    deliveryAddressId: string,
    customerId: string,
    changedAt: Date,
  ): Promise<DeliveryAddressWriteOutcome>;
  deactivateDeliveryAddress(
    deliveryAddressId: string,
    customerId: string,
    deactivatedAt: Date,
  ): Promise<DeliveryAddressWriteOutcome>;
  reactivateDeliveryAddress(
    deliveryAddressId: string,
    customerId: string,
    reactivatedAt: Date,
  ): Promise<DeliveryAddressWriteOutcome>;
}

const repository = new CustomerAddressBookRepository(
  dataSource,
) as unknown as CustomerAddressBookRepositoryContract;

const context = new DbTransactionContext(dataSource);
const transactions = new DbTransactionService(dataSource, context);

interface Seeded {
  readonly warehouseId: string;
  readonly userId: string;
  readonly customerId: string;
}

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

  const customerId = randomUUID();
  await dataSource.manager.getRepository(CustomerEntity).insert({
    id: customerId,
    warehouseId: warehouse.id!,
    name: `Acme Ltd ${customerId}`,
    deactivatedAt: null,
    recordedByUserId: userId,
    createdAt: now,
    updatedAt: now,
  });

  return { warehouseId: warehouse.id!, userId, customerId };
};

const buildAddress = (
  seeded: Seeded,
  overrides: Partial<CustomerDeliveryAddressEntity> = {},
): CustomerDeliveryAddressEntity => ({
  id: randomUUID(),
  customerId: seeded.customerId,
  warehouseId: seeded.warehouseId,
  addressText: '1 Depot Road, Springfield',
  accessNotes: null,
  isMain: false,
  deactivatedAt: null,
  createdAt: now,
  updatedAt: now,
  ...overrides,
});

const seedAddress = async (
  seeded: Seeded,
  overrides: Partial<CustomerDeliveryAddressEntity> = {},
): Promise<string> => {
  const address = buildAddress(seeded, overrides);
  await dataSource.manager
    .getRepository(CustomerDeliveryAddressEntity)
    .insert(address);
  return address.id;
};

// The locking read always runs inside a transaction, because `FOR UPDATE` outside one releases the
// lock at the end of the statement that took it. Hoisted so the tests below do not nest a callback
// inside a callback inside a callback to say so.
const lockInTransaction = (
  customerId: string,
): Promise<CustomerDeliveryAddressEntity[]> =>
  transactions.executeInTransaction({}, () =>
    repository.lockDeliveryAddresses(customerId),
  );

const readAddress = (
  id: string,
): Promise<CustomerDeliveryAddressEntity | null> =>
  dataSource.manager
    .getRepository(CustomerDeliveryAddressEntity)
    .findOneBy({ id });

// Captures the SQL PostgreSQL was actually asked to run. PGlite has a single backend, so a genuine
// two-connection race either self-deadlocks or lets both writers win (vitest.pglite.config.ts,
// data-model.md § "Concurrency, locks and transactions": "PGlite cannot prove any of this … the
// lock order and the conditional-update races are asserted by *shape*"). The shape is therefore
// what this spec asserts.
const captureStatements = async <T>(
  operation: () => Promise<T>,
): Promise<{ result: T; statements: string[] }> => {
  const spy = vi.spyOn(PostgresQueryRunner.prototype, 'query');
  const before = spy.mock.calls.length;
  const result = await operation();
  const statements = spy.mock.calls
    .slice(before)
    .map((call) => String(call[0]))
    .filter(
      (sql) =>
        !/^(?:START TRANSACTION|SET TRANSACTION|COMMIT|ROLLBACK|BEGIN)/u.test(
          sql,
        ),
    );
  spy.mockRestore();
  return { result, statements };
};

// eslint-disable-next-line max-lines-per-function -- one suite covering one repository's whole persistence surface is inherently long, matching the other repository integration specs in this directory
describe('CustomerAddressBookRepository', () => {
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

  describe('listDeliveryAddresses', () => {
    // openapi.yaml `Customer.deliveryAddresses` — "Every Delivery Address of this Customer, active
    // and Inactive alike, ordered by creation time", because an Inactive one keeps reading exactly
    // as before wherever a record already names it (AC-06a).
    it('returns the whole address set, active and Inactive alike, in creation order', async () => {
      const seeded = await seed();
      const second = await seedAddress(seeded, {
        createdAt: new Date('2026-09-03T10:00:00.000Z'),
      });
      const first = await seedAddress(seeded, {
        createdAt: new Date('2026-09-03T08:00:00.000Z'),
        isMain: true,
      });
      const third = await seedAddress(seeded, {
        createdAt: new Date('2026-09-03T11:00:00.000Z'),
        deactivatedAt: later,
      });

      const addresses = await repository.listDeliveryAddresses(
        seeded.customerId,
      );

      expect(addresses.map((address) => address.id)).toEqual([
        first,
        second,
        third,
      ]);
    });

    // An address has no life apart from the Customer that owns it, so the read is scoped to one
    // Customer and never spills another Customer's addresses into it.
    it('never returns another Customer’s addresses', async () => {
      const seeded = await seed();
      const other = await seed();
      await seedAddress(seeded);

      expect(await repository.listDeliveryAddresses(other.customerId)).toEqual(
        [],
      );
    });
  });

  describe('lockDeliveryAddresses', () => {
    // `sad.md` §6.3 step 4 — "the read is `FOR UPDATE` over the Customer's address rows so two
    // concurrent deactivations cannot both see two remaining". PGlite cannot run that race, so the
    // proof is the statement shape: without `FOR UPDATE` the condition and the write are separable
    // by another transaction, which is the whole reason this method exists.
    it('takes the row lock the last-active-address condition is decided under', async () => {
      const seeded = await seed();
      await seedAddress(seeded, { isMain: true });
      await seedAddress(seeded);

      const { result, statements } = await captureStatements(() =>
        lockInTransaction(seeded.customerId),
      );

      expect(result).toHaveLength(2);
      expect(statements).toHaveLength(1);
      expect(statements[0]).toMatch(/FOR UPDATE/u);
    });

    // data-model.md § "Concurrency, locks and transactions" — "a Customer's address rows are locked
    // in ascending identifier order", which is what keeps two transactions from taking the same two
    // rows in opposite orders and deadlocking.
    it('locks the address rows in ascending identifier order', async () => {
      const seeded = await seed();
      const ids = [randomUUID(), randomUUID(), randomUUID()];
      for (const id of ids) {
        await seedAddress(seeded, { id });
      }

      const locked = await lockInTransaction(seeded.customerId);

      expect(locked.map((address) => address.id)).toEqual([...ids].sort());
    });

    // The condition is "at least one **active** address remains", so the locked set has to carry
    // the Inactive rows too — a caller counting the returned rows would otherwise decide AC-07
    // against the wrong number.
    it('locks the Inactive addresses as well as the active ones', async () => {
      const seeded = await seed();
      await seedAddress(seeded, { isMain: true });
      await seedAddress(seeded, { deactivatedAt: later });

      const locked = await lockInTransaction(seeded.customerId);

      expect(
        locked.filter((address) => address.deactivatedAt === null),
      ).toHaveLength(1);
      expect(locked).toHaveLength(2);
    });
  });

  describe('addDeliveryAddress', () => {
    // AC-04 — the second address is recorded against the Customer with its access notes.
    it('records an address with its access notes', async () => {
      const seeded = await seed();
      const address = buildAddress(seeded, {
        addressText: '9 Quay Street, Springfield',
        accessNotes: 'Gate code on the intercom; deliveries 09:00-17:00',
      });

      const added = await transactions.executeInTransaction({}, () =>
        repository.addDeliveryAddress(address),
      );

      expect(added).toMatchObject({ id: address.id, isMain: false });
      expect(await readAddress(address.id)).toMatchObject({
        addressText: '9 Quay Street, Springfield',
        accessNotes: 'Gate code on the intercom; deliveries 09:00-17:00',
        deactivatedAt: null,
      });
    });
  });

  describe('setMainDeliveryAddress', () => {
    // AC-04, AC-05 — "the system … makes the second one Main and the first one no longer".
    // `uq_customer_delivery_addresses_customer_main` admits one Main per Customer, so clearing the
    // previous flag and setting the new one are one operation and not two a caller must sequence.
    it('moves the Main flag off the previous address in one operation', async () => {
      const seeded = await seed();
      const previous = await seedAddress(seeded, { isMain: true });
      const next = await seedAddress(seeded);

      const outcome = await transactions.executeInTransaction({}, () =>
        repository.setMainDeliveryAddress(next, seeded.customerId, later),
      );

      expect(outcome).toBe('applied');
      expect(await readAddress(previous)).toMatchObject({ isMain: false });
      expect(await readAddress(next)).toMatchObject({
        isMain: true,
        updatedAt: later,
      });
    });

    // `chk_customer_delivery_addresses_main_is_active` — an Inactive address is never the Main one,
    // so the transition is conditional on the address still being active and reports the refusal
    // rather than raising the check violation.
    it('refuses to make an Inactive address Main', async () => {
      const seeded = await seed();
      const main = await seedAddress(seeded, { isMain: true });
      const inactive = await seedAddress(seeded, { deactivatedAt: later });

      const outcome = await transactions.executeInTransaction({}, () =>
        repository.setMainDeliveryAddress(inactive, seeded.customerId, later),
      );

      expect(outcome).toBe('delivery-address-unavailable');
      expect(await readAddress(inactive)).toMatchObject({ isMain: false });
      expect(await readAddress(main)).toMatchObject({ isMain: true });
    });

    // data-model.md § "Concurrency, locks and transactions" — "zero affected rows is a typed
    // concurrency refusal, never a silent no-op". An address of another Customer affects none, and
    // the previous Main flag must survive that refusal untouched.
    it('refuses an address of another Customer without disturbing the Main flag', async () => {
      const seeded = await seed();
      const other = await seed();
      const main = await seedAddress(seeded, { isMain: true });
      const foreign = await seedAddress(other);

      const outcome = await transactions.executeInTransaction({}, () =>
        repository.setMainDeliveryAddress(foreign, seeded.customerId, later),
      );

      expect(outcome).toBe('delivery-address-unavailable');
      expect(await readAddress(main)).toMatchObject({ isMain: true });
      expect(await readAddress(foreign)).toMatchObject({ isMain: false });
    });
  });

  describe('reviseDeliveryAddress', () => {
    // openapi.yaml `correctCustomerDeliveryAddress` — the text and the notes are corrected in place,
    // which is the point of holding the address by reference (`sad.md` §4).
    it('corrects the address text and its access notes in place', async () => {
      const seeded = await seed();
      const addressId = await seedAddress(seeded, {
        accessNotes: 'Old gate code',
      });

      const outcome = await transactions.executeInTransaction({}, () =>
        repository.reviseDeliveryAddress(addressId, seeded.customerId, {
          addressText: '9 Quay Street, Springfield',
          accessNotes: null,
          revisedAt: later,
        }),
      );

      expect(outcome).toBe('applied');
      expect(await readAddress(addressId)).toMatchObject({
        addressText: '9 Quay Street, Springfield',
        accessNotes: null,
        updatedAt: later,
      });
    });

    it('refuses an address of another Customer', async () => {
      const seeded = await seed();
      const other = await seed();
      const foreign = await seedAddress(other);

      const outcome = await transactions.executeInTransaction({}, () =>
        repository.reviseDeliveryAddress(foreign, seeded.customerId, {
          addressText: '9 Quay Street, Springfield',
          accessNotes: null,
          revisedAt: later,
        }),
      );

      expect(outcome).toBe('delivery-address-unavailable');
      expect(await readAddress(foreign)).toMatchObject({
        addressText: '1 Depot Road, Springfield',
      });
    });
  });

  describe('deactivateDeliveryAddress', () => {
    // AC-06a plus `chk_customer_delivery_addresses_main_is_active` — deactivating the Main address
    // has to clear the flag in the same statement, which is also what leaves the partial unique
    // index free for the replacement the command promotes next (AC-06b).
    it('records the address Inactive and clears its Main flag in the same write', async () => {
      const seeded = await seed();
      const mainAddress = await seedAddress(seeded, { isMain: true });

      const outcome = await transactions.executeInTransaction({}, () =>
        repository.deactivateDeliveryAddress(
          mainAddress,
          seeded.customerId,
          later,
        ),
      );

      expect(outcome).toBe('applied');
      expect(await readAddress(mainAddress)).toMatchObject({
        isMain: false,
        deactivatedAt: later,
        updatedAt: later,
      });
    });

    // The conditional update is guarded on the address still being active, so a second deactivation
    // affects no row and is reported as a refusal rather than as a silent success.
    it('refuses an address that is already Inactive', async () => {
      const seeded = await seed();
      const addressId = await seedAddress(seeded, { deactivatedAt: now });

      const outcome = await transactions.executeInTransaction({}, () =>
        repository.deactivateDeliveryAddress(
          addressId,
          seeded.customerId,
          later,
        ),
      );

      expect(outcome).toBe('delivery-address-unavailable');
      expect(await readAddress(addressId)).toMatchObject({
        deactivatedAt: now,
      });
    });

    // AC-06b — after the Main address is deactivated the flag moves to a remaining active address
    // in the same transaction, so the Customer is never left without a Main one at rest.
    it('leaves the partial unique index free for the promoted address', async () => {
      const seeded = await seed();
      const mainAddress = await seedAddress(seeded, { isMain: true });
      const remaining = await seedAddress(seeded);

      await transactions.executeInTransaction({}, async () => {
        await repository.deactivateDeliveryAddress(
          mainAddress,
          seeded.customerId,
          later,
        );
        await repository.setMainDeliveryAddress(
          remaining,
          seeded.customerId,
          later,
        );
      });

      expect(await readAddress(mainAddress)).toMatchObject({
        isMain: false,
        deactivatedAt: later,
      });
      expect(await readAddress(remaining)).toMatchObject({
        isMain: true,
        deactivatedAt: null,
      });
    });
  });

  describe('reactivateDeliveryAddress', () => {
    // openapi.yaml `CustomerDeliveryAddress.deactivatedAt` — "a reactivated once-Main address comes
    // back as an **ordinary** address, never as a second Main one".
    it('brings a once-Main address back as an ordinary one', async () => {
      const seeded = await seed();
      const current = await seedAddress(seeded, { isMain: true });
      const reactivated = await seedAddress(seeded, { deactivatedAt: now });

      const outcome = await transactions.executeInTransaction({}, () =>
        repository.reactivateDeliveryAddress(
          reactivated,
          seeded.customerId,
          later,
        ),
      );

      expect(outcome).toBe('applied');
      expect(await readAddress(reactivated)).toMatchObject({
        deactivatedAt: null,
        isMain: false,
        updatedAt: later,
      });
      expect(await readAddress(current)).toMatchObject({ isMain: true });
    });

    it('refuses an address that is already active', async () => {
      const seeded = await seed();
      const addressId = await seedAddress(seeded);

      const outcome = await transactions.executeInTransaction({}, () =>
        repository.reactivateDeliveryAddress(
          addressId,
          seeded.customerId,
          later,
        ),
      );

      expect(outcome).toBe('delivery-address-unavailable');
    });
  });
});
