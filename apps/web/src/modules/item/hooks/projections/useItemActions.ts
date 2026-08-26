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
 * The Item row's per-Item actions, kept to the ones the actor's Role
 * actually admits (AC-06b, AC-06d, AC-08). Both `ItemRow`'s `Dropdown.Menu`
 * and the mobile card read this one projection rather than each declaring
 * its own Permission mapping, so the two surfaces cannot drift
 * (`docs/system/adr/19-08-2026-declarative-permission-gates.md`).
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
