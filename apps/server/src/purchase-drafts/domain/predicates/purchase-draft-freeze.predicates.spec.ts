// `purchase-drafts/domain/predicates/purchase-draft-freeze.predicates.ts` does not exist yet
// (T13) — this is the RED for the pure predicates behind the freeze/closure/discard guards
// (server-error-handling.md §1: "Receive all required values as arguments", "Return boolean",
// "Do not mutate state, perform I/O, log, or throw"). Each predicate is asserted with a named
// error factory by the owning service; this spec proves the condition alone.
import {
  isDiscardableDraft,
  isEmptyDraft,
  isReadyForOrderingDraft,
} from 'purchase-drafts/domain/predicates/purchase-draft-freeze.predicates';
import { describe, expect, it } from 'vitest';

describe('purchase-draft freeze/closure/discard predicates', () => {
  // AC-14a — "a draft is only ready once it says what is being ordered": readiness requires at
  // least one line.
  describe('isEmptyDraft', () => {
    it('is true when the draft holds no lines', () => {
      expect(isEmptyDraft(0)).toBe(true);
    });

    it('is false once the draft holds at least one line', () => {
      expect(isEmptyDraft(1)).toBe(false);
      expect(isEmptyDraft(3)).toBe(false);
    });
  });

  // AC-24/AC-24a — only a draft still in the `draft` state may be discarded; a draft that has
  // been made ready is closed with a reason instead.
  describe('isDiscardableDraft', () => {
    it('is true for a draft in the draft state', () => {
      expect(isDiscardableDraft('draft')).toBe(true);
    });

    it('is false once the draft has been made ready, closed or discarded', () => {
      expect(isDiscardableDraft('ready_for_ordering')).toBe(false);
      expect(isDiscardableDraft('closed')).toBe(false);
      expect(isDiscardableDraft('discarded')).toBe(false);
    });
  });

  // AC-21/sad.md §6.11 — closure with a reason is legal only from Ready for Ordering.
  describe('isReadyForOrderingDraft', () => {
    it('is true only for a draft in Ready for Ordering', () => {
      expect(isReadyForOrderingDraft('ready_for_ordering')).toBe(true);
    });

    it('is false for every other state', () => {
      expect(isReadyForOrderingDraft('draft')).toBe(false);
      expect(isReadyForOrderingDraft('closed')).toBe(false);
      expect(isReadyForOrderingDraft('discarded')).toBe(false);
    });
  });
});
