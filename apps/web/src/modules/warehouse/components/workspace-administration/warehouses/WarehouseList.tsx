import { Chip, SearchField, Skeleton } from '@heroui/react';
import { buttonVariants } from '@heroui/styles';
import { Link as RouterLink } from '@tanstack/react-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { ROUTES } from 'shared/constants/routes';
import { LogInIcon } from 'shared/icons';

import type { Warehouse } from '@warehouser/contracts/workspaces';
import type { ReactElement } from 'react';

type WarehouseListProps = {
  className?: string;
  isLoading: boolean;
  membershipWarehouseIds: readonly string[];
  peopleCounts: Record<string, number> | undefined;
  selectedWarehouseId: string | undefined;
  warehouses: Warehouse[];
  onSelect: (warehouseId: string) => void;
};

/**
 * The searchable Warehouse list (AC-33, AC-12a). Selected = 2px accent
 * stroke; archived = neutral chip plus meta text, never colour alone. Being in
 * operation is the default state of a Warehouse and carries no chip — only the
 * departure from it is worth marking. The search term is local — nothing
 * outside this list reads it. `className` carries the responsive collapse:
 * below the split-view breakpoint this pane hides while the detail screen is
 * active.
 *
 * CR-AC-13 — each row also carries an Enter link, but only for a
 * non-archived Warehouse present in `membershipWarehouseIds`. Every other row
 * renders no Enter control at all: hidden, never disabled (CR-AC-04). The
 * card is the row's own element and the link a sibling of the selection
 * `<button>` inside it, never nested inside it — a link cannot nest inside a
 * button — so the selection button stays first in focus order while Enter
 * still draws inside the Warehouse block beside the name (`zubpS`, `XeG2t`).
 */
export const WarehouseList = ({
  className,
  isLoading,
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
  if (isLoading) {
    content = (
      <div aria-label={t('warehouses.loading')} className="mt-3 space-y-3">
        <Skeleton className="h-16 rounded-lg" />
        <Skeleton className="h-16 rounded-lg" />
        <Skeleton className="h-16 rounded-lg" />
      </div>
    );
  } else if (warehouses.length === 0) {
    content = (
      <p role="status" className="mt-3 text-muted">
        {t('warehouses.empty')}
      </p>
    );
  } else {
    content = (
      <ul
        aria-label={translateWorkspace('tabs.warehouses')}
        className="mt-3 space-y-3"
      >
        {visibleWarehouses.map((warehouse) => {
          const isSelected = warehouse.id === selectedWarehouseId;
          const isArchived = warehouse.archivedAt !== null;
          const peopleCount = peopleCounts?.[warehouse.id];
          const canEnter =
            !isArchived && membershipWarehouseIds.includes(warehouse.id);

          return (
            <li key={warehouse.id}>
              <div
                className={`flex items-start gap-2 rounded-xl border bg-surface p-4 transition-colors ${isSelected ? 'border-2 border-accent' : 'border-border hover:border-accent/40'}`}
              >
                <button
                  type="button"
                  aria-pressed={isSelected}
                  className="flex-1 rounded-lg text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                  onClick={() => onSelect(warehouse.id)}
                >
                  <span className="block font-semibold">{warehouse.name}</span>
                  <span className="mt-2 block text-sm text-muted">
                    {isArchived ? t('warehouses.readOnly') : null}
                    {isArchived && peopleCount !== undefined ? ' · ' : null}
                    {peopleCount !== undefined
                      ? t('warehouses.peopleWithAccess', {
                          count: peopleCount,
                        })
                      : null}
                  </span>
                </button>
                {isArchived ? (
                  <Chip color="default" size="sm" variant="soft">
                    {t('warehouses.chips.archived')}
                  </Chip>
                ) : null}
                {canEnter ? (
                  <RouterLink
                    to={ROUTES.WAREHOUSE}
                    params={{ warehouseId: warehouse.id }}
                    // Every row renders this same visible word, so the bare
                    // label leaves a screen-reader link list showing N
                    // identical "Enter" links with nothing to tell them apart.
                    // The accessible name names the Warehouse; the visible
                    // label stays short, as the approved row draws it.
                    aria-label={t('warehouses.enterNamed', {
                      name: warehouse.name,
                    })}
                    className={`shrink-0 gap-1.5 ${buttonVariants({ variant: 'tertiary', size: 'sm' })}`}
                  >
                    <LogInIcon />
                    {t('warehouses.enter')}
                  </RouterLink>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>
    );
  }

  return (
    <div className={className}>
      <SearchField
        aria-label={t('warehouses.search')}
        value={query}
        onChange={setQuery}
      >
        <SearchField.Group className="h-12 border border-border bg-surface shadow-none">
          <SearchField.SearchIcon />
          <SearchField.Input placeholder={t('warehouses.search')} />
          <SearchField.ClearButton />
        </SearchField.Group>
      </SearchField>
      {content}
    </div>
  );
};
