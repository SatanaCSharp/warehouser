/** The three facts that stop a Purchase Draft's own fields being written. */
export type WriteRefusal = {
  /** The Warehouse authorizes no change to what it holds (AC-23). */
  isArchived: boolean;
  /** The draft records what the supplier was told (AC-15). */
  isFrozen: boolean;
  /**
   * Whether the actor's Role carries `PURCHASE_DRAFTS:UPDATE` (AC-22).
   *
   * A field that *shows* what the draft says stays on screen for an actor
   * holding only `PURCHASE_DRAFTS:WATCH` — withholding it would withhold the
   * draft itself — so the Permission is read as a boolean here, which is
   * exactly the `isDisabled`/`aria-describedby` case
   * `docs/system/adr/19-08-2026-declarative-permission-gates.md` § Decision 3
   * keeps. A control that only *writes* (the remove-line and unlink buttons,
   * the clear-the-date button) is withheld by `WarehousePermissionGate`
   * instead, like every other action on this destination.
   */
  isPermitted: boolean;
};

/**
 * Which reason a disabled control states, most specific first.
 *
 * Precedence is an ordered table of predicates rather than the order of
 * `else if` lines (`writing-web-components.md` §6), so it can be commented and
 * reordered deliberately: being frozen wins over the Warehouse being archived
 * because it is the narrower fact — a frozen draft is refused this write in a
 * live Warehouse for exactly the same reason.
 *
 * The Permission is ranked **last** deliberately. A frozen draft and an
 * archived Warehouse refuse the write to everyone, the Warehouse Manager
 * included, so naming the actor's Role first would send a member to ask for a
 * Permission that would not have helped them.
 */
const DISABLING_REASONS: readonly {
  key: string;
  holds: (refusal: WriteRefusal) => boolean;
}[] = [
  { key: 'lineEditor.frozenReason', holds: ({ isFrozen }) => isFrozen },
  { key: 'lineEditor.archivedReason', holds: ({ isArchived }) => isArchived },
  {
    key: 'lineEditor.unpermittedReason',
    holds: ({ isPermitted }) => !isPermitted,
  },
];

/**
 * The `purchase-draft` copy key naming why a control is disabled, or
 * `undefined` when nothing disables it and the field's own helper text stands.
 *
 * AC-15 and AC-23 both require the control to stay **visible and disabled with
 * its reason exposed** rather than vanish, so every mutating control on this
 * destination reads its reason from here instead of restating one of the two
 * sentences itself.
 */
export const disablingReasonKey = (refusal: WriteRefusal): string | undefined =>
  DISABLING_REASONS.find(({ holds }) => holds(refusal))?.key;

/**
 * The id of the element on which one Purchase Draft Line states why its
 * controls are refused — the sentence `PurchaseDraftLineEditor` renders beside
 * the fields it disables.
 *
 * It is derived from the Line rather than from the reason because the Line
 * renders exactly one such sentence, whichever reason won: a control pointing
 * here is therefore described by the very words it is shown next to, which is
 * the only arrangement in which the announced reason and the drawn reason
 * cannot disagree.
 */
export const lineRefusalReasonId = (lineId: string): string =>
  `purchase-draft-line-${lineId}-refusal`;

/**
 * The same arrangement for the draft's own Expected Arrival Date: the element
 * on which that field states why it is refused. A constant rather than a
 * function, because a draft carries exactly one such field and the detail pane
 * renders exactly one draft.
 */
export const EXPECTED_ARRIVAL_REFUSAL_REASON_ID =
  'purchase-draft-expected-arrival-refusal';

/** What a control disabled on one Purchase Draft Line says, and where. */
export type LineDisablingReason = {
  /** The `purchase-draft` copy key naming the reason. */
  key: string;
  /** The element carrying that same sentence, for `aria-describedby`. */
  reasonId: string;
};

/**
 * The reason one Line's controls are refused, resolved **once** into both the
 * copy key and the element that states it.
 *
 * Resolving them together is the point. Reading the key from this precedence
 * table while deciding `aria-describedby` separately — from
 * `useArchivedWarehouse().reasonId`, say — is two independent decisions over
 * the same question, and they diverge on the two readings that matter: a frozen
 * draft in a live Warehouse is disabled with no reason announced at all, and a
 * frozen draft in an archived one announces the archived sentence while the
 * visible one says frozen, because this table ranks frozen first.
 */
export const lineDisablingReason = (
  refusal: WriteRefusal,
  lineId: string,
): LineDisablingReason | undefined => {
  const key = disablingReasonKey(refusal);

  return key === undefined
    ? undefined
    : { key, reasonId: lineRefusalReasonId(lineId) };
};

/** Whether any of the facts refuses the write, and therefore disables the control. */
export const refusesWrites = ({
  isArchived,
  isFrozen,
  isPermitted,
}: WriteRefusal): boolean => isArchived || isFrozen || !isPermitted;
