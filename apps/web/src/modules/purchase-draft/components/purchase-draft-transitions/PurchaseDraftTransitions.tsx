import { useTranslation } from 'react-i18next';

import { ClosePurchaseDraftAction } from 'modules/purchase-draft/components/purchase-draft-transitions/components/ClosePurchaseDraftAction';
import { ConfirmArrivalAction } from 'modules/purchase-draft/components/purchase-draft-transitions/components/ConfirmArrivalAction';
import { DiscardPurchaseDraftAction } from 'modules/purchase-draft/components/purchase-draft-transitions/components/DiscardPurchaseDraftAction';
import { ReadyPurchaseDraftAction } from 'modules/purchase-draft/components/purchase-draft-transitions/components/ReadyPurchaseDraftAction';
import { Conditional } from 'shared/components/Conditional';

import type {
  PurchaseDraftDetail,
  PurchaseDraftState,
} from '@warehouser/contracts/purchase-drafts';
import type { ReactElement, ReactNode } from 'react';

export type PurchaseDraftTransitionsProps = {
  draft: PurchaseDraftDetail;
};

/**
 * The detail pane's footer (frames `yGhkK`/`F0SpRx`): the four irreversible
 * acts of a Purchase Draft, which of them its state admits, and the hint that
 * says what the primary one will do.
 *
 * The layout is the frames' own and carries meaning: the act that steps back —
 * discarding, closing with a reason — sits on the left, and the act that moves
 * the draft forward sits on the right behind a sentence explaining its
 * consequence, so the irreversible one is never the first thing under the
 * cursor.
 *
 * A state that does not admit an act does not render it — a discard is not
 * offered for a draft already made ready (AC-24a), and a closed or discarded
 * draft is offered nothing at all, so the footer itself disappears rather than
 * leaving an empty rule across the pane. That is an affordance, never the
 * boundary: each act's dialog still surfaces the refusal the server returns,
 * because the state may move between this render and the press.
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
  const { t } = useTranslation('purchase-draft');

  const admitted: Record<PurchaseDraftState, ReactNode> = {
    draft: (
      <>
        <DiscardPurchaseDraftAction draft={draft} />
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-sm text-muted">
            {t('detail.footer.readyHint')}
          </span>
          <ReadyPurchaseDraftAction draft={draft} />
        </div>
      </>
    ),
    ready_for_ordering: (
      <>
        <ClosePurchaseDraftAction draft={draft} />
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-sm text-muted">
            {t('detail.footer.arrivalHint')}
          </span>
          <ConfirmArrivalAction draft={draft} />
        </div>
      </>
    ),
    closed: null,
    discarded: null,
  };

  const footer = admitted[draft.state];

  return (
    <Conditional when={footer}>
      <footer className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
        {footer}
      </footer>
    </Conditional>
  );
};
