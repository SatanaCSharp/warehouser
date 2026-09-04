import { Chip } from '@heroui/react';
import { useTranslation } from 'react-i18next';

import { DriftSignal } from 'modules/purchase-draft/components/DriftSignal';
import { useDraftActorName } from 'modules/purchase-draft/hooks/projections/useDraftActorName';
import { Conditional } from 'shared/components/Conditional';
import { useLocaleFormat } from 'shared/hooks/projections/useLocaleFormat';

import type {
  PurchaseDraftState,
  PurchaseDraftSummary,
} from '@warehouser/contracts/purchase-drafts';
import type { ReactElement } from 'react';

export type PurchaseDraftCardProps = {
  draft: PurchaseDraftSummary;
  isSelected: boolean;
  onSelect: () => void;
};

/**
 * `Ordering/Draft Card` (`l5QF7B`, frames `yGhkK`/`F0SpRx`) — one row of the
 * Purchase Drafts list: the draft's human reference `PD-0143`, its state chip,
 * and the one line that says how big it is, who last acted on it and when.
 *
 * Its `Drift Row` child is enabled only when the draft carries a Drift Signal
 * (AC-16a); a card without one renders no drift affordance at all, which is
 * what visibly distinguishes it from one that does — the drift chip's
 * icon-plus-text is `DriftSignal` itself, never a colour repainted here.
 *
 * The second line is one parameterized sentence per state rather than fragments
 * joined at the render site: which figures a state names differs (a draft names
 * who started it, a frozen one names when it was frozen and what is expected),
 * and a translator needs the whole sentence to order it.
 */
export const PurchaseDraftCard = ({
  draft,
  isSelected,
  onSelect,
}: PurchaseDraftCardProps): ReactElement => {
  const { t } = useTranslation('purchase-draft');
  const { shortCalendarDate, timestampDate } = useLocaleFormat();
  const actorName = useDraftActorName();

  const lines = t('card.lineCount', { count: draft.lineCount });
  // `F0SpRx` draws the card's expected arrival as `expected 5 Sep`, not
  // `5 Sep 2026`: the frozen date beside it already establishes the year, and
  // the card line is the densest context on the destination.
  const expected =
    draft.expectedArrivalDate === null
      ? ''
      : shortCalendarDate(draft.expectedArrivalDate);

  const meta: Record<PurchaseDraftState, string> = {
    draft: t('card.meta.draft', {
      actor: actorName(draft.createdByUserId),
      date: timestampDate(draft.createdAt),
      lines,
    }),
    ready_for_ordering: t(
      draft.expectedArrivalDate === null
        ? 'card.meta.ready_for_ordering'
        : 'card.meta.ready_for_orderingExpected',
      {
        date: timestampDate(draft.readiedAt ?? draft.createdAt),
        expected,
        lines,
      },
    ),
    closed: t('card.meta.closed', {
      date: timestampDate(
        draft.closedAt ?? draft.arrivalConfirmedAt ?? draft.createdAt,
      ),
      lines,
    }),
    discarded: t('card.meta.discarded', {
      date: timestampDate(draft.discardedAt ?? draft.createdAt),
      lines,
    }),
  };

  return (
    <li>
      <button
        aria-current={isSelected}
        className={`w-full rounded-xl border p-4 text-left ${
          isSelected ? 'border-2 border-accent' : 'border-border'
        }`}
        type="button"
        onClick={onSelect}
      >
        <div className="flex items-center justify-between gap-2">
          <span className="font-semibold text-foreground">
            {draft.reference}
          </span>
          <Chip size="sm" variant="soft">
            {t(`state.${draft.state}`)}
          </Chip>
        </div>
        <p className="mt-1 text-sm text-muted">{meta[draft.state]}</p>
        {/* AC-18a separates the two surfaces. Drift on a **directly-shipped**
            line is reported here, on the list itself, where the member sees it
            without opening anything, because goods are travelling to an address
            nobody now expects them at. The same disagreement on a Via Warehouse
            line is reported when the draft is opened, since everything on such
            a line lands at one dock either way — so the card carries the
            general signal and never the via-warehouse address one.

            Both statements report and neither instructs: the card stays the
            same button, offering the same one action it always offered. */}
        <Conditional when={draft.hasDriftSignal}>
          <p className="mt-2">
            <DriftSignal label={t('card.drift')} />
          </p>
        </Conditional>
        <Conditional when={draft.hasDirectToCustomerAddressDrift}>
          <p className="mt-2">
            <DriftSignal label={t('card.addressDrift')} />
          </p>
        </Conditional>
      </button>
    </li>
  );
};
