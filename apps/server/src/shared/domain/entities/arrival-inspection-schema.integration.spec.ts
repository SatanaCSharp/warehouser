import { randomUUID } from 'node:crypto';

import dataSource from 'shared/database/data-source';
import { AccountEntity } from 'shared/domain/entities/account.entity';
import { ItemEntity } from 'shared/domain/entities/item.entity';
import { UserEntity } from 'shared/domain/entities/user.entity';
import { WarehouseEntity } from 'shared/domain/entities/warehouse.entity';
import { WorkspaceEntity } from 'shared/domain/entities/workspace.entity';
import {
  buildWarehouse,
  buildWorkspace,
} from 'test/factories/entity-factories';
import { QueryFailedError } from 'typeorm';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

/**
 * The RED for T1 —
 * `docs/features/arrival-inspection/tasks/promote-arrival-inspection-schema-migration.md`.
 *
 * `apps/server/AGENTS.md` forbids tests for migration classes, so — exactly as
 * `customer-schema.integration.spec.ts` and `delivery-destinations-schema.integration.spec.ts`
 * did for their own schema tasks — the constraint proofs live here, against the two relations
 * `1786800000000-CreateArrivalInspectionSchema` creates and the two columns it adds to the
 * already-populated `purchase_draft_lines`, and assert only observable database behaviour.
 *
 * The apply-with-data and revert halves of the task's Definition of Done are not expressible in
 * this tier at all: it starts from an already-migrated template. Those are executed by hand
 * against the real development database, as `test-plan.md` § Test data records.
 *
 * Rows are written as raw SQL on purpose: `PurchaseDraftLineEntity` does not carry the two
 * conformance columns and no Rejection entity exists yet — the schema is the only thing under
 * test here.
 *
 * Covers AC-03, AC-04a, AC-09, AC-13, AC-14, AC-15b, AC-17, AC-17a, AC-19, AC-24 and AC-25.
 */
const now = new Date('2026-09-07T09:00:00.000Z');

/**
 * The catalogue `data-model.md` § `rejection_reasons` states, written out here rather than
 * imported from the migration: the seed itself is what this file has to prove, so the expectation
 * must be independent of the code that produces it.
 */
const expectedRejectionReasons: readonly (readonly [string, boolean])[] = [
  ['damaged_in_transit', false],
  ['damaged_by_packing', false],
  ['quality_defect', false],
  ['wrong_item_supplied', false],
  ['short_within_packaging', false],
  ['packaging_not_as_instructed', false],
  ['value_adding_note_not_applied', false],
  ['shelf_life_insufficient', false],
  ['documentation_missing', false],
  ['unfit_other', true],
];

/**
 * `spec.md` AC-14 and AC-15b bound both prose columns at one thousand **characters**. Cyrillic is
 * two bytes per character in UTF-8, so a bound written with `octet_length` would refuse this
 * string at half the stated length — which is exactly what these fixtures detect.
 */
const cyrillicOfLength = (length: number): string => 'я'.repeat(length);

type DeliveryMode = 'via_warehouse' | 'direct_to_customer';

interface Seeded {
  readonly warehouseId: string;
  readonly userId: string;
  readonly itemId: string;
  readonly draftId: string;
  readonly deliveryAddressId: string;
}

interface SeededLine {
  readonly id: string;
  readonly deliveryMode: DeliveryMode;
}

interface LineRow {
  readonly deliveryMode?: DeliveryMode;
  readonly packagingTypeId?: string | null;
  readonly valueAddingNote?: string | null;
  readonly endingQuantity?: number | null;
  readonly conformance?: string | null;
  readonly conformanceNote?: string | null;
}

interface RejectionRow {
  readonly reasonId?: string;
  readonly quantity?: number;
  readonly source?: string;
  readonly description?: string | null;
  readonly disposition?: string | null;
  readonly warehouseId?: string;
  readonly deliveryMode?: DeliveryMode;
}

interface DriverFailure {
  readonly driverError: { readonly code: string };
  readonly message: string;
}

const queryRows = async <TRow>(
  sql: string,
  parameters: unknown[] = [],
): Promise<TRow[]> => {
  const rows: unknown = await dataSource.query(sql, parameters);

  return rows as TRow[];
};

