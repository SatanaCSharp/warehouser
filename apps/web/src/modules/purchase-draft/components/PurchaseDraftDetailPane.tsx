import { Alert, Chip } from '@heroui/react';
import { useTranslation } from 'react-i18next';

import { ExpectedArrivalDateField } from 'modules/purchase-draft/components/ExpectedArrivalDateField';
import { PurchaseDraftTransitions } from 'modules/purchase-draft/components/purchase-draft-transitions/PurchaseDraftTransitions';
import { PurchaseDraftDriftAlert } from 'modules/purchase-draft/components/PurchaseDraftDriftAlert';
import { PurchaseDraftLineList } from 'modules/purchase-draft/components/PurchaseDraftLineList';
import { useMinuteTimestamp } from 'modules/purchase-draft/hooks/projections/useMinuteTimestamp';
import { usePurchaseDraftAttribution } from 'modules/purchase-draft/hooks/projections/usePurchaseDraftAttribution';
import { Conditional } from 'shared/components/Conditional';
import { LockIcon } from 'shared/icons';

import type {
  PurchaseDraftDetail,
  PurchaseDraftState,
} from '@warehouser/contracts/purchase-drafts';
import type { ReactElement } from 'react';

export type PurchaseDraftDetailPaneProps = {
  draft: PurchaseDraftDetail;
};

/**
 * The Purchase Draft detail pane (design-handoff.md `yGhkK`/`F0SpRx`/`O42LHI`).
 *
 * It opens with what the draft **is** — its human reference `PD-0143`, its
 * state, and the one line saying who did the act that state records and when
 * (AC-10, AC-14). Naming the draft matters everywhere: it is what a member
 * quotes to a colleague, what the demand table's coverage chips point at, and
 * what every dialog title repeats back before an irreversible act.
 *
 * Draft state decides what the pane renders — the editable draft, the frozen
 * record plus its Drift Signal, or a closed/discarded one — through a total
 * `Record<PurchaseDraftState, ReactElement>` lookup rather than an
 * `if`/`else if` chain (`writing-web-components.md` §6): adding a state to
 * `PurchaseDraftState` fails to compile here until this table is given
 * something to render for it.
 */
export const PurchaseDraftDetailPane = ({
  draft,
}: PurchaseDraftDetailPaneProps): ReactElement => {
  const { t } = useTranslation('purchase-draft');
  const attribution = usePurchaseDraftAttribution();
  const minuteTimestamp = useMinuteTimestamp();

  // Both are resolved before the return rather than gated inline, because
  // `Conditional` evaluates both arms and formatting a moment that does not
  // exist would throw (`writing-web-conditional-components.md` §2).
  const attributionLine = attribution(draft);
  const frozenNote =
    draft.readiedAt === null
      ? undefined
      : t('detail.frozenNote', { timestamp: minuteTimestamp(draft.readiedAt) });

  const expectedArrivalField = (isFrozen: boolean): ReactElement => (
    <div className="mt-4">
      <ExpectedArrivalDateField
        isFrozen={isFrozen}
        purchaseDraftId={draft.id}
        value={draft.expectedArrivalDate}
      />
    </div>
  );

  const content: Record<PurchaseDraftState, ReactElement> = {
    draft: (
      <div>
        <Alert status="accent">
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Title>{t('detail.readyBanner.heading')}</Alert.Title>
            <Alert.Description>
              {t('detail.readyBanner.body')}
            </Alert.Description>
          </Alert.Content>
        </Alert>
        {expectedArrivalField(false)}
        <PurchaseDraftLineList draft={draft} isFrozen={false} />
      </div>
    ),
    ready_for_ordering: (
      <div>
        <Conditional when={draft.hasDriftSignal}>
          <PurchaseDraftDriftAlert draft={draft} />
        </Conditional>
        <Conditional when={frozenNote}>
          <p className="mt-3 flex items-start gap-2 rounded-lg bg-surface-secondary p-3 text-sm text-default">
            <LockIcon />
            <span>{frozenNote}</span>
          </p>
        </Conditional>
        {expectedArrivalField(true)}
        <PurchaseDraftLineList draft={draft} isFrozen />
      </div>
    ),
    closed: (
      <div>
        <Conditional when={draft.closureReason}>
          <p className="text-sm text-muted">
            {t('detail.closureReason', { reason: draft.closureReason })}
          </p>
        </Conditional>
        {expectedArrivalField(true)}
        <PurchaseDraftLineList draft={draft} isFrozen />
      </div>
    ),
    discarded: (
      <p className="text-sm text-muted">{t('detail.discardedNotice')}</p>
    ),
  };

  return (
    // design-handoff.md's first documented mobile difference (`yGhkK`/`F0SpRx`
    // 1440 vs `O42LHI` 390): below `md:` the viewport itself is the pane and
    // the line cards already carry the surface, so the outer card frame
    // (border, background, padding) drops entirely rather than nesting a
    // card inside a card; from `md:` up the frame returns.
    <section
      aria-label={draft.reference}
      className="flex flex-col gap-3 md:rounded-xl md:border md:border-border md:bg-surface md:p-6"
    >
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-xl font-semibold">{draft.reference}</h2>
          <Conditional when={attributionLine}>
            <p className="mt-1 text-sm text-muted">{attributionLine}</p>
          </Conditional>
        </div>
        <Chip size="sm" variant="soft">
          {t(`state.${draft.state}`)}
        </Chip>
      </header>
      {content[draft.state]}
      <PurchaseDraftTransitions draft={draft} />
    </section>
  );
};
