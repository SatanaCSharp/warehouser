import { Button, Dropdown, Label } from '@heroui/react';
import type { Item } from '@warehouser/contracts/items';
import { useReactivateItemMutation } from 'modules/item/api/item-api';
import type { ItemActionHandlers } from 'modules/item/hooks/projections/useItemActions';
import { useItemActions } from 'modules/item/hooks/projections/useItemActions';
import type { Key, ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useEnteredWarehouse } from 'shared/hooks/projections/useEnteredWarehouse';
import { KebabIcon } from 'shared/icons';

export type ItemActionsMenuProps = ItemActionHandlers & {
  item: Item;
};

/**
 * The kebab menu one Item carries (design-handoff.md `Ordering/Item Row`,
 * `xEIH0`; the mobile card carries the same one, `VHU6r`).
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
 *
 * AC-23 is the opposite case and is deliberately handled the opposite way: in
 * an archived Warehouse the actions stay listed and are disabled through the
 * menu's own `disabledKeys`, each one describing itself with the sentence
 * `ArchivedWarehouseNotice` renders for the whole destination.
 *
 * **Reactivating is run here, not reported upward**, and for the same reason
 * the Permissions are read here. AC-06d makes reactivation a decision that asks
 * nothing, so it is a bare request rather than a dialog — but a request needs
 * the Warehouse it is addressed to, and a handler assembled above the
 * collection would have captured that Warehouse when the row was first built
 * and kept it. This component is rendered into the real tree, so it reads the
 * entered Warehouse on every render and the request can never be addressed to a
 * stale one. Deactivating states what it leaves behind, so it stays a report:
 * the surface that owns the dialogs opens the confirmation
 * (`docs/system/adr/27-08-2026-heroui-table-for-web-data-tables.md`,
 * `docs/system/adr/19-08-2026-generated-mutation-hooks-in-components.md`).
 */
export const ItemActionsMenu = ({
  item,
  onAdjustOnHand,
  onCorrect,
  onDeactivate,
}: ItemActionsMenuProps): ReactNode => {
  const { t } = useTranslation('item');
  const warehouseId = useEnteredWarehouse();
  const [reactivateItem] = useReactivateItemMutation();
  const label = t('directory.menu.actions', {
    sku: item.sku,
    description: item.description,
  });

  const onToggleActive = (chosen: Item): void => {
    if (chosen.deactivatedAt === null) {
      onDeactivate(chosen);
      return;
    }
    void reactivateItem({
      sku: chosen.sku,
      description: chosen.description,
      warehouseId: warehouseId ?? '',
      itemId: chosen.id,
    });
  };

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

  const disabledKeys = actions
    .filter((action) => action.isDisabled)
    .map((action) => action.id);

  return (
    <Dropdown>
      <Button isIconOnly size="sm" variant="ghost" aria-label={label}>
        <KebabIcon />
      </Button>
      <Dropdown.Popover>
        <Dropdown.Menu
          aria-label={label}
          disabledKeys={disabledKeys}
          onAction={onAction}
        >
          {/* AC-23 — the description belongs on the item that is refused, not
              on the menu around it: a screen reader announces a menu's
              description once, when the menu opens, but announces an item's
              description every time that item takes focus, and a disabled
              `Dropdown.Item` is `aria-disabled` rather than `disabled`, so it
              still takes focus. React Aria merges a caller's
              `aria-describedby` into the one it computes for the item
              (`react-aria`'s `useMenuItem`), and TypeScript admits the
              hyphenated attribute even though RAC's `MenuItemProps` stops at
              `aria-label` — so this needs no cast. `reasonId` is `undefined`
              while nothing disables the action, so nothing points at an
              element the page has not rendered. */}
          {actions.map(({ id, label: actionLabel, reasonId }) => (
            <Dropdown.Item
              aria-describedby={reasonId}
              id={id}
              key={id}
              textValue={actionLabel}
            >
              <Label>{actionLabel}</Label>
            </Dropdown.Item>
          ))}
        </Dropdown.Menu>
      </Dropdown.Popover>
    </Dropdown>
  );
};
