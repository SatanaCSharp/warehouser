// The pure predicates behind Arrival Confirmation's payload guards
// (server-error-handling.md §1: "Receive all required values as arguments", "Return boolean",
// "Do not mutate state, perform I/O, log, or throw"). Each is enforced with a named error factory
// by `ArrivalConfirmationService`; this spec pins the condition alone, including the edge cases the
// integration tier is too expensive to enumerate.
import {
  namesEachLineOnce,
  namesOnlyLinesOfTheDraft,
  recordsAtLeastOneLine,
} from 'purchase-drafts/domain/predicates/arrival-confirmation.predicates';

// Hex letters on purpose: a spelling difference has to be observable for the case-sensitivity
// assertions below to mean anything.
const lineA = '00000000-0000-4000-8000-0000000004ab';
const lineB = '00000000-0000-4000-8000-0000000004cd';
const lineC = '00000000-0000-4000-8000-0000000004ef';

describe('arrival-confirmation payload predicates', () => {
  // AC-15/spec.md §6.1 — a confirmation may record a received quantity only against the lines of
  // the draft it names.
  describe('namesOnlyLinesOfTheDraft', () => {
    const draftLines = new Set([lineA, lineB]);

    it('is true for a single line of the draft', () => {
      expect(namesOnlyLinesOfTheDraft([lineA], draftLines)).toBe(true);
    });

    it('is true for every line of the draft, in any order', () => {
      expect(namesOnlyLinesOfTheDraft([lineB, lineA], draftLines)).toBe(true);
    });

    it('is true for a subset: a line may be omitted', () => {
      expect(namesOnlyLinesOfTheDraft([lineB], draftLines)).toBe(true);
    });

    it('is false when any line is not one of the draft own', () => {
      expect(namesOnlyLinesOfTheDraft([lineC], draftLines)).toBe(false);
      expect(namesOnlyLinesOfTheDraft([lineA, lineC], draftLines)).toBe(false);
    });

    // The membership test is exact: identifiers are compared as stored, never case-folded, so a
    // differently-cased spelling of a real line is not one of the draft's lines.
    it('is false for a differently-cased spelling of a line of the draft', () => {
      expect(namesOnlyLinesOfTheDraft([lineA.toUpperCase()], draftLines)).toBe(
        false,
      );
    });

    // Vacuously true, which is exactly why `recordsAtLeastOneLine` exists as a separate guard.
    it('is vacuously true for no lines at all', () => {
      expect(namesOnlyLinesOfTheDraft([], draftLines)).toBe(true);
    });

    it('is false for any line when the draft holds none', () => {
      expect(namesOnlyLinesOfTheDraft([lineA], new Set())).toBe(false);
    });
  });

  // AC-18 — the per-line bound is a bound on the line, so a line may appear at most once.
  describe('namesEachLineOnce', () => {
    it('is true for one line', () => {
      expect(namesEachLineOnce([lineA])).toBe(true);
    });

    it('is true for several distinct lines', () => {
      expect(namesEachLineOnce([lineA, lineB, lineC])).toBe(true);
    });

    it('is false when one line is repeated', () => {
      expect(namesEachLineOnce([lineA, lineA])).toBe(false);
    });

    it('is false when a repeat is separated by other lines', () => {
      expect(namesEachLineOnce([lineA, lineB, lineA])).toBe(false);
    });

    it('is false when a line is repeated more than twice', () => {
      expect(namesEachLineOnce([lineA, lineA, lineA])).toBe(false);
    });

    // Distinctness is exact for the same reason membership is: two spellings are two identifiers.
    it('is true for two differently-cased spellings, which are two identifiers', () => {
      expect(namesEachLineOnce([lineA, lineA.toUpperCase()])).toBe(true);
    });

    it('is vacuously true for no lines at all', () => {
      expect(namesEachLineOnce([])).toBe(true);
    });
  });

  // AC-17/openapi.yaml `ArrivalConfirmation.lines` `minItems: 1` — the guard the other two are
  // vacuously true against.
  describe('recordsAtLeastOneLine', () => {
    it('is false for an empty confirmation', () => {
      expect(recordsAtLeastOneLine([])).toBe(false);
    });

    it('is true from one line upwards', () => {
      expect(recordsAtLeastOneLine([lineA])).toBe(true);
      expect(recordsAtLeastOneLine([lineA, lineB])).toBe(true);
    });
  });

  // server-error-handling.md §1 — "Do not mutate state". The service passes arrays it goes on to
  // use; a predicate that sorted or deduped in place would corrupt the write that follows.
  it('leaves its arguments untouched', () => {
    const submitted = [lineB, lineA, lineB];
    const draftLines = new Set([lineA, lineB]);

    namesOnlyLinesOfTheDraft(submitted, draftLines);
    namesEachLineOnce(submitted);
    recordsAtLeastOneLine(submitted);

    expect(submitted).toEqual([lineB, lineA, lineB]);
    expect([...draftLines]).toEqual([lineA, lineB]);
  });
});
