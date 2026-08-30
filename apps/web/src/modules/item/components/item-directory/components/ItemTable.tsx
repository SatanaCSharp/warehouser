import { Table } from '@heroui/react';
import { useTranslation } from 'react-i18next';

import { ItemActionsMenu } from 'modules/item/components/item-directory/components/ItemActionsMenu';
import { ItemOnHand } from 'modules/item/components/item-directory/components/ItemOnHand';
import { ItemStatusChip } from 'modules/item/components/item-directory/components/ItemStatusChip';

import type { Item } from '@warehouser/contracts/items';
import type { ItemActionHandlers } from 'modules/item/hooks/projections/useItemActions';
import type { ReactElement } from 'react';

export type ItemTableProps = ItemActionHandlers & {
  items: Item[];
  /** Names the table for assistive technology; the destination's heading. */
  label: string;
};

/**
 * The Items destination's table from the split-view breakpoint up
 * (design-handoff.md `Ordering/Item Row`, `xEIH0`, desktop `XIvAZ`): one row
 * per Item with its six cells — SKU, description, unit, on hand, status,
 * actions.
 *
 * It is a HeroUI `Table`, not a hand-assembled `<table>`
 * (`docs/system/adr/27-08-2026-heroui-table-for-web-data-tables.md`), so cell
 * density, row borders and hover come from `@heroui/styles` tokens rather than
 * a `p-2` repeated twelve times, and the status cell needs no
 * `jsx-a11y/control-has-associated-label` suppression to hold a `Chip`.
 *
 * The row renderer is a plain function, not a component: a React Aria
 * collection builds its rows before they reach the DOM, so a renderer may call
 * no hook. Nor may it close over live state — the collection caches a row's
 * element tree per record, so anything resolved here would keep the value it
 * had when the row was first built. So every cell that reads translations or
 * the actor's Permissions is its own component, and this file resolves
 * nothing per Item at all.
 */
export const ItemTable = ({
  items,
  label,
  onAdjustOnHand,
  onCorrect,
  onToggleActive,
}: ItemTableProps): ReactElement => {
  const { t } = useTranslation('item');

  const renderItemRow = (item: Item): ReactElement => (
    <Table.Row id={item.id} key={item.id} textValue={item.sku}>
      <Table.Cell className="font-semibold">{item.sku}</Table.Cell>
      <Table.Cell>{item.description}</Table.Cell>
      <Table.Cell>{item.unitOfMeasure}</Table.Cell>
      <Table.Cell>
        <ItemOnHand item={item} />
      </Table.Cell>
      <Table.Cell>
        <ItemStatusChip item={item} />
      </Table.Cell>
      <Table.Cell>
        <ItemActionsMenu
          item={item}
          onAdjustOnHand={onAdjustOnHand}
          onCorrect={onCorrect}
          onToggleActive={onToggleActive}
        />
      </Table.Cell>
    </Table.Row>
  );

  return (
    <Table className="mt-4 hidden lg:block" variant="secondary">
      <Table.ScrollContainer>
        <Table.Content aria-label={label}>
          <Table.Header>
            <Table.Column isRowHeader id="sku">
              {t('directory.table.sku')}
            </Table.Column>
            <Table.Column id="description">
              {t('directory.table.description')}
            </Table.Column>
            <Table.Column id="unitOfMeasure">
              {t('directory.table.unitOfMeasure')}
            </Table.Column>
            <Table.Column id="onHand">
              {t('directory.table.onHand')}
            </Table.Column>
            <Table.Column id="status">
              {t('directory.table.status')}
            </Table.Column>
            <Table.Column id="actions">
              <span className="sr-only">{t('directory.table.actions')}</span>
            </Table.Column>
          </Table.Header>
          <Table.Body items={items}>{renderItemRow}</Table.Body>
        </Table.Content>
      </Table.ScrollContainer>
    </Table>
  );
};