const captureFailure = async (
  attempt: Promise<unknown>,
): Promise<DriverFailure> => {
  const failure: unknown = await attempt.catch((error: unknown) => error);

  expect(failure).toBeInstanceOf(QueryFailedError);

  return failure as QueryFailedError & DriverFailure;
};

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
const seedCustomerAddress = async (
  warehouseId: string,
  userId: string,
): Promise<string> => {
  const customerId = randomUUID();
  const addressId = randomUUID();

  await dataSource.query(
    `INSERT INTO customers
       (id, warehouse_id, name, deactivated_at, recorded_by_user_id, created_at, updated_at)
     VALUES ($1, $2, 'Acme Ltd', NULL, $3, $4, $4)`,
    [customerId, warehouseId, userId, now],
  );
  await dataSource.query(
    `INSERT INTO customer_delivery_addresses
       (id, customer_id, warehouse_id, address_text, access_notes, is_main,
        deactivated_at, created_at, updated_at)
     VALUES ($1, $2, $3, '1 Depot Road, Springfield', NULL, true, NULL, $4, $4)`,
    [addressId, customerId, warehouseId, now],
  );

  return addressId;
};

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
  await dataSource.query(
    `INSERT INTO purchase_drafts
       (id, warehouse_id, state, created_by_user_id, readied_by_user_id, readied_at,
        created_at, updated_at)
     VALUES ($1, $2, 'ready_for_ordering', $3, $3, $4, $4, $4)`,
    [draftId, warehouseId, userId, now],
  );

  return {
    warehouseId,
    userId,
    itemId,
    draftId,
    deliveryAddressId: await seedCustomerAddress(warehouseId, userId),
  };
};

/**
 * A line, optionally with its ending recorded and its Pre-receipt Conformance judged.
 * `ending_kind` follows the Delivery Mode because `chk_purchase_draft_lines_ending_matches_mode`
 * already requires it; the four attribution columns travel together for the same reason.
 */
const insertLine = async (
  seeded: Seeded,
  row: LineRow = {},
): Promise<SeededLine> => {
  const id = randomUUID();
  const deliveryMode = row.deliveryMode ?? 'via_warehouse';
  const direct = deliveryMode === 'direct_to_customer';
  const endingQuantity = row.endingQuantity ?? null;
  const ended = endingQuantity !== null;

  await dataSource.query(
    `INSERT INTO purchase_draft_lines
       (id, purchase_draft_id, warehouse_id, item_id, ordered_quantity,
        packaging_type_id, value_adding_note, delivery_mode,
        customer_delivery_address_id, ending_quantity, ending_kind,
        ending_recorded_by_user_id, ending_recorded_at,
        pre_receipt_conformance, pre_receipt_conformance_note,
        created_at, updated_at)
     VALUES ($1, $2, $3, $4, 100, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $15)`,
    [
      id,
      seeded.draftId,
      seeded.warehouseId,
      seeded.itemId,
      row.packagingTypeId ?? null,
      row.valueAddingNote ?? null,
      deliveryMode,
      direct ? seeded.deliveryAddressId : null,
      endingQuantity,
      ended ? (direct ? 'direct_delivery' : 'arrival') : null,
      ended ? seeded.userId : null,
      ended ? now : null,
      row.conformance ?? null,
      row.conformanceNote ?? null,
      now,
    ],
  );

  return { id, deliveryMode };
};

/**
 * A Rejection defaults to its line's Warehouse and Delivery Mode, and to the Source that mode
 * admits — so a cross-Warehouse or wrong-Source case has to be written deliberately
 * (`data-model.md` § Test fixtures).
 */
const insertRejection = async (
  seeded: Seeded,
  line: SeededLine,
  row: RejectionRow = {},
): Promise<string> => {
  const id = randomUUID();
  const deliveryMode = row.deliveryMode ?? line.deliveryMode;
  const source =
    row.source ??
    (deliveryMode === 'direct_to_customer' ? 'customer_reported' : 'inspected');

  // `disposition` is omitted from the column list unless a case states one — that omission is what
  // exercises the `'undecided'` DEFAULT (AC-19).
  const columns = [
    'id',
    'purchase_draft_line_id',
    'warehouse_id',
    'delivery_mode',
    'rejection_reason_id',
    'quantity',
    'source',
    'description',
    'raised_by_user_id',
    'created_at',
    'updated_at',
  ];
  const values: unknown[] = [
    id,
    line.id,
    row.warehouseId ?? seeded.warehouseId,
    deliveryMode,
    row.reasonId ?? 'damaged_in_transit',
    row.quantity ?? 5,
    source,
    row.description ?? null,
    seeded.userId,
    now,
    now,
  ];

  if (row.disposition !== undefined) {
    columns.push('disposition');
    values.push(row.disposition);
  }

  const placeholders = values.map((_value, index) => `$${index + 1}`);

  await dataSource.query(
    `INSERT INTO purchase_draft_line_rejections (${columns.join(', ')})
     VALUES (${placeholders.join(', ')})`,
    values,
  );

  return id;
};

