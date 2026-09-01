import { randomUUID } from 'node:crypto';

import dataSource from 'shared/database/data-source';
import { DbTransactionService } from 'shared/database/db-transaction.service';
import { DbTransactionContext } from 'shared/database/db-transaction-context.service';
import { AccountEntity } from 'shared/domain/entities/account.entity';
import { CustomerOrderEntity } from 'shared/domain/entities/customer-order.entity';
import { ItemEntity } from 'shared/domain/entities/item.entity';
import type { PurchaseDraftEntity } from 'shared/domain/entities/purchase-draft.entity';
import { PurchaseDraftEntity as PurchaseDraftEntityClass } from 'shared/domain/entities/purchase-draft.entity';
import type { PurchaseDraftLineEntity } from 'shared/domain/entities/purchase-draft-line.entity';
import type { PurchaseDraftLineLinkEntity } from 'shared/domain/entities/purchase-draft-line-link.entity';
import { UserEntity } from 'shared/domain/entities/user.entity';
import { WarehouseEntity } from 'shared/domain/entities/warehouse.entity';
import { WorkspaceEntity } from 'shared/domain/entities/workspace.entity';
// `PurchaseDraftAssemblyRepository` does not exist yet (T12) — this is the RED for the
// state-guarded assembly write path `data-model.md` "Concurrency, locks and transactions" and
// `sad.md` §6.6 require: every write resolves the draft **only in the `draft` state**
// (`UPDATE … WHERE state = 'draft'`), and zero affected rows is what the caller reads back rather
// than a half-applied change (`ManagerTransferRepository.assignRole`,
// `RoleLifecycleRepository.updateMemberRole` are the established boolean-return precedent for this
// exact shape). AC-10, AC-10a, AC-11a and AC-12 are proven here at the persistence boundary.
import type { AssemblyWriteOutcome } from 'shared/domain/repositories/purchase-draft-assembly.repository';
import { PurchaseDraftAssemblyRepository } from 'shared/domain/repositories/purchase-draft-assembly.repository';
import {
  buildWarehouse,
  buildWorkspace,
} from 'test/factories/entity-factories';

const now = new Date('2026-08-26T10:00:00.000Z');

interface CreateDraftLineLinkInput {
  readonly id: string;
  readonly customerOrderId: string;
  readonly statedQuantity: number;
}

interface CreateDraftLineInput {
  readonly id: string;
  readonly itemId: string;
  readonly orderedQuantity: number;
  readonly packagingTypeId?: string | null;
  readonly valueAddingNote?: string | null;
  readonly links?: readonly CreateDraftLineLinkInput[];
}

interface CreateDraftPersistenceInput {
  readonly id: string;
  readonly warehouseId: string;
  readonly expectedArrivalDate: string | null;
  readonly createdByUserId: string;
  readonly createdAt: Date;
  readonly lines: readonly CreateDraftLineInput[];
}

interface AddLineInput {
  readonly id: string;
  readonly purchaseDraftId: string;
  readonly warehouseId: string;
  readonly itemId: string;
  readonly orderedQuantity: number;
  readonly packagingTypeId?: string | null;
  readonly valueAddingNote?: string | null;
}

interface UpdateLineInput {
  readonly itemId?: string;
  readonly orderedQuantity?: number;
  readonly packagingTypeId?: string | null;
  readonly valueAddingNote?: string | null;
}

interface AddLinkInput {
  readonly id: string;
  readonly purchaseDraftLineId: string;
  readonly purchaseDraftId: string;
  readonly warehouseId: string;
  readonly customerOrderId: string;
  readonly statedQuantity: number;
}

// The shape this RED step expects the implementer to expose (tasks/purchase-draft-assembly.md
// "What"; data-model.md "Repository boundaries"). Every guarded write reports **which** of the two
// preconditions failed rather than a bare boolean — the draft is no longer in the `draft` state, or
// the line/link named is not one of that draft's — because openapi.yaml gives these routes both a
// 409 and a 404 and the service cannot pick between them from a `false`. The repository still never
// throws; the typed refusal is the service's job (server-error-handling.md §3).
/** Every draft-scoped write names the acting Warehouse beside the draft, because that pair — not
 * the id alone — is what the guard's `WHERE` clause resolves (AC-11, spec.md §6.1). */
