import { Button, Dropdown, Label } from '@heroui/react';
import { useTranslation } from 'react-i18next';

import { useItemActions } from 'modules/item/hooks/projections/useItemActions';
import { KebabIcon } from 'shared/icons';

import type { Item } from '@warehouser/contracts/items';
import type { ItemActionHandlers } from 'modules/item/hooks/projections/useItemActions';
import type { Key, ReactNode } from 'react';

export type ItemActionsMenuProps = ItemActionHandlers & {
  item: Item;
};

/**
 * The kebab menu one Item carries (design-handoff.md `Ordering/Item Row`,
 * `xEIH0`).
 *
 * It reads its own actions rather than being handed them. This is the rule for
 * anything inside a React Aria collection: the collection caches a row's
 * element tree per record, so a list resolved above it and passed in would
 * never be re-resolved — but this component subscribes to the Permissions
 * projection itself, so it re-renders when that resolves regardless of the
 * cache (`docs/system/adr/27-08-2026-heroui-table-for-web-data-tables.md`).
 *
 * An actor permissioned for none of the actions gets no trigger at all rather
 * than an empty menu — the collection form of what a `WarehousePermissionGate`
 * does to a control it protects
 * (`docs/system/adr/19-08-2026-declarative-permission-gates.md`).
 */
export const ItemActionsMenu = ({
  item,
  onAdjustOnHand,
  onCorrect,
  onToggleActive,
}: ItemActionsMenuProps): ReactNode => {
  const { t } = useTranslation('item');
  const label = t('directory.menu.actions', { sku: item.sku });
  const actions = useItemActions(item, {
    onAdjustOnHand,
    onCorrect,
    onToggleActive,
  });

  const onAction = (key: Key): void => {
    actions.find((action) => action.id === key)?.run();
  };

  if (actions.length === 0) {
    return null;
  }

  return (
    <Dropdown>
      <Button isIconOnly size="sm" variant="ghost" aria-label={label}>
        <KebabIcon />
      </Button>
      <Dropdown.Popover>
        <Dropdown.Menu aria-label={label} onAction={onAction}>
          {actions.map(({ id, label: actionLabel }) => (
            <Dropdown.Item id={id} key={id} textValue={actionLabel}>
              <Label>{actionLabel}</Label>
            </Dropdown.Item>
          ))}
        </Dropdown.Menu>
      </Dropdown.Popover>
    </Dropdown>
  );
};