const describeCatalogue = (): void => {
  describe('the extend-only Rejection Reason catalogue', () => {
    it('holds exactly the ten seeded Reasons, with only "unfit — other" requiring prose', async () => {
      const rows = await queryRows<{
        readonly id: string;
        readonly label: string;
        readonly requires_description: boolean;
      }>('SELECT id, label, requires_description FROM rejection_reasons');

      expect(rows).toHaveLength(expectedRejectionReasons.length);

      for (const [id, requiresDescription] of expectedRejectionReasons) {
        expect(rows).toContainEqual(
          expect.objectContaining({
            id,
            requires_description: requiresDescription,
          }),
        );
      }

      const prose = rows
        .filter((reason) => reason.requires_description)
        .map((reason) => reason.id);
      expect(prose).toEqual(['unfit_other']);
    });

    it('refuses deleting a Reason a Rejection names, and permits deleting an unnamed one', async () => {
      const seeded = await seedWarehouse('catalogue@example.test');
      const line = await insertLine(seeded, { endingQuantity: 40 });
      await insertRejection(seeded, line, { reasonId: 'quality_defect' });

      const failure = await captureFailure(
        dataSource.query(
          `DELETE FROM rejection_reasons WHERE id = 'quality_defect'`,
        ),
      );

      // `23001` is `restrict_violation` — the code `ON DELETE RESTRICT` raises, distinct from the
      // `23503` an insert naming a missing parent raises.
      expect(failure.driverError.code).toEqual('23001');
      expect(failure.message).toContain(
        'fk_purchase_draft_line_rejections_reason',
      );

      await dataSource.query(
        `DELETE FROM rejection_reasons WHERE id = 'documentation_missing'`,
      );
      await dataSource.query(
        `INSERT INTO rejection_reasons (id, label, requires_description, created_at, updated_at)
         VALUES ('documentation_missing', 'Documentation missing', false, $1, $1)`,
        [now],
      );
    });
  });
};

const describeOneRejectionPerReason = (): void => {
  describe('AC-09 — one line carries one Rejection per Reason', () => {
    it('refuses a second Rejection naming a Reason the line already carries', async () => {
      const seeded = await seedWarehouse('ac09@example.test');
      const line = await insertLine(seeded, { endingQuantity: 40 });

      await insertRejection(seeded, line, {
        reasonId: 'damaged_in_transit',
        quantity: 5,
      });

      const failure = await captureFailure(
        insertRejection(seeded, line, {
          reasonId: 'damaged_in_transit',
          quantity: 3,
        }),
      );

      expect(failure.driverError.code).toEqual('23505');
      expect(failure.message).toContain(
        'uq_purchase_draft_line_rejections_line_reason',
      );
    });

    it('accepts two Rejections on one line when they name different Reasons', async () => {
      const seeded = await seedWarehouse('ac09-ok@example.test');
      const line = await insertLine(seeded, { endingQuantity: 40 });

      await insertRejection(seeded, line, { reasonId: 'damaged_in_transit' });
      await insertRejection(seeded, line, { reasonId: 'quality_defect' });

      const rows = await queryRows<{ readonly count: string }>(
        'SELECT COUNT(*)::text AS count FROM purchase_draft_line_rejections WHERE purchase_draft_line_id = $1',
        [line.id],
      );

      expect(rows[0]?.count).toEqual('2');
    });
  });
};

