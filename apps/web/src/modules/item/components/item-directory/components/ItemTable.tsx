import { Table } from '@heroui/react';
import { useTranslation } from 'react-i18next';

import { ItemActionsMenu } from 'modules/item/components/item-directory/components/ItemActionsMenu';
import { ItemNamingLine } from 'modules/item/components/item-directory/components/ItemNamingLine';
import { ItemOnHand } from 'modules/item/components/item-directory/components/ItemOnHand';
import { ItemStatusChip } from 'modules/item/components/item-directory/components/ItemStatusChip';
import { ItemTableFooter } from 'modules/item/components/item-directory/components/ItemTableFooter';

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
 * per Item with its six cells — SKU, description with its naming line, the unit
 * it is counted in, on hand with its reason line, status, actions — and the
 * footer row that counts the collection.
 *
 * A deactivated row is dimmed rather than removed or restyled: AC-06d keeps it
 * "readable and counting exactly as before", and the `Inactive` chip plus the
 * naming line's own clause carry the meaning, so the opacity is reinforcement
 * and never the signal (design-handoff.md § Accessibility).
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
 * had when the row was first built. So every cell that reads translations, a
 * formatter or the actor's Permissions is its own component, and this file
 * resolves nothing per Item beyond the row's own class.
 *
 * The three handlers it *does* close over are the exception the same decision
 * names: **callbacks that only report an event upward**. Each one hands the
 * chosen Item to the surface that owns the dialogs and reads nothing else, so a
 * cached copy behaves identically to a fresh one. That is a property of these
 * handlers, not of callbacks in general — a handler that also carried the
 * entered Warehouse into a request would be captured with whatever that
 * Warehouse was at first build, which is why reactivating an Item is run by
 * `ItemActionsMenu` rather than passed through here
 * (`docs/system/adr/27-08-2026-heroui-table-for-web-data-tables.md`).
 */
export const ItemTable = ({
  items,
  label,
  onAdjustOnHand,
  onCorrect,
  onDeactivate,
}: ItemTableProps): ReactElement => {
  const { t } = useTranslation('item');

  const renderItemRow = (item: Item): ReactElement => (
    <Table.Row
      id={item.id}
      key={item.id}
      textValue={item.sku}
      className={item.deactivatedAt === null ? undefined : 'opacity-60'}
    >
      <Table.Cell className="font-semibold">{item.sku}</Table.Cell>
      <Table.Cell>
        <p className="text-foreground">{item.description}</p>
        <ItemNamingLine item={item} />
      </Table.Cell>
      <Table.Cell>{item.unitOfMeasure}</Table.Cell>
      <Table.Cell className="text-right">
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
          onDeactivate={onDeactivate}
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
      <Table.Footer>
        <ItemTableFooter items={items} />
      </Table.Footer>
    </Table>
  );
};
