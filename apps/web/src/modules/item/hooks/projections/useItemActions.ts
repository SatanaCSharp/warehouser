import { PermissionId } from '@warehouser/shared-types/enums';
import { useTranslation } from 'react-i18next';

import { usePermittedItems } from 'shared/hooks/projections/usePermittedItems';

import type { Item } from '@warehouser/contracts/items';

export type ItemAction = {
  id: 'adjustOnHand' | 'correct' | 'toggleActive';
  label: string;
  /** The Permission that offers this action. */
  permission: PermissionId;
  run: () => void;
};

export type ItemActionHandlers = {
  onAdjustOnHand: (item: Item) => void;
  onCorrect: (item: Item) => void;
  onToggleActive: (item: Item) => void;
};

/**
 * One Item's actions, kept to the ones the actor's Role admits (AC-06b,
 * AC-06d, AC-08). The table's menu and the mobile card both read this one
 * projection rather than each declaring its own Permission mapping
 * (`docs/system/adr/19-08-2026-declarative-permission-gates.md`).
 *
 * It is called by the component that renders the actions, never by whatever
 * renders the collection above it. A React Aria collection caches a row's
 * element tree per record, so a value read above it and closed over would
 * still be the one that existed when the row was first built — an actor whose
 * Permissions resolved a moment later would be offered nothing, for good
 * (`docs/system/adr/27-08-2026-heroui-table-for-web-data-tables.md`).
 */
export const useItemActions = (
  item: Item,
  { onAdjustOnHand, onCorrect, onToggleActive }: ItemActionHandlers,
): ItemAction[] => {
  const { t } = useTranslation('item');
  const isInactive = item.deactivatedAt !== null;

  return usePermittedItems<ItemAction>([
    {
      id: 'correct',
      label: t('directory.menu.correct'),
      permission: PermissionId.ITEMS_UPDATE,
      run: () => onCorrect(item),
    },
    {
      id: 'toggleActive',
      label: isInactive
        ? t('directory.menu.reactivate')
        : t('directory.menu.deactivate'),
      permission: PermissionId.ITEMS_DEACTIVATE,
      run: () => onToggleActive(item),
    },
    {
      id: 'adjustOnHand',
      label: t('directory.menu.adjustOnHand'),
      permission: PermissionId.ITEM_STOCK_ADJUST,
      run: () => onAdjustOnHand(item),
    },
  ]);
};
