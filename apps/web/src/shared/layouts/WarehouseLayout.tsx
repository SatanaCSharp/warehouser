import { Outlet, useMatch } from '@tanstack/react-router';

import { WarehouseEntryRefusal } from 'shared/components/WarehouseEntryRefusal';

import type { WarehouseEntryVerdict } from 'guards/warehouse-entry.guard';
import type { ReactElement } from 'react';

// T4 / ADR 0001 — the Warehouse layout route's own component. It is rendered
// only as `routes/warehouse.route.tsx`'s `component`, so `useMatch()` with no
// `from` reads the nearest match — that route's own match — without needing
// to import the route object back (which would create a module cycle with
// `routes/warehouse.route.tsx`, which imports this component).
export const WarehouseLayout = (): ReactElement => {
  const verdict = useMatch({
    strict: false,
    select: (match) => match.context as WarehouseEntryVerdict,
  });

  if (verdict.status === 'refused') {
    return <WarehouseEntryRefusal reason={verdict.reason ?? 'not-a-member'} />;
  }

  return <Outlet />;
};
