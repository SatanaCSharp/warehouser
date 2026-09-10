import { randomUUID } from 'node:crypto';

import dataSource from 'shared/database/data-source.js';
import { AccountEntity } from 'shared/domain/entities/account.entity.js';
import { ItemEntity } from 'shared/domain/entities/item.entity.js';
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
 * The RED for T2 —
 * `docs/features/delivery-addresses/tasks/add-delivery-destinations-migration.md`.
 *
 * `apps/server/AGENTS.md` forbids tests for migration classes, so — exactly as
 * `customer-schema.integration.spec.ts` did for T1 — the constraint proofs live
 * here, against the five shipped relations `1786700100000-AddDeliveryDestinations`
 * alters, and assert only observable database behaviour.
 *
 * The apply-with-data and revert halves of the task's Definition of Done are not
 * expressible in this tier at all: it starts from an already-migrated template.
 * Those were executed separately against a PostgreSQL 17 database holding
 * pre-existing rows, and the run is recorded in the task's commit message.
 *
 * Rows are written as raw SQL on purpose: `PurchaseDraftLineEntity`,
 * `CustomerOrderEntity` and `DemandSnapshotEntryEntity` do not carry these
 * columns until T4, and the schema is the only thing under test here.
 *
 * Covers AC-11, AC-11a, AC-13, AC-16, AC-19 and AC-24.
 */
const now = new Date('2026-09-03T09:00:00.000Z');
const futureNeededBy = '2099-01-01';

interface SeededWarehouse {
  readonly workspaceId: string;
  readonly warehouseId: string;
  readonly userId: string;
  readonly itemId: string;
}

interface SeededCustomer {
  readonly customerId: string;
  readonly mainAddressId: string;
  readonly secondAddressId: string;
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

/**
 * `accounts.user_id` / `users.account_id` are a deferred circular FK pair, so
 * both inserts must land in one transaction — the pattern every integration
 * spec under `shared/domain/` already uses.
 */
const seedWarehouse = async (
  normalizedEmail: string,
): Promise<SeededWarehouse> => {
  const workspace = buildWorkspace();
  await dataSource.manager.getRepository(WorkspaceEntity).insert(workspace);
  const warehouse = buildWarehouse({ workspaceId: workspace.id! });
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
      workspaceId: workspace.id!,
      createdAt: now,
      updatedAt: now,
    });
  });

  const itemId = randomUUID();
  await dataSource.manager.getRepository(ItemEntity).insert({
    id: itemId,
    warehouseId: warehouse.id!,
    sku: `SKU-${randomUUID()}`,
    description: 'A round-tripped Item',
    unitOfMeasure: 'ea',
    onHandQuantity: 0,
    deactivatedAt: null,
    createdAt: now,
    updatedAt: now,
  });

  return {
    workspaceId: workspace.id!,
    warehouseId: warehouse.id!,
    userId,
    itemId,
  };
};

/** A Customer with the Main Delivery Address and one further active address. */
const seedCustomer = async (
  seeded: SeededWarehouse,
  name = 'Acme Manufacturing',
): Promise<SeededCustomer> => {
  const customerId = randomUUID();
  await dataSource.query(
    `INSERT INTO customers
       (id, warehouse_id, name, deactivated_at, recorded_by_user_id, created_at, updated_at)
     VALUES ($1, $2, $3, NULL, $4, $5, $5)`,
    [customerId, seeded.warehouseId, name, seeded.userId, now],
  );

  const insertAddress = async (
    addressText: string,
    isMain: boolean,
  ): Promise<string> => {
    const id = randomUUID();
    await dataSource.query(
      `INSERT INTO customer_delivery_addresses
         (id, customer_id, warehouse_id, address_text, access_notes, is_main,
          deactivated_at, created_at, updated_at)
       VALUES ($1, $2, $3, $4, NULL, $5, NULL, $6, $6)`,
      [id, customerId, seeded.warehouseId, addressText, isMain, now],
    );

    return id;
  };

  return {
    customerId,
    mainAddressId: await insertAddress('12 Harbour Road, Unit 4', true),
    secondAddressId: await insertAddress('9 Depot Lane', false),
  };
};

