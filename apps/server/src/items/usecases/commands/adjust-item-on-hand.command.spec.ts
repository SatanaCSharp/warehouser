// AC-08/AC-09/AC-09a, and the non-enumerating Item resolution AC-03 fixes for every operation that
// names an Item. The rules live in the command itself — the use case is the application boundary
// *and* the rule owner, with no pass-through service between it and the repositories
// (server-architecture.md §Use cases). Proven against controlled repository doubles per
// server-architecture.md §Testing, so no database is involved: the point of these cases is that
// **nothing is written at all**.
import { ErrorCode } from '@warehouser/shared-types/enums';
import { ApplicationError } from '@warehouser/shared-types/errors';
import { AdjustItemOnHandCommand } from 'items/usecases/commands/adjust-item-on-hand.command';
import type { AccessCurrentUser } from 'shared/access/access-current-user';

const uuid = (suffix: string): string =>
  `00000000-0000-4000-8000-${suffix.padStart(12, '0')}`;

const warehouseId = uuid('1');
const otherWarehouseId = uuid('2');
const actorId = uuid('3');
const itemId = uuid('101');
const adjustmentId = uuid('110');
const adjustedAt = new Date('2026-08-26T09:45:00.000Z');

const currentUser: AccessCurrentUser = {
  userId: actorId,
  warehouseId,
  roleId: uuid('4'),
  roleKind: 'custom',
  permissionId: 'ITEM_STOCK:ADJUST',
  archived: false,
};

// Resolves the Item only for the Warehouse it actually belongs to, so a foreign-Warehouse target
// reaches the command exactly as a missing one does (AC-03).
const itemCatalogueRepositoryDouble = (
  item: {
    id: string;
    warehouseId: string;
    deactivatedAt: Date | null;
  } | null = { id: itemId, warehouseId, deactivatedAt: null },
) => ({
  findById: jest.fn().mockResolvedValue(item),
});

const itemStockAdjustmentRepositoryDouble = () => ({
  recordAdjustment: jest.fn().mockResolvedValue(undefined),
});

const commandWith = (
  itemCatalogueRepository: ReturnType<typeof itemCatalogueRepositoryDouble>,
  itemStockAdjustmentRepository: ReturnType<
    typeof itemStockAdjustmentRepositoryDouble
  >,
): AdjustItemOnHandCommand =>
  new AdjustItemOnHandCommand(
    itemCatalogueRepository as never,
    itemStockAdjustmentRepository as never,
    { adjustmentId: () => adjustmentId, now: () => adjustedAt },
  );

