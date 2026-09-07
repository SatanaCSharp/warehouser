import { randomUUID } from 'node:crypto';

import dataSource from 'shared/database/data-source';
import { AccountEntity } from 'shared/domain/entities/account.entity';
import { CustomerEntity } from 'shared/domain/entities/customer.entity';
import { CustomerDeliveryAddressEntity } from 'shared/domain/entities/customer-delivery-address.entity';
import { ItemEntity } from 'shared/domain/entities/item.entity';
import { PurchaseDraftEntity } from 'shared/domain/entities/purchase-draft.entity';
import { PurchaseDraftLineEntity } from 'shared/domain/entities/purchase-draft-line.entity';
import { PurchaseDraftLineRejectionEntity } from 'shared/domain/entities/purchase-draft-line-rejection.entity';
import { RejectionReasonEntity } from 'shared/domain/entities/rejection-reason.entity';
import { UserEntity } from 'shared/domain/entities/user.entity';
import { WarehouseEntity } from 'shared/domain/entities/warehouse.entity';
import { WorkspaceEntity } from 'shared/domain/entities/workspace.entity';
import {
  buildWarehouse,
  buildWorkspace,
} from 'test/factories/entity-factories';
import {
  type EntityTarget,
  type ObjectLiteral,
  QueryFailedError,
} from 'typeorm';

/**
 * The RED for T3 —
 * `docs/features/arrival-inspection/tasks/rejection-persistence-entities.md`.
 *
 * `arrival-inspection-schema.integration.spec.ts` (T1) proves the *constraints* of the two new
 * relations with raw SQL, because no entity existed to write them through. This file proves the
 * *mapping*: that `RejectionReasonEntity` and `PurchaseDraftLineRejectionEntity` name the columns
 * the migration created — every one of them, no more, with the migration's own types and
 * nullability — that `PurchaseDraftLineEntity` carries the two Pre-receipt Conformance columns, and
 * that a row of each round-trips through the database it maps.
 *
 * Nothing here re-asserts a constraint T1 already probed. The one database refusal this file does
 * assert — the amendment attribution pair — is the Definition of Done's own requirement and is not
 * covered there.
 *
 * Covers AC-05, AC-13, AC-15, AC-18 and AC-24 at the persistence boundary.
 */
const now = new Date('2026-09-07T09:00:00.000Z');

/**
 * The mapping facts this file compares on: which physical column a property names, whether the
 * column admits NULL, and the type it holds. Nullability is the classic silent defect — an entity
 * marking a `NOT NULL` column optional compiles, round-trips, and only fails in production — so it
 * is asserted in both directions rather than sampled.
 */
interface MappedColumn {
  readonly databaseName: string;
  readonly isNullable: boolean;
  readonly dataType: string;
  readonly length: number | null;
}

/** What `information_schema` says the migrated database actually holds. */
const physicalColumns = async (table: string): Promise<MappedColumn[]> => {
  const rows: unknown = await dataSource.query(
    `SELECT column_name AS "databaseName",
            is_nullable = 'YES' AS "isNullable",
            data_type AS "dataType",
            character_maximum_length AS "length"
     FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = $1
     ORDER BY column_name`,
    [table],
  );

  return rows as MappedColumn[];
};

/** What the entity claims the database holds, read from TypeORM's own metadata. */
const entityColumns = (entity: EntityTarget<ObjectLiteral>): MappedColumn[] =>
  dataSource
    .getMetadata(entity)
    .columns.map((column): MappedColumn => ({
      databaseName: column.databaseName,
      isNullable: column.isNullable,
      dataType: dataSource.driver.normalizeType(column),
      length: column.length === '' ? null : Number(column.length),
    }))
    .sort((left, right) => left.databaseName.localeCompare(right.databaseName));

/**
 * `accounts.user_id` / `users.account_id` are a deferred circular FK pair, so both inserts must
 * land in one transaction — the pattern every integration spec under `shared/domain/` uses.
 */
const seedUser = async (
  workspaceId: string,
  normalizedEmail: string,
): Promise<string> => {
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
      workspaceId,
      createdAt: now,
      updatedAt: now,
    });
  });

  return userId;
};

