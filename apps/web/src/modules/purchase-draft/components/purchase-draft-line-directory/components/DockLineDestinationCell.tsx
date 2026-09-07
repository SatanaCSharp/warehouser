import { useTranslation } from 'react-i18next';

import { DriftSignal } from 'modules/purchase-draft/components/DriftSignal';
import { useDestinationStatement } from 'modules/purchase-draft/hooks/projections/useDestinationStatement';
import { Conditional } from 'shared/components/Conditional';
import { MapPinIcon } from 'shared/icons';

import type { PurchaseDraftLine } from '@warehouser/contracts/purchase-drafts';
import type { ReactElement } from 'react';

export type DockLineDestinationCellProps = {
  line: PurchaseDraftLine;
};

/**
 * The `DESTINATION` cell of `Delivery/Dock Line Row` (`DFncO`, frame `zj46c`):
 * where this line's goods travel, and — when a linked Customer Order has been
 * redirected since the draft was frozen — the warning second line the frame
 * draws under it (AC-18, design-handoff.md §States "one carrying address
 * drift").
 *
 * **Why the by-line view has to say this at all.** A member preparing the dock
 * reads this table and nothing else; the aggregate drift alert lives on the
 * draft they have not opened. Without this line, the one surface that decides
 * what is put on a pallet is the one surface that never mentions the address
 * moved.
 *
 * It is its own component rather than an expression in a cell because it reads
 * translations and the destination projection, and a React Aria row renderer
 * may call no hook
 * (`docs/system/adr/27-08-2026-heroui-table-for-web-data-tables.md`).
 *
 * The signal is the shared `DriftSignal` — icon **plus** text, never colour
 * alone — so this cell cannot repaint a warning of its own that disagrees with
 * the draft's. It states that an order was redirected and no more: which
 * address it moved to is customer data the redacted arm of this read does not
 * carry (AC-09a), and the entitled member is told both halves on the draft
 * itself.
 *
 * The address is rendered as text, never as markup and never as a link, and it
 * wraps rather than truncating: an address is long by nature and truncating one
 * makes it ambiguous (spec.md §6.1, design-handoff.md §Accessibility).
 */
export const DockLineDestinationCell = ({
  line,
}: DockLineDestinationCellProps): ReactElement => {
  const { t } = useTranslation('purchase-draft');
  const destinationStatement = useDestinationStatement();

  const { accessNotes, address, hasAddress, subject } =
    destinationStatement(line);
  const hasAddressDrift = line.links.some((link) =>
    link.driftSignals.includes('delivery_address_changed'),
  );

  return (
    <div className="flex items-start gap-2">
      <span
        aria-hidden="true"
        className={`mt-0.5 shrink-0 text-muted ${hasAddress ? '' : 'invisible'}`}
      >
        <MapPinIcon />
      </span>
      <span className="min-w-0">
        <span className="block break-words font-medium text-foreground empty:hidden">
          {subject}
        </span>
        <span
          className={`block whitespace-pre-line break-words ${
            hasAddress ? 'text-foreground' : 'text-muted'
          }`}
        >
          {address}
        </span>
        <span className="block text-sm text-muted empty:hidden">
          {accessNotes}
        </span>
        <Conditional when={hasAddressDrift}>
          <DriftSignal
            className="mt-1 text-sm"
            label={t('byLine.addressDrift')}
          />
        </Conditional>
      </span>
    </div>
  );
};
