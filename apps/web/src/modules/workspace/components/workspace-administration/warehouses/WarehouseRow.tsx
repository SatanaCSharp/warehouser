import { Chip } from '@heroui/react';
import { useTranslation } from 'react-i18next';

import { WarehouseEnterLink } from 'modules/workspace/components/workspace-administration/warehouses/WarehouseEnterLink';
import { Conditional } from 'shared/components/Conditional';

import type { Warehouse } from '@warehouser/contracts/workspaces';
import type { ReactElement } from 'react';

type WarehouseRowProps = {
  isSelected: boolean;
  membershipWarehouseIds: readonly string[];
  peopleCount: number | undefined;
  warehouse: Warehouse;
  onSelect: (warehouseId: string) => void;
};

/**
 * One Warehouse of the list (AC-33, AC-12a). Selected = 2px accent stroke;
 * archived = neutral chip plus meta text, never colour alone. Being in
 * operation is the default state of a Warehouse and carries no chip — only the
 * departure from it is worth marking.
 *
 * CR-AC-13 — the row also carries an Enter link, but only for a non-archived
 * Warehouse present in `membershipWarehouseIds`. Every other row renders no
 * Enter control at all: hidden, never disabled (modules-level-refactor
 * CR-AC-04, re-pinned here as CR-RG-02). `canEnter` is
 * derived here, next to the single inline guard that applies it, so the rule
 * reads beside the control it protects and the membership set travels no
 * further down than this row.
 */
export const WarehouseRow = ({
  isSelected,
  membershipWarehouseIds,
  peopleCount,
  warehouse,
  onSelect,
}: WarehouseRowProps): ReactElement => {
  const { t } = useTranslation('warehouse');
  const isArchived = warehouse.archivedAt !== null;
  const canEnter = !isArchived && membershipWarehouseIds.includes(warehouse.id);

  const onSelectWarehouse = (warehouseId: string) => (): void =>
    onSelect(warehouseId);

  return (
    <div
      className={`flex items-start gap-2 rounded-xl border bg-surface p-4 transition-colors ${isSelected ? 'border-2 border-accent' : 'border-border hover:border-accent/40'}`}
    >
      <button
        type="button"
        aria-pressed={isSelected}
        className="flex-1 rounded-lg text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        onClick={onSelectWarehouse(warehouse.id)}
      >
        <span className="block font-semibold">{warehouse.name}</span>
        <span className="mt-2 block text-sm text-muted">
          <Conditional when={isArchived}>
            {t('warehouses.readOnly')}
          </Conditional>
          <Conditional when={isArchived && peopleCount !== undefined}>
            {' · '}
          </Conditional>
          <Conditional when={peopleCount !== undefined}>
            {t('warehouses.peopleWithAccess', { count: peopleCount })}
          </Conditional>
        </span>
      </button>
      <Conditional when={isArchived}>
        <Chip color="default" size="sm" variant="soft">
          {t('warehouses.chips.archived')}
        </Chip>
      </Conditional>
      <Conditional when={canEnter}>
        <WarehouseEnterLink warehouse={warehouse} />
      </Conditional>
    </div>
  );
};
