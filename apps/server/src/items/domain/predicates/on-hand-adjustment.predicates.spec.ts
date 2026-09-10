// T6 — `items/domain/predicates/on-hand-adjustment.predicates.ts` does not exist yet. This is the
// legitimate RED for AC-09/AC-09a at the predicate level: server-error-handling.md §1 requires the
// two conditions behind the refusals to be pure, named, argument-taking booleans that neither throw
// nor construct an error, so they stay usable for checks that do not throw.
import {
  isCountedQuantity,
  isStatedReason,
} from 'items/domain/predicates/on-hand-adjustment.predicates.js';
import { describe, expect, it } from 'vitest';

describe('on-hand adjustment predicates', () => {
  // AC-09 / data-model.md `items.on_hand_quantity` INTEGER `>= 0` — the counted figure is a whole
  // number that is never negative.
  describe('isCountedQuantity', () => {
    it.each([0, 1, 12, 1_000_000])('accepts the whole count %p', (counted) => {
      expect(isCountedQuantity(counted)).toBe(true);
    });

    it.each([-1, -12, 0.5, 12.5, Number.NaN, Number.POSITIVE_INFINITY])(
      'refuses %p, which is negative or not a whole number',
      (counted) => {
        expect(isCountedQuantity(counted)).toBe(false);
      },
    );
  });

  // AC-09a / data-model.md `item_stock_adjustments.reason` TEXT NOT NULL, trimmed non-empty — a
  // reason of nothing but whitespace is no reason at all.
  describe('isStatedReason', () => {
    it('accepts a reason with content', () => {
      expect(isStatedReason('Counted after the cancelled collection')).toBe(
        true,
      );
    });

    it.each(['', '   ', '\t\n'])('refuses the blank reason %p', (reason) => {
      expect(isStatedReason(reason)).toBe(false);
    });
  });
});
