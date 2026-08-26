// `purchase-drafts/domain/predicates/purchase-draft-assembly.predicates.ts` does not exist yet
// (T12) — this is the RED for the pure rules tasks/purchase-draft-assembly.md "What" names:
// "ordered/link quantity … value objects; the mutable-draft predicate". No NestJS, HTTP or
// TypeORM import here — server-error-handling.md §1.
import {
  isDraftMutable,
  isKnownPackagingType,
  isOrderedQuantity,
  isStatedQuantity,
} from 'purchase-drafts/domain/predicates/purchase-draft-assembly.predicates';

describe('isOrderedQuantity — data-model.md purchase_draft_lines.ordered_quantity `> 0`', () => {
  it.each([1, 40, 150])('accepts the positive whole number %i', (quantity) => {
    expect(isOrderedQuantity(quantity)).toBe(true);
  });

  it.each([0, -5, 7.5, Number.NaN])(
    'refuses %p, which is not a positive whole number',
    (quantity) => {
      expect(isOrderedQuantity(quantity)).toBe(false);
    },
  );
});

describe('isStatedQuantity — data-model.md purchase_draft_line_links.stated_quantity `> 0`', () => {
  it.each([1, 30, 500])('accepts the positive whole number %i', (quantity) => {
    expect(isStatedQuantity(quantity)).toBe(true);
  });

  it.each([0, -1, 2.5])(
    'refuses %p, which is not a positive whole number',
    (quantity) => {
      expect(isStatedQuantity(quantity)).toBe(false);
    },
  );

  // AC-11a — a link's stated quantity is never reconciled with the line quantity, the Customer
  // Order or any other link, so this predicate takes only the value itself and nothing to compare
  // it against.
  it('never depends on the line quantity, however large the stated quantity is', () => {
    expect(isStatedQuantity(500)).toBe(true);
  });
});

describe('isDraftMutable — AC-10a/AC-15, data-model.md purchase_drafts.state', () => {
  it('is true only for a draft in the draft state', () => {
    expect(isDraftMutable('draft')).toBe(true);
  });

  it.each(['ready_for_ordering', 'closed', 'discarded'])(
    'is false once the draft has reached %s',
    (state) => {
      expect(isDraftMutable(state)).toBe(false);
    },
  );
});

describe('isKnownPackagingType — AC-13, the four-entry catalogue', () => {
  const catalogueIds = ['loose_items', 'cartons', 'pallets', 'cable_coil'];

  it.each(catalogueIds)('accepts the catalogue entry %s', (packagingTypeId) => {
    expect(isKnownPackagingType(packagingTypeId, catalogueIds)).toBe(true);
  });

  it('refuses a Packaging Type outside the catalogue', () => {
    expect(isKnownPackagingType('wooden_crate', catalogueIds)).toBe(false);
  });

  it('refuses an empty string', () => {
    expect(isKnownPackagingType('', catalogueIds)).toBe(false);
  });
});
