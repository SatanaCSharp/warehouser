import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { WarehouseRow } from 'modules/workspace/components/workspace-administration/warehouses/WarehouseRow';
import { WarehouseSearchField } from 'modules/workspace/components/workspace-administration/warehouses/WarehouseSearchField';

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
 * The searchable Warehouse list (AC-33, AC-12a). The search term is local —
 * nothing outside this list reads it. `className` carries the responsive
 * collapse: below the split-view breakpoint this pane hides while the detail
 * screen is active.
 *
 * The three-way `content` assignment stays flat here and only its branch
 * bodies extract (refactor-warehouse-components CR-AC-04). The empty state is
 * the exception: one `<p role="status">` is below the threshold at which
 * indirection pays, so it stays inline rather than becoming a file of its own.
 *
 * There is no loading arm: `/workspace`'s route loader awaits the Warehouse
 * list before the destination is committed, so the list is never mounted
 * without it (global-loader CH-14). There **is** a failed-read arm, and it is
 * first: the loader settles its secondary datasets, so a rejected read still
 * commits the destination, and without this arm the empty branch below would
 * tell a permitted actor their Workspace has no Warehouse
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
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const visibleWarehouses = warehouses.filter((warehouse) =>
    warehouse.name.toLocaleLowerCase().includes(normalizedQuery),
  );

  let content: ReactElement;
  if (isError) {
    content = (
      <p role="alert" className="mt-3 text-muted">
        {t('warehouses.error')}
      </p>
    );
  } else if (warehouses.length === 0) {
    content = (
      <p role="status" className="mt-3 text-muted">
        {t('warehouses.empty')}
      </p>
    );
  } else if (visibleWarehouses.length === 0) {
    // Branching on `warehouses` alone left a search that matches nothing
    // rendering an empty `<ul>` and no explanation, while the detail pane still
    // showed the previously selected Warehouse — so the list read as broken
    // rather than as filtered.
    content = (
      <p role="status" className="mt-3 text-muted">
        {t('warehouses.noMatches', { query: query.trim() })}
      </p>
    );
  } else {
    content = (
      <ul
        aria-label={translateWorkspace('tabs.warehouses')}
        className="mt-3 space-y-3"
      >
        {visibleWarehouses.map((warehouse) => (
          <li key={warehouse.id}>
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
    );
  }

  return (
    <div className={className}>
      <WarehouseSearchField value={query} onChange={setQuery} />
      {content}
    </div>
  );
};
