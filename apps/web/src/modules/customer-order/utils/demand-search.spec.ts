import type { DemandLine } from '@warehouser/contracts/customer-orders';
import { matchesDemandQuery } from 'modules/customer-order/utils/demand-search';
import { describe, expect, it } from 'vitest';

// The Demand destination's search field (design frame `G6jhw`, placeholder
// `Search items or SKUs`) filters the demand the route already loaded, so what
// this suite pins is which of the two searchable facts a term may match and
// that a blank term is not a filter.

const line = (sku: string, description: string): DemandLine => ({
  itemId: '00000000-0000-4000-8000-000000000240',
  sku,
  description,
  unitOfMeasure: 'pieces',
  totalOutstandingQuantity: 1240,
  earliestNeededBy: '2026-09-02',
  onHandQuantity: 60,
  unfulfilledCustomerOrderCount: 2,
  coverage: [],
});

describe('matchesDemandQuery', () => {
  it('matches a SKU and a description, ignoring case', () => {
    const matches = matchesDemandQuery('pallet');

    expect(matches(line('WH-100420', 'Pallet wrap, 500mm'))).toBe(true);
    expect(matches(line('WH-PALLET-1', 'Carton 600×400×300'))).toBe(true);
    expect(matches(line('WH-100511', 'Thermal labels 4×6'))).toBe(false);
  });

  it('matches a partial SKU', () => {
    expect(matchesDemandQuery('100420')(line('WH-100420', 'Pallet wrap'))).toBe(
      true,
    );
  });

  it('treats a blank or whitespace-only term as no filter at all', () => {
    expect(matchesDemandQuery('')(line('WH-1', 'Anything'))).toBe(true);
    expect(matchesDemandQuery('   ')(line('WH-1', 'Anything'))).toBe(true);
  });
});
