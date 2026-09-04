import { useTranslation } from 'react-i18next';

import { PurchaseDraftDetailPane } from 'modules/purchase-draft/components/PurchaseDraftDetailPane';
import { usePurchaseDraft } from 'modules/purchase-draft/hooks/queries/usePurchaseDraft';
import { DatasetSkeleton } from 'shared/components/DatasetSkeleton';

import type { ReactElement } from 'react';

/** What the detail column shows, most significant state first. */
type DetailState = 'unselected' | 'failed' | 'pending' | 'ready';

type DetailReading = {
  hasSelection: boolean;
  hasDraft: boolean;
  isError: boolean;
};

/**
 * The states that displace the detail pane, in precedence order
 * (`writing-web-components.md` §6).
 *
 * Nothing selected wins outright: no read was made, so neither of the other two
 * can be true of anything. A failed read then wins over a pending one, because
 * `usePurchaseDraft` reports both as "no draft yet" and only the flag tells
 * them apart — reading them the other way round leaves a member who will never
 * get this draft watching a skeleton for good.
 */
const DISPLACING_DETAIL_STATES: readonly {
  state: DetailState;
  holds: (reading: DetailReading) => boolean;
}[] = [
  { state: 'unselected', holds: ({ hasSelection }) => !hasSelection },
  { state: 'failed', holds: ({ isError }) => isError },
  { state: 'pending', holds: ({ hasDraft }) => !hasDraft },
];

const resolveDetailState = (reading: DetailReading): DetailState =>
  DISPLACING_DETAIL_STATES.find(({ holds }) => holds(reading))?.state ??
  'ready';

/** The detail pane's own skeleton: a header line and the fields under it. */
const DETAIL_BARS = ['30%', '60%', '45%'] as const;

type PurchaseDraftDetailColumnProps = {
  selectedDraftId: string | undefined;
};

/**
 * The detail half of the by-draft split: one selected draft, or the reason
 * there is nothing to show.
 *
 * It makes the read itself rather than taking the draft as a prop, because the
 * question it answers — selected, failed, still arriving, or here — is a
 * property of that read and of nothing else (`writing-web-components.md` §4).
 * The workspace above it owns only which draft is selected.
 *
 * The read is client-side and always was; moving it here changes where it is
 * called, not when. The route's first-paint readiness is unaffected.
 */
export const PurchaseDraftDetailColumn = ({
  selectedDraftId,
}: PurchaseDraftDetailColumnProps): ReactElement => {
  const { t } = useTranslation('purchase-draft');
  const { draft: selectedDraft, isError } = usePurchaseDraft(selectedDraftId);

  // The pane reads the draft it was opened for, so it is resolved here rather
  // than gated inline — `Conditional` builds both arms
  // (`writing-web-conditional-components.md` §2). It is reached only under
  // `ready`, which is the state that holds exactly when the draft is there.
  const detailPane =
    selectedDraft === undefined ? null : (
      <PurchaseDraftDetailPane draft={selectedDraft} />
    );

  const detailState = resolveDetailState({
    hasDraft: selectedDraft !== undefined,
    hasSelection: selectedDraftId !== undefined,
    isError,
  });

  const detailContent: Record<DetailState, ReactElement> = {
    unselected: <p className="text-muted">{t('detail.empty')}</p>,
    pending: (
      <DatasetSkeleton
        columns={DETAIL_BARS}
        label={t('detail.loading')}
        rows={2}
      />
    ),
    failed: (
      <p className="text-danger" role="alert">
        {t('detail.error')}
      </p>
    ),
    ready: <>{detailPane}</>,
  };

  return detailContent[detailState];
};