const describeSourceAgreesWithMode = (): void => {
  describe('AC-24 / AC-25 — a Rejection’s Source agrees with its line’s Delivery Mode', () => {
    it('records a customer-reported refusal on a directly delivered line (AC-24)', async () => {
      const seeded = await seedWarehouse('ac24@example.test');
      const line = await insertLine(seeded, {
        deliveryMode: 'direct_to_customer',
        endingQuantity: 40,
      });

      const rejectionId = await insertRejection(seeded, line, {
        source: 'customer_reported',
      });

      const [stored] = await queryRows<Record<string, unknown>>(
        'SELECT * FROM purchase_draft_line_rejections WHERE id = $1',
        [rejectionId],
      );

      expect(stored).toMatchObject({
        source: 'customer_reported',
        delivery_mode: 'direct_to_customer',
        disposition: 'undecided',
      });
    });

    it('refuses a customer-reported refusal on an own-dock line (AC-25)', async () => {
      const seeded = await seedWarehouse('ac25-a@example.test');
      const line = await insertLine(seeded, {
        deliveryMode: 'via_warehouse',
        endingQuantity: 40,
      });

      const failure = await captureFailure(
        insertRejection(seeded, line, { source: 'customer_reported' }),
      );

      expect(failure.driverError.code).toEqual('23514');
      expect(failure.message).toContain(
        'chk_purchase_draft_line_rejections_source_matches_mode',
      );
    });

    it('refuses an inspected refusal on a directly delivered line (AC-25, the other direction)', async () => {
      const seeded = await seedWarehouse('ac25-b@example.test');
      const line = await insertLine(seeded, {
        deliveryMode: 'direct_to_customer',
        endingQuantity: 40,
      });

      const failure = await captureFailure(
        insertRejection(seeded, line, { source: 'inspected' }),
      );

      expect(failure.driverError.code).toEqual('23514');
      expect(failure.message).toContain(
        'chk_purchase_draft_line_rejections_source_matches_mode',
      );
    });

    it('refuses a Rejection claiming a Delivery Mode its line does not carry', async () => {
      const seeded = await seedWarehouse('ac25-fk@example.test');
      const line = await insertLine(seeded, {
        deliveryMode: 'via_warehouse',
        endingQuantity: 40,
      });

      const failure = await captureFailure(
        insertRejection(seeded, line, {
          deliveryMode: 'direct_to_customer',
          source: 'customer_reported',
        }),
      );

      expect(failure.driverError.code).toEqual('23503');
      expect(failure.message).toContain(
        'fk_purchase_draft_line_rejections_line',
      );
    });

    it('refuses a Rejection claiming a Warehouse its line does not belong to', async () => {
      const seeded = await seedWarehouse('ac26-fk@example.test');
      const other = await seedWarehouse('ac26-fk-other@example.test');
      const line = await insertLine(seeded, { endingQuantity: 40 });

      const failure = await captureFailure(
        insertRejection(seeded, line, { warehouseId: other.warehouseId }),
      );

      expect(failure.driverError.code).toEqual('23503');
      expect(failure.message).toContain(
        'fk_purchase_draft_line_rejections_line',
      );
    });
  });
};

const describeRejectionValueDomains = (): void => {
  describe('AC-03 / AC-19 — the refused quantity and the Disposition vocabulary', () => {
    it.each([0, -1])(
      'refuses a refused quantity of %s (AC-03)',
      async (quantity) => {
        const seeded = await seedWarehouse(`ac03-${quantity}@example.test`);
        const line = await insertLine(seeded, { endingQuantity: 40 });

        const failure = await captureFailure(
          insertRejection(seeded, line, { quantity }),
        );

        expect(failure.driverError.code).toEqual('23514');
        expect(failure.message).toContain(
          'chk_purchase_draft_line_rejections_quantity_positive',
        );
      },
    );

    it('refuses a Disposition outside those the system offers (AC-19)', async () => {
      const seeded = await seedWarehouse('ac19@example.test');
      const line = await insertLine(seeded, { endingQuantity: 40 });

      const failure = await captureFailure(
        insertRejection(seeded, line, { disposition: 'returned_to_supplier' }),
      );

      expect(failure.driverError.code).toEqual('23514');
      expect(failure.message).toContain(
        'chk_purchase_draft_line_rejections_disposition',
      );
    });

    it('refuses a Source outside those the system offers (AC-24)', async () => {
      const seeded = await seedWarehouse('ac24-source@example.test');
      const line = await insertLine(seeded, { endingQuantity: 40 });

      const failure = await captureFailure(
        insertRejection(seeded, line, { source: 'guessed' }),
      );

      expect(failure.driverError.code).toEqual('23514');
      expect(failure.message).toContain(
        'chk_purchase_draft_line_rejections_source',
      );
    });
  });
};