interface OrderRow {
  readonly customerId: string | null;
  readonly customerName: string | null;
  readonly addressId: string | null;
}

const insertCustomerOrder = async (
  seeded: SeededWarehouse,
  row: OrderRow,
): Promise<string> => {
  const id = randomUUID();
  await dataSource.query(
    `INSERT INTO customer_orders
       (id, warehouse_id, item_id, customer_id, customer_name,
        customer_delivery_address_id, quantity, outstanding_quantity, needed_by,
        state, recorded_by_user_id, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, 3, 3, $7, 'unfulfilled', $8, $9, $9)`,
    [
      id,
      seeded.warehouseId,
      seeded.itemId,
      row.customerId,
      row.customerName,
      row.addressId,
      futureNeededBy,
      seeded.userId,
      now,
    ],
  );

  return id;
};

const insertPurchaseDraft = async (
  seeded: SeededWarehouse,
): Promise<string> => {
  const id = randomUUID();
  await dataSource.query(
    `INSERT INTO purchase_drafts
       (id, warehouse_id, state, created_by_user_id, created_at, updated_at)
     VALUES ($1, $2, 'draft', $3, $4, $4)`,
    [id, seeded.warehouseId, seeded.userId, now],
  );

  return id;
};

interface LineRow {
  readonly deliveryMode?: string;
  readonly addressId?: string | null;
  readonly frozenAddressText?: string | null;
  readonly frozenAccessNotes?: string | null;
  readonly frozenCustomerName?: string | null;
  readonly endingQuantity?: number | null;
  readonly endingKind?: string | null;
  readonly endingRecordedByUserId?: string | null;
  readonly endingRecordedAt?: Date | null;
}

/**
 * `delivery_mode` is deliberately omitted from the column list when the case
 * does not state one — that omission is what exercises AC-13's DEFAULT.
 */
const insertLine = async (
  seeded: SeededWarehouse,
  draftId: string,
  row: LineRow = {},
): Promise<string> => {
  const id = randomUUID();
  const statesMode = row.deliveryMode !== undefined;

  await dataSource.query(
    `INSERT INTO purchase_draft_lines
       (id, purchase_draft_id, warehouse_id, item_id, ordered_quantity,
        ${statesMode ? 'delivery_mode,' : ''}
        customer_delivery_address_id, frozen_delivery_address_text,
        frozen_access_notes, frozen_customer_name, ending_quantity, ending_kind,
        ending_recorded_by_user_id, ending_recorded_at, created_at, updated_at)
     VALUES ($1, $2, $3, $4, 10,
        ${statesMode ? '$14,' : ''}
        $5, $6, $7, $8, $9, $10, $11, $12, $13, $13)`,
    [
      id,
      draftId,
      seeded.warehouseId,
      seeded.itemId,
      row.addressId ?? null,
      row.frozenAddressText ?? null,
      row.frozenAccessNotes ?? null,
      row.frozenCustomerName ?? null,
      row.endingQuantity ?? null,
      row.endingKind ?? null,
      row.endingRecordedByUserId ?? null,
      row.endingRecordedAt ?? null,
      now,
      ...(statesMode ? [row.deliveryMode] : []),
    ],
  );

  return id;
};

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