interface WriteScope {
  readonly purchaseDraftId: string;
  readonly warehouseId: string;
}

interface UpdateDraftInput {
  readonly expectedArrivalDate?: string | null;
}

interface PurchaseDraftAssemblyRepositoryContract {
  createDraft(input: CreateDraftPersistenceInput): Promise<PurchaseDraftEntity>;
  updateDraft(
    scope: WriteScope,
    changes: UpdateDraftInput,
  ): Promise<AssemblyWriteOutcome>;
  addLine(input: AddLineInput): Promise<AssemblyWriteOutcome>;
  updateLine(
    scope: WriteScope,
    lineId: string,
    changes: UpdateLineInput,
  ): Promise<AssemblyWriteOutcome>;
  removeLine(scope: WriteScope, lineId: string): Promise<AssemblyWriteOutcome>;
  addLink(input: AddLinkInput): Promise<AssemblyWriteOutcome>;
  updateLink(
    scope: WriteScope,
    linkId: string,
    statedQuantity: number,
  ): Promise<AssemblyWriteOutcome>;
  removeLink(scope: WriteScope, linkId: string): Promise<AssemblyWriteOutcome>;
  findLines(purchaseDraftId: string): Promise<PurchaseDraftLineEntity[]>;
  findLinks(
    purchaseDraftLineId: string,
  ): Promise<PurchaseDraftLineLinkEntity[]>;
}

const repository = new PurchaseDraftAssemblyRepository(
  dataSource,
) as unknown as PurchaseDraftAssemblyRepositoryContract;

const context = new DbTransactionContext(dataSource);
const transactions = new DbTransactionService(dataSource, context);

// `accounts.user_id` / `users.account_id` form a deferred circular FK pair
// (`DEFERRABLE INITIALLY DEFERRED`), so both inserts must land inside the same transaction — the
// identical pattern every other integration spec under this directory uses.
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

interface Seeded {
  readonly warehouseId: string;
  readonly userId: string;
  readonly itemId: string;
}

const seedWarehouse = async (): Promise<Seeded> => {
  const workspace = buildWorkspace();
  await dataSource.manager.getRepository(WorkspaceEntity).insert(workspace);
  const warehouse = buildWarehouse({ workspaceId: workspace.id! });
  await dataSource.manager.getRepository(WarehouseEntity).insert(warehouse);
  const userId = await seedUser(workspace.id!);

  const itemId = randomUUID();
  await dataSource.manager.getRepository(ItemEntity).insert({
    id: itemId,
    warehouseId: warehouse.id!,
    sku: `SKU-${itemId}`,
    description: 'Cable reel, 50m',
    unitOfMeasure: 'each',
    onHandQuantity: 0,
    deactivatedAt: null,
    createdAt: now,
    updatedAt: now,
  });

  return { warehouseId: warehouse.id!, userId, itemId };
};

const seedCustomerOrder = async (
  seeded: Seeded,
  overrides: Partial<CustomerOrderEntity> = {},
): Promise<string> => {
  const id = randomUUID();
  await dataSource.manager.getRepository(CustomerOrderEntity).insert({
    id,
    warehouseId: seeded.warehouseId,
    itemId: seeded.itemId,
    customerName: 'Test Customer North',
    quantity: 100,
    outstandingQuantity: 100,
    neededBy: '2099-01-01',
    state: 'unfulfilled',
    cancellationReason: null,
    recordedByUserId: seeded.userId,
    cancelledByUserId: null,
    cancelledAt: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  });
  return id;
};

