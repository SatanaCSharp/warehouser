import { Chip } from '@heroui/react';
import { useTranslation } from 'react-i18next';

import { DriftSignal } from 'modules/purchase-draft/components/DriftSignal';
import { Conditional } from 'shared/components/Conditional';

import type { PurchaseDraftSummary } from '@warehouser/contracts/purchase-drafts';
import type { ReactElement } from 'react';

export type PurchaseDraftCardProps = {
  draft: PurchaseDraftSummary;
  isSelected: boolean;
  onSelect: () => void;
};

/**
 * `Ordering/Draft Card` (`l5QF7B`) — one row of the Purchase Drafts list.
 * Selected = 2px accent stroke. Its `Drift Row` child is enabled only when
 * the draft carries a Drift Signal (AC-16a); a card without one renders no
 * drift affordance at all, which is what visibly distinguishes it from one
 * that does — the drift chip's icon-plus-text is `DriftSignal` itself, never
 * a colour repainted here.
 */
export const PurchaseDraftCard = ({
  draft,
  isSelected,
  onSelect,
}: PurchaseDraftCardProps): ReactElement => {
  const { t } = useTranslation('purchase-draft');

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
          <Chip size="sm" variant="soft">
            {t(`state.${draft.state}`)}
          </Chip>
          <Conditional when={draft.hasDriftSignal}>
            <DriftSignal label={t('card.drift')} />
          </Conditional>
        </div>
        <p className="mt-2 text-sm text-muted">
          {t('card.lineCount', { count: draft.lineCount })}
        </p>
        <p className="text-sm text-muted">
          {draft.expectedArrivalDate
            ? t('card.expectedArrival', { date: draft.expectedArrivalDate })
            : t('card.expectedArrivalUnstated')}
        </p>
      </button>
    </li>
  );
};
