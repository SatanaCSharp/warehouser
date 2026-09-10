import { Tabs } from '@heroui/react';
import type { PurchaseDraftState } from '@warehouser/contracts/purchase-drafts';
import { CreatePurchaseDraftAction } from 'modules/purchase-draft/components/CreatePurchaseDraftAction';
import { PurchaseDraftLineDirectory } from 'modules/purchase-draft/components/purchase-draft-line-directory/PurchaseDraftLineDirectory';
import { PurchaseDraftByDraftView } from 'modules/purchase-draft/components/purchase-draft-workspace/components/PurchaseDraftByDraftView';
import { PurchaseDraftLineSearchField } from 'modules/purchase-draft/components/purchase-draft-workspace/components/PurchaseDraftLineSearchField';
import type { PurchaseDraftView } from 'modules/purchase-draft/components/purchase-draft-workspace/components/PurchaseDraftViewToggle';
import { PurchaseDraftViewToggle } from 'modules/purchase-draft/components/purchase-draft-workspace/components/PurchaseDraftViewToggle';
import { usePurchaseDrafts } from 'modules/purchase-draft/hooks/queries/usePurchaseDrafts';
import type { ReactElement } from 'react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ArchivedWarehouseChip } from 'shared/components/ArchivedWarehouseChip';
import { ArchivedWarehouseNotice } from 'shared/components/ArchivedWarehouseNotice';
import { Conditional } from 'shared/components/Conditional';

/** The three tabs (design-handoff.md `Hh6Al`): order and count never change. */
const TAB_STATES = [
  'draft',
  'ready_for_ordering',
  'closed',
] as const satisfies readonly PurchaseDraftState[];

type TabState = (typeof TAB_STATES)[number];

/**
 * Whether a tab offers the `By draft / By line` toggle at all.
 *
 * AC-22 scopes the split to a Warehouse "whose **frozen** Purchase Drafts hold
 * lines of both delivery modes", and the approved frames draw it that way: the
 * `Being worked on` toolbar carries the `New draft` action alone (`cvX6h`),
 * while the toggle appears on the frozen tabs (`zj46c`). A draft still being
 * assembled has no dock to prepare — its lines are a decision in progress, not
 * goods anybody is about to handle — so looking at it by line answers nothing
 * the list beside it does not already answer.
 *
 * It is a total `Record` rather than a `state !== 'draft'` test so that a
 * fourth state cannot be added without someone deciding this for it
 * (`writing-web-components.md` §6).
 */
const TAB_OFFERS_VIEW_TOGGLE: Record<TabState, boolean> = {
  draft: false,
  ready_for_ordering: true,
  closed: true,
};

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
  // What was typed into the by-line search. It sits here because the field is
  // in the toolbar row beside the toggle, while the rows it filters are inside
  // the panel below — this is their nearest common owner
  // (`writing-web-components.md` §8).
  const [lineQuery, setLineQuery] = useState('');
  const [selectedDraftId, setSelectedDraftId] = useState<string | undefined>(
    undefined,
  );
  const onSelectTab = (key: unknown): void => {
    if (
      typeof key === 'string' &&
      (TAB_STATES as readonly string[]).includes(key)
    ) {
      setTab(key as TabState);
      setLineQuery('');
      setSelectedDraftId(undefined);
    }
  };
  const onSelectDraft = (draftId: string): void => setSelectedDraftId(draftId);
  const onSelectView = (selected: PurchaseDraftView): void => {
    setView(selected);
    setLineQuery('');
    setSelectedDraftId(undefined);
  };
  const onBackToList = (): void => setSelectedDraftId(undefined);

  const draftsIn = (state: TabState): typeof drafts =>
    drafts.filter((draft) => draft.state === state);
  const visibleDrafts = draftsIn(tab);

  // A tab that offers no toggle is always read by draft, whatever the member
  // last chose on a tab that did. Deriving it here rather than resetting
  // `view` in `onSelectTab` is what makes the invariant hold for every route
  // into this state — including the first paint — instead of only for the one
  // that goes through the handler: there is no reachable moment where the
  // by-line split is on screen with no control to leave it by.
  const offersViewToggle = TAB_OFFERS_VIEW_TOGGLE[tab];
  const effectiveView = offersViewToggle ? view : 'byDraft';

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
    byLine: <PurchaseDraftLineDirectory query={lineQuery} state={state} />,
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

        {/* The toolbar the frames draw across the destination: the by-line
            search at the start, and the toggle beside the one primary action
            at the end (`zj46c`). The search is absent while the member is
            looking by draft, because the rows it filters are not on screen. */}
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Conditional when={effectiveView === 'byLine'}>
            <PurchaseDraftLineSearchField
              value={lineQuery}
              onChange={setLineQuery}
            />
          </Conditional>
          <div className="ms-auto flex flex-wrap items-center gap-3">
            <Conditional when={offersViewToggle}>
              <PurchaseDraftViewToggle
                value={effectiveView}
                onChange={onSelectView}
              />
            </Conditional>
            <CreatePurchaseDraftAction />
          </div>
        </div>

        {TAB_STATES.map((state) => (
          <Tabs.Panel className="pt-5" id={state} key={state}>
            {viewContent(state)[effectiveView]}
          </Tabs.Panel>
        ))}
      </Tabs>
    </main>
  );
};