// Seeds a draft directly at a chosen state, bypassing the assembly write path entirely — this is
// what proves the guard lives in the write's own `WHERE` clause rather than in a read-then-write
// check the test could otherwise not distinguish from the real thing.
const seedDraft = async (
  seeded: Seeded,
  state: PurchaseDraftEntity['state'] = 'draft',
): Promise<string> => {
  const id = randomUUID();
  const readied = state !== 'draft' && state !== 'discarded';
  await dataSource.manager.getRepository(PurchaseDraftEntityClass).insert({
    id,
    warehouseId: seeded.warehouseId,
    state,
    expectedArrivalDate: null,
    createdByUserId: seeded.userId,
    readiedByUserId: readied ? seeded.userId : null,
    readiedAt: readied ? now : null,
    closedByUserId: state === 'closed' ? seeded.userId : null,
    closedAt: state === 'closed' ? now : null,
    closureReason: state === 'closed' ? 'Supplier could not fulfil it' : null,
    arrivalConfirmedByUserId: null,
    arrivalConfirmedAt: null,
    discardedByUserId: state === 'discarded' ? seeded.userId : null,
    discardedAt: state === 'discarded' ? now : null,
    createdAt: now,
    updatedAt: now,
  });
  return id;
};

// The pair every draft-scoped write resolves on: the draft, and the Warehouse allowed to write it.
const scope = (seeded: Seeded, purchaseDraftId: string): WriteScope => ({
  purchaseDraftId,
  warehouseId: seeded.warehouseId,
});

const readDraft = (id: string): Promise<PurchaseDraftEntity | null> =>
  dataSource.manager.getRepository(PurchaseDraftEntityClass).findOneBy({ id });