const describeCustomerOrderIdentity = (): void => {
  describe('AC-11 / AC-11a / AC-24 — an order names a Customer and an address of theirs, or a typed name and neither', () => {
    it('records an order against a Customer with one of that Customer’s addresses', async () => {
      const seeded = await seedWarehouse('ac11@example.test');
      const customer = await seedCustomer(seeded);

      const orderId = await insertCustomerOrder(seeded, {
        customerId: customer.customerId,
        customerName: null,
        addressId: customer.mainAddressId,
      });

      const [stored] = await queryRows<Record<string, unknown>>(
        'SELECT * FROM customer_orders WHERE id = $1',
        [orderId],
      );

      expect(stored).toMatchObject({
        customer_id: customer.customerId,
        customer_name: null,
        customer_delivery_address_id: customer.mainAddressId,
      });
    });

    it('records an order by typed name with no Customer and no address (AC-11a)', async () => {
      const seeded = await seedWarehouse('ac11a@example.test');

      const orderId = await insertCustomerOrder(seeded, {
        customerId: null,
        customerName: 'Buyer One',
        addressId: null,
      });

      const [stored] = await queryRows<Record<string, unknown>>(
        'SELECT * FROM customer_orders WHERE id = $1',
        [orderId],
      );

      // The absence is the signal AC-24 relies on to tell the two kinds apart.
      expect(stored).toMatchObject({
        customer_id: null,
        customer_name: 'Buyer One',
        customer_delivery_address_id: null,
      });
    });

    it('refuses an order that names both a Customer and a typed name', async () => {
      const seeded = await seedWarehouse('ac11-both@example.test');
      const customer = await seedCustomer(seeded);

      const failure = await captureFailure(
        insertCustomerOrder(seeded, {
          customerId: customer.customerId,
          customerName: 'Buyer One',
          addressId: customer.mainAddressId,
        }),
      );

      expect(failure.driverError.code).toEqual('23514');
      expect(failure.message).toContain(
        'chk_customer_orders_customer_identity',
      );
    });

    it('refuses an order that names neither', async () => {
      const seeded = await seedWarehouse('ac11-neither@example.test');

      const failure = await captureFailure(
        insertCustomerOrder(seeded, {
          customerId: null,
          customerName: null,
          addressId: null,
        }),
      );

      expect(failure.driverError.code).toEqual('23514');
      expect(failure.message).toContain(
        'chk_customer_orders_customer_identity',
      );
    });

    it('refuses an order that names a Customer but no Delivery Address', async () => {
      const seeded = await seedWarehouse('ac11-noaddr@example.test');
      const customer = await seedCustomer(seeded);

      const failure = await captureFailure(
        insertCustomerOrder(seeded, {
          customerId: customer.customerId,
          customerName: null,
          addressId: null,
        }),
      );

      expect(failure.driverError.code).toEqual('23514');
      expect(failure.message).toContain(
        'chk_customer_orders_customer_identity',
      );
    });

    it('refuses an address belonging to another Customer (the reference, not a check, is the arbiter)', async () => {
      const seeded = await seedWarehouse('ac11-cross@example.test');
      const first = await seedCustomer(seeded, 'Acme Manufacturing');
      const second = await seedCustomer(seeded, 'Northwind Foods');

      const failure = await captureFailure(
        insertCustomerOrder(seeded, {
          customerId: first.customerId,
          customerName: null,
          addressId: second.mainAddressId,
        }),
      );

      expect(failure.driverError.code).toEqual('23503');
      expect(failure.message).toContain('fk_customer_orders_delivery_address');
    });
  });
};

