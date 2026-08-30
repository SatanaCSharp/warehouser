// Pure predicates for the On-hand Quantity adjustment (server-error-handling.md §1). No NestJS,
// HTTP or TypeORM import here — see `items/domain/errors/item.errors.ts` for the named error
// factories that pair with these conditions and `usecases/commands/adjust-item-on-hand.command.ts`
// for their enforcement via `assert`.

// AC-09 / data-model.md `items.on_hand_quantity` INTEGER NOT NULL `>= 0` — the counted figure is a
// whole number that is never negative. `Number.isInteger` also rejects `NaN` and both infinities.
export const isCountedQuantity = (countedQuantity: number): boolean =>
  Number.isInteger(countedQuantity) && countedQuantity >= 0;

// AC-09a / data-model.md `item_stock_adjustments.reason` — every change to On-hand Quantity is
// recorded with its reason, and whitespace is not a reason
// (`chk_item_stock_adjustments_reason_stored_trimmed`).
export const isStatedReason = (reason: string): boolean =>
  reason.trim().length > 0;
