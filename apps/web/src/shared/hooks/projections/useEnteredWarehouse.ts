import { useRouterState } from '@tanstack/react-router';

import { ROUTES } from 'shared/constants/routes';

import type { WarehouseEntryVerdict } from 'guards/warehouse-entry.guard';

// T4 / ADR 0001 — the single reader of the entry verdict
// `guards/warehouse-entry.guard.ts` publishes into the Warehouse layout
// match's context. It answers outside the Warehouse branch too — at the root,
// in the Workspace view, and around a refusal — where no Warehouse match
// exists.
//
// T6 — this looks the Warehouse match up **by route id in the matches array**
// rather than through `useMatch({ from })`. Two reasons, both load-bearing:
//
//  1. `warehouseRoute.id` is assigned when a router builds its route tree, not
//     when the route module is imported. Passing it to `useMatch` before that
//     yields `from: undefined`, which silently degrades to "the nearest match"
//     — so the hook answered from whatever match happened to enclose the
//     caller instead of from the Warehouse.
//  2. `useMatch`'s nearest-match fallback only ever sees the caller's own match
//     and its ancestors. The shell chrome that must read the entered context
//     (`Sidebar`, CR-AC-11) is rendered by the ROOT route, an *ancestor* of the
//     Warehouse match, so a nearest-match read can never reach the verdict.
//
// Reading `state.matches` by id is position-independent and reactive, and
// `ROUTES.WAREHOUSE` is the id TanStack derives for a direct root child at that
// path — which keeps `shared/constants/routes.ts` the single owner of the
// literal and drops the import of `routes/warehouse.route.ts` (and with it the
// module cycle that import risked). `useEnteredWarehouse.spec.tsx` pins both
// the id and the ancestor read.
export const useEnteredWarehouse = (): string | undefined => {
  const verdict = useRouterState({
    select: (state) =>
      state.matches.find((match) => match.routeId === ROUTES.WAREHOUSE)
        ?.context as WarehouseEntryVerdict | undefined,
  });

  return verdict?.status === 'entered' ? verdict.warehouseId : undefined;
};