const describeLineDeliveryMode = (): void => {
  describe('AC-13 — a line starts Via Warehouse, and its mode decides whether it names an address', () => {
    it('gives a line that states no mode the Via Warehouse default', async () => {
      const seeded = await seedWarehouse('ac13-default@example.test');
      const draftId = await insertPurchaseDraft(seeded);

      const lineId = await insertLine(seeded, draftId);

      const [stored] = await queryRows<{ delivery_mode: string }>(
        'SELECT delivery_mode FROM purchase_draft_lines WHERE id = $1',
        [lineId],
      );

      expect(stored.delivery_mode).toEqual('via_warehouse');
    });

    it('records a Direct to Customer line against a Customer Delivery Address', async () => {
      const seeded = await seedWarehouse('ac13-direct@example.test');
      const customer = await seedCustomer(seeded);
      const draftId = await insertPurchaseDraft(seeded);

      const lineId = await insertLine(seeded, draftId, {
        deliveryMode: 'direct_to_customer',
        addressId: customer.secondAddressId,
      });

      const [stored] = await queryRows<Record<string, unknown>>(
        'SELECT * FROM purchase_draft_lines WHERE id = $1',
        [lineId],
      );

      expect(stored).toMatchObject({
        delivery_mode: 'direct_to_customer',
        customer_delivery_address_id: customer.secondAddressId,
      });
    });

    it('refuses a Direct to Customer line that names no address', async () => {
      const seeded = await seedWarehouse('ac13-direct-noaddr@example.test');
      const draftId = await insertPurchaseDraft(seeded);

      const failure = await captureFailure(
        insertLine(seeded, draftId, { deliveryMode: 'direct_to_customer' }),
      );

      expect(failure.driverError.code).toEqual('23514');
      expect(failure.message).toContain(
        'chk_purchase_draft_lines_delivery_mode_address',
      );
    });

    it('refuses a Via Warehouse line that names one', async () => {
      const seeded = await seedWarehouse('ac13-via-addr@example.test');
      const customer = await seedCustomer(seeded);
      const draftId = await insertPurchaseDraft(seeded);

      const failure = await captureFailure(
        insertLine(seeded, draftId, {
          deliveryMode: 'via_warehouse',
          addressId: customer.mainAddressId,
        }),
      );

      expect(failure.driverError.code).toEqual('23514');
      expect(failure.message).toContain(
        'chk_purchase_draft_lines_delivery_mode_address',
      );
    });

    it('refuses a mode outside the two the model admits', async () => {
      const seeded = await seedWarehouse('ac13-badmode@example.test');
      const draftId = await insertPurchaseDraft(seeded);

      const failure = await captureFailure(
        insertLine(seeded, draftId, { deliveryMode: 'by_drone' }),
      );

      expect(failure.driverError.code).toEqual('23514');
      expect(failure.message).toContain(
        'chk_purchase_draft_lines_delivery_mode',
      );
    });

    it('refuses an address of a Customer of another Warehouse', async () => {
      const first = await seedWarehouse('ac13-w1@example.test');
      const second = await seedWarehouse('ac13-w2@example.test');
      const strangerCustomer = await seedCustomer(second);
      const draftId = await insertPurchaseDraft(first);

      const failure = await captureFailure(
        insertLine(first, draftId, {
          deliveryMode: 'direct_to_customer',
          addressId: strangerCustomer.mainAddressId,
        }),
      );

      expect(failure.driverError.code).toEqual('23503');
      expect(failure.message).toContain(
        'fk_purchase_draft_lines_delivery_address',
      );
    });
  });
};

const describeFrozenCapture = (): void => {
  describe('AC-16 — the frozen delivery statement is captured by value, as one statement', () => {
    it('stores the address text, its notes and the customer name on a direct line', async () => {
      const seeded = await seedWarehouse('ac16-capture@example.test');
      const customer = await seedCustomer(seeded);
      const draftId = await insertPurchaseDraft(seeded);

      const lineId = await insertLine(seeded, draftId, {
        deliveryMode: 'direct_to_customer',
        addressId: customer.secondAddressId,
        frozenAddressText: '9 Depot Lane',
        frozenAccessNotes: 'Ring the bell at the side gate',
        frozenCustomerName: 'Acme Manufacturing',
      });

      const [stored] = await queryRows<Record<string, unknown>>(
        'SELECT * FROM purchase_draft_lines WHERE id = $1',
        [lineId],
      );

      expect(stored).toMatchObject({
        frozen_delivery_address_text: '9 Depot Lane',
        frozen_access_notes: 'Ring the bell at the side gate',
        frozen_customer_name: 'Acme Manufacturing',
      });
    });

    it('refuses access notes captured without the address they describe', async () => {
      const seeded = await seedWarehouse('ac16-notes@example.test');
      const draftId = await insertPurchaseDraft(seeded);

      const failure = await captureFailure(
        insertLine(seeded, draftId, {
          frozenAccessNotes: 'Ring the bell at the side gate',
        }),
      );

      expect(failure.driverError.code).toEqual('23514');
      expect(failure.message).toContain(
        'chk_purchase_draft_lines_frozen_capture_shape',
      );
    });

    it('refuses a captured customer name on a Via Warehouse line', async () => {
      const seeded = await seedWarehouse('ac16-viacustomer@example.test');
      const draftId = await insertPurchaseDraft(seeded);

      const failure = await captureFailure(
        insertLine(seeded, draftId, {
          deliveryMode: 'via_warehouse',
          frozenAddressText: '1 Warehouse Way',
          frozenCustomerName: 'Acme Manufacturing',
        }),
      );

      expect(failure.driverError.code).toEqual('23514');
      expect(failure.message).toContain(
        'chk_purchase_draft_lines_frozen_capture_shape',
      );
    });

    it('refuses an untrimmed captured address', async () => {
      const seeded = await seedWarehouse('ac16-untrimmed@example.test');
      const draftId = await insertPurchaseDraft(seeded);

      const failure = await captureFailure(
        insertLine(seeded, draftId, {
          frozenAddressText: '  9 Depot Lane  ',
        }),
      );

      expect(failure.driverError.code).toEqual('23514');
      expect(failure.message).toContain(
        'chk_purchase_draft_lines_frozen_delivery_stored_trimmed',
      );
    });
  });
};