// eslint-disable-next-line max-lines-per-function -- integration suite setup is inherently long
describe('PurchaseDraftAssemblyRepository', () => {
  beforeAll(async () => {
    await dataSource.initialize();
  });

  afterEach(async () => {
    await dataSource.query(
      'TRUNCATE arrival_allocations, purchase_draft_demand_snapshots, purchase_draft_line_links, purchase_draft_lines, purchase_drafts, item_stock_adjustments, customer_orders, items, warehouse_memberships, roles, warehouses, workspaces, sessions, users, accounts CASCADE',
    );
  });

  afterAll(async () => {
    await dataSource.destroy();
  });

  // AC-10 — the draft is recorded in the Draft state with each line, each link and its stated
  // quantity, plus the acting member and when, and an Expected Arrival Date may legitimately be
  // left unstated because the member has not yet spoken to the supplier.
  it('records a draft in the Draft state with its lines, links and no Expected Arrival Date', async () => {
    const seeded = await seedWarehouse();
    const customerOrderId = await seedCustomerOrder(seeded);
    const draftId = randomUUID();
    const lineId = randomUUID();
    const linkId = randomUUID();

    const created = await transactions.executeInTransaction({}, () =>
      repository.createDraft({
        id: draftId,
        warehouseId: seeded.warehouseId,
        expectedArrivalDate: null,
        createdByUserId: seeded.userId,
        createdAt: now,
        lines: [
          {
            id: lineId,
            itemId: seeded.itemId,
            orderedQuantity: 150,
            packagingTypeId: null,
            valueAddingNote: null,
            links: [{ id: linkId, customerOrderId, statedQuantity: 100 }],
          },
        ],
      }),
    );

    expect(created).toMatchObject({
      id: draftId,
      state: 'draft',
      expectedArrivalDate: null,
      createdByUserId: seeded.userId,
    });
    expect(await readDraft(draftId)).toMatchObject({ state: 'draft' });

    const lines = await repository.findLines(draftId);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({
      id: lineId,
      itemId: seeded.itemId,
      orderedQuantity: 150,
    });

    const links = await repository.findLinks(lineId);
    expect(links).toHaveLength(1);
    expect(links[0]).toMatchObject({ customerOrderId, statedQuantity: 100 });
  });

  // The distinction the outcome type exists for: on a draft that IS mutable, naming a line or link
  // that is not one of that draft's is `target-missing`, not `draft-frozen`. openapi.yaml maps the
  // first to 404 `PurchaseDraftTargetUnavailable` and the second to 409 `PurchaseDraftWriteConflict`,
  // so collapsing them would answer "this draft is frozen" for a draft the member can still edit.
  it('separates an unknown line or link from a frozen draft on a mutable draft', async () => {
    const seeded = await seedWarehouse();
    const draftId = await seedDraft(seeded, 'draft');
    const strangerLineId = randomUUID();
    const strangerLinkId = randomUUID();

    const updatedLine = await transactions.executeInTransaction({}, () =>
      repository.updateLine(scope(seeded, draftId), strangerLineId, {
        orderedQuantity: 60,
      }),
    );
    expect(updatedLine).toBe('target-missing');

    const removedLine = await transactions.executeInTransaction({}, () =>
      repository.removeLine(scope(seeded, draftId), strangerLineId),
    );
    expect(removedLine).toBe('target-missing');

    const updatedLink = await transactions.executeInTransaction({}, () =>
      repository.updateLink(scope(seeded, draftId), strangerLinkId, 45),
    );
    expect(updatedLink).toBe('target-missing');

    const removedLink = await transactions.executeInTransaction({}, () =>
      repository.removeLink(scope(seeded, draftId), strangerLinkId),
    );
    expect(removedLink).toBe('target-missing');

    // The draft stayed mutable throughout — which is exactly what makes 'target-missing' the
    // truthful answer rather than 'draft-frozen'.
    expect(await readDraft(draftId)).toMatchObject({ state: 'draft' });
  });

  // `addLink` is the one write whose target line is named by the caller and reaches the INSERT as
  // part of `fk_purchase_draft_line_links_line`'s composite reference. Without a predicate of its
  // own, a line that is not this draft's raised a `QueryFailedError` the global filter could only
  // map to 500 `system.internal_error` — where openapi.yaml declares 404
  // `PurchaseDraftTargetUnavailable`, with an `unknownLine` example written for exactly this case.
  it('reports a line of another draft as target-missing on addLink, never as a failed query', async () => {
    const seeded = await seedWarehouse();
    const customerOrderId = await seedCustomerOrder(seeded);
    const draftId = await seedDraft(seeded, 'draft');
    const otherDraftId = await seedDraft(seeded, 'draft');
    const lineOfTheOtherDraft = randomUUID();

    await transactions.executeInTransaction({}, () =>
      repository.addLine({
        id: lineOfTheOtherDraft,
        purchaseDraftId: otherDraftId,
        warehouseId: seeded.warehouseId,
        itemId: seeded.itemId,
        orderedQuantity: 40,
      }),
    );

    // A line of a sibling draft in the very same Warehouse, and a line id that names nothing at
    // all, are one outcome: the route must not disclose that the line exists elsewhere.
    const ofAnotherDraft = await transactions.executeInTransaction({}, () =>
      repository.addLink({
        id: randomUUID(),
        purchaseDraftLineId: lineOfTheOtherDraft,
        purchaseDraftId: draftId,
        warehouseId: seeded.warehouseId,
        customerOrderId,
        statedQuantity: 10,
      }),
    );
    expect(ofAnotherDraft).toBe('target-missing');

    const ofNoDraft = await transactions.executeInTransaction({}, () =>
      repository.addLink({
        id: randomUUID(),
        purchaseDraftLineId: randomUUID(),
        purchaseDraftId: draftId,
        warehouseId: seeded.warehouseId,
        customerOrderId,
        statedQuantity: 10,
      }),
    );
    expect(ofNoDraft).toBe('target-missing');

    // Nothing was written to either draft, and the sibling's line is untouched.
    expect(await repository.findLinks(lineOfTheOtherDraft)).toEqual([]);
    expect(await readDraft(draftId)).toMatchObject({ state: 'draft' });
  });

  // AC-10a — the draft is assembled over the course of deciding: every one of add/change/remove a
  // line and add/change/remove a link succeeds against a Draft-state draft and leaves it in Draft.
  it('accepts every kind of revision against a Draft-state draft and stays in Draft', async () => {
    const seeded = await seedWarehouse();
    const customerOrderId = await seedCustomerOrder(seeded);
    const draftId = await seedDraft(seeded, 'draft');
    const lineId = randomUUID();
    const linkId = randomUUID();

    const added = await transactions.executeInTransaction({}, () =>
      repository.addLine({
        id: lineId,
        purchaseDraftId: draftId,
        warehouseId: seeded.warehouseId,
        itemId: seeded.itemId,
        orderedQuantity: 40,
      }),
    );
    expect(added).toBe('applied');

    const updated = await transactions.executeInTransaction({}, () =>
      repository.updateLine(scope(seeded, draftId), lineId, {
        orderedQuantity: 60,
      }),
    );
    expect(updated).toBe('applied');

    const linked = await transactions.executeInTransaction({}, () =>
      repository.addLink({
        id: linkId,
        purchaseDraftLineId: lineId,
        purchaseDraftId: draftId,
        warehouseId: seeded.warehouseId,
        customerOrderId,
        statedQuantity: 30,
      }),
    );
    expect(linked).toBe('applied');

    const relinked = await transactions.executeInTransaction({}, () =>
      repository.updateLink(scope(seeded, draftId), linkId, 45),
    );
    expect(relinked).toBe('applied');

    const unlinked = await transactions.executeInTransaction({}, () =>
      repository.removeLink(scope(seeded, draftId), linkId),
    );
    expect(unlinked).toBe('applied');

    const removed = await transactions.executeInTransaction({}, () =>
      repository.removeLine(scope(seeded, draftId), lineId),
    );
    expect(removed).toBe('applied');

    // Every write above resolved and applied; the draft itself was never touched by any of them.
    expect(await readDraft(draftId)).toMatchObject({ state: 'draft' });
  });

  // The state guard is a property of the write's own `WHERE` clause: every assembly write against
  // a draft that no longer resolves in the `draft` state affects zero rows, rather than half
  // applying the change or requiring a separate read to notice.
  describe.each<[PurchaseDraftEntity['state'], string]>([
    ['ready_for_ordering', 'a draft frozen at Ready for Ordering'],
    ['closed', 'a Closed draft'],
    ['discarded', 'a discarded draft'],
  ])('against %s (%s)', (state) => {
    it('affects zero rows for addLine and leaves the draft unchanged', async () => {
      const seeded = await seedWarehouse();
      const draftId = await seedDraft(seeded, state);
      const before = await readDraft(draftId);

      const applied = await transactions.executeInTransaction({}, () =>
        repository.addLine({
          id: randomUUID(),
          purchaseDraftId: draftId,
          warehouseId: seeded.warehouseId,
          itemId: seeded.itemId,
          orderedQuantity: 10,
        }),
      );

      expect(applied).toBe('draft-frozen');
      expect(await repository.findLines(draftId)).toHaveLength(0);
      expect(await readDraft(draftId)).toEqual(before);
    });

    it('affects zero rows for updateLine, removeLine, addLink, updateLink and removeLink', async () => {
      const seeded = await seedWarehouse();
      const customerOrderId = await seedCustomerOrder(seeded);
      // A line and a link are seeded directly (not through the guarded write path) so each write
      // under test has a real row to resolve — and fails to.
      const draftId = await seedDraft(seeded, state);
      const lineId = randomUUID();
      const linkId = randomUUID();
      await dataSource.manager.query(
        `INSERT INTO purchase_draft_lines
           (id, purchase_draft_id, warehouse_id, item_id, ordered_quantity, packaging_type_id, value_adding_note, received_quantity, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, NULL, NULL, NULL, $6, $6)`,
        [lineId, draftId, seeded.warehouseId, seeded.itemId, 20, now],
      );
      await dataSource.manager.query(
        `INSERT INTO purchase_draft_line_links
           (id, purchase_draft_line_id, purchase_draft_id, warehouse_id, customer_order_id, stated_quantity, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $7)`,
        [linkId, lineId, draftId, seeded.warehouseId, customerOrderId, 20, now],
      );

      const updateLineApplied = await transactions.executeInTransaction(
        {},
        () =>
          repository.updateLine(scope(seeded, draftId), lineId, {
            orderedQuantity: 99,
          }),
      );
      const addLinkApplied = await transactions.executeInTransaction({}, () =>
        repository.addLink({
          id: randomUUID(),
          purchaseDraftLineId: lineId,
          purchaseDraftId: draftId,
          warehouseId: seeded.warehouseId,
          customerOrderId,
          statedQuantity: 5,
        }),
      );
      const updateLinkApplied = await transactions.executeInTransaction(
        {},
        () => repository.updateLink(scope(seeded, draftId), linkId, 99),
      );
      const removeLinkApplied = await transactions.executeInTransaction(
        {},
        () => repository.removeLink(scope(seeded, draftId), linkId),
      );
      const removeLineApplied = await transactions.executeInTransaction(
        {},
        () => repository.removeLine(scope(seeded, draftId), lineId),
      );

      expect(updateLineApplied).toBe('draft-frozen');
      expect(addLinkApplied).toBe('draft-frozen');
      expect(updateLinkApplied).toBe('draft-frozen');
      expect(removeLinkApplied).toBe('draft-frozen');
      expect(removeLineApplied).toBe('draft-frozen');

      // Nothing about the line or the link moved: not the quantity a rejected `updateLine` or
      // `updateLink` would have set, not a second link a rejected `addLink` would have added, and
      // the row a rejected `removeLine`/`removeLink` would have deleted is still there.
      const lines = await repository.findLines(draftId);
      expect(lines).toHaveLength(1);
      expect(lines[0]).toMatchObject({ id: lineId, orderedQuantity: 20 });
      const links = await repository.findLinks(lineId);
      expect(links).toHaveLength(1);
      expect(links[0]).toMatchObject({ id: linkId, statedQuantity: 20 });
    });
  });

  // AC-11a — a second line linking to a Customer Order another line already links to, and links
  // whose quantities do not add up to the line quantity, are both recorded unadjusted. Nothing here
  // reconciles a link's stated quantity against the line, the Customer Order or any other link.
  it('records overlapping and non-summing link quantities unadjusted', async () => {
    const seeded = await seedWarehouse();
    const customerOrderId = await seedCustomerOrder(seeded, {
      quantity: 200,
      outstandingQuantity: 200,
    });
    const draftId = await seedDraft(seeded, 'draft');

    const firstLineId = randomUUID();
    const secondLineId = randomUUID();
    await transactions.executeInTransaction({}, () =>
      repository.addLine({
        id: firstLineId,
        purchaseDraftId: draftId,
        warehouseId: seeded.warehouseId,
        itemId: seeded.itemId,
        orderedQuantity: 50,
      }),
    );
    await transactions.executeInTransaction({}, () =>
      repository.addLine({
        id: secondLineId,
        purchaseDraftId: draftId,
        warehouseId: seeded.warehouseId,
        itemId: seeded.itemId,
        orderedQuantity: 50,
      }),
    );

    // Two different lines link to the very same Customer Order.
    const firstLinkId = randomUUID();
    const secondLinkId = randomUUID();
    const firstLinked = await transactions.executeInTransaction({}, () =>
      repository.addLink({
        id: firstLinkId,
        purchaseDraftLineId: firstLineId,
        purchaseDraftId: draftId,
        warehouseId: seeded.warehouseId,
        customerOrderId,
        statedQuantity: 500, // far more than the line's own 50
      }),
    );
    const secondLinked = await transactions.executeInTransaction({}, () =>
      repository.addLink({
        id: secondLinkId,
        purchaseDraftLineId: secondLineId,
        purchaseDraftId: draftId,
        warehouseId: seeded.warehouseId,
        customerOrderId,
        statedQuantity: 1, // far less than the line's own 50
      }),
    );

    expect(firstLinked).toBe('applied');
    expect(secondLinked).toBe('applied');

    const firstLinks = await repository.findLinks(firstLineId);
    expect(firstLinks).toHaveLength(1);
    expect(firstLinks[0]).toMatchObject({ statedQuantity: 500 });

    const secondLinks = await repository.findLinks(secondLineId);
    expect(secondLinks).toHaveLength(1);
    expect(secondLinks[0]).toMatchObject({ statedQuantity: 1 });
  });

  // AC-12 — each line's Packaging Type and Value-adding Note are recorded separately from every
  // other line's.
  it('records each line’s Pre-receipt Requirement independently of the others', async () => {
    const seeded = await seedWarehouse();
    const draftId = await seedDraft(seeded, 'draft');
    const firstLineId = randomUUID();
    const secondLineId = randomUUID();

    await transactions.executeInTransaction({}, () =>
      repository.addLine({
        id: firstLineId,
        purchaseDraftId: draftId,
        warehouseId: seeded.warehouseId,
        itemId: seeded.itemId,
        orderedQuantity: 40,
        packagingTypeId: 'cartons',
        valueAddingNote: 'Bundle in tens',
      }),
    );
    await transactions.executeInTransaction({}, () =>
      repository.addLine({
        id: secondLineId,
        purchaseDraftId: draftId,
        warehouseId: seeded.warehouseId,
        itemId: seeded.itemId,
        orderedQuantity: 150,
        packagingTypeId: 'cable_coil',
        valueAddingNote: 'Translated sticker on each coil',
      }),
    );

    const lines = await repository.findLines(draftId);
    const first = lines.find((line) => line.id === firstLineId);
    const second = lines.find((line) => line.id === secondLineId);

    expect(first).toMatchObject({
      packagingTypeId: 'cartons',
      valueAddingNote: 'Bundle in tens',
    });
    expect(second).toMatchObject({
      packagingTypeId: 'cable_coil',
      valueAddingNote: 'Translated sticker on each coil',
    });
  });

  // AC-11 — the composite FK `(item_id, warehouse_id)` referencing `items(id, warehouse_id)` is
  // what makes "a line names an Item of the draft's own Warehouse" a reference the database will
  // not let you break, rather than a check application code must remember.
  it('refuses to add a line naming an Item of a different Warehouse', async () => {
    const seeded = await seedWarehouse();
    const otherWarehouse = await seedWarehouse();
    const draftId = await seedDraft(seeded, 'draft');

    const attempt = transactions.executeInTransaction({}, () =>
      repository.addLine({
        id: randomUUID(),
        purchaseDraftId: draftId,
        warehouseId: seeded.warehouseId,
        itemId: otherWarehouse.itemId,
        orderedQuantity: 10,
      }),
    );

    await expect(attempt).rejects.toBeDefined();
    expect(await repository.findLines(draftId)).toHaveLength(0);
  });

  // AC-11 — the composite FK `(customer_order_id, warehouse_id)` referencing
  // `customer_orders(id, warehouse_id)` is the same reference-level guarantee for a link.
  it('refuses to link a line to a Customer Order of a different Warehouse', async () => {
    const seeded = await seedWarehouse();
    const otherWarehouse = await seedWarehouse();
    const otherCustomerOrderId = await seedCustomerOrder(otherWarehouse);
    const draftId = await seedDraft(seeded, 'draft');
    const lineId = randomUUID();
    await transactions.executeInTransaction({}, () =>
      repository.addLine({
        id: lineId,
        purchaseDraftId: draftId,
        warehouseId: seeded.warehouseId,
        itemId: seeded.itemId,
        orderedQuantity: 10,
      }),
    );

    const attempt = transactions.executeInTransaction({}, () =>
      repository.addLink({
        id: randomUUID(),
        purchaseDraftLineId: lineId,
        purchaseDraftId: draftId,
        warehouseId: seeded.warehouseId,
        customerOrderId: otherCustomerOrderId,
        statedQuantity: 5,
      }),
    );

    await expect(attempt).rejects.toBeDefined();
    expect(await repository.findLinks(lineId)).toHaveLength(0);
  });
  // AC-11/spec.md §6.1 — the security half of the guard, at the boundary that enforces it. A member
  // acting in one Warehouse who knows a draft id from another must not be able to write it, and the
  // `warehouse_id` predicate that stops them lives in each write's own `WHERE` clause rather than in
  // a check above it — so a draft that changes hands or state between a check and the write cannot
  // slip through. Every one of these must read `target-missing`, never `draft-frozen`: a foreign
  // draft has to be indistinguishable from one that does not exist, or the refusal itself
  // enumerates what other Warehouses hold.
  describe('against a Draft-state draft of another Warehouse', () => {
    it('refuses every draft-scoped write as target-missing and changes nothing', async () => {
      const attacker = await seedWarehouse();
      const victim = await seedWarehouse();
      const victimOrderId = await seedCustomerOrder(victim);
      const draftId = await seedDraft(victim, 'draft');
      const lineId = randomUUID();
      const linkId = randomUUID();
      await dataSource.manager.query(
        `INSERT INTO purchase_draft_lines
           (id, purchase_draft_id, warehouse_id, item_id, ordered_quantity, packaging_type_id, value_adding_note, received_quantity, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, NULL, NULL, NULL, $6, $6)`,
        [lineId, draftId, victim.warehouseId, victim.itemId, 20, now],
      );
      await dataSource.manager.query(
        `INSERT INTO purchase_draft_line_links
           (id, purchase_draft_line_id, purchase_draft_id, warehouse_id, customer_order_id, stated_quantity, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $7)`,
        [linkId, lineId, draftId, victim.warehouseId, victimOrderId, 20, now],
      );
      const before = await readDraft(draftId);

      const revised = await transactions.executeInTransaction({}, () =>
        repository.updateDraft(scope(attacker, draftId), {
          expectedArrivalDate: '2026-09-30',
        }),
      );
      const lineAdded = await transactions.executeInTransaction({}, () =>
        repository.addLine({
          id: randomUUID(),
          purchaseDraftId: draftId,
          warehouseId: attacker.warehouseId,
          itemId: attacker.itemId,
          orderedQuantity: 10,
        }),
      );
      const lineUpdated = await transactions.executeInTransaction({}, () =>
        repository.updateLine(scope(attacker, draftId), lineId, {
          orderedQuantity: 99,
        }),
      );
      const linkAdded = await transactions.executeInTransaction({}, () =>
        repository.addLink({
          id: randomUUID(),
          purchaseDraftLineId: lineId,
          purchaseDraftId: draftId,
          warehouseId: attacker.warehouseId,
          customerOrderId: victimOrderId,
          statedQuantity: 5,
        }),
      );
      const linkUpdated = await transactions.executeInTransaction({}, () =>
        repository.updateLink(scope(attacker, draftId), linkId, 99),
      );
      const linkRemoved = await transactions.executeInTransaction({}, () =>
        repository.removeLink(scope(attacker, draftId), linkId),
      );
      const lineRemoved = await transactions.executeInTransaction({}, () =>
        repository.removeLine(scope(attacker, draftId), lineId),
      );

      expect(revised).toBe('target-missing');
      expect(lineAdded).toBe('target-missing');
      expect(lineUpdated).toBe('target-missing');
      expect(linkAdded).toBe('target-missing');
      expect(linkUpdated).toBe('target-missing');
      expect(linkRemoved).toBe('target-missing');
      expect(lineRemoved).toBe('target-missing');

      // Not the Expected Arrival Date a rejected `updateDraft` would have moved, not `updated_at`,
      // not the line or link quantities, and nothing added or deleted.
      expect(await readDraft(draftId)).toEqual(before);
      const lines = await repository.findLines(draftId);
      expect(lines).toHaveLength(1);
      expect(lines[0]).toMatchObject({ id: lineId, orderedQuantity: 20 });
      const links = await repository.findLinks(lineId);
      expect(links).toHaveLength(1);
      expect(links[0]).toMatchObject({ id: linkId, statedQuantity: 20 });
    });
  });
});
