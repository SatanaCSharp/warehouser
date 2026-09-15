// T5 — `items/domain/predicates/item-catalogue.predicates.ts` does not exist yet. This is the
// legitimate RED for the domain-invariant half of AC-06c and AC-06d: SKU format
// (data-model.md `items.sku` — TEXT NOT NULL, trimmed non-empty), the correctability predicate
// (AC-06c — a SKU stops being correctable once demand or a draft names the Item, while an Item
// nothing yet names may still have its SKU corrected), and the activation predicates (AC-06d —
// deactivation/reactivation, mirroring `warehouses.archived_at`'s nullable-instant shape). Pure
// functions only, per server-error-handling.md §1: no NestJS, HTTP or TypeORM import anywhere in
// `items/domain/`.
import {
  canDeactivateItem,
  canReactivateItem,
  isItemActive,
  isSkuCorrectable,
} from 'items/domain/predicates/item-catalogue.predicates';
import { describe, expect, it } from 'vitest';

describe('isSkuCorrectable', () => {
  // AC-06c — a SKU stops being correctable once demand or a draft names the Item; an Item nothing
  // yet names may still have its SKU corrected.
  it('is true when nothing names the Item', () => {
    expect(isSkuCorrectable(false)).toBe(true);
  });

  it('is false once a Customer Order or a Purchase Draft Line names the Item', () => {
    expect(isSkuCorrectable(true)).toBe(false);
  });
});

describe('isItemActive', () => {
  // AC-06d — activation is a nullable instant, mirroring `warehouses.archived_at`.
  it('is true when deactivatedAt is null', () => {
    expect(isItemActive(null)).toBe(true);
  });

  it('is false once deactivatedAt is set', () => {
    expect(isItemActive(new Date('2026-08-25T00:00:00.000Z'))).toBe(false);
  });
});

describe('canDeactivateItem', () => {
  // AC-06d — only an active Item may be deactivated.
  it('is true for an active Item', () => {
    expect(canDeactivateItem(null)).toBe(true);
  });

  it('is false for an already-deactivated Item', () => {
    expect(canDeactivateItem(new Date('2026-08-25T00:00:00.000Z'))).toBe(false);
  });
});

describe('canReactivateItem', () => {
  // AC-06d — reactivation is the same operation inverted: only an inactive Item may be reactivated.
  it('is true for a deactivated Item', () => {
    expect(canReactivateItem(new Date('2026-08-25T00:00:00.000Z'))).toBe(true);
  });

  it('is false for an already-active Item', () => {
    expect(canReactivateItem(null)).toBe(false);
  });
});