const describeProseBounds = (): void => {
  describe('AC-13 / AC-14 / AC-15b — one thousand characters, counted in characters', () => {
    it('records a description of exactly one thousand Cyrillic characters (AC-13, AC-14)', async () => {
      const seeded = await seedWarehouse('ac14-ok@example.test');
      const line = await insertLine(seeded, { endingQuantity: 40 });

      const description = cyrillicOfLength(1000);
      const rejectionId = await insertRejection(seeded, line, { description });

      const stored = (
        await queryRows<{ readonly description: string }>(
          'SELECT description FROM purchase_draft_line_rejections WHERE id = $1',
          [rejectionId],
        )
      ).at(0);

      expect(stored?.description).toEqual(description);
    });

    it('refuses a description of one thousand and one Cyrillic characters (AC-14)', async () => {
      const seeded = await seedWarehouse('ac14-over@example.test');
      const line = await insertLine(seeded, { endingQuantity: 40 });

      const failure = await captureFailure(
        insertRejection(seeded, line, { description: cyrillicOfLength(1001) }),
      );

      expect(failure.driverError.code).toEqual('23514');
      expect(failure.message).toContain(
        'chk_purchase_draft_line_rejections_description_length',
      );
    });

    it('records a conformance note of exactly one thousand Cyrillic characters (AC-15b)', async () => {
      const seeded = await seedWarehouse('ac15b-ok@example.test');
      const note = cyrillicOfLength(1000);

      const line = await insertLine(seeded, {
        packagingTypeId: 'cartons',
        endingQuantity: 40,
        conformance: 'not_met',
        conformanceNote: note,
      });

      const stored = (
        await queryRows<{
          readonly pre_receipt_conformance_note: string;
        }>(
          'SELECT pre_receipt_conformance_note FROM purchase_draft_lines WHERE id = $1',
          [line.id],
        )
      ).at(0);

      expect(stored?.pre_receipt_conformance_note).toEqual(note);
    });

    it('refuses a conformance note of one thousand and one Cyrillic characters (AC-15b)', async () => {
      const seeded = await seedWarehouse('ac15b-over@example.test');

      const failure = await captureFailure(
        insertLine(seeded, {
          packagingTypeId: 'cartons',
          endingQuantity: 40,
          conformance: 'not_met',
          conformanceNote: cyrillicOfLength(1001),
        }),
      );

      expect(failure.driverError.code).toEqual('23514');
      expect(failure.message).toContain(
        'chk_purchase_draft_lines_conformance_note_length',
      );
    });
  });
};

/** AC-17a, whose two halves — a Packaging Type and a Value-adding Note — refuse identically. */
const expectNotApplicableRefused = async (
  seeded: Seeded,
  instruction: LineRow,
): Promise<void> => {
  const failure = await captureFailure(
    insertLine(seeded, {
      ...instruction,
      endingQuantity: 40,
      conformance: 'not_applicable',
    }),
  );

  expect(failure.driverError.code).toEqual('23514');
  expect(failure.message).toContain(
    'chk_purchase_draft_lines_pre_receipt_conformance_instruction',
  );
};

const describeConformanceAgainstInstruction = (): void => {
  describe('AC-17 / AC-17a — the verdict answers the instruction the line was frozen with', () => {
    it('records "not applicable" on a line frozen with neither instruction (AC-17)', async () => {
      const seeded = await seedWarehouse('ac17-ok@example.test');

      const line = await insertLine(seeded, {
        endingQuantity: 40,
        conformance: 'not_applicable',
      });

      const [stored] = await queryRows<Record<string, unknown>>(
        'SELECT pre_receipt_conformance FROM purchase_draft_lines WHERE id = $1',
        [line.id],
      );

      expect(stored).toMatchObject({
        pre_receipt_conformance: 'not_applicable',
      });
    });

    it.each(['met', 'not_met'])(
      'refuses "%s" on a line frozen with no instruction at all (AC-17)',
      async (conformance) => {
        const seeded = await seedWarehouse(`ac17-${conformance}@example.test`);

        const failure = await captureFailure(
          insertLine(seeded, { endingQuantity: 40, conformance }),
        );

        expect(failure.driverError.code).toEqual('23514');
        expect(failure.message).toContain(
          'chk_purchase_draft_lines_pre_receipt_conformance_instruction',
        );
      },
    );

    it('refuses "not applicable" on a line frozen carrying a Packaging Type (AC-17a)', async () => {
      const seeded = await seedWarehouse('ac17a-packaging@example.test');

      await expectNotApplicableRefused(seeded, { packagingTypeId: 'cartons' });
    });

    it('refuses "not applicable" on a line frozen carrying a Value-adding Note (AC-17a)', async () => {
      const seeded = await seedWarehouse('ac17a-note@example.test');

      await expectNotApplicableRefused(seeded, {
        valueAddingNote: 'Label each carton',
      });
    });

    it('refuses a verdict outside the three the column admits', async () => {
      const seeded = await seedWarehouse('ac15-vocab@example.test');

      const failure = await captureFailure(
        insertLine(seeded, {
          packagingTypeId: 'cartons',
          endingQuantity: 40,
          conformance: 'partially_met',
        }),
      );

      expect(failure.driverError.code).toEqual('23514');
      expect(failure.message).toContain(
        'chk_purchase_draft_lines_pre_receipt_conformance',
      );
    });
  });
};