const describeLineEndings = (): void => {
  describe('AC-19 — a line’s ending carries its quantity, kind, member and time, or none of the four', () => {
    it('records a complete ending on a Via Warehouse line', async () => {
      const seeded = await seedWarehouse('ac19-complete@example.test');
      const draftId = await insertPurchaseDraft(seeded);

      const lineId = await insertLine(seeded, draftId, {
        endingQuantity: 8,
        endingKind: 'arrival',
        endingRecordedByUserId: seeded.userId,
        endingRecordedAt: now,
      });

      const [stored] = await queryRows<Record<string, unknown>>(
        'SELECT * FROM purchase_draft_lines WHERE id = $1',
        [lineId],
      );

      expect(stored).toMatchObject({
        ending_quantity: 8,
        ending_kind: 'arrival',
        ending_recorded_by_user_id: seeded.userId,
      });
      expect(stored.ending_recorded_at).toEqual(now);
    });

    it('accepts an ending of zero — nothing arrived is still an ending', async () => {
      const seeded = await seedWarehouse('ac19-zero@example.test');
      const draftId = await insertPurchaseDraft(seeded);

      const lineId = await insertLine(seeded, draftId, {
        endingQuantity: 0,
        endingKind: 'arrival',
        endingRecordedByUserId: seeded.userId,
        endingRecordedAt: now,
      });

      const [stored] = await queryRows<{ ending_quantity: number }>(
        'SELECT ending_quantity FROM purchase_draft_lines WHERE id = $1',
        [lineId],
      );

      expect(stored.ending_quantity).toEqual(0);
    });

    it('refuses a negative ending quantity', async () => {
      const seeded = await seedWarehouse('ac19-negative@example.test');
      const draftId = await insertPurchaseDraft(seeded);

      const failure = await captureFailure(
        insertLine(seeded, draftId, {
          endingQuantity: -1,
          endingKind: 'arrival',
          endingRecordedByUserId: seeded.userId,
          endingRecordedAt: now,
        }),
      );

      expect(failure.driverError.code).toEqual('23514');
      expect(failure.message).toContain(
        'chk_purchase_draft_lines_ending_quantity_not_negative',
      );
    });

    it('refuses a quantity recorded without the member and time that recorded it', async () => {
      const seeded = await seedWarehouse('ac19-unattributed@example.test');
      const draftId = await insertPurchaseDraft(seeded);

      const failure = await captureFailure(
        insertLine(seeded, draftId, { endingQuantity: 8 }),
      );

      expect(failure.driverError.code).toEqual('23514');
      expect(failure.message).toContain(
        'chk_purchase_draft_lines_ending_attribution',
      );
    });

    it('refuses an Arrival Confirmation against a Direct to Customer line', async () => {
      const seeded = await seedWarehouse('ac19-wrongkind@example.test');
      const customer = await seedCustomer(seeded);
      const draftId = await insertPurchaseDraft(seeded);

      const failure = await captureFailure(
        insertLine(seeded, draftId, {
          deliveryMode: 'direct_to_customer',
          addressId: customer.mainAddressId,
          endingQuantity: 8,
          endingKind: 'arrival',
          endingRecordedByUserId: seeded.userId,
          endingRecordedAt: now,
        }),
      );

      expect(failure.driverError.code).toEqual('23514');
      expect(failure.message).toContain(
        'chk_purchase_draft_lines_ending_matches_mode',
      );
    });

    it('refuses a Direct Delivery against a Via Warehouse line', async () => {
      const seeded = await seedWarehouse('ac19-wrongkind2@example.test');
      const draftId = await insertPurchaseDraft(seeded);

      const failure = await captureFailure(
        insertLine(seeded, draftId, {
          deliveryMode: 'via_warehouse',
          endingQuantity: 8,
          endingKind: 'direct_delivery',
          endingRecordedByUserId: seeded.userId,
          endingRecordedAt: now,
        }),
      );

      expect(failure.driverError.code).toEqual('23514');
      expect(failure.message).toContain(
        'chk_purchase_draft_lines_ending_matches_mode',
      );
    });
  });
};

