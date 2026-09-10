import type {
  PurchaseDraftState,
  PurchaseDraftSummary,
} from '@warehouser/contracts/purchase-drafts';
import { useDraftActorName } from 'modules/purchase-draft/hooks/projections/useDraftActorName';
import { useMinuteTimestamp } from 'modules/purchase-draft/hooks/projections/useMinuteTimestamp';
import { useTranslation } from 'react-i18next';
import { useLocaleFormat } from 'shared/hooks/projections/useLocaleFormat';

/** Who did the act a state records, and when they did it. */
type Act = { actorId: string | null; at: string | null };

/**
 * The act each lifecycle state is attributed to. Total over
 * `PurchaseDraftState`, so a state added to the contract fails to compile here
 * until it says which act names it (`writing-web-components.md` §6).
 */
const ACT_OF_STATE: Record<
  PurchaseDraftState,
  (draft: PurchaseDraftSummary) => Act
> = {
  draft: ({ createdAt, createdByUserId }) => ({
    actorId: createdByUserId,
    at: createdAt,
  }),
  ready_for_ordering: ({ readiedAt, readiedByUserId }) => ({
    actorId: readiedByUserId,
    at: readiedAt,
  }),
  closed: ({ closedAt, closedByUserId }) => ({
    actorId: closedByUserId,
    at: closedAt,
  }),
  discarded: ({ discardedAt, discardedByUserId }) => ({
    actorId: discardedByUserId,
    at: discardedAt,
  }),
};

/**
 * Which copy key a state's attribution reads. The frames write a draft still
 * being assembled with the calendar day it was started on, and every
 * irreversible act with the moment it happened, to the minute.
 */
const ATTRIBUTION_OF_STATE: Record<PurchaseDraftState, string> = {
  draft: 'attribution.draft',
  ready_for_ordering: 'attribution.ready_for_ordering',
  closed: 'attribution.closed',
  discarded: 'attribution.discarded',
};

/**
 * The line under a draft's reference naming who did what, and when — `Created
 * by you · 25 Aug 2026 · every change is recorded as you make it` (frame
 * `yGhkK`) and `Made ready by another member · 22 Aug 2026, 14:20 · expected
 * arrival 5 Sep 2026` (frame `F0SpRx`).
 *
 * Answers `undefined` when the act the state names carries no actor or no time
 * — a projection that cannot say who did something says nothing rather than
 * attributing it to nobody.
 */
export const usePurchaseDraftAttribution = (): ((
  draft: PurchaseDraftSummary,
) => string | undefined) => {
  const { t } = useTranslation('purchase-draft');
  const { calendarDate, timestampDate } = useLocaleFormat();
  const minuteTimestamp = useMinuteTimestamp();
  const actorName = useDraftActorName();

  return (draft) => {
    const { actorId, at } = ACT_OF_STATE[draft.state](draft);
    if (actorId === null || at === null) {
      return undefined;
    }

    const key = ATTRIBUTION_OF_STATE[draft.state];
    const namesExpectedArrival =
      draft.state === 'ready_for_ordering' &&
      draft.expectedArrivalDate !== null;

    return t(namesExpectedArrival ? `${key}Expected` : key, {
      actor: actorName(actorId),
      date: timestampDate(at),
      timestamp: minuteTimestamp(at),
      expected:
        draft.expectedArrivalDate === null
          ? ''
          : calendarDate(draft.expectedArrivalDate),
    });
  };
};
