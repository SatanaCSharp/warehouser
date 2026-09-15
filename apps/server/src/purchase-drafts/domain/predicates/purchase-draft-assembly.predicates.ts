// Pure predicates for Purchase Draft assembly (server-error-handling.md §1). No NestJS, HTTP or
// TypeORM import here — see `purchase-drafts/domain/errors/purchase-draft.errors.ts` for the named
// error factories that pair with these conditions.

// AC-06d/AC-11 — whether the Item a line names may be named at all is `isSelectableItem` in
// `shared/predicates/item-availability.predicates.ts`, not here: `customer-orders` applies the same
// rule when demand is recorded, and a predicate more than one feature exercises belongs in
// `shared/predicates/` (server-error-handling.md §1).

// AC-13 — a Packaging Type is legal only when it is one of the catalogue's entries.
export const isKnownPackagingType = (
  packagingTypeId: string,
  catalogueIds: readonly string[],
): boolean => catalogueIds.includes(packagingTypeId);

// Whether the ending just written was the one that closed the draft. `RecordLineEndingResult` keeps
// this separate from `recorded` on purpose — an ending that simply was not the last one writes
// everything and closes nothing — so the response state turns on this question rather than on the
// write having happened.
export const closedTheDraft = (written: {
  readonly closed: boolean;
}): boolean => written.closed;

// The two refusals a guarded assembly write reports, each named so `assertApplied` maps an outcome
// to its error without restating the literal. A draft this Warehouse does not hold is
// `target-missing` — the same outcome a draft id naming nothing produces — so the 404 the member
// sees discloses nothing about drafts existing elsewhere (AC-11/spec.md §6.1).
export const isDraftFrozenOutcome = (outcome: string): boolean =>
  outcome === 'draft-frozen';

export const isTargetMissingOutcome = (outcome: string): boolean =>
  outcome === 'target-missing';

// Whether the ending was written at all. Kept apart from `closedTheDraft`: a lost race writes
// nothing, while an ending that simply was not the last one writes everything and closes nothing.
export const recordedTheEnding = (written: {
  readonly recorded: boolean;
}): boolean => written.recorded;