/** A Customer with one Delivery Address, so a Direct to Customer line has one to name. */
const seedDeliveryAddress = async (
  warehouseId: string,
  userId: string,
): Promise<string> => {
  const customerId = randomUUID();
  const addressId = randomUUID();

  await dataSource.manager.getRepository(CustomerEntity).insert({
    id: customerId,
    warehouseId,
    name: 'Acme Ltd',
    deactivatedAt: null,
    recordedByUserId: userId,
    createdAt: now,
    updatedAt: now,
  });
  await dataSource.manager.getRepository(CustomerDeliveryAddressEntity).insert({
    id: addressId,
    customerId,
    warehouseId,
    addressText: '1 Depot Road, Springfield',
    accessNotes: null,
    isMain: true,
    deactivatedAt: null,
    createdAt: now,
    updatedAt: now,
  });

  return addressId;
};

interface Seeded {
  readonly warehouseId: string;
  readonly userId: string;
  readonly itemId: string;
  readonly draftId: string;
  readonly deliveryAddressId: string;
}

const seedWarehouse = async (normalizedEmail: string): Promise<Seeded> => {
  const workspace = buildWorkspace();
  await dataSource.manager.getRepository(WorkspaceEntity).insert(workspace);
  const warehouse = buildWarehouse({ workspaceId: workspace.id! });
  await dataSource.manager.getRepository(WarehouseEntity).insert(warehouse);

  const warehouseId = warehouse.id!;
  const userId = await seedUser(workspace.id!, normalizedEmail);

  const itemId = randomUUID();
  await dataSource.manager.getRepository(ItemEntity).insert({
    id: itemId,
    warehouseId,
    sku: `SKU-${itemId}`,
    description: 'Cable reel, 50m',
    unitOfMeasure: 'each',
    onHandQuantity: 0,
    deactivatedAt: null,
    createdAt: now,
    updatedAt: now,
  });

  const draftId = randomUUID();
  await dataSource.manager.getRepository(PurchaseDraftEntity).insert({
    id: draftId,
    warehouseId,
    state: 'ready_for_ordering',
    expectedArrivalDate: null,
    createdByUserId: userId,
    readiedByUserId: userId,
    readiedAt: now,
    closedByUserId: null,
    closedAt: null,
    closureReason: null,
    arrivalConfirmedByUserId: null,
    arrivalConfirmedAt: null,
    discardedByUserId: null,
    discardedAt: null,
    createdAt: now,
    updatedAt: now,
  });

  return {
    warehouseId,
    userId,
    itemId,
    draftId,
    deliveryAddressId: await seedDeliveryAddress(warehouseId, userId),
  };
};

const buildLine = (
  seeded: Seeded,
  overrides: Partial<PurchaseDraftLineEntity> = {},
): PurchaseDraftLineEntity => ({
  id: randomUUID(),
  purchaseDraftId: seeded.draftId,
  warehouseId: seeded.warehouseId,
  itemId: seeded.itemId,
  orderedQuantity: 100,
  packagingTypeId: null,
  valueAddingNote: null,
  deliveryMode: 'via_warehouse',
  customerDeliveryAddressId: null,
  frozenDeliveryAddressText: null,
  frozenAccessNotes: null,
  frozenCustomerName: null,
  endingQuantity: null,
  endingKind: null,
  endingRecordedByUserId: null,
  endingRecordedAt: null,
  preReceiptConformance: null,
  preReceiptConformanceNote: null,
  createdAt: now,
  updatedAt: now,
  ...overrides,
});

/**
 * A line whose ending is recorded — the only state in which a Pre-receipt Conformance may exist
 * (`chk_purchase_draft_lines_conformance_requires_ending`) and the only one a Rejection hangs off.
 * The ending's kind follows the Delivery Mode, and the four attribution columns travel together.
 */
const insertEndedLine = async (
  seeded: Seeded,
  overrides: Partial<PurchaseDraftLineEntity> = {},
): Promise<PurchaseDraftLineEntity> => {
  const direct = overrides.deliveryMode === 'direct_to_customer';
  const line = buildLine(seeded, {
    customerDeliveryAddressId: direct ? seeded.deliveryAddressId : null,
    endingQuantity: 100,
    endingKind: direct ? 'direct_delivery' : 'arrival',
    endingRecordedByUserId: seeded.userId,
    endingRecordedAt: now,
    ...overrides,
  });
  await dataSource.manager.getRepository(PurchaseDraftLineEntity).insert(line);

  return line;
};

