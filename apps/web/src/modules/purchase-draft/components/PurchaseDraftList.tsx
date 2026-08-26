import { useTranslation } from 'react-i18next';

import { PurchaseDraftCard } from 'modules/purchase-draft/components/PurchaseDraftCard';
import { Conditional } from 'shared/components/Conditional';

import type { PurchaseDraftSummary } from '@warehouser/contracts/purchase-drafts';
import type { ReactElement } from 'react';

export type PurchaseDraftListProps = {
  drafts: PurchaseDraftSummary[];
  selectedDraftId: string | undefined;
  onSelect: (draftId: string) => void;
};

/**
 * The 340px list column of the Purchase drafts destination (design-handoff.md
 * `yGhkK`). Selection and dataset presence are the only concerns here; what a
 * selected draft shows is `PurchaseDraftDetailPane`'s job.
 */
export const PurchaseDraftList = ({
  drafts,
  selectedDraftId,
  onSelect,
}: PurchaseDraftListProps): ReactElement => {
  const { t } = useTranslation('purchase-draft');
  const onSelectDraft = (draftId: string) => (): void => onSelect(draftId);

  return (
    <Conditional
      when={drafts.length > 0}
      otherwise={<p className="text-muted">{t('workspace.empty')}</p>}
    >
      <ul aria-label={t('workspace.heading')} className="flex flex-col gap-3">
        {drafts.map((draft) => (
          <PurchaseDraftCard
            key={draft.id}
            draft={draft}
            isSelected={draft.id === selectedDraftId}
            onSelect={onSelectDraft(draft.id)}
          />
        ))}
      </ul>
    </Conditional>
  );
};
