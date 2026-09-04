import { Button } from '@heroui/react';
import { useTranslation } from 'react-i18next';

import { PurchaseDraftDetailColumn } from 'modules/purchase-draft/components/purchase-draft-workspace/components/PurchaseDraftDetailColumn';
import { PurchaseDraftList } from 'modules/purchase-draft/components/PurchaseDraftList';
import { Conditional } from 'shared/components/Conditional';
import { ChevronLeftIcon } from 'shared/icons';

import type {
  PurchaseDraftState,
  PurchaseDraftSummary,
} from '@warehouser/contracts/purchase-drafts';
import type { ReactElement } from 'react';

type PurchaseDraftByDraftViewProps = {
  drafts: PurchaseDraftSummary[];
  selectedDraftId: string | undefined;
  state: PurchaseDraftState;
  onSelect: (draftId: string) => void;
  onBack: () => void;
};

/**
 * The list-and-detail split for one tab — the `byDraft` half of AC-22.
 *
 * Below `md` the two columns are one at a time: the list until a draft is
 * chosen, the detail after, with the back affordance returning. From `md` up
 * both are on screen and the affordance is hidden, which is why the widths are
 * classes rather than a branch (`writing-web-components.md` §6).
 */
export const PurchaseDraftByDraftView = ({
  drafts,
  onBack,
  onSelect,
  selectedDraftId,
  state,
}: PurchaseDraftByDraftViewProps): ReactElement => {
  const { t } = useTranslation('purchase-draft');

  return (
    <div className="flex gap-6">
      <div
        className={`w-full md:w-[340px] md:shrink-0 ${
          selectedDraftId ? 'hidden md:block' : 'block'
        }`}
      >
        <PurchaseDraftList
          drafts={drafts}
          selectedDraftId={selectedDraftId}
          state={state}
          onSelect={onSelect}
        />
      </div>
      <div
        className={`min-w-0 flex-1 ${
          selectedDraftId ? 'block' : 'hidden md:block'
        }`}
      >
        <Conditional when={selectedDraftId}>
          <Button
            className="mb-3 md:hidden"
            size="sm"
            variant="tertiary"
            onPress={onBack}
          >
            <ChevronLeftIcon />
            {t('workspace.backToList')}
          </Button>
        </Conditional>
        <PurchaseDraftDetailColumn selectedDraftId={selectedDraftId} />
      </div>
    </div>
  );
};
