import { PermissionId } from '@warehouser/shared-types/enums';
import { useTranslation } from 'react-i18next';

import { useArchivedWarehouse } from 'shared/hooks/projections/useArchivedWarehouse';
import { usePermittedItems } from 'shared/hooks/projections/usePermittedItems';

import type { Item } from '@warehouser/contracts/items';

export type ItemAction = {
  id: 'adjustOnHand' | 'correct' | 'toggleActive';
  label: string;
  /** The Permission that offers this action. */
  permission: PermissionId;
  /**
   * Whether the action is offered but refused (AC-23). Every action here
   * changes what the Warehouse holds, so an archived Warehouse disables all
   * three rather than withholding them — a withheld control is what a
   * Permission does, and archiving is not a Permission
   * (`shared/hooks/projections/useArchivedWarehouse.ts`).
   */
  isDisabled: boolean;
  /** The element stating why the action is disabled, for `aria-describedby`. */
  reasonId: string | undefined;
  run: () => void;
};

/**
 * What a surface hands down to its rows: three reports upward and nothing
 * else. Every one of them only tells the surface that owns the dialogs which
 * record was chosen, which is the single thing a React Aria row renderer may
 * close over besides the record itself
 * (`docs/system/adr/27-08-2026-heroui-table-for-web-data-tables.md`).
 *
 * Reactivation is deliberately absent: it asks nothing, so it is a request the
 * menu runs itself rather than a report — see `ItemActionsMenu`.
 */
export type ItemActionHandlers = {
  onAdjustOnHand: (item: Item) => void;
  onCorrect: (item: Item) => void;
  onDeactivate: (item: Item) => void;
};

/**
 * What `useItemActions` runs when an action is chosen. It differs from
 * `ItemActionHandlers` in one entry: the menu composes the two halves of
 * `toggleActive` — reactivating, which it performs, and deactivating, which it
 * reports — into the single handler this action carries.
 */
export type ItemActionRunners = {
  onAdjustOnHand: (item: Item) => void;
  onCorrect: (item: Item) => void;
  onToggleActive: (item: Item) => void;
};

/**
 * One Item's actions, kept to the ones the actor's Role admits (AC-06b,
 * AC-06d, AC-08) and disabled — never hidden — while the Warehouse is archived
 * (AC-23). The table's menu and the mobile card both read this one projection
 * rather than each declaring its own Permission mapping
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
  { onAdjustOnHand, onCorrect, onToggleActive }: ItemActionRunners,
): ItemAction[] => {
  const { t } = useTranslation('item');
  const { isArchived, reasonId } = useArchivedWarehouse();
  const isInactive = item.deactivatedAt !== null;

  return usePermittedItems<ItemAction>([
    {
      id: 'correct',
      label: t('directory.menu.correct'),
      permission: PermissionId.ITEMS_UPDATE,
      isDisabled: isArchived,
      reasonId,
      run: () => onCorrect(item),
    },
    {
      id: 'toggleActive',
      label: isInactive
        ? t('directory.menu.reactivate')
        : t('directory.menu.deactivate'),
      permission: PermissionId.ITEMS_DEACTIVATE,
      isDisabled: isArchived,
      reasonId,
      run: () => onToggleActive(item),
    },
    {
      id: 'adjustOnHand',
      label: t('directory.menu.adjustOnHand'),
      permission: PermissionId.ITEM_STOCK_ADJUST,
      isDisabled: isArchived,
      reasonId,
      run: () => onAdjustOnHand(item),
    },
  ]);
};
