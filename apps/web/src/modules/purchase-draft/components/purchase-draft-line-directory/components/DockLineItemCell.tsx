import type { PurchaseDraftLine } from '@warehouser/contracts/purchase-drafts';
import type { ReactElement } from 'react';

export type DockLineItemCellProps = {
  line: PurchaseDraftLine;
};

/**
 * The `Item` cell of `Delivery/Dock Line Row` (`DFncO`): what a member
 * preparing the dock is looking for on the pallet — the SKU they read off it,
 * and the description that tells them they have the right one.
 *
 * Neither is customer identity, so both are stated whatever the actor may read
 * (AC-09a).
 */
export const DockLineItemCell = ({
  line,
}: DockLineItemCellProps): ReactElement => (
  <span className="block min-w-0">
    <span className="block font-medium text-foreground">{line.itemSku}</span>
    <span className="block break-words text-sm text-muted">
      {line.itemDescription}
    </span>
  </span>
);
