import { useTranslation } from 'react-i18next';

import { CreatePurchaseDraftAction } from 'modules/purchase-draft/components/CreatePurchaseDraftAction';
import { PurchaseDraftCard } from 'modules/purchase-draft/components/PurchaseDraftCard';
import { Conditional } from 'shared/components/Conditional';
import { DatasetEmptyState } from 'shared/components/DatasetEmptyState';
import { FileTextIcon } from 'shared/icons';

import type {
  PurchaseDraftState,
  PurchaseDraftSummary,
} from '@warehouser/contracts/purchase-drafts';
import type { ReactElement } from 'react';

export type PurchaseDraftListProps = {
  drafts: PurchaseDraftSummary[];
  /** The lifecycle state this tab lists, which is what its copy is written for. */
  state: PurchaseDraftState;
  selectedDraftId: string | undefined;
  onSelect: (draftId: string) => void;
};

/**
 * The 340px list column of the Purchase drafts destination (frames
 * `yGhkK`/`F0SpRx`): the cards of one tab, the footnote that says what leaves
 * this list and why, and — when the tab holds nothing — the named empty state
 * with the one action that fills it (frame `hWFRW`).
 *
 * Both the footnote and the empty copy are written per lifecycle state rather
 * than once for the list, because what a member is told about an empty
 * "Being worked on" tab and an empty "Closed" tab is not the same sentence.
 */
export const PurchaseDraftList = ({
  drafts,
  state,
  selectedDraftId,
  onSelect,
}: PurchaseDraftListProps): ReactElement => {
  const { t } = useTranslation('purchase-draft');
  const onSelectDraft = (draftId: string) => (): void => onSelect(draftId);

  const driftCount = drafts.filter((draft) => draft.hasDriftSignal).length;

  return (
    <Conditional
      when={drafts.length > 0}
      otherwise={
        <DatasetEmptyState
          action={<CreatePurchaseDraftAction />}
          description={t(`workspace.empty.${state}.description`)}
          heading={t(`workspace.empty.${state}.heading`)}
          icon={<FileTextIcon />}
        />
      }
    >
      <div className="flex flex-col gap-3">
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
        <p className="text-sm text-muted">
          {t(`workspace.footnote.${state}`)}{' '}
          <Conditional when={driftCount > 0}>
            <span>{t('workspace.driftFootnote', { count: driftCount })}</span>
          </Conditional>
        </p>
      </div>
    </Conditional>
  );
};
