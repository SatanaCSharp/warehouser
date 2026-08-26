import { Button, Chip, Dropdown, Label } from '@heroui/react';
import { useTranslation } from 'react-i18next';

import { useItemActions } from 'modules/item/hooks/projections/useItemActions';
import { Conditional } from 'shared/components/Conditional';
import { KebabIcon } from 'shared/icons';

import type { Item } from '@warehouser/contracts/items';
import type { Key, ReactElement } from 'react';

export type ItemRowProps = {
  item: Item;
  onAdjustOnHand: (item: Item) => void;
  onCorrect: (item: Item) => void;
  onToggleActive: (item: Item) => void;
};

/**
 * One Item of the catalogue (design-handoff.md `Ordering/Item Row`, `xEIH0`).
 * The on-hand cell always carries the counted figure and, while one exists,
 * the reason its most recent adjustment was recorded — the reason is part of
 * the contract this cell renders, not decoration (AC-08). A deactivated Item
 * is chipped Inactive while every other cell stays exactly as readable
 * (AC-06d).
 *
 * `Dropdown.Menu` is a React Aria collection, so `useItemActions` names the
 * Permission each action requires in its own descriptor rather than this row
 * testing a capability itself
 * (`docs/system/adr/19-08-2026-declarative-permission-gates.md`).
 */
export const ItemRow = ({
  item,
  onAdjustOnHand,
  onCorrect,
  onToggleActive,
}: ItemRowProps): ReactElement => {
  const { t } = useTranslation('item');
  const isInactive = item.deactivatedAt !== null;
  const actionsLabel = t('directory.menu.actions', { sku: item.sku });
  const actions = useItemActions(item, {
    onAdjustOnHand,
    onCorrect,
    onToggleActive,
  });

  const onAction = (key: Key): void => {
    actions.find((action) => action.id === key)?.run();
  };

  const menu =
    actions.length === 0 ? null : (
      <Dropdown>
        <Button isIconOnly size="sm" variant="ghost" aria-label={actionsLabel}>
          <KebabIcon />
        </Button>
        <Dropdown.Popover>
          <Dropdown.Menu aria-label={actionsLabel} onAction={onAction}>
            {actions.map(({ id, label }) => (
              <Dropdown.Item id={id} key={id} textValue={label}>
                <Label>{label}</Label>
              </Dropdown.Item>
            ))}
          </Dropdown.Menu>
        </Dropdown.Popover>
      </Dropdown>
    );

  return (
    <tr className="border-b border-border">
      <td className="p-2 font-semibold">{item.sku}</td>
      <td className="p-2">{item.description}</td>
      <td className="p-2">{item.unitOfMeasure}</td>
      <td className="p-2">
        <p>{item.onHandQuantity}</p>
        <Conditional when={item.latestAdjustment}>
          <p className="text-sm text-muted">{item.latestAdjustment?.reason}</p>
        </Conditional>
      </td>
      {/* eslint-disable-next-line jsx-a11y/control-has-associated-label --
          this `<td>` renders a `Chip`, not a control; the rule mis-attributes
          its warning here rather than to an actual unlabeled control (the
          menu button two cells over already carries `aria-label`, matching
          the passing `MemberRow.tsx` precedent). */}
      <td className="p-2">
        <Conditional when={isInactive}>
          <Chip color="default" size="sm" variant="soft">
            {t('chips.inactive')}
          </Chip>
        </Conditional>
      </td>
      <td className="p-2">{menu}</td>
    </tr>
  );
};
