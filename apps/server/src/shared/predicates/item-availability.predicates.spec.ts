// AC-03/AC-06d/AC-11 — the one condition that decides whether an Item may be named by a *new*
// reference, exercised by `customer-orders` when demand is recorded and by `purchase-drafts` when a
// draft line is composed or its Item restated. It lives in `shared/predicates/` because more than
// one feature exercises it (server-error-handling.md §1); it was previously written out twice, once
// in each feature.
import { isSelectableItem } from 'shared/predicates/item-availability.predicates.js';
import { describe, expect, it } from 'vitest';

describe('isSelectableItem — AC-03/AC-06d/AC-11, the Item a new reference may name', () => {
  const warehouseId = 'warehouse-north';

  it('accepts an active Item of the acting Warehouse', () => {
    expect(
      isSelectableItem({ warehouseId, deactivatedAt: null }, warehouseId),
    ).toBe(true);
  });

  // All three refusals are one condition on purpose: the caller turns them into a single
  // non-enumerating outcome, so nothing distinguishes "deactivated here" from "active elsewhere"
  // or "not there at all" (spec.md §6.1).
  it.each<[string, { warehouseId: string; deactivatedAt: Date | null } | null]>(
    [
      [
        'a deactivated Item of this Warehouse',
        { warehouseId, deactivatedAt: new Date('2026-08-20') },
      ],
      [
        'an active Item of another Warehouse',
        { warehouseId: 'warehouse-south', deactivatedAt: null },
      ],
      ['an Item that does not exist', null],
    ],
  )('refuses %s', (_case, item) => {
    expect(isSelectableItem(item, warehouseId)).toBe(false);
  });
});