const buildRejection = (
  seeded: Seeded,
  line: PurchaseDraftLineEntity,
  overrides: Partial<PurchaseDraftLineRejectionEntity> = {},
): PurchaseDraftLineRejectionEntity => ({
  id: randomUUID(),
  purchaseDraftLineId: line.id,
  warehouseId: line.warehouseId,
  deliveryMode: line.deliveryMode,
  rejectionReasonId: 'damaged_in_transit',
  quantity: 5,
  source:
    line.deliveryMode === 'direct_to_customer'
      ? 'customer_reported'
      : 'inspected',
  description: null,
  disposition: 'undecided',
  raisedByUserId: seeded.userId,
  amendedByUserId: null,
  amendedAt: null,
  createdAt: now,
  updatedAt: now,
  ...overrides,
});

const describeColumnConformance = (): void => {
  describe('the entities name exactly the columns the migration created', () => {
    it('maps RejectionReasonEntity onto rejection_reasons, column for column', async () => {
      const expected: MappedColumn[] = [
        {
          databaseName: 'created_at',
          isNullable: false,
          dataType: 'timestamp with time zone',
          length: null,
        },
        {
          databaseName: 'id',
          isNullable: false,
          dataType: 'character varying',
          length: 32,
        },
        {
          databaseName: 'label',
          isNullable: false,
          dataType: 'character varying',
          length: 100,
        },
        {
          databaseName: 'requires_description',
          isNullable: false,
          dataType: 'boolean',
          length: null,
        },
        {
          databaseName: 'updated_at',
          isNullable: false,
          dataType: 'timestamp with time zone',
          length: null,
        },
      ];

      expect(await physicalColumns('rejection_reasons')).toEqual(expected);
      expect(entityColumns(RejectionReasonEntity)).toEqual(expected);
    });

    it('maps PurchaseDraftLineRejectionEntity onto purchase_draft_line_rejections, column for column', async () => {
      const expected: MappedColumn[] = [
        {
          databaseName: 'amended_at',
          isNullable: true,
          dataType: 'timestamp with time zone',
          length: null,
        },
        {
          databaseName: 'amended_by_user_id',
          isNullable: true,
          dataType: 'uuid',
          length: null,
        },
        {
          databaseName: 'created_at',
          isNullable: false,
          dataType: 'timestamp with time zone',
          length: null,
        },
        {
          databaseName: 'delivery_mode',
          isNullable: false,
          dataType: 'character varying',
          length: 24,
        },
        {
          databaseName: 'description',
          isNullable: true,
          dataType: 'text',
          length: null,
        },
        {
          databaseName: 'disposition',
          isNullable: false,
          dataType: 'character varying',
          length: 24,
        },
        {
          databaseName: 'id',
          isNullable: false,
          dataType: 'uuid',
          length: null,
        },
        {
          databaseName: 'purchase_draft_line_id',
          isNullable: false,
          dataType: 'uuid',
          length: null,
        },
        {
          databaseName: 'quantity',
          isNullable: false,
          dataType: 'integer',
          length: null,
        },
        {
          databaseName: 'raised_by_user_id',
          isNullable: false,
          dataType: 'uuid',
          length: null,
        },
        {
          databaseName: 'rejection_reason_id',
          isNullable: false,
          dataType: 'character varying',
          length: 32,
        },
        {
          databaseName: 'source',
          isNullable: false,
          dataType: 'character varying',
          length: 24,
        },
        {
          databaseName: 'updated_at',
          isNullable: false,
          dataType: 'timestamp with time zone',
          length: null,
        },
        {
          databaseName: 'warehouse_id',
          isNullable: false,
          dataType: 'uuid',
          length: null,
        },
      ];

      expect(await physicalColumns('purchase_draft_line_rejections')).toEqual(
        expected,
      );
      expect(entityColumns(PurchaseDraftLineRejectionEntity)).toEqual(expected);
    });

    it('does not carry purchase_draft_id, which data-model.md records as deliberately absent', () => {
      expect(
        entityColumns(PurchaseDraftLineRejectionEntity).map(
          (column) => column.databaseName,
        ),
      ).not.toContain('purchase_draft_id');
    });

    it('maps both Pre-receipt Conformance columns onto purchase_draft_lines as nullable', async () => {
      const conformance = (
        await physicalColumns('purchase_draft_lines')
      ).filter((column) =>
        column.databaseName.startsWith('pre_receipt_conformance'),
      );

      expect(conformance).toEqual([
        {
          databaseName: 'pre_receipt_conformance',
          isNullable: true,
          dataType: 'character varying',
          length: 24,
        },
        {
          databaseName: 'pre_receipt_conformance_note',
          isNullable: true,
          dataType: 'text',
          length: null,
        },
      ]);
      expect(entityColumns(PurchaseDraftLineEntity)).toEqual(
        expect.arrayContaining(conformance),
      );
    });
  });
};

