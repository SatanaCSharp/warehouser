import type { PurchaseDraftLineListEntry } from '@warehouser/contracts/purchase-drafts';
import type { ReactElement } from 'react';

export type DockLineDraftCellProps = {
  entry: PurchaseDraftLineListEntry;
};

/**
 * The `Draft` cell of `Delivery/Dock Line Row` (`DFncO`): the draft this line
 * belongs to, named by the human reference a member quotes.
 *
 * A line of a mixed draft appears in whichever half its own mode places it, so
 * the same reference shows up under both headings — which is exactly why every
 * row has to name it.
 *
 * When its goods are expected is its own `EXPECTED` column
 * (`DockLineExpectedCell`), as frame `zj46c` draws it, rather than a second
 * line folded into this one.
 */
export const DockLineDraftCell = ({
  entry,
}: DockLineDraftCellProps): ReactElement => (
  <span className="block min-w-0 font-semibold text-foreground">
    {entry.purchaseDraftReference}
  </span>
);
