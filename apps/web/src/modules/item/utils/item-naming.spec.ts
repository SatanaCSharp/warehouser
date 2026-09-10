import type { Item } from '@warehouser/contracts/items';
import { itemNamingState } from 'modules/item/utils/item-naming';
import { describe, expect, it } from 'vitest';

// T18 — AC-06c's projection, resolved to the one name every sentence about
// naming is keyed by. The precedence is a table rather than a chain
// (`writing-web-components.md` §6), so it is asserted directly: the four states
// are what the table row, the mobile card, the deactivation dialog and the SKU
// refusal all index into, and a wrong answer here is wrong in four places.
// Colocated with the helper it covers (`placing-web-tests.md` §1).

const anItem = (
  namingCustomerOrderCount: number,
  namingPurchaseDraftLineCount: number,
): Item => ({
  id: '00000000-0000-4000-8000-000000000280',
  sku: 'WH-100420',
  description: 'Pallet wrap, 500mm',
  unitOfMeasure: 'pieces',
  onHandQuantity: 60,
  deactivatedAt: null,
  namingCustomerOrderCount,
  namingPurchaseDraftLineCount,
  latestAdjustment: null,
  createdAt: '2026-08-01T09:00:00.000Z',
});

describe('itemNamingState', () => {
  it('reports `none` for an Item nothing yet names, which is the half of AC-06c that stays correctable', () => {
    expect(itemNamingState(anItem(0, 0))).toBe('none');
  });

  it('reports `orders` when only Customer Orders name it', () => {
    expect(itemNamingState(anItem(5, 0))).toBe('orders');
  });

  it('reports `lines` when only Purchase Draft Lines name it', () => {
    expect(itemNamingState(anItem(0, 2))).toBe('lines');
  });

  it('reports `both` when each kind of record names it, so the sentence can say "and"', () => {
    expect(itemNamingState(anItem(3, 1))).toBe('both');
  });
});
