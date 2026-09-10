import type { PurchaseDraftLineListEntry } from '@warehouser/contracts/purchase-drafts';
import type { LineEndingDraft } from 'modules/purchase-draft/components/purchase-draft-transitions/components/LineEndingAction';
import { LineEndingAction } from 'modules/purchase-draft/components/purchase-draft-transitions/components/LineEndingAction';
import type { ReactElement } from 'react';

export type DockLineEndingCellProps = {
  entry: PurchaseDraftLineListEntry;
};

/**
 * The `ENDING` cell of `Delivery/Dock Line Row` (`DFncO`, frame `zj46c`): the
 * per-line ending action — `Record arrival` / `Record delivery`, or the
 * recorded-ending chip once one exists — reached from the by-line view
 * exactly as it already is from the draft detail (AC-19, AC-22).
 *
 * `LineEndingAction` is reused unchanged; only the draft it is handed is
 * narrower, because the by-line read already carries everything that action
 * needs (`LineEndingAction.tsx`'s `LineEndingDraft`) and this cell fetches no
 * second, full draft to build one.
 *
 * It is its own component rather than an expression in a cell because it
 * renders `LineEndingAction`, which itself reads Permissions and mutation
 * hooks, and a React Aria row renderer may call no hook
 * (`docs/system/adr/27-08-2026-heroui-table-for-web-data-tables.md`).
 */
export const DockLineEndingCell = ({
  entry,
}: DockLineEndingCellProps): ReactElement | null => {
  const draft: LineEndingDraft = {
    id: entry.purchaseDraftId,
    reference: entry.purchaseDraftReference,
    state: entry.purchaseDraftState,
    lines: [entry.line],
  };

  return <LineEndingAction draft={draft} line={entry.line} />;
};
