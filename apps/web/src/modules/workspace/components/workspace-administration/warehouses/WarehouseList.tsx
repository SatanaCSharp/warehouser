import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { WarehouseRow } from 'modules/workspace/components/workspace-administration/warehouses/WarehouseRow';
import { WarehouseSearchField } from 'modules/workspace/components/workspace-administration/warehouses/WarehouseSearchField';
import { ROW_ENTER } from 'shared/constants/motion';

import type { Warehouse } from '@warehouser/contracts/workspaces';
import type { ReactElement } from 'react';

type WarehouseListProps = {
  className?: string;
  /** True when the Warehouse read was refused or failed, not merely empty. */
  isError: boolean;
  membershipWarehouseIds: readonly string[];
  peopleCounts: Record<string, number> | undefined;
  selectedWarehouseId: string | undefined;
  warehouses: Warehouse[];
  onSelect: (warehouseId: string) => void;
};

/**
 * What the list renders in place of rows, or `ready` when it renders the rows
 * themselves. The four are mutually exclusive and one of them always holds, so
 * the render site is a total lookup rather than a chain with a fallthrough.
 */
type WarehouseListState = 'failed' | 'empty' | 'noMatches' | 'ready';

/** Everything the state is resolved from: two counts and the read's outcome. */
type WarehouseListReading = {
  isError: boolean;
  matchCount: number;
  warehouseCount: number;
};

/**
 * The states that displace the rows, most significant first — the precedence
 * that used to live in the order of an `if`/`else if` chain, written as the
 * data it always was (`writing-web-components.md` §6).
 *
 * `failed` is first for the reason the component docblock gives: a rejected
 * read still commits the destination and arrives here as an empty array, so an
 * `empty` that outranked it would tell a permitted actor a false fact about
 * their Workspace. `empty` outranks `noMatches` because a Workspace with no
 * Warehouse has nothing to search, and saying so is more useful than reporting
 * that the search term matched nothing.
 */
const displacingStates: readonly {
  state: WarehouseListState;
  holds: (reading: WarehouseListReading) => boolean;
}[] = [
  { state: 'failed', holds: ({ isError }) => isError },
  { state: 'empty', holds: ({ warehouseCount }) => warehouseCount === 0 },
  { state: 'noMatches', holds: ({ matchCount }) => matchCount === 0 },
];

/** The first state that holds, or `ready` when the rows are what to render. */
const resolveListState = (reading: WarehouseListReading): WarehouseListState =>
  displacingStates.find(({ holds }) => holds(reading))?.state ?? 'ready';

/** Case-insensitive substring match on a Warehouse's name. */
const nameContains =
  (normalizedQuery: string) =>
  (warehouse: Warehouse): boolean =>
    warehouse.name.toLocaleLowerCase().includes(normalizedQuery);

/**
 * The searchable Warehouse list (AC-33, AC-12a). The search term is local —
 * nothing outside this list reads it. `className` carries the responsive
 * collapse: below the split-view breakpoint this pane hides while the detail
 * screen is active.
 *
 * What renders is decided in two flat steps and no branch: `resolveListState`
 * names the one state that holds, and a `Record` keyed by that name resolves
 * it to an element. The `Record` is total, so a state added to the union
 * fails to compile until it is given something to render — the exhaustiveness
 * an `if`/`else if` chain could never offer. Both are cheap: naming the state
 * runs three predicates over two counts, and building the four elements runs
 * no hook and has no effect (`writing-web-conditional-components.md` §3).
 *
 * The empty, failed and unmatched states each stay one inline `<p>`: a single
 * paragraph is below the threshold at which indirection pays, so none of them
 * becomes a file of its own.
 *
 * There is no loading arm: `/workspace`'s route loader awaits the Warehouse
 * list before the destination is committed, so the list is never mounted
 * without it (global-loader CH-14). There **is** a failed-read arm, and it
 * outranks the rest: the loader settles its secondary datasets, so a rejected
 * read still commits the destination, and without that arm the empty state
 * would tell a permitted actor their Workspace has no Warehouse
 * (`frontend-architecture.md` §Page).
 */
export const WarehouseList = ({
  className,
  isError,
  membershipWarehouseIds,
  peopleCounts,
  selectedWarehouseId,
  warehouses,
  onSelect,
}: WarehouseListProps): ReactElement => {
  const { t } = useTranslation('warehouse');
  // The list is labelled with the administration shell's own tab label, which
  // stays in `workspace.json` with the rest of `tabs.*` because the shell reads
  // it too (CR-RG-04).
  const { t: translateWorkspace } = useTranslation('workspace');
  const [query, setQuery] = useState('');
  const trimmedQuery = query.trim();
  const visibleWarehouses = warehouses.filter(
    nameContains(trimmedQuery.toLocaleLowerCase()),
  );
  const listState = resolveListState({
    isError,
    matchCount: visibleWarehouses.length,
    warehouseCount: warehouses.length,
  });

  const content: Record<WarehouseListState, ReactElement> = {
    failed: (
      <p role="alert" className="mt-3 text-muted">
        {t('warehouses.error')}
      </p>
    ),
    empty: (
      <p role="status" className="mt-3 text-muted">
        {t('warehouses.empty')}
      </p>
    ),
    // Resolving on `warehouses` alone left a search that matches nothing
    // rendering an empty `<ul>` and no explanation, while the detail pane still
    // showed the previously selected Warehouse — so the list read as broken
    // rather than as filtered.
    noMatches: (
      <p role="status" className="mt-3 text-muted">
        {t('warehouses.noMatches', { query: trimmedQuery })}
      </p>
    ),
    ready: (
      <ul
        aria-label={translateWorkspace('tabs.warehouses')}
        className="mt-3 space-y-3"
      >
        {visibleWarehouses.map((warehouse) => (
          <li key={warehouse.id} className={ROW_ENTER}>
            <WarehouseRow
              isSelected={warehouse.id === selectedWarehouseId}
              membershipWarehouseIds={membershipWarehouseIds}
              peopleCount={peopleCounts?.[warehouse.id]}
              warehouse={warehouse}
              onSelect={onSelect}
            />
          </li>
        ))}
      </ul>
    ),
  };

  return (
    <div className={className}>
      <WarehouseSearchField value={query} onChange={setQuery} />
      {content[listState]}
    </div>
  );
};