const describeDraftClosurePaths = (): void => {
  describe('AC-19 — a draft may now close because its last line got an ending', () => {
    const insertClosedDraft = async (
      seeded: SeededWarehouse,
      overrides: {
        readonly arrivalConfirmed?: boolean;
        readonly closureReason?: string | null;
      } = {},
    ): Promise<string> => {
      const id = randomUUID();
      const attributed = overrides.arrivalConfirmed ?? false;
      await dataSource.query(
        `INSERT INTO purchase_drafts
           (id, warehouse_id, state, created_by_user_id, readied_by_user_id,
            readied_at, arrival_confirmed_by_user_id, arrival_confirmed_at,
            closed_by_user_id, closed_at, closure_reason, created_at, updated_at)
         VALUES ($1, $2, 'closed', $3, $3, $4, $5, $6, $3, $4, $7, $4, $4)`,
        [
          id,
          seeded.warehouseId,
          seeded.userId,
          now,
          attributed ? seeded.userId : null,
          attributed ? now : null,
          overrides.closureReason ?? null,
        ],
      );

      return id;
    };

    it('accepts a Closed draft carrying neither an arrival attribution nor a reason', async () => {
      const seeded = await seedWarehouse('ac19-thirdpath@example.test');

      const draftId = await insertClosedDraft(seeded);

      const [stored] = await queryRows<Record<string, unknown>>(
        'SELECT * FROM purchase_drafts WHERE id = $1',
        [draftId],
      );

      expect(stored).toMatchObject({
        state: 'closed',
        arrival_confirmed_at: null,
        arrival_confirmed_by_user_id: null,
        closure_reason: null,
      });
    });

    it('still accepts the two closure paths ordering shipped', async () => {
      const seeded = await seedWarehouse('ac19-oldpaths@example.test');

      await insertClosedDraft(seeded, { arrivalConfirmed: true });
      await insertClosedDraft(seeded, { closureReason: 'Supplier withdrew' });

      const stored = await queryRows<{ count: string }>(
        `SELECT count(*) FROM purchase_drafts
         WHERE warehouse_id = $1 AND state = 'closed'`,
        [seeded.warehouseId],
      );

      expect(stored).toEqual([{ count: '2' }]);
    });

    it('refuses a draft that claims both an arrival attribution and a reason', async () => {
      const seeded = await seedWarehouse('ac19-both@example.test');

      const failure = await captureFailure(
        insertClosedDraft(seeded, {
          arrivalConfirmed: true,
          closureReason: 'Supplier withdrew',
        }),
      );

      expect(failure.driverError.code).toEqual('23514');
      expect(failure.message).toContain('chk_purchase_drafts_closure_path');
    });
  });
};

