import { Tabs } from '@heroui/react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { CreatePurchaseDraftAction } from 'modules/purchase-draft/components/CreatePurchaseDraftAction';
import { PurchaseDraftLineDirectory } from 'modules/purchase-draft/components/purchase-draft-line-directory/PurchaseDraftLineDirectory';
import { PurchaseDraftDetailPane } from 'modules/purchase-draft/components/PurchaseDraftDetailPane';
import { PurchaseDraftList } from 'modules/purchase-draft/components/PurchaseDraftList';
import { PurchaseDraftViewToggle } from 'modules/purchase-draft/components/PurchaseDraftViewToggle';
import { usePurchaseDraft } from 'modules/purchase-draft/hooks/queries/usePurchaseDraft';
import { usePurchaseDrafts } from 'modules/purchase-draft/hooks/queries/usePurchaseDrafts';
import { ArchivedWarehouseChip } from 'shared/components/ArchivedWarehouseChip';
import { ArchivedWarehouseNotice } from 'shared/components/ArchivedWarehouseNotice';
import { Conditional } from 'shared/components/Conditional';
import { DatasetSkeleton } from 'shared/components/DatasetSkeleton';
import { ChevronLeftIcon } from 'shared/icons';

import type { PurchaseDraftState } from '@warehouser/contracts/purchase-drafts';
import type { PurchaseDraftView } from 'modules/purchase-draft/components/PurchaseDraftViewToggle';
import type { ReactElement } from 'react';

/** The three tabs (design-handoff.md `Hh6Al`): order and count never change. */
const TAB_STATES = [
  'draft',
  'ready_for_ordering',
  'closed',
] as const satisfies readonly PurchaseDraftState[];

type TabState = (typeof TAB_STATES)[number];

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

/** Which copy key each tab's label reads; the count is interpolated into it. */
const TAB_LABELS: Record<TabState, string> = {
  draft: 'workspace.tabs.draft',
  ready_for_ordering: 'workspace.tabs.readyForOrdering',
  closed: 'workspace.tabs.closed',
};

/**
 * The Purchase drafts destination's composition root (design-handoff.md
 * `yGhkK` desktop / `F0SpRx` frozen / `O42LHI` mobile): the page's lede, the
 * state tabs and their counts, the 340px list, and the fill detail pane.
 *
 * **The lede changes with the tab**, because the two halves of this feature are
 * different promises — a draft being assembled is a decision in progress, and a
 * frozen one is the record of what the supplier was told and is deliberately
 * not a live projection of demand (frames `yGhkK` vs `F0SpRx`).
 *
 * At 390px the list and the detail pane become two screens: selecting a
 * draft hides the list and shows the detail with a `chevron-left` "All
 * purchase drafts" back affordance; the desktop split (`md:` and up) always
 * shows both. This is the one layout branch driven by viewport rather than
 * data, so it stays a pair of Tailwind visibility classes rather than a
 * rendered branch.
 */
export const PurchaseDraftWorkspace = (): ReactElement => {
  const { t } = useTranslation('purchase-draft');
  const drafts = usePurchaseDrafts();
  const [tab, setTab] = useState<TabState>('draft');
  // How the member is looking at the drafts the tab chose. Transient, owned by
  // the toggle that sets it, and never a URL or a Redux concern: it survives
  // nothing and nobody else reads it (`writing-web-components.md` §9).
  const [view, setView] = useState<PurchaseDraftView>('byDraft');
  const [selectedDraftId, setSelectedDraftId] = useState<string | undefined>(
    undefined,
  );
  const { draft: selectedDraft, isError } = usePurchaseDraft(selectedDraftId);

  const onSelectTab = (key: unknown): void => {
    if (
      typeof key === 'string' &&
      (TAB_STATES as readonly string[]).includes(key)
    ) {
      setTab(key as TabState);
      setSelectedDraftId(undefined);
    }
  };
  const onSelectDraft = (draftId: string): void => setSelectedDraftId(draftId);
  const onSelectView = (selected: PurchaseDraftView): void => {
    setView(selected);
    setSelectedDraftId(undefined);
  };
  const onBackToList = (): void => setSelectedDraftId(undefined);

  const draftsIn = (state: TabState): typeof drafts =>
    drafts.filter((draft) => draft.state === state);
  const visibleDrafts = draftsIn(tab);

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

  // AC-22 — what the toggle chose, resolved per tab because each panel shows
  // the drafts its own state selects. A total `Record<PurchaseDraftView, …>`
  // rather than a stack of `Conditional`s re-testing `view`
  // (`writing-web-conditional-components.md` §3): a third way of looking fails
  // to compile until it is given something to render.
  //
  // Only the chosen element is rendered, so the list a member is not looking
  // at is not one more thing an assistive technology has to walk past, and the
  // by-line read is issued only for the tab in front of them. Building both
  // costs nothing: element creation runs no hook and has no effect.
  const viewContent = (
    state: TabState,
  ): Record<PurchaseDraftView, ReactElement> => ({
    byDraft: (
      <div className="flex gap-6">
        <div
          className={`w-full md:w-[340px] md:shrink-0 ${
            selectedDraftId ? 'hidden md:block' : 'block'
          }`}
        >
          <PurchaseDraftList
            drafts={visibleDrafts}
            selectedDraftId={selectedDraftId}
            state={state}
            onSelect={onSelectDraft}
          />
        </div>
        <div
          className={`min-w-0 flex-1 ${
            selectedDraftId ? 'block' : 'hidden md:block'
          }`}
        >
          <Conditional when={selectedDraftId}>
            <button
              className="mb-3 inline-flex items-center gap-1 text-sm md:hidden"
              type="button"
              onClick={onBackToList}
            >
              <ChevronLeftIcon />
              {t('workspace.backToList')}
            </button>
          </Conditional>
          {detailContent[detailState]}
        </div>
      </div>
    ),
    byLine: <PurchaseDraftLineDirectory state={state} />,
  });

  return (
    <main className="mx-auto max-w-[1440px] px-6 py-8">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-3xl font-semibold text-foreground">
          {t('workspace.heading')}
        </h1>
        <ArchivedWarehouseChip />
      </div>
      <p className="mt-3 max-w-prose text-muted">
        {t(`workspace.lede.${tab}`)}
      </p>
      <div className="mt-4">
        <ArchivedWarehouseNotice />
      </div>

      <Tabs className="mt-6" selectedKey={tab} onSelectionChange={onSelectTab}>
        <Tabs.ListContainer>
          <Tabs.List aria-label={t('workspace.tabs.label')}>
            {TAB_STATES.map((state) => (
              <Tabs.Tab id={state} key={state}>
                {t(TAB_LABELS[state], { count: draftsIn(state).length })}
                <Tabs.Indicator />
              </Tabs.Tab>
            ))}
          </Tabs.List>
        </Tabs.ListContainer>

        <div className="mt-4 flex flex-wrap items-end justify-between gap-3">
          <PurchaseDraftViewToggle value={view} onChange={onSelectView} />
          <CreatePurchaseDraftAction />
        </div>

        {TAB_STATES.map((state) => (
          <Tabs.Panel className="pt-5" id={state} key={state}>
            {viewContent(state)[view]}
          </Tabs.Panel>
        ))}
      </Tabs>
    </main>
  );
};
