import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { ItemTableFooter } from 'modules/item/components/item-directory/components/ItemTableFooter';
import { QUANTITY_GROUP_SEPARATOR } from 'shared/utils/number-format';
import { renderWithProviders } from 'test/render';

import type { Item } from '@warehouser/contracts/items';

// T18 — the Items table's footer row (frame `XIvAZ`, on design-handoff.md's
// must-preserve list). DoD: the counts read as the frames draw them at the
// scale spec.md §1 fixes — roughly 2 000 Items per Warehouse, returned whole —
// so the numeral is grouped rather than run together. Colocated with the
// component it covers (`placing-web-tests.md` §1).

const anItem = (index: number, isInactive = false): Item => ({
  id: `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
  sku: `WH-${index}`,
  description: 'Pallet wrap, 500mm',
  unitOfMeasure: 'pieces',
  onHandQuantity: 0,
  deactivatedAt: isInactive ? '2026-08-21T09:00:00.000Z' : null,
  namingCustomerOrderCount: 0,
  namingPurchaseDraftLineCount: 0,
  latestAdjustment: null,
  createdAt: '2026-08-01T09:00:00.000Z',
});

const catalogueOf = (total: number, inactive = 0): Item[] =>
  Array.from({ length: total }, (_item, index) =>
    anItem(index, index < inactive),
  );

describe('ItemTableFooter', () => {
  it('counts the collection and how much of it is inactive', () => {
    renderWithProviders(<ItemTableFooter items={catalogueOf(5, 1)} />);

    expect(screen.getByText('5 items · 1 inactive')).toBeVisible();
  });

  it('says only how many Items there are when none is inactive', () => {
    renderWithProviders(<ItemTableFooter items={catalogueOf(1)} />);

    expect(screen.getByText('1 item')).toBeVisible();
  });

  it('groups the numeral at the scale spec.md §1 fixes, rather than running it together', () => {
    renderWithProviders(<ItemTableFooter items={catalogueOf(2000)} />);

    // Testing Library normalizes the rendered no-break space away before it
    // matches, so the separator is asserted against the raw `textContent`.
    expect(screen.getByText(/items$/u).textContent).toBe(
      `2${QUANTITY_GROUP_SEPARATOR}000 items`,
    );
  });

  it('states what an inactive Item still does, beside the counts', () => {
    renderWithProviders(<ItemTableFooter items={catalogueOf(5, 1)} />);

    expect(
      screen.getByText(
        'An inactive item keeps its SKU and keeps counting on every record that already names it.',
      ),
    ).toBeVisible();
  });
});
