// `purchase-drafts/domain/predicates/purchase-draft-assembly.predicates.ts` does not exist yet
// (T12) — this is the RED for the pure rules tasks/purchase-draft-assembly.md "What" names:
// "ordered/link quantity … value objects; the mutable-draft predicate". No NestJS, HTTP or
// TypeORM import here — server-error-handling.md §1.
import { isKnownPackagingType } from 'purchase-drafts/domain/predicates/purchase-draft-assembly.predicates';
import { describe, expect, it } from 'vitest';

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
