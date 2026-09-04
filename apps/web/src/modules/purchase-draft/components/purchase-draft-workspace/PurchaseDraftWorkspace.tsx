import { Tabs } from '@heroui/react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { CreatePurchaseDraftAction } from 'modules/purchase-draft/components/CreatePurchaseDraftAction';
import { PurchaseDraftLineDirectory } from 'modules/purchase-draft/components/purchase-draft-line-directory/PurchaseDraftLineDirectory';
import { PurchaseDraftByDraftView } from 'modules/purchase-draft/components/purchase-draft-workspace/components/PurchaseDraftByDraftView';
import { PurchaseDraftViewToggle } from 'modules/purchase-draft/components/purchase-draft-workspace/components/PurchaseDraftViewToggle';
import { usePurchaseDrafts } from 'modules/purchase-draft/hooks/queries/usePurchaseDrafts';
import { ArchivedWarehouseChip } from 'shared/components/ArchivedWarehouseChip';
import { ArchivedWarehouseNotice } from 'shared/components/ArchivedWarehouseNotice';

import type { PurchaseDraftState } from '@warehouser/contracts/purchase-drafts';
import type { PurchaseDraftView } from 'modules/purchase-draft/components/purchase-draft-workspace/components/PurchaseDraftViewToggle';
import type { ReactElement } from 'react';

/** The three tabs (design-handoff.md `Hh6Al`): order and count never change. */
const TAB_STATES = [
  'draft',
  'ready_for_ordering',
  'closed',
] as const satisfies readonly PurchaseDraftState[];

type TabState = (typeof TAB_STATES)[number];

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
      <PurchaseDraftByDraftView
        drafts={visibleDrafts}
        selectedDraftId={selectedDraftId}
        state={state}
        onBack={onBackToList}
        onSelect={onSelectDraft}
      />
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