const describeCapturedDemandAddress = (): void => {
  describe('AC-16 — the Delivery Address each linked Customer Order was going to at the freeze', () => {
    const seedSnapshot = async (
      seeded: SeededWarehouse,
      captured: {
        readonly addressId: string | null;
        readonly addressText: string | null;
      },
      order: OrderRow,
    ): Promise<string> => {
      const draftId = await insertPurchaseDraft(seeded);
      const lineId = await insertLine(seeded, draftId);
      const orderId = await insertCustomerOrder(seeded, order);
      const linkId = randomUUID();

      await dataSource.query(
        `INSERT INTO purchase_draft_line_links
           (id, purchase_draft_line_id, purchase_draft_id, warehouse_id,
            customer_order_id, stated_quantity, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, 3, $6, $6)`,
        [linkId, lineId, draftId, seeded.warehouseId, orderId, now],
      );
      await dataSource.query(
        `INSERT INTO purchase_draft_demand_snapshots
           (purchase_draft_line_link_id, purchase_draft_line_id, customer_order_id,
            captured_quantity, captured_needed_by, captured_state,
            captured_customer_delivery_address_id, captured_delivery_address_text,
            created_at)
         VALUES ($1, $2, $3, 3, $4, 'unfulfilled', $5, $6, $7)`,
        [
          linkId,
          lineId,
          orderId,
          futureNeededBy,
          captured.addressId,
          captured.addressText,
          now,
        ],
      );

      return linkId;
    };

    it('captures the address key and its text together', async () => {
      const seeded = await seedWarehouse('ac16-snapshot@example.test');
      const customer = await seedCustomer(seeded);

      const linkId = await seedSnapshot(
        seeded,
        {
          addressId: customer.mainAddressId,
          addressText: '12 Harbour Road, Unit 4',
        },
        {
          customerId: customer.customerId,
          customerName: null,
          addressId: customer.mainAddressId,
        },
      );

      const [stored] = await queryRows<Record<string, unknown>>(
        `SELECT * FROM purchase_draft_demand_snapshots
         WHERE purchase_draft_line_link_id = $1`,
        [linkId],
      );

      expect(stored).toMatchObject({
        captured_customer_delivery_address_id: customer.mainAddressId,
        captured_delivery_address_text: '12 Harbour Road, Unit 4',
      });
    });

    it('captures neither for a link to an order recorded by typed name (AC-11a)', async () => {
      const seeded = await seedWarehouse('ac16-typedname@example.test');

      const linkId = await seedSnapshot(
        seeded,
        { addressId: null, addressText: null },
        { customerId: null, customerName: 'Buyer One', addressId: null },
      );

      const [stored] = await queryRows<Record<string, unknown>>(
        `SELECT * FROM purchase_draft_demand_snapshots
         WHERE purchase_draft_line_link_id = $1`,
        [linkId],
      );

      expect(stored).toMatchObject({
        captured_customer_delivery_address_id: null,
        captured_delivery_address_text: null,
      });
    });

    it('refuses a captured key without the text that states it', async () => {
      const seeded = await seedWarehouse('ac16-halfcapture@example.test');
      const customer = await seedCustomer(seeded);

      const failure = await captureFailure(
        seedSnapshot(
          seeded,
          { addressId: customer.mainAddressId, addressText: null },
          {
            customerId: customer.customerId,
            customerName: null,
            addressId: customer.mainAddressId,
          },
        ),
      );

      expect(failure.driverError.code).toEqual('23514');
      expect(failure.message).toContain(
        'chk_purchase_draft_demand_snapshots_captured_address_pairing',
      );
    });
  });
};

describe('the delivery destinations added to the five shipped relations', () => {
  beforeAll(async () => {
    await dataSource.initialize();
  });

  afterEach(async () => {
    await dataSource.query(
      `TRUNCATE purchase_draft_demand_snapshots, purchase_draft_line_links,
                purchase_draft_lines, purchase_drafts, customer_orders,
                customer_delivery_addresses, customers, items, warehouses,
                sessions, users, accounts, workspaces CASCADE`,
    );
  });

  afterAll(async () => {
    await dataSource.destroy();
  });

  describeCustomerOrderIdentity();
  describeLineDeliveryMode();
  describeFrozenCapture();
  describeLineEndings();
  describeDraftClosurePaths();
  describeCapturedDemandAddress();
});
