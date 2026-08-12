import { Chip, SearchField, Skeleton } from '@heroui/react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import type { Warehouse } from '@warehouser/contracts/workspaces';
import type { ReactElement } from 'react';

type WarehouseListProps = {
  className?: string;
  isLoading: boolean;
  peopleCounts: Record<string, number> | undefined;
  selectedWarehouseId: string | undefined;
  warehouses: Warehouse[];
  onSelect: (warehouseId: string) => void;
};

/**
 * The searchable Warehouse list (AC-33, AC-12a). Selected = 2px accent
 * stroke; archived = neutral chip plus meta text, never colour alone. The
 * search term is local — nothing outside this list reads it. `className`
 * carries the responsive collapse: below the split-view breakpoint this pane
 * hides while the detail screen is active.
 */
export const WarehouseList = ({
  className,
  isLoading,
  peopleCounts,
  selectedWarehouseId,
  warehouses,
  onSelect,
}: WarehouseListProps): ReactElement => {
  const { t } = useTranslation('workspace');
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
      <ul aria-label={t('tabs.warehouses')} className="mt-3 space-y-3">
        {visibleWarehouses.map((warehouse) => {
          const isSelected = warehouse.id === selectedWarehouseId;
          const isArchived = warehouse.archivedAt !== null;
          const peopleCount = peopleCounts?.[warehouse.id];

          return (
            <li key={warehouse.id}>
              <button
                type="button"
                aria-pressed={isSelected}
                className={`w-full rounded-xl border bg-surface p-4 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${isSelected ? 'border-2 border-accent' : 'border-border hover:border-accent/40'}`}
                onClick={() => onSelect(warehouse.id)}
              >
                <span className="flex items-center justify-between gap-2">
                  <span className="font-semibold">{warehouse.name}</span>
                  <Chip
                    color={isArchived ? 'default' : 'success'}
                    size="sm"
                    variant="soft"
                  >
                    {isArchived
                      ? t('warehouses.chips.archived')
                      : t('warehouses.chips.inOperation')}
                  </Chip>
                </span>
                <span className="mt-2 block text-sm text-muted">
                  {isArchived ? t('warehouses.readOnly') : null}
                  {isArchived && peopleCount !== undefined ? ' · ' : null}
                  {peopleCount !== undefined
                    ? t('warehouses.peopleWithAccess', { count: peopleCount })
                    : null}
                </span>
              </button>
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
