import { EmptyState, Table } from '@heroui/react';
import type { PurchaseDraftLineListEntry } from '@warehouser/contracts/purchase-drafts';
import { DockLineDestinationCell } from 'modules/purchase-draft/components/purchase-draft-line-directory/components/DockLineDestinationCell';
import { DockLineDraftCell } from 'modules/purchase-draft/components/purchase-draft-line-directory/components/DockLineDraftCell';
import { DockLineEndingCell } from 'modules/purchase-draft/components/purchase-draft-line-directory/components/DockLineEndingCell';
import { DockLineExpectedCell } from 'modules/purchase-draft/components/purchase-draft-line-directory/components/DockLineExpectedCell';
import { DockLineItemCell } from 'modules/purchase-draft/components/purchase-draft-line-directory/components/DockLineItemCell';
import { DockLineQuantityCell } from 'modules/purchase-draft/components/purchase-draft-line-directory/components/DockLineQuantityCell';
import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';

export type DockLineTableProps = {
  entries: PurchaseDraftLineListEntry[];
  /**
   * What this half says when nothing lands in it. The table states it itself —
   * `renderEmptyState` on `Table.Body`
   * (`docs/system/adr/27-08-2026-heroui-table-for-web-data-tables.md`
   * §Decision rule 3) — rather than leaving it to a paragraph beside the
   * table, which the by-line view has no second responsive surface to justify.
   */
  emptyMessage: string;
  /** Names the table for assistive technology. */
  label: string;
};

/**
 * One half of the `By line` view — `Delivery/Dock Line Row` (`DFncO`) repeated
 * for every line whose own Delivery Mode places it here (AC-22).
 *
 * It is a HeroUI `Table`, not a hand-assembled `<table>`
 * (`docs/system/adr/27-08-2026-heroui-table-for-web-data-tables.md`), and its
 * row renderer resolves nothing per line: every cell that reads a translation
 * or a formatter is its own component, because a React Aria collection caches
 * a row's element tree per record and a renderer may call no hook.
 *
 * A row's height is the content's, never fixed, so a wrapping destination is
 * never clipped — an address is long by nature and truncating one makes it
 * ambiguous (design-handoff.md §Component mapping, §Accessibility).
 */
export const DockLineTable = ({
  emptyMessage,
  entries,
  label,
}: DockLineTableProps): ReactElement => {
  const { t } = useTranslation('purchase-draft');

  // Reaching an empty half is a resolved answer a member preparing the dock
  // needs, not a failure, so it announces itself with `role="status"`.
  const renderEmptyState = (): ReactElement => (
    <EmptyState className="p-3 text-sm text-muted" role="status">
      {emptyMessage}
    </EmptyState>
  );

  const renderLineRow = (entry: PurchaseDraftLineListEntry): ReactElement => (
    <Table.Row
      id={entry.line.id}
      key={entry.line.id}
      textValue={entry.line.itemSku}
    >
      <Table.Cell className="align-middle">
        <DockLineDraftCell entry={entry} />
      </Table.Cell>
      <Table.Cell className="align-middle">
        <DockLineItemCell line={entry.line} />
      </Table.Cell>
      <Table.Cell className="align-middle text-right">
        <DockLineQuantityCell line={entry.line} />
      </Table.Cell>
      <Table.Cell className="align-middle">
        <DockLineDestinationCell line={entry.line} />
      </Table.Cell>
      <Table.Cell className="align-middle">
        <DockLineExpectedCell entry={entry} />
      </Table.Cell>
      <Table.Cell className="align-middle text-right">
        <DockLineEndingCell entry={entry} />
      </Table.Cell>
    </Table.Row>
  );

  return (
    <Table className="mt-3" variant="secondary">
      <Table.ScrollContainer>
        <Table.Content aria-label={label}>
          <Table.Header>
            <Table.Column isRowHeader id="draft">
              {t('byLine.draftColumn')}
            </Table.Column>
            <Table.Column id="item">{t('byLine.itemColumn')}</Table.Column>
            <Table.Column id="ordered">
              {t('byLine.orderedColumn')}
            </Table.Column>
            <Table.Column id="destination">
              {t('byLine.destinationColumn')}
            </Table.Column>
            <Table.Column id="expected">
              {t('byLine.expectedColumn')}
            </Table.Column>
            <Table.Column id="ending">{t('byLine.endingColumn')}</Table.Column>
          </Table.Header>
          <Table.Body items={entries} renderEmptyState={renderEmptyState}>
            {renderLineRow}
          </Table.Body>
        </Table.Content>
      </Table.ScrollContainer>
    </Table>
  );
};