const describeVocabularies = (): void => {
  describe('the persistence-oriented value types', () => {
    it('narrows Source, Disposition and the Conformance verdict to the vocabularies the schema admits', () => {
      const acceptsSource = (
        source: PurchaseDraftLineRejectionEntity['source'],
      ): string => source;
      const acceptsDisposition = (
        disposition: PurchaseDraftLineRejectionEntity['disposition'],
      ): string => disposition;
      const acceptsConformance = (
        conformance: PurchaseDraftLineEntity['preReceiptConformance'],
      ): string | null => conformance;

      // @ts-expect-error — `source` is the two-value union `chk_..._source` admits, never a string
      acceptsSource('guessed');
      // @ts-expect-error — `disposition` is the four-value union `chk_..._disposition` admits
      acceptsDisposition('maybe');
      // @ts-expect-error — the verdict is the three-value union `chk_..._pre_receipt_conformance` admits
      acceptsConformance('partly');

      expect(acceptsSource('customer_reported')).toEqual('customer_reported');
      expect(acceptsDisposition('held_for_return')).toEqual('held_for_return');
      expect(acceptsConformance('not_met')).toEqual('not_met');
    });
  });
};

const describeRoundTrips = (): void => {
  describe('column mapping against the migrated schema (round-trip)', () => {
    it('reads back the migration-seeded Rejection Reason catalogue (AC-05)', async () => {
      const repository = dataSource.manager.getRepository(
        RejectionReasonEntity,
      );

      const damaged = await repository.findOneByOrFail({
        id: 'damaged_in_transit',
      });
      const other = await repository.findOneByOrFail({ id: 'unfit_other' });

      expect(damaged).toMatchObject({
        id: 'damaged_in_transit',
        label: 'Damaged in transit',
        requiresDescription: false,
      });
      expect(damaged.createdAt).toBeInstanceOf(Date);
      expect(other).toMatchObject({
        label: 'Unfit — other',
        requiresDescription: true,
      });
    });

    it('persists and reads back an inspected Rejection with the member’s description (AC-05, AC-13)', async () => {
      const seeded = await seedWarehouse('inspector@example.test');
      const line = await insertEndedLine(seeded);
      const rejection = buildRejection(seeded, line, {
        rejectionReasonId: 'unfit_other',
        quantity: 7,
        description: 'Three reels had crushed flanges',
      });

      await dataSource.manager
        .getRepository(PurchaseDraftLineRejectionEntity)
        .insert(rejection);
      const found = await dataSource.manager
        .getRepository(PurchaseDraftLineRejectionEntity)
        .findOneByOrFail({ id: rejection.id });

      expect(found).toMatchObject({
        purchaseDraftLineId: line.id,
        warehouseId: seeded.warehouseId,
        deliveryMode: 'via_warehouse',
        rejectionReasonId: 'unfit_other',
        quantity: 7,
        source: 'inspected',
        description: 'Three reels had crushed flanges',
        disposition: 'undecided',
        raisedByUserId: seeded.userId,
        amendedByUserId: null,
        amendedAt: null,
      });
      expect(found.createdAt).toBeInstanceOf(Date);
    });

    it('resolves the Reason and the line a stored Rejection names (AC-05)', async () => {
      const seeded = await seedWarehouse('resolver@example.test');
      const line = await insertEndedLine(seeded);
      const rejection = buildRejection(seeded, line, {
        rejectionReasonId: 'quality_defect',
      });
      await dataSource.manager
        .getRepository(PurchaseDraftLineRejectionEntity)
        .insert(rejection);

      const stored = await dataSource.manager
        .getRepository(PurchaseDraftLineRejectionEntity)
        .findOneByOrFail({ id: rejection.id });
      const reason = await dataSource.manager
        .getRepository(RejectionReasonEntity)
        .findOneByOrFail({ id: stored.rejectionReasonId });
      const referencedLine = await dataSource.manager
        .getRepository(PurchaseDraftLineEntity)
        .findOneByOrFail({ id: stored.purchaseDraftLineId });

      expect(reason.label).toEqual('Quality defect');
      expect(referencedLine.warehouseId).toEqual(stored.warehouseId);
      expect(referencedLine.deliveryMode).toEqual(stored.deliveryMode);
    });

    it('persists a customer-reported Rejection on a directly delivered line (AC-24)', async () => {
      const seeded = await seedWarehouse('direct-liner@example.test');
      const line = await insertEndedLine(seeded, {
        deliveryMode: 'direct_to_customer',
      });
      const rejection = buildRejection(seeded, line);

      await dataSource.manager
        .getRepository(PurchaseDraftLineRejectionEntity)
        .insert(rejection);
      const found = await dataSource.manager
        .getRepository(PurchaseDraftLineRejectionEntity)
        .findOneByOrFail({ id: rejection.id });

      expect(found).toMatchObject({
        deliveryMode: 'direct_to_customer',
        source: 'customer_reported',
      });
    });
  });
};

