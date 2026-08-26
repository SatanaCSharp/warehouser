import { ClosePurchaseDraftAction } from 'modules/purchase-draft/components/purchase-draft-transitions/components/ClosePurchaseDraftAction';
import { ConfirmArrivalAction } from 'modules/purchase-draft/components/purchase-draft-transitions/components/ConfirmArrivalAction';
import { DiscardPurchaseDraftAction } from 'modules/purchase-draft/components/purchase-draft-transitions/components/DiscardPurchaseDraftAction';
import { ReadyPurchaseDraftAction } from 'modules/purchase-draft/components/purchase-draft-transitions/components/ReadyPurchaseDraftAction';

import type {
  PurchaseDraftDetail,
  PurchaseDraftState,
} from '@warehouser/contracts/purchase-drafts';
import type { ReactElement, ReactNode } from 'react';

export type PurchaseDraftTransitionsProps = {
  draft: PurchaseDraftDetail;
};

/**
 * The four irreversible acts of a Purchase Draft, and which of them its state
 * admits (design-handoff.md `s5EPi`/`blZtz`).
 *
 * A state that does not admit an act does not render it — a discard is not
 * offered for a draft already made ready (AC-24a), and a closed or discarded
 * draft is offered nothing at all. That is an affordance, never the boundary:
 * each act's dialog still surfaces the refusal the server returns, because the
 * state may move between this render and the press.
 *
 * The table is annotated `Record<PurchaseDraftState, …>` so adding a state to
 * `PurchaseDraftState` fails to compile until this component says what that
 * state admits, rather than falling through an `if`/`else if` chain to
 * whatever the last arm rendered (`writing-web-components.md` §6). Its values
 * are `ReactNode` rather than `ReactElement` because two of the four states
 * admit nothing at all, and `null` says that where an empty fragment only
 * looked like it did — the totality the guide is after is the key type's, and
 * that is unchanged.
 */
export const PurchaseDraftTransitions = ({
  draft,
}: PurchaseDraftTransitionsProps): ReactElement => {
  const admitted: Record<PurchaseDraftState, ReactNode> = {
    draft: (
      <>
        <ReadyPurchaseDraftAction draft={draft} />
        <DiscardPurchaseDraftAction draft={draft} />
      </>
    ),
    ready_for_ordering: (
      <>
        <ConfirmArrivalAction draft={draft} />
        <ClosePurchaseDraftAction draft={draft} />
      </>
    ),
    closed: null,
    discarded: null,
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      {admitted[draft.state]}
    </div>
  );
};
