import { Outlet, useMatch } from '@tanstack/react-router';

import { useRecordWarehouseEntry } from 'modules/warehouse/hooks/effects/useRecordWarehouseEntry';
import { WarehouseEntryRefusal } from 'shared/components/WarehouseEntryRefusal';

import type { WarehouseEntryVerdict } from 'guards/warehouse-entry.guard';
import type { ReactElement } from 'react';

// T8 / CR-AC-09 — the entry-record write must never run around a refusal.
// Calling the hook from this private helper, rendered only by the branch
// below that already resolved to `entered`, makes that scoping a property of
// *where* the hook is called rather than a condition inside it.
const EnteredWarehouseOutlet = (): ReactElement => {
  useRecordWarehouseEntry();
  return <Outlet />;
};

// T4 / ADR 0001 — the Warehouse layout route's own component. It is rendered
// only as `routes/warehouse.route.tsx`'s `component`, so `useMatch()` with no
// `from` reads the nearest match — that route's own match — without needing
// to import the route object back (which would create a module cycle with
// `routes/warehouse.route.tsx`, which imports this component).
export const WarehouseLayout = (): ReactElement => {
  const verdict = useMatch({
    strict: false,
    select: (match) => match.context as WarehouseEntryVerdict | undefined,
  });

  // CR-AC-07 — the single entry-enforcement point of this change, so its
  // default is closed. Branching on `refused` would admit everything that is
  // merely not that string — including a verdict the route never published —
  // and render the Warehouse view plus its CR-AC-09 write on the strength of
  // an absent value. Only an explicit `entered` enters; anything else is
  // refused non-disclosingly, which is also the correct answer for a state
  // that should be unreachable.
  if (verdict?.status !== 'entered') {
    return <WarehouseEntryRefusal reason={verdict?.reason ?? 'not-a-member'} />;
  }

  return <EnteredWarehouseOutlet />;
};