const describeConformanceRequiresEnding = (): void => {
  describe('AC-04a — a judgement exists only where an ending recorded something', () => {
    it('refuses a judgement on a line with no ending', async () => {
      const seeded = await seedWarehouse('ac04a-none@example.test');

      const failure = await captureFailure(
        insertLine(seeded, {
          packagingTypeId: 'cartons',
          endingQuantity: null,
          conformance: 'met',
        }),
      );

      expect(failure.driverError.code).toEqual('23514');
      expect(failure.message).toContain(
        'chk_purchase_draft_lines_conformance_requires_ending',
      );
    });

    it('refuses a judgement on an ending that received nothing', async () => {
      const seeded = await seedWarehouse('ac04a-zero@example.test');

      const failure = await captureFailure(
        insertLine(seeded, {
          packagingTypeId: 'cartons',
          endingQuantity: 0,
          conformance: 'met',
        }),
      );

      expect(failure.driverError.code).toEqual('23514');
      expect(failure.message).toContain(
        'chk_purchase_draft_lines_conformance_requires_ending',
      );
    });

    it('records a nothing-received ending carrying neither judgement', async () => {
      const seeded = await seedWarehouse('ac04a-ok@example.test');

      const line = await insertLine(seeded, { endingQuantity: 0 });

      const [stored] = await queryRows<Record<string, unknown>>(
        `SELECT ending_quantity, pre_receipt_conformance, pre_receipt_conformance_note
         FROM purchase_draft_lines WHERE id = $1`,
        [line.id],
      );

      expect(stored).toMatchObject({
        ending_quantity: 0,
        pre_receipt_conformance: null,
        pre_receipt_conformance_note: null,
      });
    });
  });
};

const describePreReleaseEndings = (): void => {
  describe('endings recorded before this release are untouched by it', () => {
    it('reads NULL in both conformance columns and is refused by no new check', async () => {
      const seeded = await seedWarehouse('pre-release@example.test');

      // The shape of every ending recorded before this migration: a received quantity, a kind and
      // its attribution, and no judgement of any kind (`spec.md` §8, tenth question).
      const line = await insertLine(seeded, { endingQuantity: 100 });

      const [stored] = await queryRows<Record<string, unknown>>(
        `SELECT ending_quantity, ending_kind, pre_receipt_conformance,
                pre_receipt_conformance_note
         FROM purchase_draft_lines WHERE id = $1`,
        [line.id],
      );

      expect(stored).toMatchObject({
        ending_quantity: 100,
        ending_kind: 'arrival',
        pre_receipt_conformance: null,
        pre_receipt_conformance_note: null,
      });

      // Re-validating the row against every new check: an update touching it must not be refused
      // by `…_conformance_requires_ending` or `…_pre_receipt_conformance_instruction`.
      await dataSource.query(
        'UPDATE purchase_draft_lines SET updated_at = $2 WHERE id = $1',
        [line.id, new Date('2026-09-08T09:00:00.000Z')],
      );

      const [after] = await queryRows<Record<string, unknown>>(
        'SELECT pre_receipt_conformance FROM purchase_draft_lines WHERE id = $1',
        [line.id],
      );

      expect(after).toMatchObject({ pre_receipt_conformance: null });
    });

    it('refuses a note standing without a verdict', async () => {
      const seeded = await seedWarehouse('note-shape@example.test');

      const failure = await captureFailure(
        insertLine(seeded, {
          endingQuantity: 100,
          conformanceNote: 'The pallets were shrink-wrapped',
        }),
      );

      expect(failure.driverError.code).toEqual('23514');
      expect(failure.message).toContain(
        'chk_purchase_draft_lines_conformance_note_shape',
      );
    });
  });
};

describe('the arrival-inspection schema', () => {
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

  describeCatalogue();
  describeOneRejectionPerReason();
  describeSourceAgreesWithMode();
  describeRejectionValueDomains();
  describeProseBounds();
  describeConformanceAgainstInstruction();
  describeConformanceRequiresEnding();
  describePreReleaseEndings();
});
