import { useTranslation } from 'react-i18next';

import { DockLineTable } from 'modules/purchase-draft/components/purchase-draft-line-directory/components/DockLineTable';
import { usePurchaseDraftLines } from 'modules/purchase-draft/hooks/queries/usePurchaseDraftLines';
import { matchesLineQuery } from 'modules/purchase-draft/utils/line-search';
import { DatasetSkeleton } from 'shared/components/DatasetSkeleton';

import type {
  DeliveryMode,
  PurchaseDraftLineListEntry,
  PurchaseDraftState,
} from '@warehouser/contracts/purchase-drafts';
import type { ReactElement } from 'react';

export type PurchaseDraftLineDirectoryProps = {
  /** Which drafts the state tabs are currently choosing. */
  state: PurchaseDraftState;
  /**
   * What was typed into the toolbar's search field. It arrives as a prop
   * because the field sits in the row above this view, beside the toggle that
   * chose it (`PurchaseDraftWorkspace`).
   */
  query: string;
};

/** What the by-line view shows, most significant state first. */
type DirectoryState = 'failed' | 'pending' | 'noMatches' | 'ready';

/** What the ordered predicates below read to name the state on screen. */
type DirectoryReading = {
  isError: boolean;
  isPending: boolean;
  matchCount: number;
  isSearching: boolean;
};

const DISPLACING_STATES: readonly {
  state: DirectoryState;
  holds: (reading: DirectoryReading) => boolean;
}[] = [
  // A failed read wins over a pending one: both answer "no lines yet", and
  // reading them the other way round leaves a member who will never get this
  // answer watching a skeleton for good.
  { state: 'failed', holds: ({ isError }) => isError },
  { state: 'pending', holds: ({ isPending }) => isPending },
  // A term that matches nothing is answered once, above the split, rather than
  // by two tables each saying nothing is coming: "no line matches what you
  // typed" and "no line is coming to this warehouse" are different answers,
  // and showing the second one for the first reason would tell a member the
  // dock is clear when it is not.
  {
    state: 'noMatches',
    holds: ({ isSearching, matchCount }) => isSearching && matchCount === 0,
  },
];

/** The skeleton's own bars: a draft, an item, a quantity and a destination. */
const LINE_BARS = ['20%', '30%', '15%', '35%'] as const;

/** One half of the split, in the order both frames draw them. */
const HALVES = [
  'via_warehouse',
  'direct_to_customer',
] as const satisfies readonly DeliveryMode[];

/** Which copy each half reads. Adding a mode fails to compile until it has one. */
const HALF_COPY: Record<
  DeliveryMode,
  { empty: string; heading: string; label: string }
> = {
  via_warehouse: {
    empty: 'byLine.dockEmpty',
    heading: 'byLine.dockHeading',
    label: 'byLine.dockTableLabel',
  },
  direct_to_customer: {
    empty: 'byLine.directEmpty',
    heading: 'byLine.directHeading',
    label: 'byLine.directTableLabel',
  },
};

/**
 * The `By line` view (`DFncO`, AC-22): the lines landing at this Warehouse's
 * own Delivery Address kept apart from the lines shipping Direct to Customer,
 * so a member preparing the dock sees only the goods they will physically
 * handle.
 *
 * **One read, split here.** Both halves come from the single by-line request,
 * partitioned on each line's **own** `deliveryMode` — which is what makes a
 * draft holding both modes appear in both halves rather than whole in either.
 * Filtering server-side per half would issue two requests that could disagree
 * with each other about one draft.
 *
 * **Neither half is dropped when it is empty.** "Nothing is coming to the
 * dock" is the answer a member preparing it needs, and an absent table reads
 * as a failed load rather than as an answer. The sentence is the table's own
 * empty state rather than a paragraph beside it
 * (`adr/27-08-2026-heroui-table-for-web-data-tables.md` §Decision rule 3): the
 * view renders no second responsive surface for either half.
 *
 * The view is read-only by nature, so an archived Warehouse changes nothing
 * about it: every read still succeeds on exactly the terms that applied before
 * archiving (AC-23).
 */
export const PurchaseDraftLineDirectory = ({
  state,
  query,
}: PurchaseDraftLineDirectoryProps): ReactElement => {
  const { t } = useTranslation('purchase-draft');
  const { entries, isError, isPending } = usePurchaseDraftLines(state);
  const matches = entries.filter(matchesLineQuery(query));

  const directoryState =
    DISPLACING_STATES.find(({ holds }) =>
      holds({
        isError,
        isPending,
        isSearching: query.trim() !== '',
        matchCount: matches.length,
      }),
    )?.state ?? 'ready';

  const halfOf = (mode: DeliveryMode): PurchaseDraftLineListEntry[] =>
    matches.filter((entry) => entry.line.deliveryMode === mode);

  const content: Record<DirectoryState, ReactElement> = {
    failed: (
      <p className="text-danger" role="alert">
        {t('byLine.error')}
      </p>
    ),
    pending: (
      <DatasetSkeleton
        columns={LINE_BARS}
        label={t('byLine.loading')}
        rows={3}
      />
    ),
    noMatches: (
      <p className="text-muted" role="status">
        {t('byLine.noMatches', { query: query.trim() })}
      </p>
    ),
    ready: (
      <>
        {HALVES.map((mode) => (
          <section className="mt-4 first:mt-0" key={mode}>
            <h3 className="text-lg font-semibold text-foreground">
              {t(HALF_COPY[mode].heading)}
            </h3>
            <DockLineTable
              emptyMessage={t(HALF_COPY[mode].empty)}
              entries={halfOf(mode)}
              label={t(HALF_COPY[mode].label)}
            />
          </section>
        ))}
      </>
    ),
  };

  return <div>{content[directoryState]}</div>;
};
