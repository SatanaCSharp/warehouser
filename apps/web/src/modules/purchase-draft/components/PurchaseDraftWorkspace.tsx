import { Tabs } from '@heroui/react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { CreatePurchaseDraftAction } from 'modules/purchase-draft/components/CreatePurchaseDraftAction';
import { PurchaseDraftDetailPane } from 'modules/purchase-draft/components/PurchaseDraftDetailPane';
import { PurchaseDraftList } from 'modules/purchase-draft/components/PurchaseDraftList';
import { usePurchaseDraft } from 'modules/purchase-draft/hooks/queries/usePurchaseDraft';
import { usePurchaseDrafts } from 'modules/purchase-draft/hooks/queries/usePurchaseDrafts';
import { Conditional } from 'shared/components/Conditional';
import { ChevronLeftIcon } from 'shared/icons';

import type { PurchaseDraftState } from '@warehouser/contracts/purchase-drafts';
import type { ReactElement } from 'react';

/** The three tabs (design-handoff.md `Hh6Al`): order and count never change. */
const TAB_STATES = [
  'draft',
  'ready_for_ordering',
  'closed',
] as const satisfies readonly PurchaseDraftState[];

/**
 * The Purchase drafts destination's composition root (design-handoff.md
 * `yGhkK` desktop / `O42LHI` mobile): the state tabs, the 340px list, and the
 * fill detail pane, matching Access and Workspaces' list-and-detail shape.
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
  const [tab, setTab] = useState<(typeof TAB_STATES)[number]>('draft');
  const [selectedDraftId, setSelectedDraftId] = useState<string | undefined>(
    undefined,
  );
  const selectedDraft = usePurchaseDraft(selectedDraftId);

  const onSelectTab = (key: unknown): void => {
    if (
      typeof key === 'string' &&
      (TAB_STATES as readonly string[]).includes(key)
    ) {
      setTab(key as (typeof TAB_STATES)[number]);
      setSelectedDraftId(undefined);
    }
  };
  const onSelectDraft = (draftId: string): void => setSelectedDraftId(draftId);
  const onBackToList = (): void => setSelectedDraftId(undefined);

  const visibleDrafts = drafts.filter((draft) => draft.state === tab);

  const detailContent = !selectedDraft ? (
    <p className="text-muted">{t('detail.empty')}</p>
  ) : (
    <PurchaseDraftDetailPane draft={selectedDraft} />
  );

  return (
    <main className="mx-auto max-w-[1440px] px-6 py-8">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-3xl font-semibold text-foreground">
          {t('workspace.heading')}
        </h1>
        <CreatePurchaseDraftAction />
      </div>

      <Tabs className="mt-6" selectedKey={tab} onSelectionChange={onSelectTab}>
        <Tabs.ListContainer>
          <Tabs.List aria-label={t('workspace.tabs.label')}>
            <Tabs.Tab id="draft">
              {t('workspace.tabs.draft')}
              <Tabs.Indicator />
            </Tabs.Tab>
            <Tabs.Tab id="ready_for_ordering">
              {t('workspace.tabs.readyForOrdering')}
              <Tabs.Indicator />
            </Tabs.Tab>
            <Tabs.Tab id="closed">
              {t('workspace.tabs.closed')}
              <Tabs.Indicator />
            </Tabs.Tab>
          </Tabs.List>
        </Tabs.ListContainer>

        {TAB_STATES.map((state) => (
          <Tabs.Panel className="pt-5" id={state} key={state}>
            <div className="flex gap-6">
              <div
                className={`w-full md:w-[340px] md:shrink-0 ${
                  selectedDraftId ? 'hidden md:block' : 'block'
                }`}
              >
                <PurchaseDraftList
                  drafts={visibleDrafts}
                  selectedDraftId={selectedDraftId}
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
                {detailContent}
              </div>
            </div>
          </Tabs.Panel>
        ))}
      </Tabs>
    </main>
  );
};