describe('AdjustItemOnHandCommand', () => {
  // AC-09 — a negative or fractional count is refused in plain language, and nothing is written.
  it.each([-1, -12, 0.5, 12.5])(
    'refuses the count %p and writes nothing',
    async (countedQuantity) => {
      const itemCatalogueRepository = itemCatalogueRepositoryDouble();
      const itemStockAdjustmentRepository =
        itemStockAdjustmentRepositoryDouble();

      const rejection = commandWith(
        itemCatalogueRepository,
        itemStockAdjustmentRepository,
      ).execute(currentUser, itemId, {
        countedQuantity,
        reason: 'Counted after the cancelled collection',
      });

      await expect(rejection).rejects.toBeInstanceOf(ApplicationError);
      await expect(rejection).rejects.toMatchObject({
        code: ErrorCode.ITEMS_INVALID_ON_HAND_QUANTITY,
        details: { field: 'countedQuantity', rule: 'non_negative_integer' },
      });
      expect(
        itemStockAdjustmentRepository.recordAdjustment,
      ).not.toHaveBeenCalled();
    },
  );

  // AC-09a — an adjustment without a stated reason is refused, and nothing is written. Whitespace
  // is not a reason: `chk_item_stock_adjustments_reason_stored_trimmed` would refuse it anyway,
  // but the member must be told in plain language rather than met with a constraint violation.
  it.each(['', '   ', '\t\n'])(
    'refuses the blank reason %p and writes nothing',
    async (reason) => {
      const itemCatalogueRepository = itemCatalogueRepositoryDouble();
      const itemStockAdjustmentRepository =
        itemStockAdjustmentRepositoryDouble();

      const rejection = commandWith(
        itemCatalogueRepository,
        itemStockAdjustmentRepository,
      ).execute(currentUser, itemId, { countedQuantity: 12, reason });

      await expect(rejection).rejects.toMatchObject({
        code: ErrorCode.ITEMS_ADJUSTMENT_REASON_REQUIRED,
        details: { field: 'reason' },
      });
      expect(
        itemStockAdjustmentRepository.recordAdjustment,
      ).not.toHaveBeenCalled();
    },
  );

  // AC-09/AC-09a — both refusals are decided before any persistence is consulted, so "changes
  // nothing" is a property of the flow and not of a rollback.
  it('refuses an invalid figure without even resolving the Item', async () => {
    const itemCatalogueRepository = itemCatalogueRepositoryDouble();
    const itemStockAdjustmentRepository = itemStockAdjustmentRepositoryDouble();

    await expect(
      commandWith(
        itemCatalogueRepository,
        itemStockAdjustmentRepository,
      ).execute(currentUser, itemId, {
        countedQuantity: -1,
        reason: 'Counted',
      }),
    ).rejects.toBeInstanceOf(ApplicationError);

    expect(itemCatalogueRepository.findById).not.toHaveBeenCalled();
  });

  // AC-03 — an Item of another Warehouse is refused **identically** to a missing one: the same
  // code, and no `details` that could disclose that it exists elsewhere.
  it.each([
    [
      'an Item of another Warehouse',
      { id: itemId, warehouseId: otherWarehouseId, deactivatedAt: null },
    ],
    ['a missing Item', null],
  ])('refuses %s, disclosing nothing', async (_case, item) => {
    const itemCatalogueRepository = itemCatalogueRepositoryDouble(item);
    const itemStockAdjustmentRepository = itemStockAdjustmentRepositoryDouble();

    const rejection = commandWith(
      itemCatalogueRepository,
      itemStockAdjustmentRepository,
    ).execute(currentUser, itemId, { countedQuantity: 12, reason: 'Counted' });

    await expect(rejection).rejects.toMatchObject({
      code: ErrorCode.ITEMS_TARGET_UNAVAILABLE,
    });
    await expect(rejection).rejects.toHaveProperty('details', undefined);
    expect(
      itemStockAdjustmentRepository.recordAdjustment,
    ).not.toHaveBeenCalled();
  });

  // AC-08 — the accepted adjustment carries the count, the reason, the acting member and the time,
  // and it reaches persistence as ONE call: the Item's figure and the history row are the
  // repository's single cohesive operation, never two writes the command coordinates (sad.md §6.3,
  // creating-a-server-repository.md "Prefer one cohesive write method").
  it('records the count, the reason, the acting member and the time in one repository call', async () => {
    const itemCatalogueRepository = itemCatalogueRepositoryDouble();
    const itemStockAdjustmentRepository = itemStockAdjustmentRepositoryDouble();

    const recorded = await commandWith(
      itemCatalogueRepository,
      itemStockAdjustmentRepository,
    ).execute(currentUser, itemId, {
      countedQuantity: 12,
      reason: '  Counted after the cancelled collection  ',
    });

    expect(
      itemStockAdjustmentRepository.recordAdjustment,
    ).toHaveBeenCalledTimes(1);
    expect(itemStockAdjustmentRepository.recordAdjustment).toHaveBeenCalledWith(
      {
        adjustmentId,
        itemId,
        warehouseId,
        countedQuantity: 12,
        // Stored trimmed, as `chk_item_stock_adjustments_reason_stored_trimmed` requires.
        reason: 'Counted after the cancelled collection',
        adjustedByUserId: actorId,
        adjustedAt,
      },
    );
    expect(recorded).toEqual({
      id: adjustmentId,
      itemId,
      countedQuantity: 12,
      reason: 'Counted after the cancelled collection',
      adjustedByUserId: actorId,
      createdAt: adjustedAt,
    });
  });

  // AC-08 — the figure is **set to the count**, never derived from the figure already stored, so
  // the previous value is never read and never enters the write (CONTEXT.md §Invariants).
  it('sets the figure to the count without reading the figure already stored', async () => {
    const itemCatalogueRepository = itemCatalogueRepositoryDouble();
    const itemStockAdjustmentRepository = itemStockAdjustmentRepositoryDouble();

    await commandWith(
      itemCatalogueRepository,
      itemStockAdjustmentRepository,
    ).execute(currentUser, itemId, { countedQuantity: 0, reason: 'Counted' });

    expect(itemStockAdjustmentRepository.recordAdjustment).toHaveBeenCalledWith(
      expect.objectContaining({ countedQuantity: 0 }),
    );
  });
});
