// Pure predicates behind the freeze/closure/discard guards (server-error-handling.md §1:
// arguments only, boolean return, no I/O). Each is enforced with a named error factory by the
// owning service; this module states the conditions alone.

// AC-14a — "a draft is only ready once it says what is being ordered": readiness requires at
// least one line.
export const isEmptyDraft = (lineCount: number): boolean => lineCount === 0;

// AC-24/AC-24a — only a draft still in the `draft` state may be discarded; a draft that has been
// made ready is closed with a reason instead. Reused for the freeze pre-read: readiness also
// requires the draft to still resolve in the `draft` state.
export const isDiscardableDraft = (state: string): boolean => state === 'draft';

// AC-21/sad.md §6.11 — closure with a reason is legal only from Ready for Ordering.
export const isReadyForOrderingDraft = (state: string): boolean =>
  state === 'ready_for_ordering';