const describeConformanceColumns = (): void => {
  describe('the Pre-receipt Conformance on a Purchase Draft Line (AC-15)', () => {
    it('reads NULL in both columns on an ending that recorded no judgement', async () => {
      const seeded = await seedWarehouse('pre-release@example.test');
      const line = await insertEndedLine(seeded);

      const found = await dataSource.manager
        .getRepository(PurchaseDraftLineEntity)
        .findOneByOrFail({ id: line.id });

      expect(found.preReceiptConformance).toBeNull();
      expect(found.preReceiptConformanceNote).toBeNull();
    });

    it('persists a not-met verdict together with the member’s note', async () => {
      const seeded = await seedWarehouse('judge@example.test');
      const line = await insertEndedLine(seeded, {
        packagingTypeId: 'pallets',
        valueAddingNote: 'Label each reel with the order number',
        preReceiptConformance: 'not_met',
        preReceiptConformanceNote: 'Delivered loose, and nothing was labelled',
      });

      const found = await dataSource.manager
        .getRepository(PurchaseDraftLineEntity)
        .findOneByOrFail({ id: line.id });

      expect(found).toMatchObject({
        preReceiptConformance: 'not_met',
        preReceiptConformanceNote: 'Delivered loose, and nothing was labelled',
      });
    });
  });
};

const describeAmendment = (): void => {
  describe('the amendment attribution pair (AC-18)', () => {
    it('writes the disposition, the amending member and the time together', async () => {
      const seeded = await seedWarehouse('amender@example.test');
      const line = await insertEndedLine(seeded);
      const rejection = buildRejection(seeded, line);
      const repository = dataSource.manager.getRepository(
        PurchaseDraftLineRejectionEntity,
      );
      await repository.insert(rejection);
      const amendedAt = new Date('2026-09-08T11:30:00.000Z');

      await repository.update(rejection.id, {
        disposition: 'held_for_return',
        amendedByUserId: seeded.userId,
        amendedAt,
      });
      const found = await repository.findOneByOrFail({ id: rejection.id });

      expect(found).toMatchObject({
        disposition: 'held_for_return',
        amendedByUserId: seeded.userId,
        quantity: rejection.quantity,
      });
      expect(found.amendedAt).toEqual(amendedAt);
    });

    it('refuses an amendment time written without the amending member', async () => {
      const seeded = await seedWarehouse('half-amender@example.test');
      const line = await insertEndedLine(seeded);
      const repository = dataSource.manager.getRepository(
        PurchaseDraftLineRejectionEntity,
      );

      const failure: unknown = await repository
        .insert(
          buildRejection(seeded, line, {
            amendedAt: new Date('2026-09-08T11:30:00.000Z'),
          }),
        )
        .catch((error: unknown) => error);

      expect(failure).toBeInstanceOf(QueryFailedError);
      const queryFailure = failure as QueryFailedError & {
        driverError: { code: string };
      };
      expect(queryFailure.driverError.code).toEqual('23514');
      expect(queryFailure.message).toContain(
        'chk_purchase_draft_line_rejections_amendment_attribution',
      );
    });
  });
};

describe('Arrival-inspection shared persistence entities', () => {
  beforeAll(async () => {
    await dataSource.initialize();
  });

  afterEach(async () => {
    await dataSource.query(
      `TRUNCATE purchase_draft_line_rejections, purchase_draft_demand_snapshots,
                purchase_draft_line_links, purchase_draft_lines, purchase_drafts,
                arrival_allocations, customer_orders, customer_delivery_addresses,
                customers, items, warehouses, sessions, users, accounts, workspaces CASCADE`,
    );
  });

  afterAll(async () => {
    await dataSource.destroy();
  });

  describeColumnConformance();
  describeVocabularies();
  describeRoundTrips();
  describeConformanceColumns();
  describeAmendment();
});
